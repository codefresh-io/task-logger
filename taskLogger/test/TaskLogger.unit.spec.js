const proxyquire = require('proxyquire').noCallThru();
const chai       = require('chai');
const Q = require('q');

const expect     = chai.expect;
const sinon      = require('sinon');
const sinonChai  = require('sinon-chai');
const { Readable, Writable } = require('stream');

chai.use(sinonChai);
const { TYPES, STATUS, VISIBILITY } = require('../enums');

const SECRET_REPLACEMENT = '****';

const createMockedStepClass = () => {
    const StepClass = sinon.spy(() => {
        let onErrorHandler;
        let onFinishedHandler;
        let onWriteCallsHandler;
        let onFlushHandler;
        return {
            emit: (event, data) => {
                if (event === 'error') {
                    onErrorHandler(data);
                } else if (event === 'finished') {
                    onFinishedHandler(data);
                } else if (event === 'writeCalls') {
                    onWriteCallsHandler(data);
                } else if (event === 'flush') {
                    onFlushHandler(data);
                }
            },
            on: sinon.spy((event, handler) => {
                if (event === 'error') {
                    onErrorHandler = handler;
                } else if (event === 'finished') {
                    onFinishedHandler = handler;
                } else if (event === 'writeCalls') {
                    onWriteCallsHandler = handler;
                } else if (event === 'flush') {
                    onFlushHandler = handler;
                }
            }),
            finish: sinon.spy(),
            reportName: sinon.spy(),
            clearLogs: sinon.spy(),
            setStatus: sinon.spy(),
            setFinishTimestamp: sinon.spy(),
            setCreationTimestamp: sinon.spy(),
            onLastUpdateChanged: sinon.spy(),
        };
    });
    return StepClass;
};

let firebaseStepLoggerMockedClass;

const getTaskLoggerInstance = (task = { accountId: 'accountId', jobId: 'jobId' }, opts = {}) => {
    firebaseStepLoggerMockedClass = createMockedStepClass();
    const TaskLogger = proxyquire('../TaskLogger', {
        './firebase/StepLogger': firebaseStepLoggerMockedClass
    });

    const taskLogger = new TaskLogger(task, opts);
    taskLogger.emit = sinon.spy();
    taskLogger.type = TYPES.FIREBASE;
    taskLogger.create = sinon.spy(taskLogger.create);
    taskLogger.finish = sinon.spy(taskLogger.finish);
    taskLogger.fatalError = sinon.spy(taskLogger.fatalError);
    taskLogger.updateMemoryUsage = sinon.spy(taskLogger.updateMemoryUsage);
    taskLogger.setMemoryLimit = sinon.spy(taskLogger.setMemoryLimit);
    taskLogger.setLogSize = sinon.spy(taskLogger.setLogSize);
    taskLogger.setVisibility = sinon.spy(taskLogger.setVisibility);
    taskLogger.setData = sinon.spy(taskLogger.setData);
    taskLogger.setStatus = sinon.spy(taskLogger.setStatus);
    taskLogger.getConfiguration = sinon.spy(taskLogger.getConfiguration);
    taskLogger.newStepAdded = sinon.spy();
    taskLogger._reportMemoryUsage = sinon.spy();
    taskLogger._reportMemoryLimit = sinon.spy();
    taskLogger._reportLogSize = sinon.spy();
    taskLogger._reportVisibility = sinon.spy();
    taskLogger._reportData = sinon.spy();
    taskLogger._reportStatus = sinon.spy();
    return taskLogger;
};

describe('Base TaskLogger tests', () => {

    describe('constructor', () => {

        describe('positive', () => {
            it('should succeeded instantiating a new TaskLogger instance', () => {
                const taskLogger = getTaskLoggerInstance({ accountId: 'accountId', jobId: 'jobId' }, {});
                expect(taskLogger.steps).to.deep.equal({});
            });
        });

        describe('negative', () => {
            it('should fail in case accountId is missing', () => {
                try {
                    getTaskLoggerInstance({}, {});
                    throw new Error('should have failed');
                } catch (err) {
                    expect(err.toString()).to.equal('Error: failed to create taskLogger because accountId must be provided');
                }
            });

            it('should fail in case jobId is missing', () => {
                try {
                    getTaskLoggerInstance({ accountId: 'accountId' }, {});
                    throw new Error('should have failed');
                } catch (err) {
                    expect(err.toString()).to.equal('Error: failed to create taskLogger because jobId must be provided');
                }
            });
        });
    });

    describe('get configuration', () => {

        it('should set data', () => {
            const task = { accountId: 'account', jobId: 'job' };
            const opts = { key: 'value' };
            const taskLogger = getTaskLoggerInstance(task, opts);
            expect(taskLogger.getConfiguration()).to.deep.equal({
                opts,
                task
            });
        });

    });

    describe('create', () => {
        it('should create a new step in case it does not exist', () => {
            const taskLogger = getTaskLoggerInstance();
            taskLogger.create('new-step');
            expect(firebaseStepLoggerMockedClass).to.have.been.calledOnce;
        });

        it('should add created step to steps field', () => {
            const taskLogger = getTaskLoggerInstance();
            const stepLogger = taskLogger.create('new-step');
            expect(taskLogger.steps).to.deep.equal({ 'new-step': stepLogger });
        });

        it('should return an existing step in case it was already created', () => {
            const taskLogger = getTaskLoggerInstance();
            const stepLogger = taskLogger.create('new-step');
            expect(stepLogger).to.equal(taskLogger.create('new-step'));
            expect(firebaseStepLoggerMockedClass).to.have.been.calledOnce;
        });

        it('should listen on errors from step and emit an error in case invoked', () => {
            const taskLogger = getTaskLoggerInstance();
            const stepLogger = taskLogger.create('new-step');
            expect(stepLogger.on).to.have.been.calledWith('error');
            const error = new Error('my error');
            stepLogger.emit('error', error);
            expect(taskLogger.emit).to.have.been.calledWith('error', error);
        });

        it('should listen on finished step and delete it from steps', () => {
            const taskLogger = getTaskLoggerInstance();
            const stepLogger = taskLogger.create('new-step');
            expect(taskLogger.steps).to.deep.equal({ 'new-step': stepLogger });
            expect(stepLogger.on).to.have.been.calledWith('finished');
            stepLogger.emit('finished');
            expect(taskLogger.steps).to.deep.equal({});
        });

        it('should reset an existing step if asked', () => {
            const taskLogger = getTaskLoggerInstance();
            let stepLogger = taskLogger.create('new-step');
            expect(stepLogger.setStatus).to.not.have.been.called;
            stepLogger = taskLogger.create('new-step', true);
            expect(stepLogger.setStatus).to.have.been.calledWith(STATUS.PENDING);
            expect(stepLogger.setFinishTimestamp).to.have.been.calledWith('');
            expect(stepLogger.setCreationTimestamp).to.have.been.calledWith('');
        });

        it('should run creation logic in case asked for', () => {
            const taskLogger = getTaskLoggerInstance();
            const stepLogger = taskLogger.create('new-step', undefined, true);
            expect(stepLogger.setStatus).to.have.been.calledWith(STATUS.PENDING);
            expect(stepLogger.reportName).to.have.been.calledWith();
            expect(stepLogger.clearLogs).to.have.been.calledWith();
            expect(taskLogger.newStepAdded).to.have.been.calledWith(stepLogger);
        });

    });

    describe('awaitLogsFlushed', () => {
        it('write calls from step loggers should be counted', () => {

            const taskLogger = getTaskLoggerInstance();
            const stepLogger = taskLogger.create('new-step');
            stepLogger.emit('writeCalls');
            expect(taskLogger.logsStatus.writeCalls).to.be.equals(1);
            expect(taskLogger.logsStatus.resolvedCalls).to.be.equals(0);
            expect(taskLogger.logsStatus.rejectedCalls).to.be.equals(0);

        });
        it('flush calls from step loggers should be counted when resolved', () => {

            const taskLogger = getTaskLoggerInstance();
            const stepLogger = taskLogger.create('new-step');
            stepLogger.emit('flush');
            expect(taskLogger.logsStatus.writeCalls).to.be.equals(0);
            expect(taskLogger.logsStatus.resolvedCalls).to.be.equals(1);
            expect(taskLogger.logsStatus.rejectedCalls).to.be.equals(0);

        });
        it('rejected flush calls from step loggers should be counted as rejceted', () => {

            const taskLogger = getTaskLoggerInstance();
            const stepLogger = taskLogger.create('new-step');
            stepLogger.emit('flush', new Error());
            expect(taskLogger.logsStatus.writeCalls).to.be.equals(0);
            expect(taskLogger.logsStatus.resolvedCalls).to.be.equals(0);
            expect(taskLogger.logsStatus.rejectedCalls).to.be.equals(1);

        });
        it('should be resolved when all stream resolved', () => {

            const taskLogger = getTaskLoggerInstance();
            const stepLogger = taskLogger.create('new-step');
            stepLogger.emit('writeCalls');
            stepLogger.emit('flush');
            return taskLogger.awaitLogsFlushed();

        });
        it('should not resolved when not all stream resolved', function () {
            this.timeout(0);
            const taskLogger = getTaskLoggerInstance();
            const stepLogger = taskLogger.create('new-step');
            stepLogger.emit('writeCalls');
            stepLogger.emit('flush');
            stepLogger.emit('writeCalls');

            return Promise.race([
                new Promise(resolve => setTimeout(resolve, 3000, 'timeout')),
                taskLogger.awaitLogsFlushed().then(
                  () => { throw Error('unexpectedly resolved'); },
                  () => { throw Error('unexpectedly rejected'); }
                  )
            ]);
        });
    });

    describe('maskingStream', () => {
        it('should mask blacklisted words from the input stream', () => {
            const blacklist = {
                SOME_SECRET: 'ABCD',
                PASSWORD: 'xyz123'
            };
            const taskLogger = getTaskLoggerInstance(undefined, { blacklist });
            const maskingStream = taskLogger.createMaskingStream();

            const containerOutput = [
                { sent: 'Hello world', expected: 'Hello world' },
                { sent: 'Something something ABCD something', expected: `Something something ${SECRET_REPLACEMENT} something` },
                { sent: 'ABCDABCDHHK', expected: `${SECRET_REPLACEMENT}${SECRET_REPLACEMENT}HHK` },
                { sent: 'something XYZ123 xyz123', expected: `something XYZ123 ${SECRET_REPLACEMENT}` },
            ];
            let i = 0;
            const containerOutputStream = new Readable({
                read() {
                    if (!containerOutput[i]) {
                        this.push(null); // end stream
                    } else {
                        this.push(containerOutput[i].sent);
                        i += 1;
                    }
                }
            });

            let j = 0;
            const finalOutputStream = new Writable({
                write(chunk, encoding, done) {
                    const data = chunk.toString('utf8');
                    expect(data).to.be.equal(containerOutput[j].expected);
                    j += 1;
                    done();
                }
            });

            const deferred = Q.defer();
            finalOutputStream.on('finish', deferred.resolve.bind(deferred));

            containerOutputStream.pipe(maskingStream).pipe(finalOutputStream);

            return deferred.promise;
        });

        it('should mask the longer secret first', () => {
            const blacklist = {
                SHORT_SECRET: 'xyz',
                LONG_SECRET: 'xyz123'
            };
            const taskLogger = getTaskLoggerInstance(undefined, { blacklist });
            const maskingStream = taskLogger.createMaskingStream();

            const containerOutput = [
                { sent: 'Hello, xyz123', expected: `Hello, ${SECRET_REPLACEMENT}` },
            ];
            let i = 0;
            const containerOutputStream = new Readable({
                read() {
                    if (!containerOutput[i]) {
                        this.push(null); // end stream
                    } else {
                        this.push(containerOutput[i].sent);
                        i += 1;
                    }
                }
            });

            let j = 0;
            const finalOutputStream = new Writable({
                write(chunk, encoding, done) {
                    const data = chunk.toString('utf8');
                    expect(data).to.be.equal(containerOutput[j].expected);
                    j += 1;
                    done();
                }
            });

            const deferred = Q.defer();
            finalOutputStream.on('finish', deferred.resolve.bind(deferred));

            containerOutputStream.pipe(maskingStream).pipe(finalOutputStream);

            return deferred.promise;
        });

        it.only('should mask secret that was split between to chunks', () => {
            const blacklist = {
                SECRET: 'xyz123'
            };
            const taskLogger = getTaskLoggerInstance(undefined, { blacklist });
            const maskingStream = taskLogger.createMaskingStream();
            const calcLength = (relativeChunk, fullChunk, maskedChunk) => ((relativeChunk.length / fullChunk.length) * maskedChunk.length).toFixed();
            const relativeLength = calcLength('Hello, xyz', 'Hello, xyz123 world', 'Hello, **** world');
            const containerOutput = [
                { sent: 'Hello, xyz', expected: `Hello, ${SECRET_REPLACEMENT}`.slice(0, relativeLength) },
                { sent: '123 world', expected: `${SECRET_REPLACEMENT} world`.slice(relativeLength) },
            ];
            let i = 0;
            const containerOutputStream = new Readable({
                read() {
                    if (!containerOutput[i]) {
                        this.push(null); // end stream
                    } else {
                        this.push(containerOutput[i].sent);
                        i += 1;
                    }
                }
            });

            let j = 0;
            const finalOutputStream = new Writable({
                write(chunk, encoding, done) {
                    const data = chunk.toString('utf8');
                    expect(data).to.be.equal(containerOutput[j].expected);
                    j += 1;
                    done();
                }
            });

            const deferred = Q.defer();
            finalOutputStream.on('finish', deferred.resolve.bind(deferred));

            containerOutputStream.pipe(maskingStream).pipe(finalOutputStream);

            return deferred.promise;
        });

        it('should ignore masks with empty secret', () => {
            const blacklist = {
                EMPTY_SECRET: '',
            };
            const taskLogger = getTaskLoggerInstance(undefined, { blacklist });
            const maskingStream = taskLogger.createMaskingStream();

            taskLogger.addNewMask({ key: 'EMPTY_SECRET2', value: '' });

            expect(taskLogger.blacklistMasks).to.have.lengthOf(0);

            const containerOutput = [
                { sent: 'Hello, xyz123', expected: 'Hello, xyz123' },
            ];
            let i = 0;
            const containerOutputStream = new Readable({
                read() {
                    if (!containerOutput[i]) {
                        this.push(null); // end stream
                    } else {
                        this.push(containerOutput[i].sent);
                        i += 1;
                    }
                }
            });

            let j = 0;
            const finalOutputStream = new Writable({
                write(chunk, encoding, done) {
                    const data = chunk.toString('utf8');
                    expect(data).to.be.equal(containerOutput[j].expected);
                    j += 1;
                    done();
                }
            });

            const deferred = Q.defer();
            finalOutputStream.on('finish', deferred.resolve.bind(deferred));

            containerOutputStream.pipe(maskingStream).pipe(finalOutputStream);

            return deferred.promise;
        });

        it('should keep masks sorted by length when adding new masks', () => {
            const blacklist = {
                SHORT_SECRET: 'xyz',
                LONG_SECRET: 'xyz123'
            };
            const taskLogger = getTaskLoggerInstance(undefined, { blacklist });
            taskLogger.addNewMask({ key: 'SOME_SECRET', value: 'x' });
            taskLogger.addNewMask({ key: 'SOME_SECRET2', value: 'xy' });
            taskLogger.addNewMask({ key: 'SOME_SECRET3', value: 'xyz1234' });

            const expectedMasksValues = ['xyz1234', 'xyz123', 'xyz', 'xy', 'x'];
            const actualMasksValues = taskLogger.blacklistMasks.map(mask => mask.word);

            expect(actualMasksValues).to.be.deep.equal(expectedMasksValues);
        });

        it('should keep masks sorted by length when adding new masks1', () => {
            const blacklist = {
                SHORT_SECRET: 'xyz',
                LONG_SECRET: 'xyz123'
            };
            const taskLogger = getTaskLoggerInstance(undefined, { blacklist });
            taskLogger.addNewMask({ key: 'SOME_SECRET', value: 'a b' });
            taskLogger.addNewMask({ key: 'SOME_SECRET2', value: 'a b c' });
            taskLogger.addNewMask({ key: 'SOME_SECRET3', value: 'abcd' });

            const expectedMasksValues = [
                'a\\ b\\ c',
                'xyz123',
                'a b c',
                'abcd',
                'a\\ b',
                'a b',
                'xyz'
            ];
            const actualMasksValues = taskLogger.blacklistMasks.map(mask => mask.word);

            expect(actualMasksValues).to.be.deep.equal(expectedMasksValues);
        });
    });

    describe('finish', () => {
        it('should set finished field with true', () => {
            const taskLogger = getTaskLoggerInstance();
            expect(taskLogger.finished).to.equal(false);
            taskLogger.finish();
            expect(taskLogger.finished).to.equal(true);
        });

        it('should call finish of each created step', () => {
            const taskLogger = getTaskLoggerInstance();
            const stepLogger = taskLogger.create('new-step');
            taskLogger.finish();
            expect(stepLogger.finish.callCount).to.equal(1);
        });
    });

    describe('fatalError', () => {
        it('should set fatal field to true', () => {
            const taskLogger = getTaskLoggerInstance();
            expect(taskLogger.fatal).to.equal(false);
            taskLogger.fatalError(new Error('fatal error'));
            expect(taskLogger.fatal).to.equal(true);
        });

        it('should create a new step in case no steps exists', () => {
            const taskLogger = getTaskLoggerInstance();
            taskLogger.fatalError(new Error('fatal error'));
            expect(taskLogger.create).to.have.been.calledWith('Something went wrong');
        });

        it('should call finish of each created step', () => {
            const taskLogger = getTaskLoggerInstance();
            const stepLogger = taskLogger.create('new-step');
            taskLogger.fatalError(new Error('fatal error'));
            expect(stepLogger.finish.callCount).to.equal(1);
        });

    });

    describe('updateMemoryUsage', () => {

        it('should report memory usage', () => {
            const taskLogger = getTaskLoggerInstance();
            const time = new Date();
            const memoryUsage = 'usage';
            taskLogger.updateMemoryUsage(time, memoryUsage);
            expect(taskLogger._reportMemoryUsage).to.have.been.calledWith(time, memoryUsage);
        });

    });

    describe('setMemoryLimit', () => {

        it('should set memory limit', () => {
            const taskLogger = getTaskLoggerInstance();
            const memoryLimit = 'limit';
            taskLogger.setMemoryLimit(memoryLimit);
            expect(taskLogger.memoryLimit).to.equal(memoryLimit);
            expect(taskLogger._reportMemoryLimit).to.have.been.calledWith();
        });

    });

    describe('setLogSize', () => {

        it('should set log size', () => {
            const taskLogger = getTaskLoggerInstance();
            const logSize = 'size';
            taskLogger.setLogSize(logSize);
            expect(taskLogger.logSize).to.equal(logSize);
            expect(taskLogger._reportLogSize).to.have.been.calledWith();
        });

    });

    describe('setVisibility', () => {

        describe('positive', () => {
            it('should set the visiblity to private', async () => {
                const taskLogger = getTaskLoggerInstance();
                await taskLogger.setVisibility(VISIBILITY.PRIVATE);
                expect(taskLogger.visibility).to.equal(VISIBILITY.PRIVATE);
                expect(taskLogger._reportVisibility).to.have.been.calledWith();
            });

            it('should set the visiblity to public', async () => {
                const taskLogger = getTaskLoggerInstance();
                await taskLogger.setVisibility(VISIBILITY.PUBLIC);
                expect(taskLogger.visibility).to.equal(VISIBILITY.PUBLIC);
                expect(taskLogger._reportVisibility).to.have.been.calledWith();
            });
        });

        describe('negative', () => {
            it('should fail in case the visiblity is not supported', async () => {
                const taskLogger = getTaskLoggerInstance();
                try {
                    await taskLogger.setVisibility('non-valid');
                    throw new Error('should have failed');
                } catch (err) {
                    expect(err.toString()).to.equal('Error: Visibility: non-valid is not supported. use public/private');
                }
            });
        });

    });

    describe('setData', () => {

        it('should set data', async () => {
            const taskLogger = getTaskLoggerInstance();
            const data = {};
            await taskLogger.setData(data);
            expect(taskLogger.data).to.equal(data);
            expect(taskLogger._reportData).to.have.been.calledWith();
        });

    });

    describe('setData', () => {

        it('should set data', async () => {
            const taskLogger = getTaskLoggerInstance();
            const status = 'status';
            await taskLogger.setStatus(status);
            expect(taskLogger.status).to.equal(status);
            expect(taskLogger._reportStatus).to.have.been.calledWith();
        });

    });

    describe('writeStepsFixes', () => {

        it('writeStepsFixes ', async () => {
            const date = new Date();
            const stepsFixes = {
                step1: {
                    status: 'terminated',
                    finishTimestamp: date,
                },
                step2: {
                    status: 'terminated',
                    finishTimestamp: date,
                }
            };
            const taskLogger = getTaskLoggerInstance();
            await taskLogger.writeStepsFixes(stepsFixes);
            expect(taskLogger.steps.step1.setStatus).to.have.been.calledWith('terminated');
            expect(taskLogger.steps.step2.setStatus).to.have.been.calledWith('terminated');
            expect(taskLogger.steps.step2.setFinishTimestamp).to.have.been.calledWith(parseInt((date.getTime() / 1000).toFixed(), 10));
            expect(taskLogger.create.callCount).to.equal(2);
            expect(taskLogger.create.getCall(0)).to.have.been.calledWith('step1', false, false);
            expect(taskLogger.create.getCall(1)).to.have.been.calledWith('step2', false, false);
        });
    });

});
