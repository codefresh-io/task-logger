// jshint ignore:start
const { Transform, Readable, Writable } = require('stream');
const CFError = require('cf-errors');

class DebuggerStreams {
    constructor(options) {
        this.jobIdRef = options.jobIdRef;
    }

    async createStreams(step, phase) {
        this.errorHandler = (err) => {
            throw new CFError({
                cause: err,
                message: `Failed to get commands from firebase for step: ${step} and phase: ${phase}`,
            });
        };
        this.phase = phase;
        this.stepRef = this.jobIdRef.child(`debug/breakpoints/${step}`);
        this.stepRef.update({ inDebugger: phase });
        this.stepRef.child('phases')
            .on('value', (snapshot) => { this.phases = snapshot.val(); }, this.errorHandler, this);
        this.stepsStreamsRef = this.jobIdRef.child(`debug/streams/${step}/${phase}`);

        this.commandsStream = new CommandsStream(this.stepsStreamsRef.child('debuggerCommands'), this.errorHandler);
        this.transformOutputStream = new TransformOutputStream();
        this.outputStream = new OutputStream(this.stepsStreamsRef, this.stepRef, this._destroyStreams.bind(this));

        return this;
    }

    _destroyStreams() {
        this.commandsStream.destroy();
        this.transformOutputStream.destroy();
        this.outputStream.destroy();
    }
}

class CommandsStream extends Readable {
    constructor(commandsRef, errorHandler) {
        super();
        commandsRef.on('child_added', snapshot => this.push(snapshot.val()), errorHandler, this);

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

module.exports = DebuggerStreams;
