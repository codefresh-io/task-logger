const { TaskLogger: MONGO, TYPES } = require('../index');

const main = async () => {
    const mongoTaskLogger = await MONGO({
        accountId: 'accountId',
        jobId: 'jobId'
    }, {
        type: TYPES.MONGO,
        mongo: {
            mongoURI: `mongodb://local.codefresh.io/logs`,
            mongoDBName: 'logs'
        }
    });

    mongoTaskLogger.reportId();
    mongoTaskLogger.reportAccountId();
    mongoTaskLogger.setVisibility('public');
    mongoTaskLogger.setStatus('running');
    mongoTaskLogger.setMemoryLimit('2');
    mongoTaskLogger.updateMemoryUsage(new Date(), 'sd');
    mongoTaskLogger.setData({ key: 'value' });


    const stepLoggerRedis = mongoTaskLogger.create('stepName', undefined, undefined, true);
    stepLoggerRedis.start();
    stepLoggerRedis.write('hey');
    stepLoggerRedis.reportName();
    stepLoggerRedis.clearLogs();
    stepLoggerRedis.setStatus('pending');
    stepLoggerRedis.start();
    stepLoggerRedis.write('write');
    stepLoggerRedis.debug('debug');
    stepLoggerRedis.warn('warn');
    stepLoggerRedis.info('info');

    stepLoggerRedis.markPreviouslyExecuted();
    stepLoggerRedis.markPendingApproval();

    stepLoggerRedis.updateMemoryUsage(new Date().getTime(), 'mem');
    stepLoggerRedis.updateCpuUsage(new Date().getTime(), 'cpu');

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
            mongoURI: `mongodb://local.codefresh.io/logs`,
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
            mongoURI: `mongodb://local.codefresh.io/logs`,
            mongoDBName: 'logs'
        }
    });

    await mongoTaskLoggerRestored.restore();
    const mongoRestoredStepLogger = mongoTaskLoggerRestored.create('stepName', undefined, undefined, true); // eslint-disable-line
    mongoRestoredStepLogger.write('makore');

    mongoTaskLoggerRestored.addErrorMessageToEndOfSteps('my error!');

    mongoTaskLogger.setStatus('success');
};

main();
