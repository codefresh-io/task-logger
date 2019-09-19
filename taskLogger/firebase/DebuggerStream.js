// jshint ignore:start
const _ = require('lodash');
const { Duplex, Transform } = require('stream');
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

        this.phase = phase;
        this.stepRef = this.jobIdRef.child(`debug/breakpoints/${step}`);
        this.stepRef.update({ inDebugger: phase });
        this.stepsStreamsRef = this.jobIdRef.child(`debug/streams/${step}/${phase}`);

        this.stepRef.child('phases')
            .on('value', (snapshot) => { this.phases = snapshot.val(); }, errorCallback, this);

        this.stepsStreamsRef.child('debuggerCommands')
            .on('child_added', snapshot => this.push(snapshot.val()), errorCallback, this);

        return this.stepRef;
    }

    _onData(targetStream) {
        return command => targetStream.write(command);
    }

    _transform(data, encoding, callback) {
        if (!data || data.length < 8) return;
        const outType = _.get(data, '[0]');
        const text = data.slice(8).toString();
        outType === 1 ? console.log(text) : console.error(text);
        this.push(text);
        callback();
    }

    async attachDebuggerStream(targetStream) {
        const ping = setInterval(() => {
            targetStream.write('\u0007');
        }, 20000);

        this.on('data', this._onData(targetStream));

        targetStream.on('error', (error) => {
            console.error('error:', error);
        });

        targetStream.on('close', () => {
            clearInterval(ping);
            console.error('clear interval');
        });

        const OutputStream = Transform;
        OutputStream.prototype._transform = this._transform;
        const outputStream = new OutputStream();

        targetStream.pipe(outputStream);

        return outputStream;
    }

    _read() { }

    _write(chunk, encoding, callback) {
        if (chunk.toString() !== '\u0007') {
            this.stepsStreamsRef.child('debuggerOutput').push(chunk.toString());
        }
        callback();
    }

    _final(callback) {
        this.stepsStreamsRef.child('debuggerCommands').off('child_added');
        this.stepRef.update({ inDebugger: false });
        callback();
    }
}

module.exports = DebuggerStream;
