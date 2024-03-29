/* eslint-disable no-plusplus */
const { Writable } = require('stream');
const _ = require('lodash');
const debug = require('debug')('verbose:codefresh:firebase:firebaseWritableStream');

// const FIREBASE_MESSAGE_SIZE_LIMIT = 10 * 1024 * 1024; // 10 MB Maximum size of a string


class FirebaseWritableStream extends Writable {
    constructor(_firebaseClient, options) {
        super(options);
        this._firebaseClient = _firebaseClient;
        this._timeUnitLimitMs = options.timeUnitLimitMs;
        this._flushTimeLimitMs = options.flushTimeLimitMs || 1000;
        this._debounceDelay = options.debounceDelay;
        this._messageSizeLimitPerTimeUnit = options.messageSizeLimitPerTimeUnit;
        this._batchSize = options.batchSize;

        this._logsBatch = Object.create(null);
        this._currentLogByteSizeInTimeUnit = 0;
        this._currentBatchSize = 0;
        this._debounceTimeout = null;
    }

    _write(chunk, encoding, next) {
        clearTimeout(this._debounceTimeout);
        // Extract step name headers
        const stepNameLength = chunk.readUInt8(0);
        const stepName = chunk.slice(1, stepNameLength + 1);
        const message = chunk.slice(stepNameLength + 1);

        const newLogKey = `${stepName}/logs/${this._firebaseClient.child('logs').push().key()}`;
        const currentMessageSize = Buffer.byteLength(message);

        const now = Date.now();
        this._previousTimestamp = this._previousTimestamp || now;

        const msDelta = now - this._previousTimestamp;

        // time unit (minute) has passed, reset current byte size
        if (msDelta > this._timeUnitLimitMs) {
            debug(`[${Date.now()}] FirebaseWritableStream._write: ${this._timeUnitLimitMs} has passed resetting current log byte size to 0`);
            this._currentLogByteSizeInTimeUnit = 0;
            this._previousTimestamp = now;
        }

        // current logs size during timeUnit exceeds limit (1MB/Second)
        if (currentMessageSize + this._currentLogByteSizeInTimeUnit > this._messageSizeLimitPerTimeUnit) {
            debug(`[${Date.now()}] FirebaseWritableStream._write: current log size + message [${currentMessageSize + this._currentLogByteSizeInTimeUnit}
             / ${this._messageSizeLimitPerTimeUnit}] exceeded, flushing...`);

            this.emit('writeCalls');
            this._firebaseClient.update(this._logsBatch, (err) => {
                if (err) {
                    this.emit('flush', err, this._currentBatchSize);
                    debug(`[${Date.now()}] FirebaseWritableStream._write: failed to flush logs to firebase on: ${err.stack}`);
                    next();
                    return;
                }
                this.emit('flush', null, this._currentBatchSize);
                this._logsBatch = Object.create(null);
                this._currentBatchSize = 0;
                this.emit('write');
                const waitMs = (this._timeUnitLimitMs - msDelta) + 5;
                // lets wait till time unit limit + x will pass in order to continue
                debug(`[${Date.now()}] FirebaseWritableStream._write: successfully flushed to firebase, waiting ${waitMs} ms for logs byte size reset`);
                debug(`[${Date.now()}] FirebaseWritableStream._write: waiting ${waitMs} till time interval will pass (${this._timeUnitLimitMs})`);
                setTimeout(this._write.bind(this, chunk, encoding, next), waitMs);
            });
            return;
        }

        this._currentLogByteSizeInTimeUnit += currentMessageSize;
        this._currentBatchSize += currentMessageSize;
        this._logsBatch[`${newLogKey}`] = message.toString();
        debug(`[${Date.now()}] FirebaseWritableStream._write: updated logs batch with new key
                 '${newLogKey}', current logs byte size ${this._currentLogByteSizeInTimeUnit / 1024} KB`);

        const hasMoreTime = msDelta < this._flushTimeLimitMs;
        if (hasMoreTime && _.size(this._logsBatch) < this._batchSize) {
            debug(`[${Date.now()}] FirebaseWritableStream._write: batch capacity is still
                     available [${_.size(this._logsBatch)}/${this._batchSize}], resetting debounce flush and continue`);
            this._setBatchFlushTimeout(this._debounceDelay);
            next();
            return;
        }

        if (!hasMoreTime) {
            debug(`[${Date.now()}] FirebaseWritableStream._write: time limit ${this._flushTimeLimitMs} exceeded. Flushing...`);
        } else {
            debug(`[${Date.now()}] FirebaseWritableStream._write: batch size ${this._batchSize} exceeded. Flushing...`);
        }

        this.emit('writeCalls');
        this._firebaseClient.update(this._logsBatch, (err) => {
            if (err) {
                this.emit('flush', err, this._currentBatchSize);
                debug(`[${Date.now()}] FirebaseWritableStream._setBatchFlushTimeout: failed to flush logs to firebase on: ${err.stack}`);
                next();
                return;
            }
            this.emit('flush', null, this._currentBatchSize);
            this._logsBatch = Object.create(null);
            this._currentBatchSize = 0;
            this.emit('write');
            this._setBatchFlushTimeout(this._debounceDelay);
            next();
        });
    }

    _setBatchFlushTimeout(flushInterval) {
        this._debounceTimeout = setTimeout(() => {
            if (_.isEmpty(this._logsBatch)) {
                return;
            }

            this.emit('writeCalls');
            this._firebaseClient.update(this._logsBatch, (err) => {
                if (err) {
                    this.emit('flush', err, this._currentBatchSize);
                    debug(`[${Date.now()}] FirebaseWritableStream._setBatchFlushTimeout: failed to flush logs to firebase on: ${err.stack}`);
                    return;
                }
                this.emit('flush', null, this._currentBatchSize);
                this._logsBatch = Object.create(null);
                this._currentBatchSize = 0;
                this.emit('write');
            });
        }, flushInterval);
    }
}

module.exports = FirebaseWritableStream;
