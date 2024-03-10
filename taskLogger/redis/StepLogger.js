const BaseStepLogger                   = require('../StepLogger');
const RedisPubDecorator                = require('./redisPubDecorator');
const RedisLogger                      = require('./RedisLogger');
const RedisTaskLogger                  = require('./TaskLogger');
const { STATUS }                       = require('../enums');

class RedisStepLogger extends BaseStepLogger {
    constructor(step, opts, taskLogger) {
        super(step, opts, taskLogger);
        const extendOpts = { ...step, ...opts };
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

    async _reportOutputUrl() {
        await this.writer.child('data').child('outputUrl').set(this.outputUrl);
    }

    async _reportEnvironmentName() {
        await this.writer.child('data').child('environmentName').set(this.environmentName);
    }

    async _reportEnvironmentId() {
        await this.writer.child('data').child('environmentId').set(this.environmentId);
    }

    async _reportActivityId() {
        await this.writer.child('data').child('activityId').set(this.activityId);
    }

    async _reportLastUpdate() {
        await this.writer.child('lastUpdate').set(this.lastUpdate);
    }

    async _reportPrevioulyExecuted() {
        await this.writer.child('previouslyExecuted').set(this.previouslyExecuted);
    }

    async _reportStatus() {
        return await this.writer.child('status').set(this.status);
    }

    async _reportFinishTimestamp() {
        return await this.writer.child('finishTimeStamp').set(this.finishTimeStamp);
    }

    async _reportCreationTimestamp() {
        await this.writer.child('creationTimeStamp').set(this.creationTimeStamp);
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

    async _reportStepProgress() {
        await this.writer.child('progress').set(this.stepProgress);
    }

    async reportName() {
        await this.writer.child('name').set(this.name);
    }

    clearLogs() {
        // TODO: Is is needed ? if so need to implement (get all keys from set and delete the relevant ones)
    }

    async delete() {
        return await this.writer.remove();
    }
}

module.exports = RedisStepLogger;
