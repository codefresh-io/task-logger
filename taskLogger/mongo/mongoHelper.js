const keyMapper =  {
    'logs': 'logs',
    'metrics': 'logs',
    'metrics.memory': 'logs',
    'metrics.cpu': 'logs',
    'metrics.logs.total': 'logs',
    'default': 'metadata'
};

class MongoHelper {

    static getCollection(key) {
        return keyMapper[key] || keyMapper.default;
    }

}

module.exports = MongoHelper;
