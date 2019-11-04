const TaskLoggerFactory = require('./taskLogger/taskLoggerFactory');
const TYPES = require('./taskLogger/enums').TYPES;
const packageJson = require('./package.json');

module.exports = {
    TaskLogger: TaskLoggerFactory,
    TYPES,
    version: packageJson.version,
};
