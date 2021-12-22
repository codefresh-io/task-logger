const { Transform } = require('stream');
// eslint-disable-next-line no-unused-vars
const TaskLogger = require('./TaskLogger');

class Chunk {
    constructor(data) {
        this.sent = false;
        this.data = data;
    }
}

class PrependTimestampsStream extends Transform {
    /**
     * @param {TaskLogger} taskLogger TaskLogger
     * @param {any} {chunkFlushTimeout}=DEFAULTS
     */
    constructor({ chunkFlushTimeout, defaultChunkSize } = PrependTimestampsStream.DEFAULTS) {
        super();
        this.chunks = [];
        this.lastWasNewLine = true;
        this.chunkFlushTimeout = chunkFlushTimeout || PrependTimestampsStream.DEFAULTS.chunkFlushTimeout;
        this.defaultChunkSize = defaultChunkSize || PrependTimestampsStream.DEFAULTS.defaultChunkSize;
    }

    _transform(chunk, encoding, callback) {
        if (Buffer.isBuffer(chunk)) {
            chunk = chunk.toString('utf8');
        }

        this._addChunk(chunk);
        const curFullChunk = this._getFullChunk();
        const lines = curFullChunk.split('\n');
        const keepPart = lines.pop();

        const linesWithTimestamps = lines.map((line) => {
            let res = line;
            if (this.lastWasNewLine && res.trim() !== '') {
                res = this._prependTimestamp(res);
            }
            return `${res}\n`;
        });
        const sendPart = linesWithTimestamps.join('');

        if (sendPart) {
            this.push(sendPart);
            this.lastWasNewLine = true;
        }

        this._updateChunks(keepPart);
        return callback(null);
    }

    _flush(callback) {
        this.chunks.forEach((c) => { c.sent = true; });
        const chunk = this._getFullChunk();
        const toSend = this.lastWasNewLine && chunk.trim() !== '' ? this._prependTimestamp(chunk) : chunk;
        callback(null, toSend);
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
            this.push(this.lastWasNewLine && chunk.data.trim() !== '' ? this._prependTimestamp(chunk.data) : chunk.data);
            this.lastWasNewLine = false;
        }, this.chunkFlushTimeout);
    }

    _getFullChunk() {
        return this.chunks.reduce((str, chunk) => { str += chunk.data; return str; }, '');
    }

    _prependTimestamp(logMessage) {
        const ts = `\u001b[36m[${new Date().toISOString()}]\u001b[0m`;
        return `${ts} ${logMessage}`;
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

PrependTimestampsStream.DEFAULTS = Object.freeze({
    chunkFlushTimeout: 200, // ms
    defaultChunkSize: 100, // bytes
});

module.exports = PrependTimestampsStream;
