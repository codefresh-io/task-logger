const TaskLogger                        = require('../TaskLogger');
const CFError                           = require('cf-errors');
const MongoClient                       = require('mongodb').MongoClient;
const { TYPES, STATUS }                 = require('../enums');
const EventEmitter                      = require('events');

const mongoCacheMap                     = new Map();

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
                useNewUrlParser: true
            };
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
                }, this.opts);
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

    reportId() {
        const key = 'id';
        const filter = this.getFilter();
        this.db.collection(this.getCollection(key)).updateOne(filter,
        { $set: Object.assign({ [key]: this.jobId }, filter) }, { upsert: true }, (err) => {
            if (err) {
                this.emitter.emit('ERROR', err);
            }
        });
    }
    reportAccountId() {
        const key = 'accountId';
        const filter = this.getFilter();
        this.db.collection(this.getCollection(key)).updateOne(filter,
        { $set: Object.assign({ [key]: this.accountId }, filter) }, { upsert: true }, (err) => {
            if (err) {
                this.emitter.emit('ERROR', err);
            }
        });
    }
    _reportMemoryUsage(time, memoryUsage) {
        const key = 'metrics';
        const filter = this.getFilter();
        this.db.collection(this.getCollection(key)).updateOne(filter,
        { $set: Object.assign({ 'metrics.memory': { time, usage: memoryUsage } }, filter) }, { upsert: true }, (err) => {
            if (err) {
                this.emitter.emit('ERROR', err);
            }
        });
    }

    _reportMemoryLimit() {
        const key = 'metrics';
        this.db.collection(this.getCollection(key)).updateOne(this.getFilter(),
        { $set: { 'metrics.limits.memory': this.memoryLimit } }, { upsert: true }, (err) => {
            if (err) {
                this.emitter.emit('ERROR', err);
            }
        });

    }

    _reportVisibility() {
        const key = 'visibility';
        this.db.collection(this.getCollection(key)).updateOne(this.getFilter(),
        { $set: { [key]: this.visibility } }, { upsert: true }, (err) => {
            if (err) {
                this.emitter.emit('ERROR', err);
            }
        });
    }

    _reportData() {
        const key = 'data';
        this.db.collection(this.getCollection(key)).updateOne(this.getFilter(),
        { $set: { 'data': this.data } }, { upsert: true }, (err) => {
            if (err) {
                this.emitter.emit('ERROR', err);
            }
        });
    }

    _reportStatus() {
        const key = 'data';
        this.db.collection(this.getCollection(key)).updateOne(this.getFilter(),
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

    getFilter() {
        return {
            accountId: this.accountId,
            jobId: this.jobId
        };
    }

    getCollection() {
        return 'metadata';
    }
}
MongoTaskLogger.TYPE = TYPES.MONGO;
module.exports = MongoTaskLogger;
