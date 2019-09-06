// jshint ignore:start
const { Duplex } = require('stream');
const CFError = require('cf-errors');

class DebuggerStream extends Duplex {
    constructor(options) {
        super();
        this.jobIdRef = options.jobIdRef;
    }

    async createStream(step, phase) {
        const errorCallback = (err) => {
            throw new CFError({
                cause: err,
                message: `Failed to get commands from firebase for step: ${step} and phase: ${phase}`,
            });
        };

        this.stepRef = this.jobIdRef.child(`debug/steps/${step}`);
        this.stepRef.update({ inDebugger: phase });
        this.stepsStreamsRef = this.stepRef.child(`streams/${phase}`);

        this.stepRef.child('phases')
            .on('value', (snapshot) => { this.phases = snapshot.val(); }, errorCallback, this);

        this.stepsStreamsRef.child('debuggerCommands')
            .on('child_added', snapshot => this.push(`${snapshot.val()}\n`), errorCallback, this);

        return this.stepRef;
    }

    _read() { }

    _write(chunk, encoding, callback) {
        this.stepsStreamsRef.child('debuggerOutput').push(chunk.toString());
        callback();
    }

    _final(callback) {
        this.stepsStreamsRef.child('debuggerCommands').off('child_added');
        this.stepRef.update({ inDebugger: false });
        callback();
    }
}

module.exports = DebuggerStream;
