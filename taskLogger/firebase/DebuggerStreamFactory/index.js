// jshint ignore:start
const CFError = require('cf-errors');
const CommandsStream = require('./CommandsStream');
const FilterLimitedStream = require('./FilterLimitedStream');
const TransformCutResizeStream = require('./TransformCutResizeStream');
const TransformOutputStream = require('./TransformOutputStream');
const OutputStream = require('./OutputStream');

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
        this.transformCutResizeStream = new TransformCutResizeStream();
        this.commandsStream = new CommandsStream(this.stepsStreamsRef.child('debuggerCommands'), this.errorHandler);
        this.outputStream = new OutputStream(this.stepsStreamsRef, this.stepRef, this._destroyStreams.bind(this));
        this.limitStream = new FilterLimitedStream(this.outputStream);

        return this;
    }

    _destroyStreams() {
        this.commandsStream.destroy();
        this.limitStream.destroy();
        this.transformCutResizeStream.destroy();
        this.transformOutputStream.destroy();
        this.outputStream.destroy();
    }
}

module.exports = DebuggerStreamFactory;
