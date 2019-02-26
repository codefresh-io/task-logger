const FirebaseTaskLogger = require('./firebase/TaskLogger');
const RedisTaskLogger = require('./redis/TaskLogger');

const factoryMap = {
    [FirebaseTaskLogger.TYPE]: FirebaseTaskLogger.factory,
    [RedisTaskLogger.TYPE]: RedisTaskLogger.factory
};

const factory = async (task, opts) => {
    const func = factoryMap[opts.type];
    if (!func) {
        throw new Error(`Failed to create TaskLogger. Type: ${opts.type} is not supported`);
    }

    return func(task, opts);
};

module.exports = factory;
