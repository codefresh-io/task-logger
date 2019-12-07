const _ = require('lodash');
const Q = require('q');
const proxyquire = require('proxyquire').noCallThru();
const chai       = require('chai');

const expect     = chai.expect;
const sinon      = require('sinon');
const sinonChai  = require('sinon-chai');

chai.use(sinonChai);
const { createFirebaseStub, createFirebaseStubWithDebugger } = require('./FirebaseStub');
const { RestClientStub } = require('./RestClientStub');

let Firebase;

const getTaskLoggerInstance = async (task = { accountId: 'accountId', jobId: 'jobId' },
    opts = { baseFirebaseUrl: 'url', firebaseSecret: 'secret' }) => {
    Firebase = createFirebaseStub();

    const TaskLogger = proxyquire('../TaskLogger', {
        'firebase': Firebase,
        './rest/client': RestClientStub
    });

    const taskLogger = await TaskLogger.factory(task, opts);
    taskLogger.emit  = sinon.spy(taskLogger.emit);

    return taskLogger;
};

const getTaskLoggerInstanceWithDebugger = async (task = { accountId: 'accountId', jobId: 'jobId' },
    opts = { baseFirebaseUrl: 'url', firebaseSecret: 'secret' }) => {
    const deferred = Q.defer();
    Firebase = createFirebaseStubWithDebugger(deferred);

    const TaskLogger = proxyquire('../TaskLogger', {
        'firebase': Firebase,
    });

    const taskLogger = await TaskLogger.factory(task, opts);
    taskLogger.emit  = sinon.spy(taskLogger.emit);

    taskLogger.outputPromise = deferred.promise;

    return taskLogger;
};

const interfaces = [
    { name: 'base class', opts: {} },
    { name: 'REST class', opts: { restInterface: true } }
];

_.forEach(interfaces, (int) => {

    describe(`Firebase TaskLogger '${int.name}' tests`, () => {

        describe('factory', () => {

            describe('positive', () => {

                it('should succeed if all data is passed and authentication succeeded', async () => {
                    Firebase = createFirebaseStub();

                    const TaskLogger = proxyquire('../TaskLogger', {
                        'firebase': Firebase,
                    });

                    const task = { accountId: 'accountId', jobId: 'jobId' };
                    const opts = _.merge({}, {
                        baseFirebaseUrl: 'url',
                        firebaseSecret: 'secret'
                    }, int.opts);
                    expect(TaskLogger.authenticated).to.equal(false);
                    const taskLogger = await TaskLogger.factory(task, opts);

                    if (int.opts.restInterface) {
                        expect(taskLogger.restClient).to.exist;
                        expect(TaskLogger.authenticated).to.equal(false);
                    } else {
                        expect(Firebase.prototype.authWithCustomToken).to.have.been.calledWith('secret');
                        expect(TaskLogger.authenticated).to.equal(true);
                    }
                });

                it('should perform authentication only once', async () => {
                    Firebase = createFirebaseStub();

                    const TaskLogger = proxyquire('../TaskLogger', {
                        'firebase': Firebase,
                    });

                    const task = { accountId: 'accountId', jobId: 'jobId' };
                    const opts = _.merge({}, {
                        baseFirebaseUrl: 'url',
                        firebaseSecret: 'secret'
                    }, int.opts);
                    expect(TaskLogger.authenticated).to.equal(false);
                    await TaskLogger.factory(task, opts);
                    await TaskLogger.factory(task, opts);
                    if (int.opts.restInterface) {
                        expect(Firebase.prototype.authWithCustomToken.callCount).to.equal(0);
                    } else {
                        expect(Firebase.prototype.authWithCustomToken.callCount).to.equal(1);
                    }

                });

                it('should pause debugger until `continue` is pressed', async () => {
                    const taskLogger = await getTaskLoggerInstanceWithDebugger();
                    taskLogger.useDebugger = true;
                    taskLogger.pauseTimeout = 5000;
                    let onValueHandler;
                    taskLogger.debugRef = {
                        child: () => ({
                            set: () => {},
                            off: () => {},
                            on: (name, handler) => {
                                onValueHandler = handler;
                            }
                        }),
                    };

                    setTimeout(() => onValueHandler({ val: () => ({ pause: false }) }), 1000);
                    await taskLogger.pauseDebugger({ name: 'stepName', title: 'stepTitle' });
                });

                it('should notify UI if step is failed', async () => {
                    const taskLogger = await getTaskLoggerInstanceWithDebugger();
                    taskLogger.useDebugger = true;
                    taskLogger.pauseTimeout = 5000;
                    _.set(taskLogger, 'breakpoints.stepName.phases.after', true);
                    taskLogger.debugRef = {
                        child: () => ({
                            set: (arg) => {
                                expect(arg).to.eql({
                                    pause: false,
                                    failed: true,
                                    stepName: 'stepName',
                                    stepTitle: 'stepTitle',
                                });
                            },
                            off: () => {},
                            on: () => {}
                        }),
                    };

                    await taskLogger.pauseDebugger({ name: 'stepName', title: 'stepTitle' });
                });

                it('should stop pause debugger by timeout', async () => {
                    const taskLogger = await getTaskLoggerInstanceWithDebugger(undefined, undefined, {
                        value: () => ({
                            val: arg => ({ pause: arg }),
                        }),
                    });
                    taskLogger.useDebugger = true;
                    taskLogger.pauseTimeout = 1000;
                    taskLogger.debugRef = {
                        child: () => ({
                            set: () => {},
                            off: () => {},
                            on: (name, handler) => {
                                handler({ val: () => ({ pause: true }) });
                            }
                        }),
                    };
                    try {
                        await taskLogger.pauseDebugger({ name: 'stepName', title: 'stepTitle' });
                    } catch (err) {
                        expect(err.message).to.be.equal(`Timed out after ${taskLogger.pauseTimeout} ms`);
                        return;
                    }
                    throw new Error('Error expected but not occurred');
                });

            });

            describe('negative', () => {

                if (!int.opts.restInterface) {
                    it('should throw an error in case authentication failed', async () => {
                        Firebase = createFirebaseStub();

                        const TaskLogger = proxyquire('../TaskLogger', {
                            'firebase': Firebase,
                        });

                        const task = { accountId: 'accountId', jobId: 'jobId' };
                        const opts = _.merge({}, {
                            baseFirebaseUrl: 'url',
                            firebaseSecret: 'secret'
                        }, int.opts);
                        Firebase.prototype.authWithCustomToken.yields(new Error('my error'));
                        try {
                            await TaskLogger.factory(task, opts);
                            throw new Error('should have failed');
                        } catch (err) {
                            expect(err.toString()).to.equal('Error: Failed to create taskLogger because authentication to firebase url url/jobId; caused by Error: my error'); // eslint-disable-line
                        }
                    });
                }

                it('should fail in case of a missing baseFirebaseUrl', async () => {
                    Firebase = createFirebaseStub();

                    const TaskLogger = proxyquire('../TaskLogger', {
                        'firebase': Firebase,
                    });

                    const task = { accountId: 'accountId', jobId: 'jobId' };
                    const opts = _.merge({}, {
                        firebaseSecret: 'secret'
                    }, int.opts);

                    try {
                        await TaskLogger.factory(task, opts);
                        throw new Error('should have failed');
                    } catch (err) {
                        expect(err.toString()).to.equal('Error: failed to create taskLogger because baseFirebaseUrl must be provided');
                    }
                });

                it('should fail in case of a missing firebaseSecret', async () => {
                    Firebase = createFirebaseStub();

                    const TaskLogger = proxyquire('../TaskLogger', {
                        'firebase': Firebase,
                    });

                    const task = { accountId: 'accountId', jobId: 'jobId' };
                    const opts = _.merge({}, {
                        baseFirebaseUrl: 'url',
                    }, int.opts);

                    try {
                        await TaskLogger.factory(task, opts);
                        throw new Error('should have failed');
                    } catch (err) {
                        expect(err.toString()).to.equal('Error: failed to create taskLogger because Firebase secret reference must be provided');
                    }
                });

            });
        });

        describe('reporting', () => {
            it('should report memory usage', async () => {
                const opts = _.merge({}, { baseFirebaseUrl: 'url', firebaseSecret: 'secret' }, int.opts);
                const taskLogger = await getTaskLoggerInstance(undefined, opts);
                const time = new Date();
                const memoryUsage = 'usage';
                taskLogger._reportMemoryUsage(time, memoryUsage);
                if (opts.restInterface) {
                    expect(taskLogger.restClient.push).to.have.been.calledWith(`${taskLogger.baseRef.ref()}/metrics/memory`, { time, usage: memoryUsage });
                } else {
                    expect(Firebase.prototype.push).to.have.been.calledWith({ time, usage: memoryUsage });
                }
            });

            it('should report memory limit', async () => {
                const opts = _.merge({}, { baseFirebaseUrl: 'url', firebaseSecret: 'secret' }, int.opts);
                const taskLogger = await getTaskLoggerInstance(undefined, opts);
                taskLogger.memoryLimit = 'limit';
                taskLogger._reportMemoryLimit();
                if (opts.restInterface) {
                    expect(taskLogger.restClient.set).to.have.been.calledWith(`${taskLogger.baseRef.ref()}/metrics/limits/memory`, taskLogger.memoryLimit);
                } else {
                    expect(Firebase.prototype.push).to.have.been.calledWith(taskLogger.memoryLimit);
                }
            });

            it('should report log size', async () => {
                const opts = _.merge({}, { baseFirebaseUrl: 'url', firebaseSecret: 'secret' }, int.opts);
                const taskLogger = await getTaskLoggerInstance(undefined, opts);
                taskLogger.logSize = 'size';
                taskLogger._reportLogSize();
                if (opts.restInterface) {
                    expect(taskLogger.restClient.set).to.have.been.calledWith(`${taskLogger.baseRef.ref()}/metrics/logs/total`, taskLogger.logSize);
                } else {
                    expect(Firebase.prototype.set).to.have.been.calledWith(taskLogger.logSize);
                }
            });

            it('should report visibility', async () => {
                const opts = _.merge({}, { baseFirebaseUrl: 'url', firebaseSecret: 'secret' }, int.opts);
                const taskLogger = await getTaskLoggerInstance(undefined, opts);
                taskLogger.visibility = 'public';
                taskLogger._reportVisibility();
                if (opts.restInterface) {
                    expect(taskLogger.restClient.set).to.have.been.calledWith(`${taskLogger.baseRef.ref()}/visibility`, taskLogger.visibility);
                } else {
                    expect(Firebase.prototype.set).to.have.been.calledWith(taskLogger.visibility);
                }
            });

            it('should report data', async () => {
                const opts = _.merge({}, { baseFirebaseUrl: 'url', firebaseSecret: 'secret' }, int.opts);
                const taskLogger = await getTaskLoggerInstance(undefined, opts);
                taskLogger.data = { key: 'value' };
                taskLogger._reportData();
                if (opts.restInterface) {
                    expect(taskLogger.restClient.set).to.have.been.calledWith(`${taskLogger.baseRef.ref()}/data`, taskLogger.data);
                } else {
                    expect(Firebase.prototype.set).to.have.been.calledWith(taskLogger.data);
                }
            });

            it('should report status', async () => {
                const opts = _.merge({}, { baseFirebaseUrl: 'url', firebaseSecret: 'secret' }, int.opts);
                const taskLogger = await getTaskLoggerInstance(undefined, opts);
                taskLogger.status = 'running';
                taskLogger._reportStatus();
                if (opts.restInterface) {
                    expect(taskLogger.restClient.set).to.have.been.calledWith(`${taskLogger.baseRef.ref()}/status`, taskLogger.status);
                } else {
                    expect(Firebase.prototype.set).to.have.been.calledWith(taskLogger.status);
                }
            });

            it('should report accountId', async () => {
                const opts = _.merge({}, { baseFirebaseUrl: 'url', firebaseSecret: 'secret' }, int.opts);
                const taskLogger = await getTaskLoggerInstance(undefined, opts);
                taskLogger.reportAccountId();
                if (opts.restInterface) {
                    expect(taskLogger.restClient.set).to.have.been.calledWith(`${taskLogger.baseRef.ref()}/accountId`, taskLogger.accountId);
                } else {
                    expect(Firebase.prototype.set).to.have.been.calledWith(taskLogger.accountId);
                }
            });

            it('should report job id', async () => {
                const opts = _.merge({}, { baseFirebaseUrl: 'url', firebaseSecret: 'secret' }, int.opts);
                const taskLogger = await getTaskLoggerInstance(undefined, opts);
                taskLogger.reportId();
                if (opts.restInterface) {
                    expect(taskLogger.restClient.set).to.have.been.calledWith(`${taskLogger.baseRef.ref()}/id`, taskLogger.jobId);
                } else {
                    expect(Firebase.prototype.set).to.have.been.calledWith(taskLogger.jobId);
                }
            });
        });

        if (!int.opts.restInterface) {
            describe('debugger streams', () => {

                describe('positive', () => {
                    it('should pass data through debug streams', async () => {
                        const opts = _.merge({}, { baseFirebaseUrl: 'url', firebaseSecret: 'secret' }, int.opts);
                        const taskLogger = await getTaskLoggerInstanceWithDebugger(undefined, opts);
                        const streams = await taskLogger.createDebuggerStreams('step', 'before');
                        streams.commandsStream.pipe(streams.transformOutputStream).pipe(streams.outputStream);
                        taskLogger.baseRef.child_added('8header_ls\n');
                        const result = await taskLogger.outputPromise;
                        expect(result).to.be.equal('ls\n');
                        streams._destroyStreams();
                    });

                    it('should pass allowed command in filter stream', async () => {
                        const opts = _.merge({}, { baseFirebaseUrl: 'url', firebaseSecret: 'secret' }, int.opts);
                        const taskLogger = await getTaskLoggerInstanceWithDebugger(undefined, opts);
                        const streams = await taskLogger.createDebuggerStreams('step', 'before');
                        streams.commandsStream.pipe(streams.limitStream).pipe(streams.outputStream);
                        taskLogger.baseRef.child_added('ls');
                        const result = await taskLogger.outputPromise;
                        streams._destroyStreams();
                        expect(result).to.be.equal('ls\r');
                    });

                    it('should block restricted command in filter stream', async () => {
                        const opts = _.merge({}, { baseFirebaseUrl: 'url', firebaseSecret: 'secret' }, int.opts);
                        const taskLogger = await getTaskLoggerInstanceWithDebugger(undefined, opts);
                        const streams = await taskLogger.createDebuggerStreams('step', 'before');
                        streams.commandsStream.pipe(streams.limitStream).pipe(streams.outputStream);
                        taskLogger.baseRef.child_added('cmd');
                        const result = await taskLogger.outputPromise;
                        streams._destroyStreams();
                        expect(result).to.be.equal('Using of command is restricted\n');
                    });

                    it('should pass ^C in filter stream', async () => {
                        const opts = _.merge({}, { baseFirebaseUrl: 'url', firebaseSecret: 'secret' }, int.opts);
                        const taskLogger = await getTaskLoggerInstanceWithDebugger(undefined, opts);
                        const streams = await taskLogger.createDebuggerStreams('step', 'before');
                        streams.commandsStream.pipe(streams.limitStream).pipe(streams.outputStream);
                        taskLogger.baseRef.child_added('\x03');
                        const result = await taskLogger.outputPromise;
                        expect(result).to.be.equal('\x03');
                        streams._destroyStreams();
                    });
                });

                describe('negative', () => {
                    it('should block data in filter stream (blocked command)', async () => {
                        const opts = _.merge({}, { baseFirebaseUrl: 'url', firebaseSecret: 'secret' }, int.opts);
                        const taskLogger = await getTaskLoggerInstanceWithDebugger(undefined, opts);
                        const streams = await taskLogger.createDebuggerStreams('step', 'before');
                        streams.commandsStream.pipe(streams.limitStream).pipe(streams.transformOutputStream).pipe(streams.outputStream);
                        taskLogger.baseRef.child_added('rm\n');
                        const result = await taskLogger.outputPromise;
                        expect(result).to.be.equal('Using of command is restricted\n');
                        streams._destroyStreams();
                    });

                    it('should block data in filter stream (more than one command)', async () => {
                        const opts = _.merge({}, { baseFirebaseUrl: 'url', firebaseSecret: 'secret' }, int.opts);
                        const taskLogger = await getTaskLoggerInstanceWithDebugger(undefined, opts);
                        const streams = await taskLogger.createDebuggerStreams('step', 'before');
                        streams.commandsStream.pipe(streams.limitStream).pipe(streams.transformOutputStream).pipe(streams.outputStream);
                        taskLogger.baseRef.child_added('rm && cat\n');
                        const result = await taskLogger.outputPromise;
                        expect(result).to.be.equal('Combining commands is restricted\n');
                        streams._destroyStreams();
                    });
                });

            });
        }
    });
});
