const BaseStepLogger                   = require('../StepLogger');
const RedisPubDecorator                = require('./redisPubDecorator');
const RedisLogger                      = require('./RedisLogger');
const RedisTaskLogger                  = require('./TaskLogger');
const { STATUS }                       = require('../enums');

class RedisStepLogger extends BaseStepLogger {
    constructor(step, opts, taskLogger) {
        super(step, opts, taskLogger);
        const extendOpts = Object.assign({}, step, opts);
        extendOpts.key = `${step.accountId}:${step.jobId}:steps:${step.name}`;
        const redisConnection = RedisTaskLogger.getRedisConnectionFromCache(extendOpts);
        this.writer = new RedisPubDecorator(extendOpts, new RedisLogger(redisConnection, extendOpts), `${step.accountId}:${step.jobId}`);
        this.writer.setStrategies(`${step.accountId}:${step.jobId}`);
    }

    async restore() {
        this.status = await this.writer.child('status').get();
        this.pendingApproval = this.status === STATUS.PENDING_APPROVAL;
    }

    async _reportLog(message, syncId = Date.now()) {
        await this.writer.child('logs').push(message, syncId);
    }

    _reportOutputUrl() {
        this.writer.child('data').child('outputUrl').set(this.outputUrl);
    }

    _reportEnvironmentName() {
        this.writer.child('data').child('environmentName').set(this.environmentName);
    }

    _reportEnvironmentId() {
        this.writer.child('data').child('environmentId').set(this.environmentId);
    }

    _reportActivityId() {
        this.writer.child('data').child('activityId').set(this.activityId);
    }

    _reportLastUpdate() {
        this.writer.child('lastUpdate').set(this.lastUpdate);
    }

    _reportPrevioulyExecuted() {
        this.writer.child('previouslyExecuted').set(this.previouslyExecuted);
    }

    async _reportStatus() {
        return this.writer.child('status').set(this.status);
    }

    async _reportFinishTimestamp() {
        return this.writer.child('finishTimeStamp').set(this.finishTimeStamp);
    }

    _reportCreationTimestamp() {
        this.writer.child('creationTimeStamp').set(this.creationTimeStamp);
    }

    async _reportMemoryUsage(time, memoryUsage, syncId = Date.now()) {
        await this.writer.child('metrics').child('memory').push({ time, usage: memoryUsage }, syncId);
    }

    async _reportCpuUsage(time, cpuUsage, syncId = Date.now()) {
        await this.writer.child('metrics').child('cpu').push({ time, usage: cpuUsage }, syncId);
    }

    _reportLogSize() {
        this.writer.child('metrics.logs.total').set(this.logSize);
    }

    _reportStepProgress() {
        this.writer.child('progress').set(this.stepProgress);
    }

    reportName() {
        this.writer.child('name').set(this.name);
    }

    clearLogs() {
        // TODO: Is is needed ? if so need to implement (get all keys from set and delete the relevant ones)
    }

    async delete() {
        return this.writer.remove();
    }
}

module.exports = RedisStepLogger;
