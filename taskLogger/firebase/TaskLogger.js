const _ = require('lodash');
const Firebase = require('firebase');
const debug = require('debug')('codefresh:firebase:taskLogger');
const Q = require('q');
const CFError = require('cf-errors');
const BaseTaskLogger = require('../TaskLogger');
const StepLogger = require('./StepLogger');
const DebuggerStreamFactory = require('./DebuggerStreamFactory');
const { TYPES } = require('../enums');
const { wrapWithRetry } = require('../helpers');
const RestClient = require('./rest/Client');
const FirebaseTokenGenerator = require('firebase-token-generator');
const FirebaseWritableStream = require('./step-streams/FirebaseWritableStream');

const defaultFirebaseTimeout = 60000;

class FirebaseTaskLogger extends BaseTaskLogger {
    constructor(task, opts) {
        super(task, opts);
        this.type = TYPES.FIREBASE;
        this.pauseTimeout = 10 * 60 * 1000; // 10 min
        this.useLogsTimestamps = opts.useLogsTimestamps || false;
    }

    // TODO once everyone is moving to new model for token per progress, this should also contain the build id and restrict only access to this specific job
    _provisionToken(userId, isAdmin) {
        try {
            const tokenGenerator = new FirebaseTokenGenerator(this.firebaseSecret);
            const token = tokenGenerator.createToken(
                {
                    uid: userId.toString(),
                    userId: userId.toString(),
                    accountId: this.accountId,
                    admin: isAdmin
                },
                {
                    expires: Math.floor((new Date()).getTime() / 1000) + _.get(this.opts, 'sessionExpirationInSeconds', 1680) // default is 1680 - one day
                });
            return token;
        } catch (err) {
            throw new CFError({
                cause: err,
                message: 'failed to create user firebase token'
            });
        }
    }

    getConfiguration(userId, isAdmin, skipTokenCreation) {
        return {
            task: {
                accountId: this.accountId,
                jobId: this.jobId,
            },
            opts: {
                type: this.opts.type,
                baseFirebaseUrl: this.opts.baseFirebaseUrl,
                firebaseSecret: skipTokenCreation ? this.firebaseSecret : this._provisionToken(userId, isAdmin),
                ...(this.opts.logsRateLimitConfig && { logsRateLimitConfig: this.opts.logsRateLimitConfig }),
                ...(this.opts.healthCheckConfig && { healthCheckConfig: this.opts.healthCheckConfig }),
                ...(this.opts.blacklist && { blacklist: this.opts.blacklist }),
                ...(this.opts.useLogsTimestamps && { useLogsTimestamps: this.opts.useLogsTimestamps })
            }
        };
    }

    static async factory(task, opts) {
        const { restInterface } = opts;

        let taskLogger;
        if (restInterface) {
            const FirebaseRestTaskLogger = require('./rest/TaskLogger'); // eslint-disable-line global-require
            taskLogger = new FirebaseRestTaskLogger(task, opts);
        } else {
            taskLogger = new FirebaseTaskLogger(task, opts);
        }

        const { baseFirebaseUrl, firebaseSecret, logsRateLimitConfig, firebaseTimeout } = opts;

        if (!baseFirebaseUrl) {
            throw new CFError('failed to create taskLogger because baseFirebaseUrl must be provided');
        }
        taskLogger.baseFirebaseUrl = baseFirebaseUrl;

        if (!firebaseSecret) {
            throw new CFError('failed to create taskLogger because Firebase secret reference must be provided');
        }
        taskLogger.firebaseSecret = firebaseSecret;

        taskLogger.baseUrl = `${taskLogger.baseFirebaseUrl}/${taskLogger.jobId}`;
        taskLogger.baseRef = new Firebase(taskLogger.baseUrl);

        taskLogger.lastUpdateUrl = `${taskLogger.baseUrl}/lastUpdate`;
        taskLogger.lastUpdateRef = new Firebase(taskLogger.lastUpdateUrl);

        taskLogger.stepsUrl = `${taskLogger.baseUrl}/steps`;
        const stepRef = new Firebase(taskLogger.stepsUrl);
        taskLogger.stepsRef = stepRef;
        if (logsRateLimitConfig) {
            const fbStream = new FirebaseWritableStream(stepRef, logsRateLimitConfig);
            // override default taskLogger behavior because fbStream can flush n writeCalls at once
            fbStream.on('flush', (err, nFlushed, batchSize) => {
                taskLogger._updateCurrentLogSize(batchSize);
                if (err) {
                    taskLogger.logsStatus.rejectedCalls += nFlushed;
                } else {
                    taskLogger.logsStatus.resolvedCalls += nFlushed;
                }
                taskLogger.emit('flush', err, nFlushed, batchSize);
            });
            taskLogger.opts.firebaseWritableStream = fbStream;
        }

        if (restInterface) {
            taskLogger.restClient = new RestClient(taskLogger.firebaseSecret);
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
                await wrapWithRetry(this.healthCheck,
                    {
                        retries,
                        errorAfterTimeout,
                        invocationParams: {
                            number: counter,
                            baseRef: this.baseRef,
                        }
                    });
                this.emit('healthCheckStatus', { status: 'succeed', id: counter, duration: Date.now() - startTime, startTime: new Date(startTime) });

            } catch (error) {
                this.emit('healthCheckStatus', { status: 'failed', id: counter, error: error.message, duration: Date.now() - startTime, startTime: new Date(startTime) });
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
