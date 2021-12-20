const sinon = require('sinon');

const createFirebaseStub = function () {
    const Firebase = function (path) {
        this.path = path;
    };

    Firebase.prototype.authWithCustomToken = sinon.stub().yields();
    Firebase.prototype.push = sinon.spy();
    Firebase.prototype.set = sinon.spy();
    Firebase.prototype.update = sinon.spy();
    Firebase.prototype.child = function (newPath) {
        return new Firebase(`${this.path}/${newPath}`);
    };
    Firebase.prototype.ref = function () {
        return this.path;
    };

    return Firebase;
};

const createFirebaseStubWithDebugger = function (deferredSteamFlow) {
    const Firebase = createFirebaseStub();

    Firebase.prototype.handlers = {};
    Firebase.prototype.on = (event, handler) => {
        Firebase.prototype.handlers[event] = handler;
    };
    Firebase.prototype.off = (event) => {
        delete Firebase.prototype.handlers[event];
    };
    Firebase.prototype.child_added = (value) => {
        Firebase.prototype.handlers.child_added({ val: () => value });
    };
    Firebase.prototype.push = (val) => {
        deferredSteamFlow.resolve(val);
    };

    return Firebase;
};

const createFirebaseStubWithHealthCheck = ({ timeout = 10, setCallbackValue }) => {
    const Firebase = createFirebaseStub();
    Firebase.prototype.handlers = {};
    Firebase.prototype.count = 0;
    Firebase.prototype.set = sinon.spy((key, func) => {
        const timerId = setTimeout(() => {
            // eslint-disable-next-line no-plusplus
            Firebase.prototype.count++;
            clearTimeout(timerId);
            if (typeof func === 'function') {
                func(setCallbackValue);
            }
        }, timeout); // ticking

    });
    return Firebase;
};

module.exports = {
    createFirebaseStub,
    createFirebaseStubWithDebugger,
    createFirebaseStubWithHealthCheck,
};
