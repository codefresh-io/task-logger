const { TaskLogger: Firebase, TYPES } = require('../index');

const main = async () => {
    const taskLogger = await Firebase({
        accountId: 'accountId',
        jobId: 'jobId'
    }, {
        type: TYPES.FIREBASE,
        baseFirebaseUrl: 'https://codefresh-dev.firebaseio.com/development-docker/build-logs',
        firebaseSecret: process.env.FIREBASE_SECRET,
        restInterface: true
    });

    taskLogger.on('error', (err) => {
        console.error(err.stack);
    });

    console.log(JSON.stringify(taskLogger.getConfiguration()));

    taskLogger.reportId();
    taskLogger.reportAccountId();
    taskLogger.setVisibility('public');
    taskLogger.setStatus('running');
    taskLogger.setMemoryLimit('2');
    taskLogger.updateMemoryUsage(new Date(), 'sd');
    taskLogger.setData({ key: 'value' });

    const newStep = taskLogger.create('stepName1', undefined, true);
    newStep.start();
    newStep.finish();
    const stepLogger2 = taskLogger.create('stepName2', undefined, true);
    const stepLogger = taskLogger.create('stepName', undefined, true);
    stepLogger.start();
    stepLogger.write('hey');
    stepLogger.reportName();
    stepLogger.clearLogs();
    stepLogger.setStatus('pending');
    stepLogger.start();
    stepLogger.write('write');
    stepLogger.debug('debug');
    stepLogger.warn('warn');
    stepLogger.info('info');
    const lastUpdate = await taskLogger.getLastUpdate();
    console.log(`last update : ${lastUpdate}`);

    stepLogger.markPreviouslyExecuted();
    stepLogger.markPendingApproval();

    stepLogger.updateMemoryUsage(new Date().getTime(), 'mem');
    stepLogger.updateCpuUsage(new Date().getTime(), 'cpu');

    stepLogger2.start();
    taskLogger.addErrorMessageToEndOfSteps('my error!!');

    // stepLogger.markTerminating();

    // stepLogger.finish(new Error('err'));
    // stepLogger.finish();

    // await stepLogger.delete();

    // const restoredTaskLogger = await Firebase({
    //     accountId: 'accountId',
    //     jobId: 'jobId'
    // }, {
    //     type: TYPES.FIREBASE,
    //     baseFirebaseUrl: 'https://codefresh-dev.firebaseio.com/development-docker/build-logs',
    //     firebaseSecret: process.env.FIREBASE_SECRET
    // });
    // await restoredTaskLogger.restore();
    // const restoredStepLogger = restoredTaskLogger.create('stepName', undefined, undefined, true);
    // restoredStepLogger.write('makore');
    //
    // restoredTaskLogger.addErrorMessageToEndOfSteps('my error!');
    //
    // taskLogger.setStatus('success');
    // await taskLogger.clearSteps();
    // await taskLogger.delete();
    // taskLogger.finish();
    // taskLogger.fatalError(new Error('my error'));
};

main();
