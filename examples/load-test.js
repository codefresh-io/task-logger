const { TaskLogger: Firebase, TYPES } = require('../index');

const main = async () => {
    const taskLogger = await Firebase({
        accountId: '5bf28e120aae761ce4f26016',
        jobId: '5c7ee35804a23774f9007988'
    }, {
        type: TYPES.FIREBASE,
        baseFirebaseUrl: 'https://codefresh-dev.firebaseio.com/development-docker/build-logs',
        firebaseSecret: 'rmxPCB0YOyRdA0ohVUlkbGaQsSmXlARBIXbfnXoM'
    });


    const stepLogger = taskLogger.create('itai-test', undefined, undefined, true);
    stepLogger.start();
    stepLogger.info('hey');

    setTimeout(async () => {
        console.log('performing');
        await stepLogger.restore();
        console.log('performed');
    }, 5000);

    for (let i = 0; i < 100000; i++) { // eslint-disable-line
        stepLogger.info('hey');
    }

/*    setInterval(() => {
        stepLogger.info('hey');
    }, 10); */


};

main();
