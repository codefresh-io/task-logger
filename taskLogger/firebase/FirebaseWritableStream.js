const { Writable } = require('stream');
const _ = require('lodash');

const FIREBASE_MESSAGE_SIZE_LIMIT = 10 * 1024 * 1024; // 10 MB Maximum size of a string


class FirebaseWritableStream extends Writable {
    constructor(_firebaseClient, options) {
        super(options);
        this._firebaseClient = _firebaseClient;
        this._timeUnitLimitMs = options.timeUnitLimitMs;
        this._debounceDelay = options.debounceDelay;
        this._messageSizeLimitPerTimeUnit = options.messageSizeLimitPerTimeUnit;
        this._batchSize = options.batchSize;
    }

    _write(chunk, encoding, next) {
        clearTimeout(this._debounceTimeout);
        const newLogKey = `${this._firebaseClient.child('logs').push().key()}`;
        const currentMessageSize = Buffer.byteLength(chunk);

        this._previousTimestamp = this._previousTimestamp || new Date().getTime();

        const now = new Date().getTime();
        const msDelta = now - this._previousTimestamp;
        console.log(`${new Date().toISOString()} streamLog.updateBatch: ms passed ${msDelta} / ${this._timeUnitLimitMs}`);
        // minute as passed, reset current byte size
        if (msDelta > this._timeUnitLimitMs) {
            console.log(`${new Date().toISOString()} streamLog.updateBatch: ${this._timeUnitLimitMs} 
                    has passed resetting current log byte size to 0`);
            this._currentLogByteSize = 0;
            this._previousTimestamp = now;
        }

        // current logs size during timeUnit exceeds limit (1MB/Second)
        if (currentMessageSize + this._currentLogByteSize > this._messageSizeLimitPerTimeUnit) {
            console.log(`${new Date().toISOString()} streamLog.updateBatch: current log size + message
                     [${currentMessageSize + this._currentLogByteSize} / ${this._messageSizeLimitPerTimeUnit}] exceeded, flushing...`);

            this._firebaseClient.update(this._logsBatch, (err) => {
                if (err) {
                    next(err);
                    return;
                }
                this._logBatchByteSize = 0;
                this._logsBatch = Object.create(null);

                const waitMs = (this._timeUnitLimitMs - msDelta) + 5;
                // lets wait till time unit limit will pass in order to continue
                this._debounceTimeout = setTimeout(this._write.bind(this, chunk, encoding, next), waitMs);
                console.log(`${new Date().toISOString()} streamLog.updateBatch: successfully flushed to firebase,
                         waiting ${waitMs} ms for logs byte size reset`);
            });
            return;
        }

        this._logBatchByteSize += currentMessageSize;
        this._currentLogByteSize += this._logBatchByteSize;
        this._logsBatch[`${newLogKey}`] = chunk.toString();
        console.log(`${new Date().toISOString()} streamLog.updateBatch: updated logs batch with new key
                 '${newLogKey}', current logs byte size ${this._currentLogByteSize / 1024} KB`);

        if (_.size(this._logsBatch) < this._batchSize) {
            console.log(`${new Date().toISOString()} streamLog.updateBatch: batch capacity is still
                     available [${_.keys(this._logsBatch).length}/${this._batchSize}],  resetting debounce flush and continue`);
            this._setBatchFlushTimeout(this._debounceDelay);
            next();
            return;
        }

        console.log(`${new Date().toISOString()} streamLog.updateBatch: logs batch size has been met [${this._batchSize}] flushing...`);
        this._firebaseClient.update(this._logsBatch, (err) => {
            if (err) {
                next(err);
                return;
            }
            console.log(`${new Date().toISOString()} streamLog.updateBatch: flushed successfully,
                     resetting logs batch and debounce flush`);
            this._logsBatch = Object.create(null);
            this._setBatchFlushTimeout(this._debounceDelay);
            next();
        });
    }

    _setBatchFlushTimeout(flushInterval) {
        console.log(new Date().toISOString(), 'streamLog._setBatchFlushTimeout: setting flush timout', flushInterval);
        this._debounceTimeout = setTimeout(() => {
            if (_.isEmpty(this._logsBatch)) {
                console.log(`${new Date().toISOString()} streamLog._setBatchFlushTimeout: logs batch is empty, no update is required`);
                return;
            }
            console.log(`${new Date().toISOString()} streamLog._setBatchFlushTimeout: timeout 
                        triggered, [${this._logBatchByteSize / 1024} KB /${FIREBASE_MESSAGE_SIZE_LIMIT / 1024} KB], flushing...`);
            this._firebaseClient.update(this._logsBatch, (err) => {
                if (err) {
                    console.error(`${new Date().toISOString()} streamLog._setBatchFlushTimeout: flushed successfully`);
                } else {
                    console.log(`${new Date().toISOString()} streamLog._setBatchFlushTimeout: flushed successfully`);
                }
                this._logsBatch = Object.create(null);
            });
        }, flushInterval);
    }
}

module.exports = FirebaseWritableStream;
