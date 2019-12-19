const TaskLogger = require('../TaskLogger');
const { TYPES, STATUS } = require('../enums');


class StdOutTaskLogger extends TaskLogger {
    constructor(task, opts) {
        super(task, opts);
        this.type = TYPES.STDOUT

    }
    static async factory(task, opts) {
        return new StdOutTaskLogger(task, opts);
    }

    newStepAdded(step) {
        this.emit('step-pushed', step.name);
    }

    async getLastUpdate() {

        return  this.writter.child('lastUpdate').get();
    }

    async addErrorMessageToEndOfSteps(message) {
        Object.keys(this.steps).forEach((step) => {
            this.steps[step]._reportLog(`\x1B[31m${message}\x1B[0m\r\n`);
        });
    }

    _reportLastUpdate(value) {

    }

    restore() {
        return Q.resolve();
    }

    reportId() {

    }
    reportAccountId() {

    }
    _reportMemoryUsage(time, memoryUsage, syncId) {

    }

    _reportMemoryLimit() {

    }

    _reportVisibility() {

    }

    _reportData() {

    }

    _reportStatus() {

    }
    _reportLogSize() {

    }
}

StdOutTaskLogger.TYPE = TYPES.STDOUT;

module.exports = StdOutTaskLogger;
