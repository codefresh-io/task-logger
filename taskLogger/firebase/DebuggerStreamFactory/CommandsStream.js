const { Readable } = require('stream');

class CommandsStream extends Readable {
    constructor(commandsRef, errorHandler) {
        super();
        commandsRef.on('child_added', snapshot => this.push(snapshot.val()), errorHandler, this);

        this.ping = setInterval(() => {
            this.push('\u0007');
        }, 20000);
    }

    _read() { }

    _destroy() {
        clearInterval(this.ping);
    }
}

module.exports = CommandsStream;
