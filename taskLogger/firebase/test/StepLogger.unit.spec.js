const proxyquire = require('proxyquire').noCallThru();
const chai       = require('chai');

const expect     = chai.expect;
const sinon      = require('sinon');
const sinonChai  = require('sinon-chai');

chai.use(sinonChai);
const { createFirebaseStub } = require('./FirebaseStub');

let Firebase;

const getStepLoggerInstance = async (step = { accountId: 'accountId', jobId: 'jobId', name: 'name' },
    opts = { baseFirebaseUrl: 'url' }) => {
    Firebase = createFirebaseStub();

    const StepLogger = proxyquire('../StepLogger', {
        'firebase': Firebase,
    });

    const stepLogger = new StepLogger(step, opts);
    stepLogger.emit  = sinon.spy(stepLogger.emit);

    return stepLogger;
};

describe('Firebase StepLogger tests', () => {

    describe('constructor', () => {

        describe('positive', () => {

            it('should succeed if all data is passed and authentication succeeded', async () => {
                Firebase = createFirebaseStub();

                const StepLogger = proxyquire('../StepLogger', {
                    'firebase': Firebase,
                });

                const task = { accountId: 'accountId', jobId: 'jobId', name: 'name' };
                const opts = { baseFirebaseUrl: 'url' };

                new StepLogger(task, opts); // eslint-disable-line
            });

            it('_filterMessage should return filtered message', async () => {
                const stepLogger = await getStepLoggerInstance();
                const filtered = stepLogger._filterMessage({ message: 'word, secretWord, word', filters: ['secretWord'] });
                expect(filtered).to.equal('word, ****, word');
            });
        });

        describe('negative', () => {

            it('should fail in case of a missing baseFirebaseUrl', async () => {
                Firebase = createFirebaseStub();

                const StepLogger = proxyquire('../StepLogger', {
                    'firebase': Firebase,
                });

                const task = { accountId: 'accountId', jobId: 'jobId', name: 'name' };
                const opts = { };

                try {
                    new StepLogger(task, opts); // eslint-disable-line
                    throw new Error('should have failed');
                } catch (err) {
                    expect(err.toString()).to.equal('Error: failed to create stepLogger because baseFirebaseUrl must be provided');
                }
            });

        });
    });

    describe('reporting', () => {
        it('should report log message', async () => {
            const stepLogger = await getStepLoggerInstance();
            const message = 'message';
            stepLogger._reportLog(message);
            expect(Firebase.prototype.push).to.have.been.calledWith(message);
        });

        it('should report last update', async () => {
            const stepLogger = await getStepLoggerInstance();
            stepLogger.lastUpdate = new Date();
            const spy = sinon.spy();
            stepLogger.onLastUpdateChanged(spy);
            stepLogger.emit('lastUpdateChanged');
            expect(spy).to.have.been.calledWith(stepLogger.lastUpdate);
        });

        it('should report previously executed', async () => {
            const stepLogger = await getStepLoggerInstance();
            stepLogger.previouslyExecuted = true;
            stepLogger._reportPrevioulyExecuted();
            expect(Firebase.prototype.set).to.have.been.calledWith(stepLogger.previouslyExecuted);
        });

        it('should report status', async () => {
            const stepLogger = await getStepLoggerInstance();
            stepLogger.status = 'running';
            stepLogger._reportStatus();
            expect(Firebase.prototype.set).to.have.been.calledWith(stepLogger.status);
        });

        it('should report finish timestamp', async () => {
            const stepLogger = await getStepLoggerInstance();
            stepLogger.finishTimeStamp = new Date();
            stepLogger._reportFinishTimestamp();
            expect(Firebase.prototype.set).to.have.been.calledWith(stepLogger.finishTimeStamp);
        });

        it('should report creation time', async () => {
            const stepLogger = await getStepLoggerInstance();
            stepLogger.creationTimeStamp = new Date();
            stepLogger._reportCreationTimestamp();
            expect(Firebase.prototype.set).to.have.been.calledWith(stepLogger.creationTimeStamp);
        });

        it('should report memory usage', async () => {
            const stepLogger = await getStepLoggerInstance();
            const time = new Date();
            const usage = 'usage';
            stepLogger._reportMemoryUsage(time, usage);
            expect(Firebase.prototype.push).to.have.been.calledWith({ time, usage });
        });

        it('should report cpu usage', async () => {
            const stepLogger = await getStepLoggerInstance();
            const time = new Date();
            const usage = 'usage';
            stepLogger._reportCpuUsage(time, usage);
            expect(Firebase.prototype.push).to.have.been.calledWith({ time, usage });
        });

        it('should report log size', async () => {
            const stepLogger = await getStepLoggerInstance();
            stepLogger.logSize = 'size';
            stepLogger._reportLogSize();
            expect(Firebase.prototype.set).to.have.been.calledWith(stepLogger.logSize);
        });

        it('should report name', async () => {
            const stepLogger = await getStepLoggerInstance();
            stepLogger.reportName();
            expect(Firebase.prototype.set).to.have.been.calledWith(stepLogger.name);
        });

        it('should update outputUrl', async () => {
            const stepLogger = await getStepLoggerInstance();
            const url = 'url';
            stepLogger.updateOutputUrl(url);
            expect(Firebase.prototype.set).to.have.been.calledWith(url);
        });
    });
});
