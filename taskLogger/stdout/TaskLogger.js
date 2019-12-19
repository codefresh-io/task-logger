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
        this.writter.child('lastUpdate').set(value);
    }

    reportId() {
        this.writter.child('id').set(this.jobId);
    }
    reportAccountId() {
        this.writter.child('accountId').set(this.accountId);
    }
    _reportMemoryUsage(time, memoryUsage, syncId) {
        this.writter.child('metrics').child('memory').push({ time, usage: memoryUsage }, syncId);
    }

    _reportMemoryLimit() {
        this.writter.child('metrics.limits.memory').push(this.memoryLimit);
    }

    _reportVisibility() {
        this.writter.child('visibility').set(this.visibility);
    }

    _reportData() {
        this.writter.child('data').set(this.data);
    }

    _reportStatus() {
        this.writter.child('status').set(this.status);
    }
    _reportLogSize() {
        this.writter.child('metrics.logs.total').set(this.logSize);
    }
}

StdOutTaskLogger.TYPE = TYPES.STDOUT;

module.exports = StdOutTaskLogger;
