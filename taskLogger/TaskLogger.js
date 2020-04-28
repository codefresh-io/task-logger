
const debug        = require('debug')('codefresh:taskLogger');
const _            = require('lodash');
const CFError      = require('cf-errors');
const EventEmitter = require('events');
const { Transform } = require('stream');
const { STATUS, VISIBILITY } = require('./enums');
const Q = require('q');

/**
 * TaskLogger - logging for build/launch/promote jobs
 * @param jobid - progress job id
 * @param firstStepCreationTime - optional. if provided the first step creationTime will be this value
 * @param baseFirebaseUrl - baseFirebaseUrl (pre-quisite authentication to firebase should have been made)
 * @param FirebaseLib - a reference to Firebase lib because we must use the same singelton for pre-quisite authentication
 * @returns {{create: create, finish: finish}}
 */
class TaskLogger extends EventEmitter {
    constructor({ accountId, jobId }, opts) {
        super();
        this.opts = opts;

        if (!accountId && !opts.skipAccountValidation) { // skipAccountValidation is only here to allow downloading a launched-composition single step
            throw new CFError('failed to create taskLogger because accountId must be provided');
        }
        this.accountId = accountId;

        if (!jobId) {
            throw new CFError('failed to create taskLogger because jobId must be provided');
        }
        this.jobId = jobId;
        this.blacklistMasks = this._prepareBlacklistMasks();
        this.fatal    = false;
        this.finished = false;
        this.steps    = {};
        this._curLogSize = 0;
        this.logsStatus = {
            writeCalls: 0,
            resolvedCalls: 0,
            rejectedCalls: 0,
            kbps: 0.0,
        };
        setInterval(this._updateLogsRate.bind(this), 1000).unref(); // to update the logs rate every second
    }

    create(name, resetStatus, runCreationLogic) {
        let step = this.steps[name];
        if (!step) {
            step = this.createStepLogger(name, this.opts);
            step.on('writeCalls', this._handleWriteCallsEvent.bind(this));
            step.on('flush', this._handleFlushEvent.bind(this));
            step.on('error', (err) => {
                this.emit('error', err);
            });
            this.steps[name]      = step;
            step.on('finished', () => {
                delete this.steps[name];
            });
            step.onLastUpdateChanged((value) => {
                this._reportLastUpdate(value);
            });
            if (runCreationLogic) {
                step.reportName();
                step.clearLogs();
                step.setStatus(STATUS.PENDING);
                this.newStepAdded(step);
            }

            debug(`Created new step logger for: ${name}`);
        } else if (resetStatus) {
            debug(`Reusing step logger and resetting for: ${name}`);
            step.setStatus(STATUS.PENDING);
            step.setFinishTimestamp('');
            step.setCreationTimestamp('');
        } else {
            debug(`Reusing step logger state for: ${name}`);
        }

        return step;
    }

    createStepLogger(name, opts) {
        const StepClass = require(`./${this.type}/StepLogger`); // eslint-disable-line
        const step = new StepClass({
            accountId: this.accountId,
            jobId: this.jobId,
            name
        }, {
            ...opts
        }, this);
        return step;
    }

    /**
     * returns a new transform stream that filters words included in the blacklist of this task-logger
     * @returns {Transform}
     */
    createMaskingStream() {
        const taskLogger = this;
        return new Transform({
            transform(chunk, encoding, callback) {
                if (Buffer.isBuffer(chunk)) {
                    chunk = chunk.toString('utf8');
                }
                callback(null, Buffer.from(taskLogger._maskBlacklistWords(chunk)));
            }
        });
    }

    /**
     * adds a new mask to this task-logger
     * @param { key: string, value: string } word
     */
    addNewMask(word) {
        const newMask = this._newMask(word);
        let sortedIndex = 0;
        for (let i = 0; i < this.blacklistMasks.length; i += 1) {
            if (this.blacklistMasks[i].word.length <= newMask.word.length) {
                break;
            }
            sortedIndex += 1;
        }
        // inserts the mask in the right place (based on mask length)
        this.blacklistMasks.splice(sortedIndex, 0, newMask);
    }

    _maskBlacklistWords(data) {
        let maskedData = data;
        this.blacklistMasks.forEach((mask) => {
            maskedData = maskedData.replace(mask.regex, mask.replacer.bind(mask));
        });
        return maskedData;
    }

    finish() { // jshint ignore:line
        if (this.fatal) {
            return;
        }
        if (_.size(this.steps)) {
            _.forEach(this.steps, (step) => {
                step.finish(new Error('Unknown error occurred'));
            });
        }
        this.finished = true;
    }

    fatalError(err) {
        if (!err) {
            throw new CFError('fatalError was called without an error. not valid.');
        }
        if (this.fatal) {
            return;
        }

        if (_.size(this.steps)) {
            _.forEach(this.steps, (step) => {
                step.finish(new Error('Unknown error occurred'));
            });
        }        else {
            const errorStep = this.create('Something went wrong');
            errorStep.finish(err);
        }

        _.forEach(this.steps, (step) => {
            step.fatal = true;
        });
        this.fatal = true;
    }

    updateMemoryUsage(time, memoryUsage) {
        this._reportMemoryUsage(time, memoryUsage);
    }

    setMemoryLimit(memoryLimit) {
        this.memoryLimit = memoryLimit.replace('Mi', '');
        this._reportMemoryLimit();
    }

    setLogSize(size) {
        this.logSize = size;
        this._reportLogSize();
    }

    async setVisibility(visibility) {
        if (![VISIBILITY.PRIVATE, VISIBILITY.PUBLIC].includes(visibility)) {
            throw new Error(`Visibility: ${visibility} is not supported. use public/private`);
        }

        this.visibility = visibility;
        return this._reportVisibility();
    }

    async setData(data) {
        this.data = data;
        return this._reportData();
    }

    async setStatus(status) {
        this.status = status;
        return this._reportStatus();
    }

    startHealthCheck() {
        this._startHealthCheck &&  this._startHealthCheck();
    }
    stopHealthCheck() {
        this._stopHealthCheck &&  this._stopHealthCheck();
    }

    getConfiguration() {
        return {
            task: {
                accountId: this.accountId,
                jobId: this.jobId,
            },
            opts: {
                ...this.opts
            }
        };
    }

    // only call this when you know there will be no more write calls
    awaitLogsFlushed() {
        const deferred = Q.defer();
        this._checkAllFlushed(deferred);
        this.on('flush', this._checkAllFlushed.bind(this, deferred));
        return deferred.promise;
    }

    getStatus() {
        return this.logsStatus;
    }

    _checkAllFlushed(deferred) {
        if (this.logsStatus.resolvedCalls + this.logsStatus.rejectedCalls === this.logsStatus.writeCalls) {
            deferred.resolve();
        }
    }

    _handleWriteCallsEvent() {
        this.logsStatus.writeCalls += 1;
    }

    _handleFlushEvent(err) {
        if (err) {
            this.logsStatus.rejectedCalls += 1;
        } else {
            this.logsStatus.resolvedCalls += 1;
        }
        this.emit('flush', err);
    }

    _updateCurrentLogSize(size) {
        this._curLogSize += size;
    }

    _updateLogsRate() {
        this.logsStatus.kbps = this._curLogSize / 1000;
        this._curLogSize = 0.0;
    }

    syncStepsByWorkflowContextRevision(contextRevision) {
        _.forEach(contextRevision, (step, stepName) => {
            if (_.get(step, 'status') !== STATUS.PENDING) {
                const stepLogger = this.create(stepName, false, false);
                if (stepLogger) {
                    const { status, finishTime } = this._validateStepDataFromContextRevision({
                        status: _.get(step, 'status'),
                        finishTime: _.get(step, 'finishTimestamp'),
                    });
                    if (status) {
                        stepLogger.setStatus(status);
                    }
                    if (finishTime) {
                        const finishTimestamp = parseInt(((finishTime instanceof Date ? finishTime : new Date(finishTime)).getTime()
                            / 1000).toFixed(), 10);
                        stepLogger.setFinishTimestamp(finishTimestamp);
                    }
                }
            }
        });
    }

    _validateStepDataFromContextRevision(stepDataFromContextRevision) {
        const { status, finishTime } = stepDataFromContextRevision;
        if (_.includes([STATUS.RUNNING, STATUS.ELECTED, STATUS.TERMINATING], status)) {
            return {
                status: STATUS.TERMINATED,
                finishTime: new Date(),
            };
        } else if (status === STATUS.FAILURE) {
            return {
                status: STATUS.ERROR,
                finishTime,
            };
        }
        return stepDataFromContextRevision;
    }

    _newMask(word) {
        return {
            name: word.key,
            word: word.value,
            regex: new RegExp(word.value, 'g'),
            replacement: '*'.repeat(word.length),
            replacer() {
                debug(`masked secret: ${this.name}`);
                return this.replacement;
            }
        };
    }

    _prepareBlacklistMasks() {
        const blacklist = this.opts.blacklist || {};
        return _.chain(blacklist)
            .orderBy(['length'], 'desc')
            .map((value, key) => this._newMask({ key, value }))
            .value();
    }
}

module.exports = TaskLogger;
