const TaskLoggerFactory = require('./taskLogger/taskLoggerFactory');
const TYPES = require('./taskLogger/enums').TYPES;

module.exports = {
    TaskLogger: TaskLoggerFactory,
    TYPES
};
