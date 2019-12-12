const debug              = require('debug')('codefresh:firebase:rest:stepLogger');
const CFError            = require('cf-errors');
const { STATUS }         = require('../../enums');
const FirebaseStepLogger = require('../StepLogger');

class FirebaseRestStepLogger extends FirebaseStepLogger {

    constructor(step, opts) {
        super(step, opts);

        this.restClient = opts.restClient;
        if (!this.restClient) {
            throw new CFError('failed to create stepLogger because restClient must be passed from task logger');
        }

        this.restClient.once('data-set-successfully', () => {
            this.emit('step-pushed');
        });
    }

    async restore() {
        debug(`performing restore for step: ${this.name}`);

        debug(`firebase name reference: ${this.stepRef.child('name').ref()}`);
        this.name = await this.restClient.get(`${this.stepRef.ref().toString()}/name`);

        debug(`firebase status reference: ${this.stepRef.child('status').ref()}`);
        this.status = await this.restClient.get(`${this.stepRef.ref().toString()}/status`);
        debug(`received status: ${this.status} for step: ${this.name}`);
        if (this.status === STATUS.PENDING_APPROVAL) {
            this.pendingApproval = true;
        }
    }

    _reportLog(message) {
        this.restClient.push(`${this.stepRef.ref().toString()}/logs`, message)
            .catch((err) => {
                this.emit('error', err);
            });
    }

    _reportOutputUrl() {
        this.restClient.set(`${this.stepRef.ref().toString()}/data/outputUrl`, this.outputUrl)
            .catch((err) => {
                this.emit('error', err);
            });
    }

    _reportPrevioulyExecuted() {
        this.restClient.set(`${this.stepRef.ref().toString()}/previouslyExecuted`, this.previouslyExecuted)
            .catch((err) => {
                this.emit('error', err);
            });
    }

    _reportStatus() {
        this.restClient.set(`${this.stepRef.ref().toString()}/status`, this.status)
            .catch((err) => {
                this.emit('error', err);
            });
    }

    _reportFinishTimestamp() {
        this.restClient.set(`${this.stepRef.ref().toString()}/finishTimeStamp`, this.finishTimeStamp)
            .catch((err) => {
                this.emit('error', err);
            });
    }

    _reportCreationTimestamp() {
        this.restClient.set(`${this.stepRef.ref().toString()}/creationTimeStamp`, this.creationTimeStamp)
            .catch((err) => {
                this.emit('error', err);
            });
    }

    _reportMemoryUsage(time, memoryUsage) {
        this.restClient.push(`${this.stepRef.ref().toString()}/metrics/memory`, { time, usage: memoryUsage })
            .catch((err) => {
                this.emit('error', err);
            });
    }

    _reportCpuUsage(time, cpuUsage) {
        this.restClient.push(`${this.stepRef.ref().toString()}/metrics/cpu`, { time, usage: cpuUsage })
            .catch((err) => {
                this.emit('error', err);
            });
    }

    _reportLogSize() {
        this.restClient.set(`${this.stepRef.ref().toString()}/metrics/logs/total`, this.logSize)
            .catch((err) => {
                this.emit('error', err);
            });
    }

    reportName() {
        this.restClient.set(`${this.stepRef.ref().toString()}/name`, this.name)
            .catch((err) => {
                this.emit('error', err);
            });
    }

    clearLogs() {
        this.restClient.set(`${this.stepRef.ref().toString()}/logs`, {})
            .catch((err) => {
                this.emit('error', err);
            });
    }

    async delete() {
        return this.restClient.remove(`${this.stepRef.ref().toString()}`);
    }

    async getRaw() {
        try {
            return this.restClient.get(`${this.stepRef.ref().toString()}`, {});
        } catch (err) {
            throw new CFError({
                cause: err,
                message: `could not fetch logs from firebase for step:${this.name}`
            });
        }
    }
}

module.exports = FirebaseRestStepLogger;
