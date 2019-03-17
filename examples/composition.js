const { TaskLogger: COMPOSE, TYPES } = require('../index');

const main = async () => {

    const composeTaskLogger = await COMPOSE({
        accountId: 'accountId',
        jobId: 'jobId'
    }, {
        loggersDefs: [
            {
                opts: {
                    type: TYPES.MONGO,
                    mongo: {
                        mongoURI: `mongodb://local.codefresh.io/logs`,
                        mongoDBName: 'logs'
                    }
                }
            },
            {
                opts: {
                    type: TYPES.REDIS,
                    redis: {
                        host: 'local.codefresh.io',
                        password: 'redisPassword',
                        db: 1,
                        port: 6379
                    }
                }
            }

        ],
        type: TYPES.COMPOSE

    });

    composeTaskLogger.reportId();
    composeTaskLogger.reportAccountId();
    composeTaskLogger.setVisibility('public');
    composeTaskLogger.setStatus('running');
    composeTaskLogger.setMemoryLimit('2');
    composeTaskLogger.updateMemoryUsage(new Date(), 'sd');
    composeTaskLogger.setData({ key: 'value' });


    const stepLoggerCompose = composeTaskLogger.create('stepName', undefined, undefined, true);
    stepLoggerCompose.start();
    stepLoggerCompose.write('hey');
    stepLoggerCompose.reportName();
    stepLoggerCompose.clearLogs();
    stepLoggerCompose.setStatus('pending');
    stepLoggerCompose.start();
    stepLoggerCompose.write('write');
    stepLoggerCompose.debug('debug');
    stepLoggerCompose.warn('warn');
    stepLoggerCompose.info('info');
    const lastUpdate = await composeTaskLogger.getLastUpdate();
    console.log(`last update : ${lastUpdate}`);

    stepLoggerCompose.markPreviouslyExecuted();
    stepLoggerCompose.markPendingApproval();

    stepLoggerCompose.updateMemoryUsage(new Date().getTime(), 'mem');
    stepLoggerCompose.updateCpuUsage(new Date().getTime(), 'cpu');

    // stepLogger.markTerminating();

    // stepLogger.finish(new Error('err'));
    // stepLogger.finish();

    // await stepLogger.delete();


    const composeTaskLoggerForStepRestore = await COMPOSE({
        accountId: 'accountId',
        jobId: 'jobId'
    }, {
        loggersDefs: [
            {
                opts: {
                    type: TYPES.MONGO,
                    mongo: {
                        mongoURI: `mongodb://local.codefresh.io/logs`,
                        mongoDBName: 'logs'
                    }
                }
            },
            {
                opts: {
                    type: TYPES.REDIS,
                    redis: {
                        host: 'local.codefresh.io',
                        password: 'redisPassword',
                        db: 1,
                        port: 6379
                    }
                }
            }

        ],
        type: TYPES.COMPOSE

    });
    const composeStepLoggerForRestore = composeTaskLoggerForStepRestore.create('stepName', undefined, undefined, false);
    await composeStepLoggerForRestore.restore();


    const composeTaskLoggerRestored = await COMPOSE({
        accountId: 'accountId',
        jobId: 'jobId'
    }, {
        loggersDefs: [
            {
                opts: {
                    type: TYPES.MONGO,
                    mongo: {
                        mongoURI: `mongodb://local.codefresh.io/logs`,
                        mongoDBName: 'logs'
                    }
                }
            },
            {
                opts: {
                    type: TYPES.REDIS,
                    redis: {
                        host: 'local.codefresh.io',
                        password: 'redisPassword',
                        db: 1,
                        port: 6379
                    }
                }
            }

        ],
        type: TYPES.COMPOSE

    });

    await composeTaskLoggerRestored.restore();
    const composeRestoredStepLogger = composeTaskLoggerRestored.create('stepName', undefined, undefined, true); // eslint-disable-line
    composeRestoredStepLogger.write('makore');

    composeTaskLoggerRestored.addErrorMessageToEndOfSteps('my error!');

    composeTaskLogger.setStatus('success');
};

main();
