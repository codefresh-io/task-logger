const _ = require('lodash');

const CONSOLIDATED = 'consolidated';
const MOVE_FORWARD = -1;
class RedisFlattenStrategy {
    constructor(keys, baseKey) {
        this.keys = keys;
        this.baseKey = baseKey;


    }
    push(obj, key, redisClient, stack, syncId) {
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
                slot: key.substr(this.baseKey.length + 1).replace(new RegExp(':', 'g'), '.'),
                payload: obj,
                time: syncId
            };
            redisClient.zadd(`${this.baseKey}:${CONSOLIDATED}`, syncId, JSON.stringify(objToPush));
            return syncId;
        }
        return MOVE_FORWARD;
    }
}

class RedisArrayStrategy {
    constructor(keys) {
        this.keys = keys;
    }
    push(obj, key, redisClient, stack) {
        if (this.keys.has(stack[0])) {
            if (stack.length === 1 && typeof (obj) === 'string') {
                redisClient.rpush(`${key}:${stack.shift()}`, obj);
            } else {
                while (stack.length !== 0) {
                    key = `${key}:${stack.shift()}`;
                }
                redisClient.rpush(key, JSON.stringify(obj));
            }
            return 1;
        }
        return MOVE_FORWARD;
    }
}

class RedisSetStratry {

    push(obj, key, redisClient, stack) {

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
            redisClient.hmset(key, hsetKeysValues);
        } else {
            redisClient.set(key, obj);
        }
        return 0;

    }
}

class ChainRedisStrategy {

    constructor(strategies) {
        this.strategies = strategies;
    }
    push(obj, key, redisClient, stack, syncId) {
        let id;

        this.strategies.some((strategy) => {
            const result = strategy.push(obj, key, redisClient, stack, syncId);
            const strategyExecuted = result > 0;
            if (strategyExecuted) {
                id = result;
                return true;
            }
            return false;
        });
        return id;
    }
}
module.exports = {
    RedisFlattenStrategy,
    RedisSetStratry,
    ChainRedisStrategy,
    RedisArrayStrategy
};
