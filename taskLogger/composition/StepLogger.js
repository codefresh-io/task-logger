const _                                 = require('lodash');
const BaseStepLogger                   = require('../StepLogger');
const { STATUS }                       = require('../enums');

class CompositionStepLogger extends BaseStepLogger {
    constructor(step, opts, taskLogger) {
        super(step, opts, taskLogger);
        this.loggers = [];
        taskLogger.loggers.forEach((logger) => {
            this.loggers.push(logger.createStepLogger(step.name, logger.opts));
        });
    }

    async restore() {
        const restorePromises = this.loggers.map(logger => logger.restore());
        await Promise.all(restorePromises);
        this.status = this.loggers[0].status;
        this.pendingApproval = this.status === STATUS.PENDING_APPROVAL;
    }

    _reportOutputUrl() {
        this.loggers.forEach((logger) =>  {
            logger.outputUrl = this.outputUrl;
            logger._reportOutputUrl(this.outputUrl);
        });

    }

    _reportEnvironmentName() {
        this.loggers.forEach((logger) =>  {
            logger.environmentName = this.environmentName;
            logger._reportEnvironmentName(this.environmentName);
        });
    }

    _reportEnvironmentId() {
        this.loggers.forEach((logger) =>  {
            logger.environmentId = this.environmentId;
            logger._reportEnvironmentId(this.environmentId);
        });
    }

    _reportActivityId() {
        this.loggers.forEach((logger) =>  {
            logger.activityId = this.activityId;
            logger._reportActivityId(this.activityId);
        });
    }

    _reportLog(message) {
        const syncId = Date.now();
        this.loggers.forEach(logger => logger._reportLog(message, syncId));

    }

    _reportLastUpdate() {
        this.loggers.forEach((logger) =>  {
            logger.lastUpdate = this.lastUpdate;
            logger._reportLastUpdate(this.lastUpdate);
        });

    }

    _reportPrevioulyExecuted() {
        this.loggers.forEach((logger) => {
            logger.previouslyExecuted = this.previouslyExecuted;
            logger._reportPrevioulyExecuted(this.previouslyExecuted);
        });

    }

    async _reportStatus() {
        return _.map(this.loggers, (logger) => {
            logger.status = this.status;
            return logger._reportStatus();
        });
    }

    async _reportFinishTimestamp() {
        return _.map(this.loggers, (logger) => {
            logger.finishTimeStamp = this.finishTimeStamp;
            return logger._reportFinishTimestamp(this.finishTimeStamp);
        });
    }

    _reportCreationTimestamp() {
        this.loggers.forEach((logger) => {
            logger.creationTimeStamp = this.creationTimeStamp;
            logger._reportCreationTimestamp(this.creationTimeStamp);
        });

    }

    _reportMemoryUsage(time, memoryUsage) {
        const syncId = Date.now();
        this.loggers.forEach(logger => logger._reportMemoryUsage(time, memoryUsage, syncId));

    }

    _reportCpuUsage(time, cpuUsage) {
        const syncId = Date.now();
        this.loggers.forEach(logger => logger._reportCpuUsage(time, cpuUsage, syncId));

    }

    _reportLogSize() {
        this.loggers.forEach((logger) => {
            logger.logSize = this.logSize;
            logger._reportLogSize();
        });

    }

    _reportLogProcess() {
        this.loggers.forEach((logger) => {
            logger.processLog = this.processLog;
            logger._reportLogProcess();
        });
    }

    reportName() {
        this.loggers.forEach(logger => logger.reportName());

    }

    clearLogs() {
        // TODO: Is is needed ? if so need to implement (get all keys from set and delete the relevant ones)
    }

    async delete() {
        // return this.writter.remove();
    }
}

module.exports = CompositionStepLogger;
