const proxyquire = require('proxyquire').noCallThru();
const chai       = require('chai');
const sinon      = require('sinon');
const sinonChai  = require('sinon-chai');

const expect     = chai.expect;
chai.use(sinonChai);
const { TYPES } = require('../enums');

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
    taskLogger.updateDiskState = sinon.spy(taskLogger.updateDiskState);
    taskLogger.setDiskSpaceUsageLimit = sinon.spy(taskLogger.setDiskSpaceUsageLimit);
    taskLogger.setLogSize = sinon.spy(taskLogger.setLogSize);
    taskLogger.setVisibility = sinon.spy(taskLogger.setVisibility);
    taskLogger.setData = sinon.spy(taskLogger.setData);
    taskLogger.setStatus = sinon.spy(taskLogger.setStatus);
    taskLogger.getConfiguration = sinon.spy(taskLogger.getConfiguration);
    taskLogger.newStepAdded = sinon.spy();
    taskLogger._reportMemoryUsage = sinon.spy();
    taskLogger._reportMemoryLimit = sinon.spy();
    taskLogger._reportDiskState = sinon.spy();
    taskLogger._reportDiskSpaceUsageLimit = sinon.spy();
    taskLogger._reportLogSize = sinon.spy();
    taskLogger._reportVisibility = sinon.spy();
    taskLogger._reportData = sinon.spy();
    taskLogger._reportStatus = sinon.spy();
    return taskLogger;
};

describe('Base MaskingStream tests', () => {

    describe('MaskingStream._updateChunks()', () => {
        it('should divide the new full chunk into equal chunks and compact to chunks of default chunk size if needed', () => {
            const blacklist = {
                SECRET: '123'
            };

            const taskLogger = getTaskLoggerInstance(undefined, { blacklist });
            const maskingStream = taskLogger.createMaskingStream();

            const chunks = [
                { data: 'A', sent: false },
                { data: 'B', sent: false },
                { data: 'C', sent: false },
            ];
            maskingStream.chunks = chunks.slice();
            maskingStream._updateChunks('CCC');
            expect(maskingStream.chunks).to.have.length(1);
            expect(chunks[0].data).to.be.equal('CCC');
            expect(chunks[1].data).to.be.equal('B');
            expect(chunks[2].data).to.be.equal('C');

            expect(chunks[0].sent).to.be.false;
            expect(chunks[1].sent).to.be.true;
            expect(chunks[2].sent).to.be.true;
        });

        it('should get rid of empty chunks', () => {
            const blacklist = {
                SECRET: '123'
            };

            const taskLogger = getTaskLoggerInstance(undefined, { blacklist });
            const maskingStream = taskLogger.createMaskingStream();

            const chunks = [
                { data: 'A', sent: false },
                { data: 'B', sent: false },
                { data: 'C', sent: false },
            ];
            maskingStream.chunks = chunks.slice();
            maskingStream._updateChunks('A');
            expect(maskingStream.chunks).to.have.length(1);
            expect(chunks[0].data).to.be.equal('A');
            expect(chunks[1].data).to.be.equal('B');
            expect(chunks[2].data).to.be.equal('C');

            expect(chunks[0].sent).to.be.false;
            expect(chunks[1].sent).to.be.true;
            expect(chunks[2].sent).to.be.true;
        });

        it('should divide the new full chunks equally between all existing chunks', () => {
            const blacklist = {
                SECRET: '123'
            };

            const taskLogger = getTaskLoggerInstance(undefined, { blacklist });
            const maskingStream = taskLogger.createMaskingStream();

            const chunks = [
                { data: 'A', sent: false },
                { data: 'B', sent: false },
                { data: 'C', sent: false },
                { data: 'D', sent: false },
            ];
            maskingStream.chunks = chunks.slice();
            maskingStream._updateChunks(Buffer.alloc(1000, 'a').toString('utf8'));
            expect(maskingStream.chunks).to.have.length(4);
            expect(chunks[0].data).to.be.equal(Buffer.alloc(250, 'a').toString('utf8'));
            expect(chunks[1].data).to.be.equal(Buffer.alloc(250, 'a').toString('utf8'));
            expect(chunks[2].data).to.be.equal(Buffer.alloc(250, 'a').toString('utf8'));
            expect(chunks[3].data).to.be.equal(Buffer.alloc(250, 'a').toString('utf8'));

            expect(chunks[0].sent).to.be.false;
            expect(chunks[1].sent).to.be.false;
            expect(chunks[2].sent).to.be.false;
            expect(chunks[3].sent).to.be.false;
        });
    });

});
