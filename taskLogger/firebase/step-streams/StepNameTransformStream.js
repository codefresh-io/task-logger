const { Transform } = require('stream');

class StepNameTransformStream extends Transform {
    constructor(stepName) {
        super();
        this.stepName = stepName;
    }

    _transform(chunk, encoding, done) {
        const stepNameSizeHeader = Buffer.alloc(1); // Create 1 byte buffer for step name size header // Notice that step name will be limited by 255 chars
        const stepNameLengthHex = `0x${this.stepName.length.toString(16)}`;
        stepNameSizeHeader.writeUInt8(stepNameLengthHex, 0);

        const data = Buffer.concat([stepNameSizeHeader, Buffer.from(this.stepName), chunk]);
        this.emit('writeCalls');
        done(null, data);
    }
}

module.exports = StepNameTransformStream;
