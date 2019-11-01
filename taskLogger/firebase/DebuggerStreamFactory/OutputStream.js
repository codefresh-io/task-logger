const { Writable } = require('stream');

class OutputStream extends Writable {
    constructor(stepsStreamsRef, stepRef, destroyStreams) {
        super();
        this.stepsStreamsRef = stepsStreamsRef;
        this.stepRef = stepRef;
        this.destroyStreams = destroyStreams;
    }

    _write(chunk, encoding, callback) {
        const value = chunk.toString().replace(/\u0007/g, '').replace(/\^G/g, '');
        value && this.stepsStreamsRef.child('debuggerOutput').push(value);
        callback();
    }

    _final(callback) {
        this.stepsStreamsRef.child('debuggerCommands').off('child_added');
        this.stepRef.update({ inDebugger: false });
        this.destroyStreams();
        callback();
    }
}

module.exports = OutputStream;
