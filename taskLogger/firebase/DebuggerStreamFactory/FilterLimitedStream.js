const { Transform } = require('stream');

const ALLOWED_COMMANDS = ['ls', 'printenv', 'cat', 'top', 'exit', 'cf_export', 'cd', 'export'];

class FilterLimitedStream extends Transform {
    constructor(skipStream) {
        super();
        this.skipStream = skipStream;
    }

    _validateCommand(data) {
        const str = data.toString();
        // check for sequence of commands
        if (str.match(/&{2}|\|{2}/)) {
            return {
                isValid: false,
                message: 'Combining commands is restricted\n',
            };
        }

        // check for control codes (^C, Bell for ping)
        let cmdMatch = str.match(/^\x03|\x07|\\x03|\\x07$/); // eslint-disable-line no-control-regex
        if (cmdMatch) {
            return {
                isValid: true,
                command: str.length === 1 ? str : String.fromCharCode(+str.replace('\\', '0')),
            };
        }

        // check for escape sequences
        cmdMatch = str.match(/^\x1b\[8;\d+;\d+t$/);
        if (cmdMatch) {
            return {
                isValid: true,
                command: str,
            };
        }

        // check for command (the first word of passed string)
        cmdMatch = str.match(/^(\S+)/);
        if (cmdMatch) {
            if (ALLOWED_COMMANDS.indexOf(cmdMatch[1]) !== -1) {
                return {
                    isValid: true,
                    command: `${str}\r`,
                };
            }
        }
        return {
            isValid: false,
            message: 'Using of command is restricted\n',
        };
    }
    _transform(data, encoding, callback) {
        const validationResult = this._validateCommand(data);
        if (validationResult.isValid) {
            this.push(validationResult.command);
        } else {
            this.push('');
            if (validationResult.message) {
                this.skipStream.write(validationResult.message);
            }
        }
        callback();
    }
}

module.exports = FilterLimitedStream;
