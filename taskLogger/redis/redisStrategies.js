/* eslint-disable max-classes-per-file */
const _ = require('lodash');
const debug = require('debug')('codefresh:taskLogger:redis:RedisStrategies');

const CONSOLIDATED = 'consolidated';
const MOVE_FORWARD = -1;

class RedisFlattenStrategy {
    constructor(keys, baseKey) {
        this.keys = keys;
        this.baseKey = baseKey;
    }

    async push(obj, key, redisClient, stack, syncId) {
        const lastKeyPart = _.last(key.split(':'));
        const keyInKeysSet =  [stack[0], lastKeyPart].some(this.keys.has.bind(this.keys));
        if (keyInKeysSet) {
            while (stack.length !== 0) {
                key = `${key}:${stack.shift()}`;
            }

            if (!syncId) {
                throw new Error(`syncId for key: ${key} is required for RedisFlattenStrategy`);
            }

            const objToPush = {
                slot: key.substr(this.baseKey.length + 1).replace(/:/g, '.'),
                payload: obj,
                time: syncId
            };
            const member = {
                score: syncId,
                value: objToPush,
            };
            await redisClient.zAdd(`${this.baseKey}:${CONSOLIDATED}`, member).catch((err) => {
                debug(`Error in redis zAdd: ${err.toString()}`);
            });
            return syncId;
        }

        return MOVE_FORWARD;
    }
}

class RedisArrayStrategy {
    constructor(keys) {
        this.keys = keys;
    }

    async push(obj, key, redisClient, stack) {
        if (this.keys.has(stack[0])) {
            if (stack.length === 1 && typeof (obj) === 'string') {
                await redisClient.rPush(`${key}:${stack.shift()}`, obj).catch((err) => {
                    debug(`Error in redis rPush: ${err.toString()}`);
                });
            } else {
                while (stack.length !== 0) {
                    key = `${key}:${stack.shift()}`;
                }

                await redisClient.rPush(key, JSON.stringify(obj)).catch((err) => {
                    debug(`Error in redis rPush: ${err.toString()}`);
                });
            }

            return 1;
        }

        return MOVE_FORWARD;
    }
}

class RedisSetStratry {
    async push(obj, key, redisClient, stack) {
        if (typeof (obj) !== 'object' && stack.length !== 0) {
            obj = {
                [stack.pop()]: obj
            };
        }

        if (typeof (obj) === 'object') {
            while (stack.length !== 0) {
                key = `${key}:${stack.shift()}`;
            }

            if (Object.keys(obj).length === 0) {
                return MOVE_FORWARD;
            }

            const hsetKeysValues = Object.keys(obj).reduce((acc, objKey) => {
                acc.push(objKey);
                acc.push(obj[objKey]);
                return acc;
            }, []);
            await redisClient.hSet(key, hsetKeysValues).catch((err) => {
                debug(`Error in redis hSet: ${err.toString()}`);
            });
        } else {
            await redisClient.set(key, obj).catch((err) => {
                debug(`Error in redis set: ${err.toString()}`);
            });
        }

        return 0;
    }
}

class ChainRedisStrategy {
    constructor(strategies) {
        this.strategies = strategies;
    }

    async push(obj, key, redisClient, stack, syncId) {
        // eslint-disable-next-line no-restricted-syntax
        for (const strategy of this.strategies) {
            // eslint-disable-next-line no-await-in-loop
            const result = await strategy.push(obj, key, redisClient, stack, syncId);
            const strategyExecuted = result > 0;
            if (strategyExecuted) {
                return result;
            }
        }

        return undefined;
    }
}

module.exports = {
    RedisFlattenStrategy,
    RedisSetStratry,
    ChainRedisStrategy,
    RedisArrayStrategy
};
