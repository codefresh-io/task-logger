const { TaskLogger: Firebase, TYPES } = require('../index');

const main = async () => {
    const redisTaskLogger = await Firebase({
        accountId: 'accountId',
        jobId: 'jobId'
    }, {
        type: TYPES.REDIS,
        config: {
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

    stepLoggerRedis.markPreviouslyExecuted();
    stepLoggerRedis.markPendingApproval();

    stepLoggerRedis.updateMemoryUsage(new Date().getTime(), 'mem');
    stepLoggerRedis.updateCpuUsage(new Date().getTime(), 'cpu');

    // stepLogger.markTerminating();

    // stepLogger.finish(new Error('err'));
    // stepLogger.finish();

    // await stepLogger.delete();


    const redisRestoredTaskLogger = await Firebase({
        accountId: 'accountId',
        jobId: 'jobId'
    }, {
        type: TYPES.REDIS,
        config: {
            host: 'local.codefresh.io',
            password: 'redisPassword',
            db: 1,
            port: 6379
        }
    });

    await redisRestoredTaskLogger.restore();
    const redisRestoredStepLogger = redisRestoredTaskLogger.create('stepName', undefined, undefined, true); // eslint-disable-line
    // redisRestoredStepLogger.write('makore');

    // redisRestoredTaskLogger.addErrorMessageToEndOfSteps('my error!');

    // redisTaskLogger.setStatus('success');
};

main();
