const _ = require('lodash');
const Firebase = require('legacy-firebase');
const debug = require('debug')('codefresh:firebase:taskLogger');
const Q = require('q');
const CFError = require('cf-errors');
const FirebaseTokenGenerator = require('firebase-token-generator');
const { initializeApp: initializeAppAdmin } = require('firebase-admin/app');
const { getAuth: getAuthAdmin } = require('firebase-admin/auth');
const firebaseAdmin = require('firebase-admin');

const { initializeApp } = require('firebase/app');
const { getAuth, signInWithCustomToken } = require('firebase/auth');
const BaseTaskLogger = require('../TaskLogger');
const StepLogger = require('./StepLogger');
const DebuggerStreamFactory = require('./DebuggerStreamFactory');
const { TYPES } = require('../enums');
const { wrapWithRetry } = require('../helpers');
const RestClient = require('./rest/Client');
const FirebaseWritableStream = require('./step-streams/FirebaseWritableStream');

/**
 * @typedef {import('firebase-admin/app').App} FirebaseAdminApp
 * @typedef {import('firebase/app').FirebaseApp} FirebaseApp
 *
 *
 * @typedef {object} PrivilegedClaims Claims for a privileged token
 * that is generated for in-platform use.
 * @property {true} isPrivileged
 * @property {string} accountId
 * @property {boolean} isAdmin
 * @property {string} userId
 *
 * @typedef {object} UnprivilegedClaims Claims for a token with limited access
 *      that is generated for userland use.
 * @property {false} isPrivileged
 * @property {string} accountId
 * @property {boolean} isAdmin
 * @property {string} userId
 *
 * @typedef {PrivilegedClaims | UnprivilegedClaims} Claims Token claims.
 *
 *
 * @typedef {object} PlatformGetTokensOptions Options for token generation
 *      from inside the platform, with access to the Service Account JSON.
 * @property {true} isPlatform `true` if requesting a token from inside
 *      the platform. Service Account JSON will be used for token generation.
 * @property {string} firebaseServiceAccountPath Path to Service Account JSON.
 * @property {object} firebaseConfig
 * @property {Claims} claims
 *
 * @typedef {object} UserlandGetTokensOptions Options for token generation
 *      from userland, with *no* access to the Service Account JSON.
 *      Platform API will be called for token generation.
 * @property {false} isPlatform `false` if requesting a token from userland,
 *      with *no* access to Service Account JSON.
 *      Platform API will be called for token generation.
 * @property {string} progressId
 *
 * @typedef {PlatformGetTokensOptions | UserlandGetTokensOptions} GetTokensOptions
 *
 *
 * @typedef {object} PlatformFactoryOptions
 * @property {true} isPlatform
 * @property {Claims} claims
 *
 * @typedef {object} UserlandFactoryOptions
 * @property {false} isPlatform
 * @property {Claims} claims
 * @property {string} codefreshApiUrl
 * @property {string} codefreshApiKey
 *
 * @typedef {PlatformFactoryOptions | UserlandFactoryOptions} FactoryOptions
 *
 *
 * @typedef {object} LegacyGetConfigurationOptions
 * @property {boolean} skipTokenCreation
 * @property {string} userId
 * @property {string} isAdmin
 *
 *
 * @typedef {object} FirebaseTokens
 * @property {string} firebaseSdkToken Token that is used by Firebase SDK.
 * @property {string} firebaseIdToken ID Token that is used by Firebase API.
 */

const defaultFirebaseTimeout = 60000;

class FirebaseTaskLogger extends BaseTaskLogger {
    /**
     * @type {import('got/dist/source/index').Got}
     */
    static #codefreshHttpClient;

    /**
     * @type {Map<string, FirebaseAdminApp>}
     */
    static #firebaseAdminApps = new Map();

    /**
     * @type {Map<string, FirebaseApp>}
     */
    static #firebaseApps = new Map();

    constructor(task, opts) {
        super(task, opts);
        this.type = TYPES.FIREBASE;
        this.pauseTimeout = 10 * 60 * 1000; // 10 min
        this.useLogsTimestamps = opts.useLogsTimestamps || false;
    }

    /**
     * @deprecated This provisions custom tokens basing on
     * deprecated Database Secrets.
     * @returns {string}
     */
    static provisionToken(accountId, userId, firebaseSecret, sessionExpirationInSeconds, isAdmin) {
        try {
            const tokenGenerator = new FirebaseTokenGenerator(firebaseSecret);
            const token = tokenGenerator.createToken(
                {
                    uid: userId.toString(),
                    userId: userId.toString(),
                    accountId,
                    admin: isAdmin
                },
                {
                    expires: Math.floor(Date.now() / 1000) + (parseInt(sessionExpirationInSeconds, 10) || 1680) // default is 1680 - one day
                }
            );
            return token;
        } catch (err) {
            throw new CFError({
                cause: err,
                message: 'failed to create user firebase token'
            });
        }
    }

    /**
     * @param {GetTokensOptions} options
     * @returns {Promise<FirebaseTokens>}
     */
    static async getTokens(options) {
        try {
            if (options.isPlatform === false) {
                const { firebaseSdkToken, firebaseIdToken } = await this.#codefreshHttpClient.get('user/firebaseAuth', {
                    searchParams: { progressId: options.progressId },
                }).json();
                return { firebaseSdkToken, firebaseIdToken };
            }

            const { databaseURL } = options.firebaseConfig;

            let firebaseAdminApp = this.#firebaseAdminApps.get(databaseURL);
            if (!firebaseAdminApp) {
                firebaseAdminApp = initializeAppAdmin({
                    ...options.firebaseConfig,
                    credential: firebaseAdmin.credential.cert(options.firebaseServiceAccountPath),
                });
                this.#firebaseAdminApps.set(databaseURL, firebaseAdminApp);
            }
            const uid = options.claims.isPrivileged
                ? options.claims.accountId
                : options.claims.userId;
            const firebaseSdkToken = await getAuthAdmin(firebaseAdminApp).createCustomToken(
                uid,
                options.claims,
            );

            let firebaseApp = this.#firebaseApps.get(databaseURL);
            if (!firebaseApp) {
                firebaseApp = initializeApp(options.firebaseConfig);
                this.#firebaseApps.set(databaseURL, firebaseApp);
            }
            const userCredential = await signInWithCustomToken(
                getAuth(firebaseApp),
                firebaseSdkToken,
            );
            const firebaseIdToken = await userCredential.user.getIdToken();

            return { firebaseSdkToken, firebaseIdToken };
        } catch (error) {
            throw new CFError({
                cause: error,
                message: `Failed to get Firebase tokens, is platform: ${options.isPlatform}`,
            });
        }
    }

    /**
     * @param {GetTokensOptions} options
     * @returns {Promise<string>}
     */
    static async #getIdToken(options) {
        const { firebaseIdToken } = await FirebaseTaskLogger.getTokens(options);
        return firebaseIdToken;
    }

    /**
     * @param {LegacyGetConfigurationOptions} [legacyOptions]
     * @returns
     */
    async getConfiguration(legacyOptions) {
        /**
         * @deprecated This token is used by older clients
         * and can be removed after migration.
         */
        let firebaseSecret;
        if (legacyOptions) {
            firebaseSecret = legacyOptions.skipTokenCreation
                ? this.firebaseSecret
                : FirebaseTaskLogger.provisionToken(this.accountId, legacyOptions.userId, this.firebaseSecret, this.opts.sessionExpirationInSeconds, legacyOptions.isAdmin);
        }

        /**
         * @type {GetTokensOptions}
         */
        const getTokensOptions = this.isPlatform
            ? {
                isPlatform: true,
                firebaseConfig: this.firebaseConfig,
                firebaseServiceAccountPath: this.firebaseServiceAccountPath,
                claims: this.claims,
            }
            : {
                isPlatform: false,
                progressId: this.jobId,
            };
        const { firebaseSdkToken, firebaseIdToken } = await FirebaseTaskLogger.getTokens(getTokensOptions);

        return {
            task: {
                accountId: this.accountId,
                jobId: this.jobId,
            },
            opts: {
                type: this.opts.type,
                baseFirebaseUrl: this.baseFirebaseUrl,
                ...(this.opts.logsRateLimitConfig && { logsRateLimitConfig: this.opts.logsRateLimitConfig }),
                ...(this.opts.healthCheckConfig && { healthCheckConfig: this.opts.healthCheckConfig }),
                ...(this.opts.blacklist && { blacklist: this.opts.blacklist }),
                ...(this.opts.useLogsTimestamps && { useLogsTimestamps: this.opts.useLogsTimestamps }),
                firebaseSecret,
                firebaseSdkToken,
                firebaseIdToken,
                firebaseConfig: this.firebaseConfig,
            }
        };
    }

    /**
     * @param {FactoryOptions} factoryOptions
     * @returns
     */
    static async factory(task, opts, factoryOptions) {
        // eslint-disable-next-line import/no-unresolved
        const { default: httpClient } = await import('got');

        const {
            baseFirebaseUrl,
            firebaseConfig,
            firebaseSecret,
            firebaseTimeout,
            logsRateLimitConfig,
            restInterface,
        } = opts;

        if (factoryOptions.isPlatform === false) {
            this.#codefreshHttpClient ??= httpClient.extend({
                headers: { 'Authorization': factoryOptions.codefreshApiKey },
                prefixUrl: factoryOptions.codefreshApiUrl,
            });
        }

        let taskLogger;
        if (restInterface) {
            const FirebaseRestTaskLogger = require('./rest/TaskLogger'); // eslint-disable-line global-require
            taskLogger = new FirebaseRestTaskLogger(task, opts);
        } else {
            taskLogger = new FirebaseTaskLogger(task, opts);
        }

        taskLogger.isPlatform = factoryOptions.isPlatform;
        taskLogger.claims = factoryOptions.claims;

        if (!baseFirebaseUrl) {
            throw new CFError('failed to create taskLogger because baseFirebaseUrl must be provided');
        }
        taskLogger.baseFirebaseUrl = baseFirebaseUrl;

        if (!firebaseSecret) {
            throw new CFError('failed to create taskLogger because Firebase secret reference must be provided');
        }
        taskLogger.firebaseSecret = firebaseSecret;

        if (!firebaseConfig) {
            throw new CFError('failed to create taskLogger because "firebaseConfig" must be provided');
        }
        taskLogger.firebaseConfig = firebaseConfig;

        const firebaseServiceAccountPath = process.env.FIREBASE_SA_PATH;
        if (factoryOptions.isPlatform === true && !firebaseServiceAccountPath) {
            throw new CFError('failed to create taskLogger because "FIREBASE_SA_PATH" env variable must be provided');
        }
        taskLogger.firebaseServiceAccountPath = firebaseServiceAccountPath;

        taskLogger.baseUrl = `${taskLogger.baseFirebaseUrl}/${taskLogger.jobId}`;
        taskLogger.baseRef = new Firebase(taskLogger.baseUrl);

        taskLogger.lastUpdateUrl = `${taskLogger.baseUrl}/lastUpdate`;
        taskLogger.lastUpdateRef = new Firebase(taskLogger.lastUpdateUrl);

        taskLogger.stepsUrl = `${taskLogger.baseUrl}/steps`;
        const stepRef = new Firebase(taskLogger.stepsUrl);
        taskLogger.stepsRef = stepRef;

        const getTokensOptions = factoryOptions.isPlatform
            ? {
                isPlatform: true,
                firebaseServiceAccountPath,
                firebaseConfig,
                claims: factoryOptions.claims,
            }
            : {
                isPlatform: false,
                progressId: task.jobId,
            };
        const { firebaseSdkToken, firebaseIdToken } = await FirebaseTaskLogger.getTokens(getTokensOptions);

        if (logsRateLimitConfig) {
            const fbStream = new FirebaseWritableStream(stepRef, logsRateLimitConfig);
            // override default taskLogger behavior because fbStream can flush n writeCalls at once
            fbStream.on('flush', taskLogger._handleStreamFlushEvent.bind(taskLogger));
            fbStream.on('writeCalls', taskLogger._handleWriteCallsEvent.bind(taskLogger));

            taskLogger.opts.firebaseWritableStream = fbStream;
        }

        if (restInterface) {
            const restClientOptions = factoryOptions.isPlatform
                ? {
                    isPlatform: factoryOptions.isPlatform,
                    firebaseIdToken,
                    getNewFirebaseIdToken: FirebaseTaskLogger.#getIdToken.bind(FirebaseTaskLogger, {
                        isPlatform: factoryOptions.isPlatform,
                        firebaseServiceAccountPath,
                        firebaseConfig,
                        claims: factoryOptions.claims,
                    }),
                }
                : {
                    isPlatform: factoryOptions.claims,
                    firebaseIdToken,
                    codefreshApiUrl: factoryOptions.codefreshApiUrl,
                    codefreshApiKey: factoryOptions.codefreshApiKey,
                    progressId: task.jobId,
                };
            taskLogger.restClient = new RestClient(httpClient, restClientOptions);
        } else {
            // establishing connection is only rqeuired in case of stream interface
            try {
                if (!FirebaseTaskLogger.authenticated) {
                    debug('connecting to firebase');
                    await Promise.race([
                        Q.ninvoke(taskLogger.baseRef, 'authWithCustomToken', firebaseSecret),
                        Q.delay(firebaseTimeout || defaultFirebaseTimeout).then(() => {
                            throw new Error(`authtication to firebase timed out after ${firebaseTimeout || defaultFirebaseTimeout}`);
                        })]);

                    debug(`TaskLogger created and authenticated to firebase url: ${taskLogger.baseUrl}`);

                    // workaround to not authenticate each time
                    FirebaseTaskLogger.authenticated = true;
                } else {
                    debug('TaskLogger created without authentication');
                }
            } catch (err) {
                throw new CFError({
                    cause: err,
                    message: `Failed to create taskLogger because authentication to firebase url ${taskLogger.baseUrl}`
                });
            }
        }

        return taskLogger;
    }

    newStepAdded(step) {
        step.stepRef.on('value', (snapshot) => {
            const val = snapshot.val();
            if (val && val.name === step.name) {
                step.stepRef.off('value');
                this.emit('step-pushed', step.name);
                this._updateCurrentStepReferences();
            }
        });
    }

    initDebugger() {
        const that = this;
        this.debugRef = this.baseRef.child('debug');
        this.debugRef.child('useDebugger').on('value', (snapshot) => { that.useDebugger = snapshot.val(); });
        this.debugRef.child('breakpoints').on('value', (snapshot) => { that.breakpoints = snapshot.val(); });

        // Awaiting for debug approval
        this.debuggerAwaiting = Q.resolve();
        const debuggerAwaitingDeferred = Q.defer();
        this.debugRef.child('pendingDebugger').on('value', (pendingDebuggerSnapshot) => {
            if (pendingDebuggerSnapshot.val()) {
                that.debuggerAwaiting = debuggerAwaitingDeferred.promise;
            } else {
                debuggerAwaitingDeferred.resolve();
                that.debugRef.child('pendingDebugger').off('value');
            }
        });

        this.freeDebugger = () => {
            this.debugRef.child('useDebugger').off('value');
            this.debugRef.child('breakpoints').off('value');
        };
    }

    createDebuggerStreams(step, phase) {
        const debuggerStreams = new DebuggerStreamFactory({ jobIdRef: this.baseRef });
        return debuggerStreams.createStreams(step, phase);
    }

    async initDebuggerState(state) {
        return this.baseRef.child('debug').set(state);
    }

    async setUseDebugger() {
        return this.baseRef.child('debug/useDebugger').set(true);
    }

    async getUseDebugger() {
        const value = Q.defer();
        this.baseRef.child('debug/useDebugger').on('value', (snapshot) => {
            const val = snapshot.val();
            if (value.promise.isPending() && val !== null) {
                value.resolve(val);
            }
        });
        return value.promise.timeout(5000)
            .finally(() => {
                this.baseRef.child('debug/useDebugger').off('value');
            });
    }

    pauseDebugger(step) {
        if (!this.useDebugger) {
            return Q.resolve();
        }

        if (_.get(this, `breakpoints['${step.name}'].phases.after`) === true) {
            this.debugRef.child('pauseDebugger').set({
                pause: false,
                failed: true,
                stepName: step.name,
                stepTitle: step.title,
            });
            return Q.resolve();
        }

        this.debugRef.child('pauseDebugger').set({
            pause: true,
            failed: true,
            stepName: step.name,
            stepTitle: step.title,
            reason: `Step "${step.title}" failed. Set breakpoint and debug failed step.`
        });
        const pauseAwaitingDeferred = Q.defer();
        this.pauseDebuggerAwaiting = pauseAwaitingDeferred.promise
            .timeout(this.pauseTimeout)
            .finally(() => {
                this.debugRef.child('pauseDebugger').set({
                    pause: false,
                });
                this.debugRef.child('pauseDebugger').off('value');
            });
        this.debugRef.child('pauseDebugger').on('value', (pauseDebuggerSnapshot) => {
            if (pauseDebuggerSnapshot.val().pause === false) {
                pauseAwaitingDeferred.resolve();
            }
        });
        return this.pauseDebuggerAwaiting;
    }

    async restore() {
        const extraPrintData = { jobId: this.jobId };
        return wrapWithRetry(async () => {
            const deferred = Q.defer();
            debug(`performing restore for job: ${this.jobId}`);

            this.baseRef.child(FirebaseTaskLogger.STEPS_REFERENCES_KEY).once('value', (snapshot) => {
                const stepsReferences = snapshot.val();
                if (!stepsReferences) {
                    deferred.resolve();
                }

                Q.all(_.map(stepsReferences, async (name, key) => { // eslint-disable-line
                    const step = new StepLogger({
                        accountId: this.accountId,
                        jobId: this.jobId,
                        name: key
                    }, {
                        ...this.opts
                    }, this);
                    step.on('error', (err) => {
                        this.emit('error', err);
                    });
                    step.on('finished', () => {
                        delete this.steps[name];
                    });

                    step.logs = {};

                    await step.restore();
                    this.steps[step.name] = step;
                }))
                    .then(() => {
                        deferred.resolve();
                    })
                    .done();
            });
            return deferred.promise;
        }, { errorAfterTimeout: 120000, retries: 3 }, extraPrintData);
    }

    // TODO change this to push new step as it occurs, currently it does not work well in sync worfklows
    // finished steps will get deleted and then on next report we will have only part of steps
    _updateCurrentStepReferences() {
        const stepsReferences = {};
        _.forEach(this.steps, (step) => {
            stepsReferences[_.last(step.stepRef.toString().split('/'))] = step.name;
        });
        this.baseRef.child(FirebaseTaskLogger.STEPS_REFERENCES_KEY).set(stepsReferences);
    }

    async addErrorMessageToEndOfSteps(rawMessage) {
        const deferred = Q.defer();

        this.stepsRef.limitToLast(1).once('value', (snapshot) => {
            try {
                _.forEach(snapshot.val(), (step, stepKey) => {
                    const stepRef = new Firebase(`${this.stepsUrl}/${stepKey}`);
                    let message = `\x1B[31m${rawMessage}\x1B[0m\r\n`;
                    if (this.useLogsTimestamps) {
                        message = `[${new Date().toISOString()}] ${message}`;
                    }
                    stepRef.child('logs').push(message);
                });
                deferred.resolve();
            } catch (err) {
                deferred.reject(err);
            }
        });

        return deferred.promise;
    }

    _reportMemoryUsage(time, memoryUsage) {
        this.baseRef.child('metrics').child('memory').push({ time, usage: memoryUsage });
    }

    _reportMemoryLimit() {
        this.baseRef.child('metrics').child('limits').child('memory').push(this.memoryLimit);
    }

    _reportDiskState(time, diskState) {
        this.baseRef.child('metrics').child('disk').push({ time, ...diskState });
    }

    _reportDiskSpaceUsageLimit() {
        this.baseRef.child('metrics').child('limits').child('diskSpaceUsage').push(this.diskSpaceUsageLimit);
    }

    _reportLogSize() {
        this.baseRef.child('metrics').child('logs').child('total').set(this.logSize);
    }

    async _reportVisibility() {
        return this.baseRef.child('visibility').set(this.visibility);
    }

    async _reportData() {
        return this.baseRef.child('data').set(this.data);
    }

    async _reportStatus() {
        return this.baseRef.child('status').set(this.status);
    }

    async reportAccountId() {
        return this.baseRef.child('accountId').set(this.accountId);
    }

    async reportId() {
        return this.baseRef.child('id').set(this.jobId);
    }

    _reportLastUpdate(value) {
        this.lastUpdateRef.set(value);
    }

    async getLastUpdate() {
        const deferred = Q.defer();

        this.lastUpdateRef.once('value', (snapshot) => {
            const lastUpdate = snapshot.val();
            deferred.resolve(lastUpdate);
        }, function (errorObject) {
            deferred.reject(new CFError({
                cause: errorObject,
                message: `could not fetch lastUpdate from firebase for jobId: ${this.jobId}`
            }));
        });

        return deferred.promise;
    }

    async clearSteps() {
        return this.stepsRef.remove();
    }

    async delete() {
        return this.baseRef.remove();
    }

    async getRaw() {
        const deferred = Q.defer();

        this.baseRef.once('value', (snapshot) => {
            const data = snapshot.val();
            deferred.resolve(data);
        }, function (errorObject) {
            deferred.reject(new CFError({
                cause: errorObject,
                message: `could not fetch logs from firebase for jobId:${this.jobId}`
            }));
        });

        return deferred.promise;
    }

    _startHealthCheck() {
        debug('init health check status');
        const interval = _.get(this.opts, 'healthCheckConfig.interval', 30 * 1000);
        const retries = _.get(this.opts, 'healthCheckConfig.retries', 2);
        const errorAfterTimeout = _.get(this.opts, 'healthCheckConfig.errorAfterTimeout', 15 * 1000);
        const callOnce = _.get(this.opts, 'healthCheckConfig.callOnce', false);
        this.healthCheckCounter = 0;
        const func = callOnce ? setTimeout : setInterval;
        this.timeoutId = func(async () => {
            // eslint-disable-next-line no-plusplus
            const counter = this.healthCheckCounter++;
            const startTime = Date.now();
            debug(`running health check number ${counter}`);
            try {
                await wrapWithRetry(
                    this.healthCheck,
                    {
                        retries,
                        errorAfterTimeout,
                        invocationParams: {
                            number: counter,
                            baseRef: this.baseRef,
                        }
                    }
                );
                this.emit('healthCheckStatus', {
                    status: 'succeed', id: counter, duration: Date.now() - startTime, startTime: new Date(startTime)
                });

            } catch (error) {
                this.emit('healthCheckStatus', {
                    status: 'failed', id: counter, error: error.message, duration: Date.now() - startTime, startTime: new Date(startTime)
                });
            }

        }, interval);
        this.emit('healthCheckStatus', { status: 'started' });
    }

    async healthCheck({ number, baseRef }) {

        const deferred = Q.defer();
        debug(`set value ${number} for health check`);
        baseRef.child('healthCheck').set(number, (err) => {
            if (err) {
                deferred.reject(new CFError({
                    cause: err,
                    message: `could not fetch health check value from firebase #:${number}`
                }));
            } else {
                deferred.resolve('ok');
            }
        });
        return deferred.promise;
    }

    _stopHealthCheck() {
        const callOnce = _.get(this.opts, 'healthCheckCallOnce', false);
        const func = callOnce ? clearTimeout : clearInterval;
        func(this.timeoutId);
    }

    onHealthCheckReported(handler) {
        this.addListener('healthCheckStatus', (status) => {
            handler(status);
        });
    }
}
FirebaseTaskLogger.TYPE = TYPES.FIREBASE;
FirebaseTaskLogger.authenticated = false;
FirebaseTaskLogger.STEPS_REFERENCES_KEY = 'stepsReferences';

module.exports = FirebaseTaskLogger;
