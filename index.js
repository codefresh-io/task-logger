const TaskLoggerFactory = require('./taskLogger/taskLoggerFactory');
const { TYPES } = require('./taskLogger/enums');

module.exports = {
    TaskLogger: TaskLoggerFactory,
    TYPES
};
