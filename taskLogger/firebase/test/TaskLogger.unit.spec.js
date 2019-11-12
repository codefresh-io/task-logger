const Q = require('q');
const proxyquire = require('proxyquire').noCallThru();
const chai       = require('chai');

const expect     = chai.expect;
const sinon      = require('sinon');
const sinonChai  = require('sinon-chai');

chai.use(sinonChai);
const { createFirebaseStub, createFirebaseStubWithDebugger } = require('./FirebaseStub');

let Firebase;

const getTaskLoggerInstance = async (task = { accountId: 'accountId', jobId: 'jobId' },
    opts = { baseFirebaseUrl: 'url', firebaseSecret: 'secret' }) => {
    Firebase = createFirebaseStub();

    const TaskLogger = proxyquire('../TaskLogger', {
        'firebase': Firebase,
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

describe('Firebase TaskLogger tests', () => {

    describe('factory', () => {

        describe('positive', () => {

            it('should succeed if all data is passed and authentication succeeded', async () => {
                Firebase = createFirebaseStub();

                const TaskLogger = proxyquire('../TaskLogger', {
                    'firebase': Firebase,
                });

                const task = { accountId: 'accountId', jobId: 'jobId' };
                const opts = {
                    baseFirebaseUrl: 'url',
                    firebaseSecret: 'secret'
                };
                expect(TaskLogger.authenticated).to.equal(false);
                await TaskLogger.factory(task, opts);
                expect(Firebase.prototype.authWithCustomToken).to.have.been.calledWith('secret');
                expect(TaskLogger.authenticated).to.equal(true);
            });

            it('should perform authentication only once', async () => {
                Firebase = createFirebaseStub();

                const TaskLogger = proxyquire('../TaskLogger', {
                    'firebase': Firebase,
                });

                const task = { accountId: 'accountId', jobId: 'jobId' };
                const opts = {
                    baseFirebaseUrl: 'url',
                    firebaseSecret: 'secret'
                };
                expect(TaskLogger.authenticated).to.equal(false);
                await TaskLogger.factory(task, opts);
                await TaskLogger.factory(task, opts);
                expect(Firebase.prototype.authWithCustomToken.callCount).to.equal(1);
            });

            it('should pass data through debug streams', async () => {
                const taskLogger = await getTaskLoggerInstanceWithDebugger();
                const streams = await taskLogger.createDebuggerStreams('step', 'before');
                streams.commandsStream.pipe(streams.transformOutputStream).pipe(streams.outputStream);
                taskLogger.baseRef.child_added('8header_ls\n');
                const result = await taskLogger.outputPromise;
                expect(result).to.be.equal('ls\n');
                streams._destroyStreams();
            });

            it('should pass allowed command in filter stream', async () => {
                const taskLogger = await getTaskLoggerInstanceWithDebugger();
                const streams = await taskLogger.createDebuggerStreams('step', 'before');
                streams.commandsStream.pipe(streams.limitStream).pipe(streams.outputStream);
                taskLogger.baseRef.child_added('ls');
                const result = await taskLogger.outputPromise;
                streams._destroyStreams();
                expect(result).to.be.equal('ls\r');
            });

            it('should block restricted command in filter stream', async () => {
                const taskLogger = await getTaskLoggerInstanceWithDebugger();
                const streams = await taskLogger.createDebuggerStreams('step', 'before');
                streams.commandsStream.pipe(streams.limitStream).pipe(streams.outputStream);
                taskLogger.baseRef.child_added('cmd');
                const result = await taskLogger.outputPromise;
                streams._destroyStreams();
                expect(result).to.be.equal('Using of command is restricted\n');
            });

            it('should pass ^C in filter stream', async () => {
                const taskLogger = await getTaskLoggerInstanceWithDebugger();
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
                const taskLogger = await getTaskLoggerInstanceWithDebugger();
                const streams = await taskLogger.createDebuggerStreams('step', 'before');
                streams.commandsStream.pipe(streams.limitStream).pipe(streams.transformOutputStream).pipe(streams.outputStream);
                taskLogger.baseRef.child_added('rm\n');
                const result = await taskLogger.outputPromise;
                expect(result).to.be.equal('Using of command is restricted\n');
                streams._destroyStreams();
            });

            it('should block data in filter stream (more than one command)', async () => {
                const taskLogger = await getTaskLoggerInstanceWithDebugger();
                const streams = await taskLogger.createDebuggerStreams('step', 'before');
                streams.commandsStream.pipe(streams.limitStream).pipe(streams.transformOutputStream).pipe(streams.outputStream);
                taskLogger.baseRef.child_added('rm && cat\n');
                const result = await taskLogger.outputPromise;
                expect(result).to.be.equal('Combining commands is restricted\n');
                streams._destroyStreams();
            });

            it('should throw an error in case authentication failed', async () => {
                Firebase = createFirebaseStub();

                const TaskLogger = proxyquire('../TaskLogger', {
                    'firebase': Firebase,
                });

                const task = { accountId: 'accountId', jobId: 'jobId' };
                const opts = {
                    baseFirebaseUrl: 'url',
                    firebaseSecret: 'secret'
                };
                Firebase.prototype.authWithCustomToken.yields(new Error('my error'));
                try {
                    await TaskLogger.factory(task, opts);
                    throw new Error('should have failed');
                } catch (err) {
                    expect(err.toString()).to.equal('Error: Failed to create taskLogger because authentication to firebase url url/jobId; caused by Error: my error'); // eslint-disable-line
                }
            });

            it('should fail in case of a missing baseFirebaseUrl', async () => {
                Firebase = createFirebaseStub();

                const TaskLogger = proxyquire('../TaskLogger', {
                    'firebase': Firebase,
                });

                const task = { accountId: 'accountId', jobId: 'jobId' };
                const opts = {
                    firebaseSecret: 'secret'
                };

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
                const opts = {
                    baseFirebaseUrl: 'url',
                };

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
            const taskLogger = await getTaskLoggerInstance();
            const time = new Date();
            const memoryUsage = 'usage';
            taskLogger._reportMemoryUsage(time, memoryUsage);
            expect(Firebase.prototype.push).to.have.been.calledWith({ time, usage: memoryUsage });
        });

        it('should report memory limit', async () => {
            const taskLogger = await getTaskLoggerInstance();
            taskLogger.memoryLimit = 'limit';
            taskLogger._reportMemoryLimit();
            expect(Firebase.prototype.push).to.have.been.calledWith(taskLogger.memoryLimit);
        });

        it('should report log size', async () => {
            const taskLogger = await getTaskLoggerInstance();
            taskLogger.logSize = 'size';
            taskLogger._reportLogSize();
            expect(Firebase.prototype.set).to.have.been.calledWith(taskLogger.logSize);
        });

        it('should report visibility', async () => {
            const taskLogger = await getTaskLoggerInstance();
            taskLogger.visibility = 'public';
            taskLogger._reportVisibility();
            expect(Firebase.prototype.set).to.have.been.calledWith(taskLogger.visibility);
        });

        it('should report data', async () => {
            const taskLogger = await getTaskLoggerInstance();
            taskLogger.data = { key: 'value' };
            taskLogger._reportData();
            expect(Firebase.prototype.set).to.have.been.calledWith(taskLogger.data);
        });

        it('should report status', async () => {
            const taskLogger = await getTaskLoggerInstance();
            taskLogger.status = 'running';
            taskLogger._reportStatus();
            expect(Firebase.prototype.set).to.have.been.calledWith(taskLogger.status);
        });

        it('should report accountId', async () => {
            const taskLogger = await getTaskLoggerInstance();
            taskLogger.reportAccountId();
            expect(Firebase.prototype.set).to.have.been.calledWith(taskLogger.accountId);
        });

        it('should report job id', async () => {
            const taskLogger = await getTaskLoggerInstance();
            taskLogger.reportId();
            expect(Firebase.prototype.set).to.have.been.calledWith(taskLogger.jobId);
        });
    });
});
