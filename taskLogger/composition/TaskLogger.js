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

    reportId() {
        this.loggers.forEach(logger => logger.reportId());
    }
    reportAccountId() {
        this.loggers.forEach(logger => logger.reportAccountId());

    }
    _reportMemoryUsage(time, memoryUsage) {
        this.loggers.forEach(logger => logger._reportMemoryUsage(time, memoryUsage));

    }

    _reportMemoryLimit() {
        this.loggers.forEach((logger) =>  {
            logger.memoryLimit = this.memoryLimit;
            logger._reportMemoryLimit();
        });


    }

    _reportVisibility() {
        this.loggers.forEach((logger) => {
            logger.visibility = this.visibility;
            logger._reportVisibility();
        });

    }

    _reportData() {
        this.loggers.forEach((logger) =>  {
            logger.data = this.data;
            logger._reportData();
        });

    }

    _reportStatus() {
        this.loggers.forEach((logger) => {
            logger.status = this.status;
            logger._reportStatus();
        });

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
