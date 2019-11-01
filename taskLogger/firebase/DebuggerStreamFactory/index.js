// jshint ignore:start
const CFError = require('cf-errors');
const CommandsStream = require('./CommandsStream.js');
const FilterLimitedStream = require('./FilterLimitedStream.js');
const TransformOutputStream = require('./TransformOutputStream.js');
const OutputStream = require('./OutputStream.js');

class DebuggerStreamFactory {
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

module.exports = DebuggerStreamFactory;
