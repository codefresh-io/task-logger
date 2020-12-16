const { Transform } = require('stream');
// eslint-disable-next-line no-unused-vars
const TaskLogger = require('./TaskLogger');

class Chunk {
    constructor(data) {
        this.sent = false;
        this.data = data;
    }
}

class MaskingStream extends Transform {
    /**
     * @param {TaskLogger} taskLogger TaskLogger
     * @param {any} {chunkFlushTimeout}=DEFAULTS
     */
    constructor(taskLogger, { chunkFlushTimeout, defaultChunkSize } = MaskingStream.DEFAULTS) {
        super();
        this.taskLogger = taskLogger;
        this.chunks = [];
        this.chunkFlushTimeout = chunkFlushTimeout || MaskingStream.DEFAULTS.chunkFlushTimeout;
        this.defaultChunkSize = defaultChunkSize || MaskingStream.DEFAULTS.defaultChunkSize;
    }

    _transform(chunk, encoding, callback) {
        if (Buffer.isBuffer(chunk)) {
            chunk = chunk.toString('utf8');
        }

        this._addChunk(chunk);

        const longestMask = this.taskLogger._getLongestMaskLength();
        const curFullChunk = this._getFullChunk();
        if (curFullChunk.length < longestMask) {
            return callback(null); // don't do anything yet
        }

        // search and mask secrets
        const maskedFullChunk = this.taskLogger._maskBlacklistWords(curFullChunk);
        const excessPartSize = maskedFullChunk.length > longestMask ? maskedFullChunk.length - longestMask : 0;
        const sendPart = maskedFullChunk.slice(0, excessPartSize);
        const keepPart = maskedFullChunk.slice(excessPartSize);

        if (sendPart) {
            this.push(sendPart);
        }

        this._updateChunks(keepPart);
        return callback(null);
    }

    _flush(callback) {
        this.chunks.forEach((c) => { c.sent = true; });
        callback(null, this.taskLogger._maskBlacklistWords(this._getFullChunk()));
    }

    _addChunk(data) {
        const chunk = new Chunk(data);
        this.chunks.push(chunk);
        setTimeout(() => {
            if (chunk.sent) return; // do nothing

            // if the chunk wasn't sent by now, send the chunk and remove
            // this chunk from the buffer (it is the first chunk, for sure).
            this.chunks.shift();
            chunk.sent = true;
            this.push(this.taskLogger._maskBlacklistWords(chunk.data));
        }, this.chunkFlushTimeout);
    }

    _getFullChunk() {
        return this.chunks.reduce((str, chunk) => { str += chunk.data; return str; }, '');
    }

    // This reorganizes the chunks after a part of the full chunk was sent
    _updateChunks(newFullChunk) {
        const n = this.chunks.length;
        const chunkSize = Math.max(Math.ceil(newFullChunk.length / n), this.defaultChunkSize);
        let from = 0;
        let to = chunkSize;
        let i = 0;

        // spread the new full chunk into equal size chunks and replace the
        // existing chunks data to keep their respective flush timeouts
        while (from < newFullChunk.length) {
            const chunk = this.chunks[i];
            chunk.data = newFullChunk.slice(from, to);
            from = to;
            to += chunkSize;
            i += 1;
        }

        // remove empty chunks from the end of the chunks array
        for (; i < n; i += 1) {
            const chunk = this.chunks.pop();
            chunk.sent = true; // mark as handled to prevent it from being sent
        }
    }
}

MaskingStream.DEFAULTS = Object.freeze({
    chunkFlushTimeout: 200, // ms
    defaultChunkSize: 100, // bytes
});

module.exports = MaskingStream;
