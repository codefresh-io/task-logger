const { TaskLogger: REDIS, TYPES } = require('../index');

const main = async () => {
    const redisTaskLogger = await REDIS({
        accountId: 'accountId',
        jobId: 'jobId'
    }, {
        type: TYPES.REDIS,
        redis: {
            host: 'local.codefresh.io',
            password: 'redisPassword',
            db: 1,
            port: 6379
        }
    });

    redisTaskLogger.reportId();
    redisTaskLogger.reportAccountId();
    redisTaskLogger.setVisibility('public');
    redisTaskLogger.setStatus('running');
    redisTaskLogger.setMemoryLimit('2');
    redisTaskLogger.updateMemoryUsage(new Date(), 'sd');
    redisTaskLogger.setData({ key: 'value' });
    redisTaskLogger.setLogSize(100);


    const stepLoggerRedis = redisTaskLogger.create('stepName', undefined, undefined, true);
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
    stepLoggerRedis.setLogSize(20);
    const lastUpdate = await redisTaskLogger.getLastUpdate();
    console.log(`last update : ${lastUpdate}`);

    stepLoggerRedis.markPreviouslyExecuted();
    stepLoggerRedis.markPendingApproval();

    stepLoggerRedis.updateMemoryUsage(new Date().getTime(), 'mem');
    stepLoggerRedis.updateCpuUsage(new Date().getTime(), 'cpu');

    // stepLogger.markTerminating();

    // stepLogger.finish(new Error('err'));
    // stepLogger.finish();

    // await stepLogger.delete();

    const redisTaskLoggerForStepRestore = await REDIS({
        accountId: 'accountId',
        jobId: 'jobId'
    }, {
        type: TYPES.REDIS,
        redis: {
            host: '192.168.99.100',
            password: 'redisPassword',
            db: 1,
            port: 6379
        }
    });
    const redisStepLoggerForRestore = redisTaskLoggerForStepRestore.create('stepName', undefined, undefined, false);
    await redisStepLoggerForRestore.restore();


    const redisRestoredTaskLogger = await REDIS({
        accountId: 'accountId',
        jobId: 'jobId'
    }, {
        type: TYPES.REDIS,
        redis: {
            host: '192.168.99.100',
            password: 'redisPassword',
            db: 1,
            port: 6379
        }
    });

    await redisRestoredTaskLogger.restore();
    const redisRestoredStepLogger = redisRestoredTaskLogger.create('stepName', undefined, undefined, true); // eslint-disable-line
    redisRestoredStepLogger.write('makore');

    redisRestoredTaskLogger.addErrorMessageToEndOfSteps('my error!');

    redisTaskLogger.setStatus('success');
};

main();
