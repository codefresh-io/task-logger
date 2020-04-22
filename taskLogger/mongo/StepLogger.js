const BaseStepLogger                   = require('../StepLogger');
const MongoTaskLogger                  = require('./TaskLogger');
const { STATUS }                       = require('../enums');
const MongoHelper                       = require('./mongoHelper');
const EventEmitter                      = require('events');


class MongoStepLogger extends BaseStepLogger {
    constructor(step, opts, taskLogger) {
        super(step, opts, taskLogger);
        this.db = MongoTaskLogger.getConnection(opts);
        this.emitter = new EventEmitter();
    }

    async restore() {
        const key = 'name';
        const doc = await new Promise((resolve, reject) => {
            this.db.collection(MongoHelper.getCollection(key)).find(this.getFilter())
                    .toArray((err, docs) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(docs && docs[0]);
                        }
                    });
        });
        if (doc) {
            this.status = doc.status;
            this.pendingApproval = this.status === STATUS.PENDING_APPROVAL;
        }
    }

    _reportLog(message, syncId) {
        const key = 'logs';
        this.db.collection(MongoHelper.getCollection(key)).insertOne(
            this.getObjectToPush(key, message, syncId), (err) => {
                if (err) {
                    this.emitter.emit('ERROR', err);
                }
            });
    }

    _reportOutputUrl() {
        const key = `steps.${this.name}.data.outputUrl`;
        this.db.collection(MongoHelper.getCollection(key)).updateOne(this.getFilter(),
            { $set: { [key]: this.outputUrl } }, { upsert: true }, (err) => {
                if (err) {
                    this.emitter.emit('ERROR', err);
                }
            });
    }

    _reportLastUpdate() {
        const key = `steps.${this.name}.lastUpdate`;
        this.db.collection(MongoHelper.getCollection(key)).updateOne(this.getFilter(),
        { $set: { [key]: this.lastUpdate } }, { upsert: true }, (err) => {
            if (err) {
                this.emitter.emit('ERROR', err);
            }
        });
    }

    _reportPrevioulyExecuted() {
        const key = `steps.${this.name}.previouslyExecuted`;
        this.db.collection(MongoHelper.getCollection(key)).updateOne(this.getFilter(),
        { $set: { [key]: this.previouslyExecuted } }, { upsert: true }, (err) => {
            if (err) {
                this.emitter.emit('ERROR', err);
            }
        });
    }

    _reportStatus() {
        const key = `steps.${this.name}.status`;
        this.db.collection(MongoHelper.getCollection(key)).updateOne(this.getFilter(),
        { $set: { [key]: this.status } }, { upsert: true }, (err) => {
            if (err) {
                this.emitter.emit('ERROR', err);
            }
        });
    }

    _reportFinishTimestamp() {
        const key = `steps.${this.name}.finishTimeStamp`;
        this.db.collection(MongoHelper.getCollection(key)).updateOne(this.getFilter(),
        { $set: { [key]: this.finishTimeStamp } }, { upsert: true }, (err) => {
            if (err) {
                this.emitter.emit('ERROR', err);
            }
        });
    }

    _reportCreationTimestamp() {
        const key = `steps.${this.name}.creationTimeStamp`;
        this.db.collection(MongoHelper.getCollection(key)).updateOne(this.getFilter(),
        { $set: { [key]: this.creationTimeStamp } }, { upsert: true }, (err) => {
            if (err) {
                this.emitter.emit('ERROR', err);
            }
        });
    }

    _reportMemoryUsage(time, memoryUsage, syncId) {
        const key = 'metrics.memory';
        this.db.collection(MongoHelper.getCollection(key)).insertOne(
            this.getObjectToPush(key, { time, usage: memoryUsage }, syncId), (err) => {
                if (err) {
                    this.emitter.emit('ERROR', err);
                }
            });
    }

    _reportCpuUsage(time, cpuUsage, syncId) {
        const key = 'metrics.cpu';
        this.db.collection(MongoHelper.getCollection(key)).insertOne(
            this.getObjectToPush(key, { time, usage: cpuUsage }, syncId), (err) => {
                if (err) {
                    this.emitter.emit('ERROR', err);
                }
            });
    }

    _reportLogSize() {
        const key = `steps.${this.name}.metrics.logs.total`;
        this.db.collection(MongoHelper.getCollection(key)).updateOne(this.getFilter(),
        { $set: { [key]: this.logSize } }, { upsert: true }, (err) => {
            if (err) {
                this.emitter.emit('ERROR', err);
            }
        });
    }

    reportName() {
        const key = `steps.${this.name}.name`;
        this.db.collection(MongoHelper.getCollection(key)).updateOne(this.getFilter(),
        { $set: { [key]: this.name } }, { upsert: true }, (err) => {
            if (err) {
                this.emitter.emit('ERROR', err);
            }
        });
    }

    clearLogs() {
        // TODO: Is is needed ? if so need to implement (get all keys from set and delete the relevant ones)
    }

    async delete() {
        // return this.writter.remove();
    }

    getObjectToPush(key, payload, syncId) {
        return {
            accountId: this.accountId,
            jobId: this.jobId,
            slot: `steps.${this.name}.${key}`,
            payload,
            time: syncId
        };
    }

    getFilter() {
        return {
            accountId: this.accountId,
            jobId: this.jobId
        };
    }

}

module.exports = MongoStepLogger;
