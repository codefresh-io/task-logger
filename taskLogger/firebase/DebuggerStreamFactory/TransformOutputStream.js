const { Transform } = require('stream');

class TransformOutputStream extends Transform {
    _transform(data, encoding, callback) {
        // Docker returns data with header (8 bytes). Trim it.
        if (!data || data.length < 8) return;
        const text = data.slice(8).toString();
        this.push(text);
        callback();
    }
}

module.exports = TransformOutputStream;
