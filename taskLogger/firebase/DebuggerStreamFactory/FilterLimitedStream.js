const { Transform } = require('stream');

const ALLOWED_COMMANDS = ['ls', 'printenv', 'cat', 'top', 'exit', 'cf_export', 'cd', 'export'];
function isCommandAllowed(cmd) {
    return ALLOWED_COMMANDS.indexOf(cmd) !== -1;
}

const MATCH = {
    // Deny sequences of commands and pipes
    // command [...args] && command [...args]
    // command [...args] || command [...args]
    // command [...args] | command [...args]
    // return true if matched
    isSequence: str => !!str.match(/&{2}|\|{1,2}/),
    // Check for single control codes ('^C' for brake, 'Bell' for ping)
    // Can take as code as string. Converts in correct escape code
    mapEscapes: (str) => {
        const cmdMatch = str.match(/^\x03|\x07|\\x03|\\x07$/); // eslint-disable-line no-control-regex
        if (cmdMatch) {
            return str.length === 1 ? str : String.fromCharCode(+str.replace('\\', '0'));
        }
        return false;
    },
    // check for single escape sequence for terminal resizing
    // Example: \x1b[8;25;80t
    // return true if resizing detected
    isResize: str => !!str.match(/^\x1b\[8;\d+;\d+t$/), // eslint-disable-line no-control-regex
    // check if command is allowed (the first word of passed string)
    // return false if command is absent in the list
    // return prepared command in case of success
    validateCommand: (str) => {
        const match = str.match(/^(\S+)/);
        if (match) {
            if (isCommandAllowed(match[1])) {
                return `${str}\r`;
            }
        }
        return false;
    }
};

class FilterLimitedStream extends Transform {
    constructor(skipStream) {
        super();
        this.skipStream = skipStream;
    }

    _validateCommand(data) {
        const str = data.toString();
        // check for sequence of commands
        if (MATCH.isSequence(str)) {
            return {
                isValid: false,
                message: 'Combining commands is restricted\n',
            };
        }

        // check for control codes ('^C' for brake, 'Bell' for ping)
        let command = MATCH.mapEscapes(str);
        if (command) {
            return {
                isValid: true,
                command,
            };
        }

        // check for single escape sequence for terminal resizing
        if (MATCH.isResize(str)) {
            return {
                isValid: true,
                command: str,
            };
        }

        // check if command is allowed
        command = MATCH.validateCommand(str);
        if (command) {
            return {
                isValid: true,
                command,
            };
        }

        return {
            isValid: false,
            message: 'Using of command is restricted\n',
        };
    }

    // Pass command if it present in the list of allowed commands
    // Or pass error message directly to output (skip container)
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
