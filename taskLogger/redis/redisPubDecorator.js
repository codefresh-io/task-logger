const NRP = require('node-redis-pubsub');

const scope = 'codefresh';
const nrpCacheMap = new Map();

class RedisPubDecorator {
    constructor(opts, redisLogger, keyPrefixToRemove) {
        this.jobId = opts.jobId;
        this.redisLogger = redisLogger;
        this.keyPrefixToRemove = keyPrefixToRemove;
        this.nrp = RedisPubDecorator.getConnectionFromCache({
            ...opts.redis,
            scope
        });
        this.keyToAction = opts.keyToMapper || {
            'logs': 'e',
            'memory': 'e',
            'cpu': 'e'
        };
    }

    static getConnectionFromCache(config) {
        const key = `${config.host}.${config.port}.${config.db}.${config.scope}`;
        if (!nrpCacheMap.has(key)) {
            nrpCacheMap.set(key, new NRP(
                config
            ));
        }

        return nrpCacheMap.get(key);
    }

    setStrategies(baseKey) {
        this.redisLogger.setStrategies(baseKey);
    }

    _wrapper(toBeWrappedObject, thisArg) {
        const wrappingObj = {
            push: async (obj, syncId) => {
                const key = await toBeWrappedObject.push(obj, syncId);
                this._emit(key, obj);
            },
            child: (path) => {
                const wrappedChild = toBeWrappedObject.child(path);
                return thisArg._wrapper(wrappedChild, thisArg);
            },
            set: async (value) => {
                const key = await toBeWrappedObject.set(value);
                this._emit(key, value);
            },
            update: async (value) => {
                const key = await toBeWrappedObject.update(value);
                this._emit(key, value);
            },
            toString: () => {
                return toBeWrappedObject.toString();
            },
            watch: (fn) => {
                toBeWrappedObject.watch(fn);
            },
            getHash: async () => {
                return toBeWrappedObject.getHash();
            },
            children: () => {
                return toBeWrappedObject.children();
            },
            get: async () => {
                return await toBeWrappedObject.get();
            }
        };
        return wrappingObj;
    }

    child(name) {
        return this._wrapper(this.redisLogger.child(name), this);
    }

    _emit(key, obj) {
        this.nrp.emit(this.jobId, JSON.stringify({
            slot: this._reFormatKey(key.key),
            payload: obj,
            action: this._getAction(key.key),
            ...(key.id > 0 && { id: key.id })
        }));
    }

    _reFormatKey(key) {
        if (this.keyPrefixToRemove) {
            key = key.substr(this.keyPrefixToRemove.length + 1);
        }

        return key.replace(/:/g, '.').replace('.[', '[');
    }

    _getAction(key = '') {
        const splittedKeys = key.split(':');
        if (splittedKeys && splittedKeys.length > 0) {
            const endsWith = splittedKeys[splittedKeys.length - 1];
            const actionFromMapper = this.keyToAction[endsWith];
            if (actionFromMapper) {
                return actionFromMapper;
            }
        }

        return 'r';
    }
}

module.exports = RedisPubDecorator;
