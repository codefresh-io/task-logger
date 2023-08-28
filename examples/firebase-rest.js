
const { TaskLogger: Firebase, TYPES } = require('../index');

const main = async () => {
    const taskLogger = await Firebase({
        accountId: 'accountId',
        jobId: 'jobId3'
    }, {
        type: TYPES.FIREBASE,
        baseFirebaseUrl: 'https://codefresh-dev.firebaseio.com/development-docker/build-logs-ziv',
        firebaseSecret: process.env.FIREBASE_SECRET,
        restInterface: true
    });

    const userId = 'userId';
    console.log(JSON.stringify(taskLogger.getConfiguration(userId)));

    const promises = [];

    for (let i = 0; i < 10000; i++) {
        promises.push(
            taskLogger.setMemoryLimit(`${i}`),
            taskLogger.updateMemoryUsage(new Date(), 'sd')
        );
    }

    return Promise.all(promises).then(() => {
        console.log('Done!');
    }).catch((err) => {
        console.log(err);
    });
};

main();

