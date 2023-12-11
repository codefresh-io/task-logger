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
            debug(error.message);
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
            push: (obj, syncId) => {
                // TODO:HIGH:stack is internal data strcture of the logger , don't pass it
                const stackClone = stack.slice(0);
                let fullKey = key;
                while (stackClone.length !== 0) {
                    fullKey = `${fullKey}:${stackClone.shift()}`;
                }

                const receveidId = this.strategies.push(obj, key, thisArg.redisClient, stack, syncId);

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
            set: (value) => {
                return wrapper.push(value);
            },
            update: (value) => {
                return wrapper.set(value);
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
                return new Promise((resolve, reject) => {
                    this.redisClient.hGetAll(key, (err, keys) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(keys);
                        }
                    });
                });
            },
            get: async () => {
                return new Promise((resolve, reject) => {
                    this.redisClient.hGet(`${key}`, stack[0], (err, value) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(value);
                        }
                    });
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
            this.redisClient.quit();
        });
    }
}

module.exports = RedisLogger;
