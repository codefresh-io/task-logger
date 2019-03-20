const BaseStepLogger                   = require('../StepLogger');
const RedisPubDecorator                = require('./redisPubDecorator');
const RedisLogger                      = require('./RedisLogger');
const RedisTaskLogger                  = require('./TaskLogger');
const { STATUS }                       = require('../enums');

class RedisStepLogger extends BaseStepLogger {
    constructor(step, opts) {
        super(step, opts);
        const extendOpts = Object.assign({}, step, opts);
        extendOpts.key = `${step.accountId}:${step.jobId}:steps:${step.name}`;
        const redisConnection = RedisTaskLogger.getRedisConnectionFromCache(extendOpts);
        this.writter = new RedisPubDecorator(extendOpts, new RedisLogger(redisConnection, extendOpts), `${step.accountId}:${step.jobId}`);
        this.writter.setStrategies(`${step.accountId}:${step.jobId}`);
    }

    async restore() {
        this.status = await this.writter.child('status').get();
        this.pendingApproval = this.status === STATUS.PENDING_APPROVAL;
    }

    _reportLog(message, syncId) {
        this.writter.child('logs').push(message, syncId);
    }

    _reportLastUpdate() {
        this.writter.child('lastUpdate').set(this.lastUpdate);
    }

    _reportPrevioulyExecuted() {
        this.writter.child('previouslyExecuted').set(this.previouslyExecuted);
    }

    _reportStatus() {
        this.writter.child('status').set(this.status);
    }

    _reportFinishTimestamp() {
        this.writter.child('finishTimeStamp').set(this.finishTimeStamp);
    }

    _reportCreationTimestamp() {
        this.writter.child('creationTimeStamp').set(this.creationTimeStamp);
    }

    _reportMemoryUsage(time, memoryUsage, syncId) {
        this.writter.child('metrics').child('memory').push({ time, usage: memoryUsage }, syncId);
    }

    _reportCpuUsage(time, cpuUsage, syncId) {
        this.writter.child('metrics').child('cpu').push({ time, usage: cpuUsage }, syncId);
    }

    _reportLogSize() {
        this.writter.child('metrics.logs.total').set(this.logSize);
    }

    reportName() {
        this.writter.child('name').set(this.name);
    }

    clearLogs() {
        // TODO: Is is needed ? if so need to implement (get all keys from set and delete the relevant ones)
    }

    async delete() {
        return this.writter.remove();
    }
}

module.exports = RedisStepLogger;
