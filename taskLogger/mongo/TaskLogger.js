const TaskLogger = require('../TaskLogger');
const CFError = require('cf-errors');
const MongoClient = require('mongodb').MongoClient;
const { TYPES, STATUS } = require('../enums');
const EventEmitter = require('events');

const mongoCacheMap = new Map();

class MongoTaskLogger extends TaskLogger {

    constructor(db, task, opts) {
        super(task, opts);
        this.db = db;
        this.mongoDBName = opts.mongo.mongoDBName;
        this.type = TYPES.MONGO;
        this.emitter = new EventEmitter();
    }
    static async factory(task, opts) {
        if (!opts || !opts.mongo) {
            throw new CFError(CFError.Errors.Error, 'no config');
        }
        const db = await MongoTaskLogger.connect(opts);
        return new MongoTaskLogger(db, task, opts);

    }

    static async connect(opts) {

        const config = opts.mongo;
        const key = `${config.mongoURI}.${config.mongoDBName}`;
        if (!mongoCacheMap.has(key)) {
            const mongodbOptions = {
                useNewUrlParser: true,
                ...opts.mongodbOptions,
            };

            if (mongodbOptions.sslKey && !Buffer.isBuffer(mongodbOptions.sslKey)) {
                mongodbOptions.sslKey = Buffer.from(mongodbOptions.sslKey);
            }

            if (mongodbOptions.sslCert && !Buffer.isBuffer(mongodbOptions.sslCert)) {
                mongodbOptions.sslCert = Buffer.from(mongodbOptions.sslCert);
            }

            const client = await MongoClient.connect(config.mongoURI, mongodbOptions);
            mongoCacheMap.set(key, client.db(config.mongoDBName));
        }
        return mongoCacheMap.get(key);
    }

    static getConnection(opts) {
        const config = opts.mongo;
        const key = `${config.mongoURI}.${config.mongoDBName}`;
        if (mongoCacheMap.has(key)) {
            return mongoCacheMap.get(key);
        }
        return undefined;
    }

    newStepAdded(step) {
        this.emit('step-pushed', step.name);
    }

    async restore() {
        const key = 'name';
        const dbSteps = await new Promise((resolve, reject) => {
            this.db.collection(this.getCollection(key)).find(
                Object.assign({ 'name': { $exists: true } }, this.getFilter()))
                .toArray((err, docs) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(docs);
                    }
                });
        });

        if (dbSteps) {
            // const stepFromRedis = Object.keys(keyToStatus);
            const StepLogger = require('./StepLogger'); // eslint-disable-line
            this.steps = dbSteps.reduce((acc, current) => {
                const name = current.name;
                acc[name] =
                    new StepLogger({
                        name: current.name,
                        jobId: this.jobId,
                        accountId: this.accountId
                    }, this.opts, this);
                acc[name].pendingApproval = current.status === STATUS.PENDING_APPROVAL;
                acc[name].status = current.status;
                return acc;
            }, {});
        }

    }

    async addErrorMessageToEndOfSteps(message) {

        Object.keys(this.steps).forEach((step) => {
            this.steps[step]._reportLog(`\x1B[31m${message}\x1B[0m\r\n`);
        });
    }

    async getLastUpdate() {

        const key = 'lastUpdate';
        return new Promise((resolve, reject) => {
            this.db.collection(this.getCollection(key)).find(
                this.getFilter())
                .toArray((err, docs) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(docs && docs[0] && docs[0].lastUpdate);
                    }
                });
        });
    }

    _reportLastUpdate(value) {
        const key = 'lastUpdate';
        const filter = this.getFilter();
        this.db.collection(this.getCollection(key)).updateOne(filter,
            { $set: Object.assign({ [key]: value }, filter) }, { upsert: true }, (err) => {
                if (err) {
                    this.emitter.emit('ERROR', err);
                }
            });
    }

    async reportId() {
        const key = 'id';
        const filter = this.getFilter();
        return this.db.collection(this.getCollection(key)).updateOne(filter,
            { $set: Object.assign({ [key]: this.jobId }, filter) }, { upsert: true }, (err) => {
                if (err) {
                    this.emitter.emit('ERROR', err);
                }
            });
    }
    async reportAccountId() {
        const key = 'accountId';
        const filter = this.getFilter();
        return this.db.collection(this.getCollection(key)).updateOne(filter,
            { $set: Object.assign({ [key]: this.accountId }, filter) }, { upsert: true }, (err) => {
                if (err) {
                    this.emitter.emit('ERROR', err);
                }
            });
    }
    _reportMemoryUsage(time, memoryUsage) {
        const key = 'metrics.memory';
        const filter = this.getFilter();
        this.db.collection(this.getCollection(key)).insertOne(
            Object.assign({ 'slot': 'metrics.memory', 'payload': { time, usage: memoryUsage } }, filter), { upsert: true }, (err) => {
                if (err) {
                    this.emitter.emit('ERROR', err);
                }
            });
    }

    _reportMemoryLimit() {
        const key = 'metrics.limits.memory';
        this.db.collection(this.getCollection(key)).updateOne(this.getFilter(),
            { $set: { 'metrics.limits.memory': { 'value': this.memoryLimit } } }, { upsert: true }, (err) => {
                if (err) {
                    this.emitter.emit('ERROR', err);
                }
            });

    }

    async _reportVisibility() {
        const key = 'visibility';
        return this.db.collection(this.getCollection(key)).updateOne(this.getFilter(),
            { $set: { [key]: this.visibility } }, { upsert: true }, (err) => {
                if (err) {
                    this.emitter.emit('ERROR', err);
                }
            });
    }

    async _reportData() {
        const key = 'data';
        return this.db.collection(this.getCollection(key)).updateOne(this.getFilter(),
            { $set: { 'data': this.data } }, { upsert: true }, (err) => {
                if (err) {
                    this.emitter.emit('ERROR', err);
                }
            });
    }

    async _reportStatus() {
        const key = 'data';
        return this.db.collection(this.getCollection(key)).updateOne(this.getFilter(),
            { $set: { 'status': this.status } }, { upsert: true }, (err) => {
                if (err) {
                    this.emitter.emit('ERROR', err);
                }
            });
    }
    _reportLogSize() {
        const key = 'metrics';
        this.db.collection(this.getCollection(key)).updateOne(this.getFilter(),
            { $set: { 'metrics.logs.total': this.logSize } }, { upsert: true }, (err) => {
                if (err) {
                    this.emitter.emit('ERROR', err);
                }
            });
    }

    async _getStepsName() {
        const key = 'name';
        return new Promise((resolve, reject) => {
            this.db.collection(this.getCollection(key)).findOne(
                this.getFilter(), (err, doc) => {
                    if (err) {
                        reject(err);
                    } else {

                        resolve(doc);
                    }
                });
        });
    }

    // eslint-disable-next-line consistent-return
    async getRaw() {

        const dbSteps = await this._getStepsName();
        if (!dbSteps) {
            return;
        }
        // const stepFromRedis = Object.keys(keyToStatus);
        const StepLogger = require('./StepLogger'); // eslint-disable-line
        const steps = await Promise.all(Object.keys(dbSteps.steps).map((name) => {
            const logger = new StepLogger({
                name,
                jobId: this.jobId,
                accountId: this.accountId
            }, this.opts, this);
            return logger.getRaw();
        }, []));

        const stepWithLogs = Object.keys(dbSteps.steps).map((name, idx) => {
            const step = steps[idx] || [];
            return {
                name,
                logs: step.map(record => record.payload)
            };
        }, {});
        // eslint-disable-next-line consistent-return
        return {
            steps: stepWithLogs,
            id: this.jobId,
        };


    }

    getFilter() {
        return {
            accountId: this.accountId,
            jobId: this.jobId
        };
    }

    getCollection(key) {
        return key === 'metrics.memory' ? 'logs' : 'metadata';
    }
}
MongoTaskLogger.TYPE = TYPES.MONGO;
module.exports = MongoTaskLogger;
