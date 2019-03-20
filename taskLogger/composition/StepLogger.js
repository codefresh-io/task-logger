const BaseStepLogger                   = require('../StepLogger');

class CompositionStepLogger extends BaseStepLogger {
    constructor(step, opts, taskLogger) {
        super(step, opts);
        this.loggers = [];
        taskLogger.loggers.forEach((logger) => {
            this.loggers.push(logger.createStepLogger(step.name, logger.opts));
        });
    }

    async restore() {
        const restorePromises = this.loggers.map(logger => logger.restore());
        return Promise.all(restorePromises);
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

    _reportStatus() {
        this.loggers.forEach((logger) => {
            logger.status = this.status;
            logger._reportStatus(this.status);
        });

    }

    _reportFinishTimestamp() {
        this.loggers.forEach((logger) => {
            logger.finishTimeStamp = this.finishTimeStamp;
            logger._reportFinishTimestamp(this.finishTimeStamp);
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
