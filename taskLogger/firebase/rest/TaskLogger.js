const _                                = require('lodash');
const debug                            = require('debug')('codefresh:firebase:taskLogger');
const Q                                = require('q');
const CFError                          = require('cf-errors');
const FirebaseTaskLogger               = require('../TaskLogger');
const StepLogger                       = require('./StepLogger');
const { wrapWithRetry }                = require('../../helpers');

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

    async initDebuggerState(state) {
        this.restClient.set(`${this.baseRef.ref().toString()}/debug`, state)
            .catch((err) => {
                this.emit('error', err);
            });
    }

    async setUseDebugger() {
        this.restClient.set(`${this.baseRef.ref().toString()}/debug/useDebugger`, true)
            .catch((err) => {
                this.emit('error', err);
            });
    }

    async getUseDebugger() {
        this.restClient.get(`${this.baseRef.ref().toString()}/debug/useDebugger`)
            .catch((err) => {
                this.emit('error', err);
            });
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
        const extraPrintData = { jobId: this.jobId };
        return wrapWithRetry(async () => {
            debug(`performing restore for job: ${this.jobId}`);

            const stepsReferences = await this.restClient.get(`${this.baseRef.ref().toString()}/${FirebaseTaskLogger.STEPS_REFERENCES_KEY}`);
            if (!stepsReferences) {
                return;
            }

            await Q.all(_.map(stepsReferences, async (name, key) => {
                const step = new StepLogger({
                    accountId: this.accountId,
                    jobId: this.jobId,
                    name: key
                }, {
                    ...this.opts,
                    restClient: this.restClient
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
            }));
        }, {  errorAfterTimeout: 120000, retries: 3  }, extraPrintData);
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
        const inProgressSteps = _.filter(this.steps, step => ['running', 'terminating'].includes(step.status));
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
        }
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
        return this.restClient.set(`${this.baseRef.ref().toString()}/visibility`, this.visibility);
    }

    async _reportData() {
        return this.restClient.set(`${this.baseRef.ref().toString()}/data`, this.data);
    }

    async _reportStatus() {
        return this.restClient.set(`${this.baseRef.ref().toString()}/status`, this.status);
    }

    async reportAccountId() {
        return this.restClient.set(`${this.baseRef.ref().toString()}/accountId`, this.accountId);
    }

    async reportId() {
        return this.restClient.set(`${this.baseRef.ref().toString()}/id`, this.jobId);
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
}

module.exports = FirebaseRestTaskLogger;
