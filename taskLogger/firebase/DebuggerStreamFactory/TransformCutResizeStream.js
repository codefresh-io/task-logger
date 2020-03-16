const { Transform } = require('stream');

class TransformCutResizeStream extends Transform {
    _transform(data, encoding, callback) {
        const text = data.toString();
        if (!!text.match(/^\x1b\[8;\d+;\d+t$/)) {
            return callback();
        }
        this.push(text);
        callback();
    }
}

module.exports = TransformCutResizeStream;
