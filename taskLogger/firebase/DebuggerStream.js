// jshint ignore:start
const _ = require('lodash');
const { Transform, Readable, Writable } = require('stream');
const CFError = require('cf-errors');

function errorCallback(err) {
    throw new CFError({
        cause: err,
        message: `Failed to get commands from firebase for step: ${step} and phase: ${phase}`,
    });
}

class DebuggerStreams {
    constructor(options) {
        this.jobIdRef = options.jobIdRef;
    }

    async createStreams(step, phase) {
        this.phase = phase;
        this.stepRef = this.jobIdRef.child(`debug/breakpoints/${step}`);
        this.stepRef.update({ inDebugger: phase });
        this.stepRef.child('phases')
            .on('value', (snapshot) => { this.phases = snapshot.val(); }, errorCallback, this);
        this.stepsStreamsRef = this.jobIdRef.child(`debug/streams/${step}/${phase}`);

        this.commandsStream = new CommandsStream(this.stepsStreamsRef.child('debuggerCommands'));
        this.transformOutputStream = new TransformOutputStream();
        this.outputStream = new OutputStream(this.stepsStreamsRef, this.stepRef, this._destroyStreams.bind(this));

        return {
            commandsStream: this.commandsStream,
            transformOutputStream: this.transformOutputStream,
            outputStream: this.outputStream,
        };
    }

    _destroyStreams() {
        this.commandsStream.destroy();
        this.transformOutputStream.destroy();
        this.outputStream.destroy();
    }
}

class CommandsStream extends Readable {
    constructor(commandsRef) {
        super();
        commandsRef.on('child_added', snapshot => this.push(snapshot.val()), errorCallback, this);

        this.ping = setInterval(() => {
            this.push('\u0007');
        }, 20000);
    }

    _read() { }

    _destroy() {
        clearInterval(this.ping);
    }
}

class TransformOutputStream extends Transform {
    _transform(data, encoding, callback) {
        if (!data || data.length < 8) return;
        const text = data.slice(8).toString();
        this.push(text);
        callback();
    }
}

class OutputStream extends Writable {
    constructor(stepsStreamsRef, stepRef, destroyStreams) {
        super();
        this.stepsStreamsRef = stepsStreamsRef;
        this.stepRef = stepRef;
        this.destroyStreams = destroyStreams;
    }

    _write(chunk, encoding, callback) {
        if (chunk.toString() !== '\u0007') {
            this.stepsStreamsRef.child('debuggerOutput').push(chunk.toString());
        }
        callback();
    }

    _final(callback) {
        this.stepsStreamsRef.child('debuggerCommands').off('child_added');
        this.stepRef.update({ inDebugger: false });
        this.destroyStreams();
        callback();
    }
}

module.exports = DebuggerStreams;
