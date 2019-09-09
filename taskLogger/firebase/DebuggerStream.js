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

        this.stepRef = this.jobIdRef.child(`debug/steps/${step}`);
        this.stepRef.update({ inDebugger: phase });
        this.stepsStreamsRef = this.stepRef.child(`streams/${phase}`);

        this.stepRef.child('phases')
            .on('value', (snapshot) => { this.phases = snapshot.val(); }, errorCallback, this);

        this.stepsStreamsRef.child('debuggerCommands')
            .on('child_added', snapshot => this.push(`${snapshot.val()}\n`), errorCallback, this);

        return this.stepRef;
    }

    async attachDebuggerStream(dockerStream) {
        const ping = setInterval(() => {
            dockerStream.write(' ');
        }, 20000);

        this.on('data', (command) => {
            let src = command.toString();
            src = src.endsWith('\n') ? src.slice(0, -1) : src;
            const parts = src.split('\n');
            for (let i = 0; i < parts.length; i++) {
                dockerStream.write(`echo "${'-'.repeat(30)}"\n`);
                dockerStream.write(`echo 'executing command: ${parts[i]}'\n`);
                dockerStream.write(`echo "${'-'.repeat(30)}"\n`);
                dockerStream.write(`${parts[i]}\n`);
            }
        });

        dockerStream.on('error', (error) => {
            console.error('error:', error);
        });

        dockerStream.on('close', () => {
            clearInterval(ping);
            console.error('clear interval');
        });

        const OutputStream = Transform;
        OutputStream.prototype._transform = function(data, encoding, callback) {
            if (!data || data.length < 8) return;
            const outType = _.get(data, '[0]');
            const textBuf = data.slice(8);
            outType === 1 ? console.log(textBuf.toString()) : console.error(textBuf.toString());
            this.push(textBuf);
            callback();
        };
        const outputStream = new OutputStream();

        dockerStream.pipe(outputStream);

        return outputStream;
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
