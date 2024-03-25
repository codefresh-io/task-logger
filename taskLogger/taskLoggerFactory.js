const FirebaseTaskLogger = require('./firebase/TaskLogger');
const RedisTaskLogger = require('./redis/TaskLogger');
const MongoTaskLogger = require('./mongo/TaskLogger');
const ComposeTaskLogger = require('./composition/TaskLogger');

const factoryMap = {
    [FirebaseTaskLogger.TYPE]: FirebaseTaskLogger.factory,
    [RedisTaskLogger.TYPE]: RedisTaskLogger.factory,
    [MongoTaskLogger.TYPE]: MongoTaskLogger.factory,
    [ComposeTaskLogger.TYPE]: ComposeTaskLogger.factory

};

const factory = async (task, opts, ...rest) => {
    const func = factoryMap[opts.type];
    if (!func) {
        throw new Error(`Failed to create TaskLogger. Type: ${opts.type} is not supported`);
    }

    return func(task, opts, ...rest);
};

module.exports = factory;
