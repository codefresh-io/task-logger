const _ = require('lodash');
const proxyquire = require('proxyquire').noCallThru();
const chai       = require('chai');

const expect     = chai.expect;
const sinon      = require('sinon');
const sinonChai  = require('sinon-chai');

chai.use(sinonChai);
const { createFirebaseStub } = require('./FirebaseStub');
const { RestClientStub } = require('./RestClientStub');

let Firebase;

const getStepLoggerInstance = async (step = { accountId: 'accountId', jobId: 'jobId', name: 'name' },
    opts = { baseFirebaseUrl: 'url', firebaseSecret: 'secret' }) => {

    if (!opts.restClient) {
        opts.restClient = new RestClientStub();
    }

    Firebase = createFirebaseStub();

    let StepLogger;

    if (opts.restInterface) {
        StepLogger = proxyquire('../rest/StepLogger', {
            'firebase': Firebase
        });
    } else {
        StepLogger = proxyquire('../StepLogger', {
            'firebase': Firebase
        });
    }

    const stepLogger = new StepLogger(step, opts);
    stepLogger.emit  = sinon.spy(stepLogger.emit);

    return stepLogger;
};

const interfaces = [
    { name: 'base class', opts: {} },
    { name: 'REST class', opts: { restInterface: true } }
];

_.forEach(interfaces, (int) => {
    describe(`Firebase StepLogger '${int.name}' tests`, () => {

        describe('constructor', () => {

            describe('positive', () => {

                it('should succeed if all data is passed and authentication succeeded', async () => {
                    Firebase = createFirebaseStub();

                    const StepLogger = proxyquire('../StepLogger', {
                        'firebase': Firebase,
                    });

                    const task = { accountId: 'accountId', jobId: 'jobId', name: 'name' };
                    const opts = _.merge({}, {
                        baseFirebaseUrl: 'url',
                        firebaseSecret: 'secret'
                    }, int.opts);

                    new StepLogger(task, opts); // eslint-disable-line
                });
            });

            describe('negative', () => {

                it('should fail in case of a missing baseFirebaseUrl', async () => {
                    Firebase = createFirebaseStub();

                    const StepLogger = proxyquire('../StepLogger', {
                        'firebase': Firebase,
                    });

                    const task = { accountId: 'accountId', jobId: 'jobId', name: 'name' };
                    const opts = _.merge({}, {
                        firebaseSecret: 'secret'
                    }, int.opts);

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
                const opts = _.merge({}, {
                    baseFirebaseUrl: 'url',
                    firebaseSecret: 'secret'
                }, int.opts);
                const stepLogger = await getStepLoggerInstance(undefined, opts);
                const message = 'message';
                stepLogger._reportLog(message);
                if (opts.restInterface) {
                    expect(stepLogger.restClient.push).to.have.been.calledWith(`${stepLogger.stepRef.ref()}/logs`, message);
                } else {
                    expect(Firebase.prototype.push).to.have.been.calledWith(message);
                }
            });

            it('should report last update', async () => {
                const opts = _.merge({}, {
                    baseFirebaseUrl: 'url',
                    firebaseSecret: 'secret'
                }, int.opts);
                const stepLogger = await getStepLoggerInstance(undefined, opts);
                stepLogger.lastUpdate = new Date();
                const spy = sinon.spy();
                stepLogger.onLastUpdateChanged(spy);
                stepLogger.emit('lastUpdateChanged');
                expect(spy).to.have.been.calledWith(stepLogger.lastUpdate);
            });

            it('should report previously executed', async () => {
                const opts = _.merge({}, {
                    baseFirebaseUrl: 'url',
                    firebaseSecret: 'secret'
                }, int.opts);
                const stepLogger = await getStepLoggerInstance(undefined, opts);
                stepLogger.previouslyExecuted = true;
                stepLogger._reportPrevioulyExecuted();
                if (opts.restInterface) {
                    expect(stepLogger.restClient.set).to.have.been.calledWith(`${stepLogger.stepRef.ref()}/previouslyExecuted`, stepLogger.previouslyExecuted);
                } else {
                    expect(Firebase.prototype.set).to.have.been.calledWith(stepLogger.previouslyExecuted);
                }
            });

            it('should report status', async () => {
                const opts = _.merge({}, {
                    baseFirebaseUrl: 'url',
                    firebaseSecret: 'secret'
                }, int.opts);
                const stepLogger = await getStepLoggerInstance(undefined, opts);
                stepLogger.status = 'running';
                stepLogger._reportStatus();
                if (opts.restInterface) {
                    expect(stepLogger.restClient.set).to.have.been.calledWith(`${stepLogger.stepRef.ref()}/status`, stepLogger.status);
                } else {
                    expect(Firebase.prototype.set).to.have.been.calledWith(stepLogger.status);
                }
            });

            it('should report finish timestamp', async () => {
                const opts = _.merge({}, {
                    baseFirebaseUrl: 'url',
                    firebaseSecret: 'secret'
                }, int.opts);
                const stepLogger = await getStepLoggerInstance(undefined, opts);
                stepLogger.finishTimeStamp = new Date();
                stepLogger._reportFinishTimestamp();
                if (opts.restInterface) {
                    expect(stepLogger.restClient.set).to.have.been.calledWith(`${stepLogger.stepRef.ref()}/finishTimeStamp`, stepLogger.finishTimeStamp);
                } else {
                    expect(Firebase.prototype.set).to.have.been.calledWith(stepLogger.finishTimeStamp);
                }
            });

            it('should report creation time', async () => {
                const opts = _.merge({}, {
                    baseFirebaseUrl: 'url',
                    firebaseSecret: 'secret'
                }, int.opts);
                const stepLogger = await getStepLoggerInstance(undefined, opts);
                stepLogger.creationTimeStamp = new Date();
                stepLogger._reportCreationTimestamp();
                if (opts.restInterface) {
                    expect(stepLogger.restClient.set).to.have.been.calledWith(`${stepLogger.stepRef.ref()}/creationTimeStamp`, stepLogger.creationTimeStamp);
                } else {
                    expect(Firebase.prototype.set).to.have.been.calledWith(stepLogger.creationTimeStamp);
                }
            });

            it('should report memory usage', async () => {
                const opts = _.merge({}, {
                    baseFirebaseUrl: 'url',
                    firebaseSecret: 'secret'
                }, int.opts);
                const stepLogger = await getStepLoggerInstance(undefined, opts);
                const time = new Date();
                const usage = 'usage';
                stepLogger._reportMemoryUsage(time, usage);
                if (opts.restInterface) {
                    expect(stepLogger.restClient.push).to.have.been.calledWith(`${stepLogger.stepRef.ref()}/metrics/memory`, { time, usage });
                } else {
                    expect(Firebase.prototype.push).to.have.been.calledWith({ time, usage });
                }
            });

            it('should report cpu usage', async () => {
                const opts = _.merge({}, {
                    baseFirebaseUrl: 'url',
                    firebaseSecret: 'secret'
                }, int.opts);
                const stepLogger = await getStepLoggerInstance(undefined, opts);
                const time = new Date();
                const usage = 'usage';
                stepLogger._reportCpuUsage(time, usage);
                if (opts.restInterface) {
                    expect(stepLogger.restClient.push).to.have.been.calledWith(`${stepLogger.stepRef.ref()}/metrics/cpu`, { time, usage });
                } else {
                    expect(Firebase.prototype.push).to.have.been.calledWith({ time, usage });
                }
            });

            it('should report log size', async () => {
                const opts = _.merge({}, {
                    baseFirebaseUrl: 'url',
                    firebaseSecret: 'secret'
                }, int.opts);
                const stepLogger = await getStepLoggerInstance(undefined, opts);
                stepLogger.logSize = 'size';
                stepLogger._reportLogSize();
                if (opts.restInterface) {
                    expect(stepLogger.restClient.set).to.have.been.calledWith(`${stepLogger.stepRef.ref()}/metrics/logs/total`, stepLogger.logSize);
                } else {
                    expect(Firebase.prototype.set).to.have.been.calledWith(stepLogger.logSize);
                }
            });

            it('should report name', async () => {
                const opts = _.merge({}, {
                    baseFirebaseUrl: 'url',
                    firebaseSecret: 'secret'
                }, int.opts);
                const stepLogger = await getStepLoggerInstance(undefined, opts);
                stepLogger.reportName();
                if (opts.restInterface) {
                    expect(stepLogger.restClient.set).to.have.been.calledWith(`${stepLogger.stepRef.ref()}/name`, stepLogger.name);
                } else {
                    expect(Firebase.prototype.set).to.have.been.calledWith(stepLogger.name);
                }
            });

            it('should update outputUrl', async () => {
                const opts = _.merge({}, {
                    baseFirebaseUrl: 'url',
                    firebaseSecret: 'secret'
                }, int.opts);
                const stepLogger = await getStepLoggerInstance(undefined, opts);
                const url = 'url';
                stepLogger.updateOutputUrl(url);
                if (opts.restInterface) {
                    expect(stepLogger.restClient.set).to.have.been.calledWith(`${stepLogger.stepRef.ref()}/data/outputUrl`, url);
                } else {
                    expect(Firebase.prototype.set).to.have.been.calledWith(url);
                }
            });
        });
    });
});
