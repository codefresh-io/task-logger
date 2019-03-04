const Q                  = require('q');
const Firebase           = require('firebase');
const CFError            = require('cf-errors');
const { STATUS }         = require('../enums');
const BaseStepLogger     = require('../StepLogger');
const { wrapWithRetry }  = require('../helpers');

class FirebaseStepLogger extends BaseStepLogger {
    constructor(step, opts) {
        super(step, opts);

        const { baseFirebaseUrl } = opts;

        if (!baseFirebaseUrl) {
            throw new CFError('failed to create stepLogger because baseFirebaseUrl must be provided');
        }
        this.baseFirebaseUrl = baseFirebaseUrl;

        this.baseUrl = `${this.baseFirebaseUrl}/${this.jobId}`;

        this.lastUpdateUrl = `${this.baseUrl}/lastUpdate`;
        this.lastUpdateRef = new Firebase(this.lastUpdateUrl);

        this.stepUrl = `${this.baseUrl}/steps/${this.name}`;
        this.stepRef = new Firebase(this.stepUrl);
    }

    async restore() {
        return wrapWithRetry(async () => {
            const nameDeferred = Q.defer();
            const statusDeferred = Q.defer();

            this.stepRef.child('name').once('value', (snapshot) => {
                this.name = snapshot.val();
                nameDeferred.resolve();
            });
            this.stepRef.child('status').once('value', (snapshot) => {
                this.status = snapshot.val();
                if (this.status === STATUS.PENDING_APPROVAL) {
                    this.pendingApproval = true;
                }
                statusDeferred.resolve();
            });

            return Q.all([nameDeferred.promise, statusDeferred.promise]);
        });
    }

    _reportLog(message) {
        this.stepRef.child('logs').push(message);
    }

    _reportLastUpdate() {
        this.lastUpdateRef.set(this.lastUpdate);
    }

    _reportPrevioulyExecuted() {
        this.stepRef.child('previouslyExecuted').set(this.previouslyExecuted);
    }

    _reportStatus() {
        this.stepRef.child('status').set(this.status);
    }

    _reportFinishTimestamp() {
        this.stepRef.child('finishTimeStamp').set(this.finishTimeStamp);
    }

    _reportCreationTimestamp() {
        this.stepRef.child('creationTimeStamp').set(this.creationTimeStamp);
    }

    _reportMemoryUsage(time, memoryUsage) {
        this.stepRef.child('metrics').child('memory').push({ time, usage: memoryUsage });
    }

    _reportCpuUsage(time, cpuUsage) {
        this.stepRef.child('metrics').child('cpu').push({ time, usage: cpuUsage });
    }

    _reportLogSize() {
        this.stepRef.child('metrics').child('logs').child('total').set(this.logSize);
    }

    reportName() {
        this.stepRef.child('name').set(this.name);
    }

    clearLogs() {
        this.stepRef.child('logs').set({});
    }

    async delete() {
        return this.stepRef.remove();
    }

    async getRaw() {
        const deferred = Q.defer();

        this.stepRef.once('value', (snapshot) => {
            const data     = snapshot.val();
            deferred.resolve(data);
        }, function (errorObject) {
            deferred.reject(new CFError({
                cause: errorObject,
                message: `could not fetch logs from firebase for step:${this.name}`
            }));
        });

        return deferred.promise;
    }
}

module.exports = FirebaseStepLogger;
