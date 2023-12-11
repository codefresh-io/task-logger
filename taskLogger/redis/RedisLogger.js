const CFError = require('cf-errors');
const debug = require('debug')('codefresh:taskLogger:redis:RedisLogger');
const assert = require('assert').strict;
const {
    RedisFlattenStrategy,
    RedisSetStratry,
    ChainRedisStrategy,
} = require('./redisStrategies');

const root = 'build-logs';

class RedisLogger {
    constructor(redisClient, opts) {
        this.redisClient = redisClient;
        this.config = opts.redis;
        this.jobId = opts.jobId;
        this.accountId = opts.accountId;
        this.defaultLogKey = `${root}:${opts.key}`;
        this.watachedKeys = new Map();
        this.redisClient.on('error', (err) => {
            const error = new CFError({
                cause: err,
                message: `Redis client error for job ${this.jobId} in account ${this.accountId}`,
            });
            debug(error.toString());
        });
    }

    get redisClientIns() {
        return this.redisClient;
    }

    setStrategies(baseKey) {
        if (baseKey) {
            this.strategies = new ChainRedisStrategy([
                new RedisFlattenStrategy(new Set(['logs', 'metrics']), `${root}:${baseKey}`),
                new RedisSetStratry(),
            ]);
        }
    }

    // This function wraps repetetive calls to logging (e.g. : logger.child(x).set(y) , logger.child(x).child(y).update(z)
    // the stack is kept as part of the clouse call and an isolated object is created for each call (wrapper object)
    _wrapper(key, thisArg, stack) {
        const wrapper = {
            push: async (obj, syncId) => {
                // TODO:HIGH:stack is internal data strcture of the logger , don't pass it
                const stackClone = stack.slice(0);
                let fullKey = key;
                while (stackClone.length !== 0) {
                    fullKey = `${fullKey}:${stackClone.shift()}`;
                }

                const receveidId = await this.strategies.push(obj, key, thisArg.redisClient, stack, syncId);

                // Watch support:
                if (this.watachedKeys.has(fullKey)) {
                    this.watachedKeys.get(fullKey).call(this, obj);
                }

                return {
                    key: fullKey.substr(root.length + 1),
                    id: receveidId
                };
            },
            child: (path) => {
                stack.push(path);
                return thisArg._wrapper(`${key}`, thisArg, stack);
            },
            set: async (value) => {
                return await wrapper.push(value);
            },
            update: async (value) => {
                return await wrapper.set(value);
            },
            toString() {
                wrapper._updateKeyFromStack();
                return key;
            },
            watch: (fn) => {
                wrapper._updateKeyFromStack();
                this.watachedKeys.set(key, fn);
            },
            getHash: async () => {
                wrapper._updateKeyFromStack();
                return await this.redisClient.hGetAll(key).catch((err) => {
                    debug(`Error in redis getHash: ${err.toString()}`);
                });
            },
            get: async () => {
                return await this.redisClient.get(key, stack[0]).catch((err) => {
                    debug(`Error in redis get: ${err.toString()}`);
                });
            },
            children: () => {
                // TODO:Implement with scan/keys
                return [];
            },
            _updateKeyFromStack() {
                while (stack.length !== 0) {
                    key = `${key}:${stack.shift()}`;
                }
            }
        };
        return wrapper;
    }

    child(name) {
        assert(this.defaultLogKey, 'no default log key');
        return this._wrapper(`${this.defaultLogKey}`, this, [name]);
    }

    cleanConnectionOnexit() {
        process.on('exit', () => {
            this.redisClient.quit().catch((err) => {
                debug(`Error in redis quit: ${err.toString()}`);
            });
        });
    }
}

module.exports = RedisLogger;
