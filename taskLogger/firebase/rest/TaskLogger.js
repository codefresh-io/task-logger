const _                                = require('lodash');
const Q                                = require('q');
const CFError                          = require('cf-errors');
const FirebaseTaskLogger               = require('../TaskLogger');
const StepLogger                       = require('./StepLogger');

class FirebaseRestTaskLogger extends FirebaseTaskLogger {

    newStepAdded(step) {
        step.once('step-pushed', () => {
            this.emit('step-pushed', step.name);
            this._updateCurrentStepReferences();
        });
    }

    initDebugger() { // TODO only called from engine
        throw new CFError('debugger is not supported with rest client');
    }

    createDebuggerStreams() { // TODO only called from engine
        throw new CFError('debugger is not supported with rest client');
    }

    pauseDebugger(step) { // TODO only called from engine
        throw new CFError('debugger is not supported with rest client');
    }

    async initDebuggerState(state) {
        return this.restClient.set(`${this.baseRef.ref().toString()}/debug`, state);
    }

    async setUseDebugger() {
        return this.restClient.set(`${this.baseRef.ref().toString()}/debug/useDebugger`, true);
    }

    async getUseDebugger() {
        return this.restClient.get(`${this.baseRef.ref().toString()}/debug/useDebugger`);
    }

    createStepLogger(name, opts) {
        const step = new StepLogger({
            accountId: this.accountId,
            jobId: this.jobId,
            name
        }, {
            ...opts,
            restClient: this.restClient
        }, this);
        return step;
    }

    async restore() {
        return Q.resolve();
    }

    _updateCurrentStepReferences() {
        const stepsReferences = {};
        _.forEach(this.steps, (step) => {
            stepsReferences[_.last(step.stepRef.toString().split('/'))] = step.name;
        });

        this.restClient.set(`${this.baseRef.ref().toString()}/${FirebaseTaskLogger.STEPS_REFERENCES_KEY}`, stepsReferences)
            .catch((err) => {
                this.emit('error', err);
            });
    }

    async addErrorMessageToEndOfSteps(message) {
        return Q.resolve();
        /*const inProgressSteps = _.filter(this.steps, step => ['running', 'terminating'].includes(step.status));
        if (!inProgressSteps.length && this.steps[0]) {
            inProgressSteps.push(this.steps[0]);
        }
        try {
            await Q.all(_.map(inProgressSteps, async (step) => {
                await step.write(`\x1B[31m${message}\x1B[0m\r\n`);
            }));
        } catch (err) {
            throw new CFError({
                cause: err,
                message: `could not add error message to end of steps for jobId: ${this.jobId}`
            });
        }*/
    }

    _reportMemoryUsage(time, memoryUsage) {
        this.restClient.push(`${this.baseRef.ref().toString()}/metrics/memory`, { time, usage: memoryUsage })
            .catch((err) => {
                this.emit('error', err);
            });
    }

    // TODO in original we are using push not set
    _reportMemoryLimit() {
        this.restClient.set(`${this.baseRef.ref().toString()}/metrics/limits/memory`, this.memoryLimit)
            .catch((err) => {
                this.emit('error', err);
            });
    }

    _reportLogSize() {
        this.restClient.set(`${this.baseRef.ref().toString()}/metrics/logs/total`, this.logSize)
            .catch((err) => {
                this.emit('error', err);
            });
    }

    async _reportVisibility() {
        return this.restClient.set(`${this.baseRef.ref().toString()}/visibility`, this.visibility, { inOrder: false });
    }

    async _reportData() {
        return this.restClient.set(`${this.baseRef.ref().toString()}/data`, this.data);
    }

    async _reportStatus() {
        return this.restClient.set(`${this.baseRef.ref().toString()}/status`, this.status);
    }

    async reportAccountId() {
        return this.restClient.set(`${this.baseRef.ref().toString()}/accountId`, this.accountId, { inOrder: false });
    }

    async reportId() {
        return this.restClient.set(`${this.baseRef.ref().toString()}/id`, this.jobId, { inOrder: false });
    }

    _reportLastUpdate(value) {
        this.restClient.set(`${this.lastUpdateRef.ref().toString()}`, value)
            .catch((err) => {
                this.emit('error', err);
            });
    }

    async getLastUpdate() {
        try {
            return this.restClient.get(`${this.lastUpdateRef.ref().toString()}`);
        } catch (err) {
            throw new CFError({
                cause: err,
                message: `could not fetch lastUpdate from firebase for jobId: ${this.jobId}`
            });
        }
    }

    async clearSteps() {
        return this.restClient.remove(`${this.stepsRef.ref().toString()}`);
    }

    async delete() {
        return this.restClient.remove(`${this.baseRef.ref().toString()}`);
    }

    async getRaw() {
        try {
            return this.restClient.get(`${this.baseRef.ref().toString()}`);
        } catch (err) {
            throw new CFError({
                cause: err,
                message: `could not fetch logs from firebase for jobId:${this.jobId}`
            });
        }
    }

    syncStepsByWorkflowContextRevision() {
        return Q.resolve();
    }
}

module.exports = FirebaseRestTaskLogger;
