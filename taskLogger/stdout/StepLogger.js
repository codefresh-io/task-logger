const Q                  = require('q');
const BaseStepLogger     = require('../StepLogger');

class StdOutStepLogger extends BaseStepLogger {
    constructor(step, opts) {
        super(step, opts);
    }

    restore() {
        return Q.resolve();
    }

    _reportLog(message) {
        process.stdout.write(message);
    }

    _reportOutputUrl() {
        return Q.resolve();
    }

    _reportPrevioulyExecuted() {
        return Q.resolve();
    }

    _reportStatus() {
        return Q.resolve();
    }

    _reportFinishTimestamp() {
        return Q.resolve();
    }

    _reportCreationTimestamp() {
        return Q.resolve();
    }

    _reportMemoryUsage(time, memoryUsage) {
        return Q.resolve();
    }

    _reportCpuUsage(time, cpuUsage) {
        return Q.resolve();
    }

    _reportLogSize() {
        return Q.resolve();
    }

    reportName() {
        return Q.resolve();
    }

    clearLogs() {
        return Q.resolve();
    }

    delete() {
        return Q.resolve();
    }

    getRaw() {
        return Q.resolve();
    }
}

module.exports = StdOutStepLogger;
