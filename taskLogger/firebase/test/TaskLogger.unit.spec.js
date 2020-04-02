const _ = require('lodash');
const Q = require('q');
const proxyquire = require('proxyquire').noCallThru();
const chai       = require('chai');

const expect     = chai.expect;
const sinon      = require('sinon');
const sinonChai  = require('sinon-chai');

chai.use(sinonChai);
const { createFirebaseStub, createFirebaseStubWithDebugger, createFirebaseStubWithHealthCheck } = require('./FirebaseStub');
const { RestClientStub } = require('./RestClientStub');

let Firebase;

let createTokenSpy = sinon.spy((opts) => {
    if (opts.admin) {
        return 'admin-token';
    } else {
        return 'token';
    }
});
const originalTokenSpy = createTokenSpy;
const initHealthCheckSpy = sinon.spy();

const getTaskLoggerInstance = async (task = { accountId: 'accountId', jobId: 'jobId' },
    opts = { baseFirebaseUrl: 'url', firebaseSecret: 'secret' }) => {
    Firebase = createFirebaseStub();

    const TaskLogger = proxyquire('../TaskLogger', {
        'firebase': Firebase,
        './rest/Client': RestClientStub,
        'firebase-token-generator': function () {
            return {
                createToken: createTokenSpy
            };
        }
    });

    const taskLogger = await TaskLogger.factory(task, opts);
    taskLogger.emit  = sinon.spy(taskLogger.emit);

    return taskLogger;
};

const getTaskLoggerInstanceWithHealthCheck = async (task = { accountId: 'accountId', jobId: 'jobId' },
    opts = { baseFirebaseUrl: 'url', firebaseSecret: 'secret' },
    testingOpts = { onceTimeout: 10 }) => {
    Firebase = createFirebaseStubWithHealthCheck(testingOpts);

    const TaskLogger = proxyquire('../TaskLogger', {
        'firebase': Firebase,
        './rest/Client': RestClientStub,
        'firebase-token-generator': function () {
            return {
                createToken: createTokenSpy
            };
        }
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

        beforeEach(() => {
            createTokenSpy.resetHistory();
        });

        afterEach(() => {
            createTokenSpy = originalTokenSpy;
        });

        describe('getConfiguration', () => {

            describe('positive tests', () => {

                it('should return a regular token in case params were passed correctly but without admin option', async () => {
                    const opts = _.merge({}, { baseFirebaseUrl: 'url', firebaseSecret: 'secret' }, int.opts);
                    const taskLogger = await getTaskLoggerInstance(undefined, opts);

                    const userId = 'userId';
                    const configuration = await taskLogger.getConfiguration(userId);
                    expect(createTokenSpy).to.have.been.calledOnce;
                    expect(configuration).to.deep.equal({
                        'opts': {
                            'baseFirebaseUrl': 'url',
                            'firebaseSecret': 'token',
                            'type': undefined
                        },
                        'task': {
                            'accountId': 'accountId',
                            'jobId': 'jobId'
                        }
                    });
                });

                it('should return an admin token in case params were passed correctly with admin flag', async () => {
                    const opts = _.merge({}, { baseFirebaseUrl: 'url', firebaseSecret: 'secret' }, int.opts);
                    const taskLogger = await getTaskLoggerInstance(undefined, opts);

                    const userId = 'userId';
                    const configuration = await taskLogger.getConfiguration(userId, true);
                    expect(createTokenSpy).to.have.been.calledOnce;
                    expect(configuration).to.deep.equal({
                        'opts': {
                            'baseFirebaseUrl': 'url',
                            'firebaseSecret': 'admin-token',
                            'type': undefined
                        },
                        'task': {
                            'accountId': 'accountId',
                            'jobId': 'jobId'
                        }
                    });
                });

                it('should return original firebase token in case of asking to skip token creation', async () => {
                    const opts = _.merge({}, { baseFirebaseUrl: 'url', firebaseSecret: 'secret' }, int.opts);
                    const taskLogger = await getTaskLoggerInstance(undefined, opts);

                    const configuration = await taskLogger.getConfiguration(undefined, undefined, true);
                    expect(createTokenSpy).to.not.have.been.called;
                    expect(configuration).to.deep.equal({
                        'opts': {
                            'baseFirebaseUrl': 'url',
                            'firebaseSecret': 'secret',
                            'type': undefined
                        },
                        'task': {
                            'accountId': 'accountId',
                            'jobId': 'jobId'
                        }
                    });
                });

            });

            describe('negative tests', () => {

                it('should fail in case generating a new token failed', async () => {
                    createTokenSpy = sinon.spy(() => {
                        throw new Error('token creation error');
                    });

                    const opts = _.merge({}, { baseFirebaseUrl: 'url', firebaseSecret: 'secret' }, int.opts);
                    const taskLogger = await getTaskLoggerInstance(undefined, opts);

                    const userId = 'userId';
                    try {
                        await taskLogger.getConfiguration(userId, true);
                    } catch (err) {
                        expect(err.toString()).to.equal('Error: failed to create user firebase token; caused by Error: token creation error');
                        return;
                    }

                    throw new Error('should have failed');
                });

            });

        });

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
                await taskLogger._reportVisibility();
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
                await taskLogger._reportData();
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
                await taskLogger._reportStatus();
                if (opts.restInterface) {
                    expect(taskLogger.restClient.set).to.have.been.calledWith(`${taskLogger.baseRef.ref()}/status`, taskLogger.status);
                } else {
                    expect(Firebase.prototype.set).to.have.been.calledWith(taskLogger.status);
                }
            });

            it('should report accountId', async () => {
                const opts = _.merge({}, { baseFirebaseUrl: 'url', firebaseSecret: 'secret' }, int.opts);
                const taskLogger = await getTaskLoggerInstance(undefined, opts);
                await taskLogger.reportAccountId();
                if (opts.restInterface) {
                    expect(taskLogger.restClient.set).to.have.been.calledWith(`${taskLogger.baseRef.ref()}/accountId`, taskLogger.accountId);
                } else {
                    expect(Firebase.prototype.set).to.have.been.calledWith(taskLogger.accountId);
                }
            });

            it('should report job id', async () => {
                const opts = _.merge({}, { baseFirebaseUrl: 'url', firebaseSecret: 'secret' }, int.opts);
                const taskLogger = await getTaskLoggerInstance(undefined, opts);
                await taskLogger.reportId();
                if (opts.restInterface) {
                    expect(taskLogger.restClient.set).to.have.been.calledWith(`${taskLogger.baseRef.ref()}/id`, taskLogger.jobId);
                } else {
                    expect(Firebase.prototype.set).to.have.been.calledWith(taskLogger.jobId);
                }
            });
        });

        if (!int.opts.restInterface) {


            describe('healthCheck', () => {

                beforeEach(() => {
                    initHealthCheckSpy.resetHistory();
                });
                describe('positive', () => {

                    it('should report health check status started if startHealthCheck called', async () => {

                        const task = { accountId: 'accountId', jobId: 'jobId' };
                        const opts = _.merge({}, {
                            baseFirebaseUrl: 'url',
                            firebaseSecret: 'secret',
                        }, int.opts);
                        const taskLogger =  await getTaskLoggerInstanceWithHealthCheck(task, opts, true);
                        taskLogger.startHealthCheck();
                        expect(taskLogger.emit).to.have.been.calledWith('healthCheckStatus', { status: 'started' });
                        taskLogger.stopHealthCheck();
                    });

                    it('should emit healthCheck once if health check pass  ', (done) => {

                        (async () => {
                            const task = { accountId: 'accountId', jobId: 'jobId' };
                            const opts = _.merge({}, {
                                baseFirebaseUrl: 'url',
                                firebaseSecret: 'secret',
                                healthCheckEnabled: true,
                                healthCheckInterval: 1000, // 1s
                                healthCheckCallOnce: true,

                            }, int.opts);
                            const taskLogger =  await getTaskLoggerInstanceWithHealthCheck(task, opts);
                            taskLogger.startHealthCheck();
                            setTimeout(() => {

                                expect(taskLogger.emit.getCall(0).calledWith('healthCheckStatus', { status: 'started' }));
                                expect(taskLogger.emit.getCall(1).calledWith('healthCheckStatus', { status: 'succeed', id: 1 }));
                                expect(taskLogger.emit).to.have.been.calledTwice;

                                taskLogger.stopHealthCheck();
                                done();
                            }, 1500);

                        })();

                    });

                    it('should emit healthCheck twice if health check pass twice  ', (done) => {

                        (async () => {
                            const task = { accountId: 'accountId', jobId: 'jobId' };
                            const opts = _.merge({}, {
                                baseFirebaseUrl: 'url',
                                firebaseSecret: 'secret',
                                healthCheckEnabled: true,
                                healthCheckInterval: 100, // 1s
                                healthCheckCallOnce: false,

                            }, int.opts);
                            const taskLogger =  await getTaskLoggerInstanceWithHealthCheck(task, opts);
                            taskLogger.startHealthCheck();
                            setTimeout(() => {

                                expect(taskLogger.emit.getCall(0).calledWith('healthCheckStatus', { status: 'started' }));
                                expect(taskLogger.emit.getCall(1).calledWith('healthCheckStatus', { status: 'succeed', id: 1 }));
                                expect(taskLogger.emit.getCall(2).calledWith('healthCheckStatus', { status: 'succeed', id: 2 }));
                                expect(taskLogger.emit).to.have.been.calledThrice;

                                taskLogger.stopHealthCheck();
                                done();
                            }, 250);

                        })();

                    });

                    it('should emit healthCheck failed if firebase timed out  ', (done) => {

                        (async () => {
                            const task = { accountId: 'accountId', jobId: 'jobId' };
                            const opts = _.merge({}, {
                                baseFirebaseUrl: 'url',
                                firebaseSecret: 'secret',
                                healthCheckEnabled: true,
                                healthCheckTimeOutOnError: 50,
                                healthCheckInterval: 200, // 1s
                                errorAfterTimeout: 50,
                                healthCheckCallOnce: true,

                            }, int.opts);
                            const testingOpts = { timeout: 2000 }; //  won't be called
                            const taskLogger =  await getTaskLoggerInstanceWithHealthCheck(task, opts, testingOpts);
                            taskLogger.startHealthCheck();
                            setTimeout(() => {

                                expect(taskLogger.emit.getCall(0).calledWith('healthCheckStatus', { status: 'started' }));
                                expect(taskLogger.emit.getCall(1).calledWith('healthCheckStatus', { status: 'failed', id: 1 }));
                                expect(taskLogger.emit).to.have.been.calledTwice;

                                taskLogger.stopHealthCheck();
                                done();
                            }, 1500);

                        })();

                    });

                    it('should emit healthCheck failed if firebase return error on callback ', (done) => {

                        (async () => {
                            const task = { accountId: 'accountId', jobId: 'jobId' };
                            const opts = _.merge({}, {
                                baseFirebaseUrl: 'url',
                                firebaseSecret: 'secret',
                                healthCheckEnabled: true,
                                healthCheckTimeOutOnError: 50,
                                healthCheckInterval: 200,
                                errorAfterTimeout: 50,
                                healthCheckCallOnce: true,

                            }, int.opts);
                            const testingOpts = { setCallbackValue: new Error('firebase_error') };
                            const taskLogger =  await getTaskLoggerInstanceWithHealthCheck(task, opts, testingOpts);
                            taskLogger.startHealthCheck();
                            setTimeout(() => {

                                expect(taskLogger.emit.getCall(0).calledWith('healthCheckStatus', { status: 'started' }));
                                expect(taskLogger.emit.getCall(1).calledWith('healthCheckStatus', { status: 'failed', id: 1 }));
                                expect(taskLogger.emit.args[1][1].error).to.be.equals('could not fetch health check value from firebase #:0');
                                expect(taskLogger.emit).to.have.been.calledTwice;

                                taskLogger.stopHealthCheck();
                                done();
                            }, 1500);

                        })();

                    });

                });


            });
        }
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

                    it('should cut resize commands', async () => {
                        const opts = _.merge({}, { baseFirebaseUrl: 'url', firebaseSecret: 'secret' }, int.opts);
                        const taskLogger = await getTaskLoggerInstanceWithDebugger(undefined, opts);
                        const streams = await taskLogger.createDebuggerStreams('step', 'before');
                        streams.commandsStream.pipe(streams.transformCutResizeStream).pipe(streams.transformOutputStream).pipe(streams.outputStream);
                        taskLogger.baseRef.child_added(`\x1b[8;20;20t`);
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
