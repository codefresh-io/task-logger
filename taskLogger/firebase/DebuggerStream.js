// jshint ignore:start
const { Duplex } = require('stream');
const Q = require('q');
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
        this.stepsStreamsRef.update({ debuggerCommands: {} });
        this.stepsStreamsRef.update({ debuggerOutput: {} });

        this.stepsStreamsRef.child('debuggerCommands')
            .on('child_added', snapshot => this.push(`${snapshot.val()}\n`), errorCallback, this);

        return this.stepRef;
    }

    _read() { }

    _write(chunk, encoding, callback) {
        this.stepsStreamsRef.child('debuggerOutput').push(chunk.toString());
        callback();
    }

    endDebugger() {
        this.stepsStreamsRef.child('debuggerCommands').off('child_added');
        this.stepRef.update({ inDebugger: false });
        this.stepRef = null;
    }
}

module.exports = DebuggerStream;
