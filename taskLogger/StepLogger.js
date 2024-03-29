/* eslint-disable no-plusplus */
const _ = require('lodash');
const Q = require('q');
const CFError = require('cf-errors');
const EventEmitter = require('events');
const { STATUS } = require('./enums');
const request = require('request');

class StepLogger extends EventEmitter {
    constructor({ accountId, jobId, name }, opts, taskLogger) {
        super();
        this.taskLogger = taskLogger;
        this.opts = opts;
        this.logSize = 0;

        if (!accountId && !opts.skipAccountValidation) {
            throw new CFError('failed to create stepLogger because accountId must be provided');
        }
        this.accountId = accountId;

        if (!jobId) {
            throw new CFError('failed to create stepLogger because jobId must be provided');
        }
        this.jobId = jobId;

        if (!name) {
            throw new CFError('failed to create stepLogger because name must be provided');
        }

        if (!taskLogger) {
            throw new CFError('failed to create stepLogger because taskLogger must be provided');
        }

        this.name = name;

        this.fatal = false;
    }

    start(eventReporting) {
        if (this.fatal) {
            return;
        }
        if (this.status === STATUS.PENDING) {
            this.status = STATUS.RUNNING;
            this._reportStatus();
            this.setFinishTimestamp('');
            this.setCreationTimestamp(+(Date.now() / 1000).toFixed());

            if (eventReporting) {
                const event = { action: 'new-progress-step', name: this.name };

                request({
                    uri: eventReporting.url,
                    headers: { Authorization: eventReporting.token },
                    method: 'POST',
                    body: event,
                    json: true
                }, (err, response) => {
                    if (err) {
                        const error = new CFError({
                            cause: err,
                            message: 'Failed to send new-proress-step event'
                        });
                        this.emit('error', error);
                    } else if (response && response.statusCode >= 400) {
                        const error = new CFError(`Failed to send new-proress-step event. received: ${JSON.stringify(_.pick(response.toJSON(), ['statusCode', 'body']))}`); // eslint-disable-line max-len
                        this.emit('error', error);
                    }
                });
            }
        }
    }

    /**
     * returns a new transform stream that filters words included in the blacklist of
     * the task-logger related to this step-logger
     * @returns {TransformStream}
     */
    createMaskingStream() {
        return this.taskLogger.createMaskingStream();
    }

    createPrependTimestampsStream() {
        return this.taskLogger.createPrependTimestampsStream();
    }

    /**
     * adds a new mask to the task-logger related to this step-logger
     * @param { key: string, value: string } word
     */
    addNewMask(word) {
        this.taskLogger.addNewMask(word);
    }

    write(message) {
        message = this.taskLogger._maskBlacklistWords(message);
        const writePromise = this._reportLog(message);
        this.emit('writeCalls');
        if (writePromise) {
            return writePromise
                .then(() => {
                    this.taskLogger._updateCurrentLogSize(Buffer.byteLength(message));
                    this.updateLastUpdate();
                    this.emit('flush');
                })
                .catch((err) => {
                    this.emit('flush', err);
                });
        } else {
            this.updateLastUpdate();
            this.emit('flush');
        }

        return Q.resolve();
    }

    writeStream() {
        return this.streamLog();
    }

    debug(message) {
        message = this.taskLogger._maskBlacklistWords(message);
        this._reportLog(`${message}\r\n`);
        this.updateLastUpdate();
    }

    warn(message) {
        message = this.taskLogger._maskBlacklistWords(message);
        this._reportLog(`\x1B[01;93m${message}\x1B[0m\r\n`);
        this.updateLastUpdate();
    }

    info(message) {
        message = this.taskLogger._maskBlacklistWords(message);
        this._reportLog(`${message}\r\n`);
        this.updateLastUpdate();
    }

    finish(err, skip, finishTime) {
        if (this.status === STATUS.PENDING && !skip) { // do not close a pending step that should not be skipped
            return;
        }

        if (this.fatal) {
            return;
        }
        if (this.status === STATUS.RUNNING || this.status === STATUS.PENDING || this.status ===
            STATUS.PENDING_APPROVAL || this.status === STATUS.TERMINATING) {
            this.finishTimeStamp = +((finishTime || new Date()).getTime() / 1000).toFixed();
            if (err) {
                this.status = (this.status === STATUS.TERMINATING ? STATUS.TERMINATED : (this.pendingApproval ? STATUS.DENIED : STATUS.ERROR)); // eslint-disable-line
            } else {
                this.status = this.pendingApproval ? STATUS.APPROVED : STATUS.SUCCESS;
            }
            if (skip) {
                this.status = STATUS.SKIPPED;
            }
            if (err && err.toString() !== 'Error') {
                const errMsg = this.taskLogger._maskBlacklistWords(err.toString());
                this._reportLog(`\x1B[31m${errMsg}\x1B[0m\r\n`);
            }

            this._reportStatus();
            this._reportFinishTimestamp();
            this.updateLastUpdate();
            this.emit('finished');
        } else if (err) {
            this.emit('error', new CFError({
                cause: err,
                message: `progress-logs 'finish' handler was triggered after the job finished`
            }));
        } else {
            this.emit('error', new CFError(`progress-logs 'finish' handler was triggered after the job finished`));
        }
    }

    updateLastUpdate() {
        this.lastUpdate = Date.now();
        this.emit('lastUpdateChanged', this.lastUpdate);
    }

    onLastUpdateChanged(handler) {
        this.addListener('lastUpdateChanged', () => {
            handler(this.lastUpdate);
        });
    }

    async setFinishTimestamp(date) {
        this.finishTimeStamp = date;
        return this._reportFinishTimestamp();
    }

    setCreationTimestamp(date) {
        this.creationTimeStamp = date;
        this._reportCreationTimestamp();
    }

    getStatus() {
        return this.status;
    }

    markPreviouslyExecuted() {
        if (this.fatal) {
            return;
        }

        this.previouslyExecuted = true;
        this._reportPrevioulyExecuted();
    }

    markPendingApproval() {
        if (this.fatal) {
            return;
        }

        this.setStatus(STATUS.PENDING_APPROVAL);
        this.pendingApproval = true;
        this.emit('finished');
    }

    updateOutputUrl(url) {
        this.outputUrl = url;
        this._reportOutputUrl();
    }

    updateEnvironmentName(environmentName) {
        this.environmentName = environmentName;
        this._reportEnvironmentName();
    }

    updateEnvironmentId(environmentId) {
        this.environmentId = environmentId;
        this._reportEnvironmentId();
    }

    updateActivityId(activityId) {
        this.activityId = activityId;
        this._reportActivityId();
    }

    updateMemoryUsage(time, memoryUsage) {
        this._reportMemoryUsage(time, memoryUsage);
    }

    updateCpuUsage(time, cpuUsage) {
        this._reportCpuUsage(time, cpuUsage);
    }

    setLogSize(size) {
        this.logSize = size;
    }

    markTerminating() {
        if (this.status === STATUS.RUNNING) {
            this.status = STATUS.TERMINATING;
            this._reportStatus();
        } else {
            this.emit('error',
                new CFError(`markTerminating is only allowed to step in running state status , current status : ${this.status}`));
        }
    }

    async setStatus(status) {
        this.status = status;
        return this._reportStatus();
    }

    setStepProgress(log) {
        this.stepProgress = log;
        this._reportStepProgress();
    }
}

module.exports = StepLogger;
