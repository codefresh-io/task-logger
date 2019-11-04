const _                                = require('lodash');
const Firebase                         = require('firebase');
const debug                            = require('debug')('codefresh:firebase:taskLogger');
const Q                                = require('q');
const CFError                          = require('cf-errors');
const BaseTaskLogger                   = require('../TaskLogger');
const StepLogger                       = require('./StepLogger');
const DebuggerStreams                  = require('./DebuggerStream');
const { TYPES }                        = require('../enums');
const { wrapWithRetry }                = require('../helpers');

const STEPS_REFERENCES_KEY = 'stepsReferences';

class FirebaseTaskLogger extends BaseTaskLogger {
    constructor(task, opts) {
        super(task, opts);
        this.type = TYPES.FIREBASE;
    }

    static async factory(task, opts) {
        const taskLogger = new FirebaseTaskLogger(task, opts);

        const { baseFirebaseUrl, firebaseSecret } = opts;

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
        taskLogger.stepsRef = new Firebase(taskLogger.stepsUrl);

        try {
            if (!FirebaseTaskLogger.authenticated) {
                await Q.ninvoke(taskLogger.baseRef, 'authWithCustomToken', firebaseSecret);
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
        const debuggerStreams = new DebuggerStreams({ jobIdRef: this.baseRef });
        return debuggerStreams.createStreams(step, phase);
    }

    setUseDebugger() {
        return this.baseRef.child('debug/useDebugger').set(true);
    }

    getUseDebugger() {
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

    saveExportedVariables(vars = []) {
        function splitEnvVarPair(envVarPair) {
            const arr = envVarPair.split('=');
            const key = arr.splice(0, 1)[0];
            return { [key]: arr.join('=') };
        }

        const varObj = _(vars).map(splitEnvVarPair).reduce((a, b) => ({ ...a, ...b }), {});
        return Q.resolve(this.baseRef.child('debug').update({
            'cf-export': { ...varObj }
        }));
    }

    loadExportedVariables() {
        const value = Q.defer();
        this.baseRef.child('debug/cf-export').once('value', (snapshot) => {
            if (value.promise.isPending()) {
                value.resolve(snapshot.val());
            }
        });
        return Q.timeout(value.promise, 5000);
    }

    async restore() {
        const extraPrintData = { jobId: this.jobId };
        return wrapWithRetry(async () => {
            const deferred = Q.defer();
            debug(`performing restore for job: ${this.jobId}`);

            this.baseRef.child(STEPS_REFERENCES_KEY).once('value', (snapshot) => {
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
                    });
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
        }, { errorAfterTimeout: 5000 }, extraPrintData);
    }

    _updateCurrentStepReferences() {
        const stepsReferences = {};
        _.forEach(this.steps, (step) => {
            stepsReferences[_.last(step.stepRef.toString().split('/'))] = step.name;
        });
        this.baseRef.child(STEPS_REFERENCES_KEY).set(stepsReferences);
    }

    async addErrorMessageToEndOfSteps(message) {
        const deferred = Q.defer();

        this.stepsRef.limitToLast(1).once('value', (snapshot) => {
            try {
                _.forEach(snapshot.val(), (step, stepKey) => {
                    const stepRef = new Firebase(`${this.stepsUrl}/${stepKey}`);
                    stepRef.child('logs').push(`\x1B[31m${message}\x1B[0m\r\n`);
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

    _reportVisibility() {
        this.baseRef.child('visibility').set(this.visibility);
    }

    _reportData() {
        this.baseRef.child('data').set(this.data);
    }

    _reportStatus() {
        this.baseRef.child('status').set(this.status);
    }

    reportAccountId() {
        this.baseRef.child('accountId').set(this.accountId);
    }

    reportId() {
        this.baseRef.child('id').set(this.jobId);
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
            const data     = snapshot.val();
            deferred.resolve(data);
        }, function (errorObject) {
            deferred.reject(new CFError({
                cause: errorObject,
                message: `could not fetch logs from firebase for jobId:${this.jobId}`
            }));
        });

        return deferred.promise;
    }
}
FirebaseTaskLogger.TYPE          = TYPES.FIREBASE;
FirebaseTaskLogger.authenticated = false;

module.exports = FirebaseTaskLogger;
