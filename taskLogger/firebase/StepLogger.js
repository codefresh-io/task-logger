const Q                  = require('q');
const debug              = require('debug')('codefresh:firebase:stepLogger');
const Firebase           = require('firebase');
const CFError            = require('cf-errors');
const { STATUS }         = require('../enums');
const BaseStepLogger     = require('../StepLogger');
const { wrapWithRetry }  = require('../helpers');
const StepNameTransformStream = require('./step-streams/StepNameTransformStream');

class FirebaseStepLogger extends BaseStepLogger {

    constructor(step, opts) {
        super(step, opts);

        const { baseFirebaseUrl, firebaseWritableStream } = opts;

        if (!baseFirebaseUrl) {
            throw new CFError('failed to create stepLogger because baseFirebaseUrl must be provided');
        }
        this.baseFirebaseUrl = baseFirebaseUrl;

        this.baseUrl = `${this.baseFirebaseUrl}/${this.jobId}`;

        this.stepUrl = `${this.baseUrl}/steps/${this.name}`;
        this.stepRef = new Firebase(this.stepUrl);

        this.firebaseWritableStream = firebaseWritableStream;
    }

    async restore() {
        const extraPrintData = { step: this.name };
        return wrapWithRetry(async () => {
            const nameDeferred = Q.defer();
            const statusDeferred = Q.defer();
            debug(`performing restore for step: ${this.name}`);

            debug(`firebase name reference: ${this.stepRef.child('name').ref()}`);
            this.stepRef.child('name').once('value', (snapshot) => {
                debug(`received name for step: ${this.name}`);
                this.name = snapshot.val();
                nameDeferred.resolve();
            });

            debug(`firebase status reference: ${this.stepRef.child('status').ref()}`);
            this.stepRef.child('status').once('value', (snapshot) => {
                debug(`received status for step: ${this.name}`);
                this.status = snapshot.val();
                if (this.status === STATUS.PENDING_APPROVAL) {
                    this.pendingApproval = true;
                }
                statusDeferred.resolve();
            });

            return Q.all([nameDeferred.promise, statusDeferred.promise]);
        }, undefined, extraPrintData);
    }

    _reportLog(message) {
        this.stepRef.child('logs').push(message);
    }

    _reportOutputUrl() {
        this.stepRef.child('data').child('outputUrl').set(this.outputUrl);
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

    streamLog() {
        return this.firebaseWritableStream;
    }

    stepNameTransformStream() {
        return new StepNameTransformStream(this.name);
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
