const _                                 = require('lodash');
const TaskLogger                        = require('../TaskLogger');
const { TYPES }                         = require('../enums');


class CompositionTaskLogger extends TaskLogger {

    constructor(loggers, task, opts) {
        super(task, opts);
        this.loggers = loggers;
        this.type = TYPES.COMPOSE;

    }
    static async factory(task, opts) {
        const loggers = await Promise.all(opts.loggersDefs.map(async logger => require('../taskLoggerFactory')(task, logger.opts))); // eslint-disable-line
        return new CompositionTaskLogger(loggers, task, opts);
    }
    newStepAdded(step) {
        this.loggers.forEach(logger => logger.newStepAdded(step));
    }

    async restore() {
        const restorePromises = this.loggers.map(logger => logger.restore());
        return Promise.all(restorePromises);
    }

    async addErrorMessageToEndOfSteps(message) {

        const promises = this.loggers.map(logger => logger.addErrorMessageToEndOfSteps(message));
        return Promise.all(promises);
    }

    async getLastUpdate() {
        return this.loggers[0].getLastUpdate();
    }

    _reportLastUpdate(value) {
        this.loggers.forEach(logger => logger._reportLastUpdate(value));
    }

    async reportId() {
        return _.map(this.loggers, logger => logger.reportId());
    }

    async reportAccountId() {
        return _.map(this.loggers, logger => logger.reportAccountId());
    }

    _reportMemoryUsage(time, memoryUsage) {
        const syncId = Date.now();
        this.loggers.forEach(logger => logger._reportMemoryUsage(time, memoryUsage, syncId));

    }

    _reportMemoryLimit() {
        this.loggers.forEach((logger) =>  {
            logger.memoryLimit = this.memoryLimit;
            logger._reportMemoryLimit();
        });


    }

    _reportDiskState(time, diskState) {
        const syncId = Date.now();
        this.loggers.forEach(logger => logger._reportDiskState(time, diskState, syncId));
    }

    _reportDiskSpaceUsageLimit() {
        this.loggers.forEach((logger) =>  {
            logger.diskSpaceUsageLimit = this.diskSpaceUsageLimit;
            logger._reportDiskSpaceUsageLimit();
        });
    }

    async _reportVisibility() {
        return _.map(this.loggers, (logger) => {
            logger.visibility = this.visibility;
            return logger._reportVisibility();
        });
    }

    _reportData() {
        return _.map(this.loggers, (logger) => {
            logger.data = this.data;
            return logger._reportData();
        });
    }

    async _reportStatus() {
        return _.map(this.loggers, (logger) => {
            logger.status = this.status;
            return logger._reportStatus();
        });
    }
    async getRaw() {

        const promises = [];

        this.loggers.forEach((logger) => {
            promises.push(logger.getRaw());
        });
        const arr = await Promise.all(promises);

        // return the first logger that return data

        return arr.find(steps => !!steps);

    }

    _reportLogSize() {
        this.loggers.forEach((logger) => {
            logger.logSize = this.logSize;
            logger._reportLogSize();
        });
    }
}
CompositionTaskLogger.TYPE = TYPES.COMPOSE;
module.exports = CompositionTaskLogger;
