const TaskLogger                        = require('../TaskLogger');
const redis                             = require('redis');
const debug                            = require('debug')('codefresh:taskLogger:redis:taskLogger');
const CFError                          = require('cf-errors');

const RedisPubDecorator                = require('./redisPubDecorator');
const RedisLogger                      = require('./RedisLogger');
const { TYPES, STATUS }                        = require('../enums');

const STEPS_REFERENCES_KEY = 'stepsReferences';
const redisCacheMap = new Map();

class RedisTaskLogger extends TaskLogger {
    constructor(task, opts, redisConnection) {
        super(task, opts);
        const extendOpts = Object.assign({}, task, opts);
        extendOpts.key = `${task.accountId}:${task.jobId}`;
        this.writter = new RedisPubDecorator(extendOpts, new RedisLogger(redisConnection, extendOpts), extendOpts.key);
        this.writter.setStrategies(extendOpts.key);
        this.type = TYPES.REDIS;


    }

    static async factory(task, opts) {
        if (!opts || !opts.redis) {
            throw new CFError(CFError.Errors.Error, 'no config');
        }
        const redisConnection = await RedisTaskLogger.createRedisConnection(task, opts);
        return new RedisTaskLogger(task, opts, redisConnection);

    }

    static async createRedisConnection(task, opts) {
        const {
            redis: {
                host,
                port,
                db,
            }
        } = opts;
        const key = `${host}.${port}.${db}`;
        if (redisCacheMap.has(key)) {
            return redisCacheMap.get(key);
        }

        return new Promise(async (resolve, reject) => {
            const client = await redis.createClient(opts.redis)
                .on('error', (err) => {
                    debug(`redis client error ; ${err.message}`);
                    console.log(`error: ${err} `);
                    reject(new CFError({
                        cause: err,
                        message: `Failed to create redis taskLogger`
                    }));
                })
                .connect();
            debug(`redis client initilzed from task : ${JSON.stringify(task)}`);
            redisCacheMap.set(key, client);
            resolve(client);
        });
    }

    static getRedisConnectionFromCache(opts) {
        const config = opts.redis;
        const key = `${config.host}.${config.port}.${config.db}`;
        if (redisCacheMap.has(key)) {
            return redisCacheMap.get(key);
        }
        return undefined;
    }

    newStepAdded(step) {

        this.writter.child(STEPS_REFERENCES_KEY).push({
            [step.name]: step.status
        });

        this.emit('step-pushed', step.name);


    }
    async restore() {

        const keyToStatus = await this.writter.child(STEPS_REFERENCES_KEY).getHash();
        if (keyToStatus) {
            const stepFromRedis = Object.keys(keyToStatus);
            const StepLogger = require('./StepLogger'); // eslint-disable-line
            this.steps = stepFromRedis.reduce((acc, current) => {
                acc[current] =
                new StepLogger({
                    name: current,
                    jobId: this.jobId,
                    accountId: this.accountId
                }, this.opts, this);
                acc[current].pendingApproval = keyToStatus[current] === STATUS.PENDING_APPROVAL;
                acc[current].status = keyToStatus[current];
                return acc;
            }, {});
        }

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

    async reportId() {
        return this.writter.child('id').set(this.jobId);
    }
    async reportAccountId() {
        return this.writter.child('accountId').set(this.accountId);
    }
    _reportMemoryUsage(time, memoryUsage, syncId) {
        this.writter.child('metrics').child('memory').push({ time, usage: memoryUsage }, syncId);
    }

    _reportMemoryLimit() {
        this.writter.child('metrics.limits.memory').push({ 'value': this.memoryLimit });
    }

    _reportDiskState(time, diskState, syncId) {
        this.writter.child('metrics').child('disk').push({ time, ...diskState }, syncId);
    }

    _reportDiskSpaceUsageLimit() {
        this.writter.child('metrics.limits.diskSpaceUsage').push({ 'value': this.diskSpaceUsageLimit });
    }

    async _reportVisibility() {
        return this.writter.child('visibility').set(this.visibility);
    }

    async _reportData() {
        return this.writter.child('data').set(this.data);
    }

    async _reportStatus() {
        return this.writter.child('status').set(this.status);
    }

    _reportLogSize() {
        this.writter.child('metrics.logs.total').set(this.logSize);
    }

}
RedisTaskLogger.TYPE = TYPES.REDIS;

module.exports = RedisTaskLogger;

