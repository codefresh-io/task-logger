const { TaskLogger: MONGO, TYPES } = require('../index');

const mongoURI = `mongodb://local.codefresh.io/logs`;

const main = async () => {
    const mongoTaskLogger = await MONGO({
        accountId: 'accountId',
        jobId: 'jobId'
    }, {
        type: TYPES.MONGO,
        mongo: {
            mongoURI,
            mongoDBName: 'logs'
        }
    });

    await mongoTaskLogger.reportId();
    await mongoTaskLogger.reportAccountId();
    await mongoTaskLogger.setVisibility('public');
    await mongoTaskLogger.setStatus('running');
    mongoTaskLogger.setMemoryLimit('2');
    mongoTaskLogger.updateMemoryUsage(new Date(), 'sd');
    await mongoTaskLogger.setData({ key: 'value' });

    const stepLoggerMongo = mongoTaskLogger.create('stepName', undefined, undefined, true);
    stepLoggerMongo.start();
    stepLoggerMongo.write('hey');
    stepLoggerMongo.reportName();
    stepLoggerMongo.clearLogs();
    stepLoggerMongo.setStatus('pending');
    stepLoggerMongo.start();
    stepLoggerMongo.write('write');
    stepLoggerMongo.debug('debug');
    stepLoggerMongo.warn('warn');
    stepLoggerMongo.info('info');
    const lastUpdate = await mongoTaskLogger.getLastUpdate();
    console.log(`last update : ${lastUpdate}`);

    stepLoggerMongo.markPreviouslyExecuted();
    stepLoggerMongo.markPendingApproval();

    stepLoggerMongo.updateMemoryUsage(new Date().getTime(), 'mem');
    stepLoggerMongo.updateCpuUsage(new Date().getTime(), 'cpu');

    // stepLogger.markTerminating();

    // stepLogger.finish(new Error('err'));
    // stepLogger.finish();

    // await stepLogger.delete();

    const mongoTaskLoggerForStepRestore = await MONGO({
        accountId: 'accountId',
        jobId: 'jobId'
    }, {
        type: TYPES.MONGO,
        mongo: {
            mongoURI,
            mongoDBName: 'logs'
        }
    });
    const mongoStepLoggerForRestore = mongoTaskLoggerForStepRestore.create('stepName', undefined, undefined, false);
    await mongoStepLoggerForRestore.restore();

    const mongoTaskLoggerRestored = await MONGO({
        accountId: 'accountId',
        jobId: 'jobId'
    }, {
        type: TYPES.MONGO,
        mongo: {
            mongoURI,
            mongoDBName: 'logs'
        }
    });

    await mongoTaskLoggerRestored.restore();
    const mongoRestoredStepLogger = mongoTaskLoggerRestored.create('stepName', undefined, undefined, true); // eslint-disable-line
    mongoRestoredStepLogger.write('makore');

    mongoTaskLoggerRestored.addErrorMessageToEndOfSteps('my error!');

    await mongoTaskLogger.setStatus('success');
};

main();
