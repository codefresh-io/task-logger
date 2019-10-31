// jshint ignore:start
const { Transform, Readable, Writable } = require('stream');
const CFError = require('cf-errors');

const allowedCommands = ['ls', 'printenv', 'cat', 'top', 'exit', 'cf_export', 'cd', 'export'];

class DebuggerStreams {
    constructor(options = {}) {
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

        this.transformOutputStream = new TransformOutputStream();
        this.commandsStream = new CommandsStream(this.stepsStreamsRef.child('debuggerCommands'), this.errorHandler);
        this.outputStream = new OutputStream(this.stepsStreamsRef, this.stepRef, this._destroyStreams.bind(this));
        this.limitStream = new FilterLimitedStream(this.outputStream);

        return this;
    }

    _destroyStreams() {
        this.commandsStream.destroy();
        this.limitStream.destroy();
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

class FilterLimitedStream extends Transform {
    constructor(skipStream) {
        super();
        this.skipStream = skipStream;
    }

    _validateCommand(data) {
        const str = data.toString();
        // check for sequence of commands
        if (str.match(/&{2}|\|{2}/)) {
            return {
                isValid: false,
                message: 'Combining commands is restricted\n',
            };
        }

        // check for control codes (^C, Bell for ping)
        let cmdMatch = str.match(/^\x03|\x07|\\x03|\\x07$/); // eslint-disable-line no-control-regex
        if (cmdMatch) {
            return {
                isValid: true,
                command: str.length === 1 ? str : String.fromCharCode(+str.replace('\\', '0')),
            };
        }

        // check for escape sequences
        cmdMatch = str.match(/^\x1b\[8;\d+;\d+t$/);
        if (cmdMatch) {
            return {
                isValid: true,
                command: str,
            };
        }

        // check for command (the first word of passed string)
        cmdMatch = str.match(/^(\S+)/);
        if (cmdMatch) {
            if (allowedCommands.indexOf(cmdMatch[1]) !== -1) {
                return {
                    isValid: true,
                    command: `${str}\r`,
                };
            }
        }
        return {
            isValid: false,
            message: 'Using of command is restricted\n',
        };
    }
    _transform(data, encoding, callback) {
        const validationResult = this._validateCommand(data);
        if (validationResult.isValid) {
            this.push(validationResult.command);
        } else {
            this.push('');
            if (validationResult.message) {
                this.skipStream.write(validationResult.message);
            }
        }
        callback();
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
