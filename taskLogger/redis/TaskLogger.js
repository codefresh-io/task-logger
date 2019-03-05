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
        return new Promise((resolve, reject) => {

            const config = opts.redis;
            const key = `${config.host}.${config.port}.${config.db}`;
            if (!redisCacheMap.has(key)) {
                const client = redis.createClient(config);
                client.on('ready', () => {
                    debug(`redis client initilzed from task : ${JSON.stringify(task)}`);
                    redisCacheMap.set(key, client);
                    resolve(client);
                });
                client.on('error', (err) => {
                    debug(`redis client error ; ${err.message}`);
                    reject(new CFError({
                        cause: err,
                        message: `Failed to create redis taskLogger`
                    }));
                });
            } else {
                resolve(redisCacheMap.get(key));
            }


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
                }, this.opts);
                acc[current].pendingApproval = keyToStatus[current] === STATUS.PENDING_APPROVAL;
                acc[current].status = keyToStatus[current];
                return acc;
            }, {});
        }

    }
    async addErrorMessageToEndOfSteps(message) {
        Object.keys(this.steps).forEach((step) => {
            this.steps[step]._reportLog(`\x1B[31m${message}\x1B[0m\r\n`);
        });
    }

    reportId() {
        this.writter.child('id').set(this.jobId);
    }
    reportAccountId() {
        this.writter.child('accountId').set(this.accountId);
    }
    _reportMemoryUsage(time, memoryUsage) {
        this.writter.child('metrics').child('memory').push({ time, usage: memoryUsage });
    }

    _reportMemoryLimit() {
        this.writter.child('metrics').child('limits').child('memory').push(this.memoryLimit);
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
        this.baseRef.child('metrics').child('logs').child('total').set(this.logSize);
    }
}
RedisTaskLogger.TYPE = TYPES.REDIS;

module.exports = RedisTaskLogger;

