const _ = require('lodash');
const Q = require('q');
const debug = require('debug')('codefresh:taskLogger:firebase:restClient');
const EventEmitter = require('events');
let request = require('requestretry');

const RETRY_STATUS_CODES = [502, 503, 504];
request = request.defaults(
    {
        timeout: process.env.FIREBASE_REQUEST_TIMEOUT || 20 * 1000,
        retryStrategy: (err, response = {}) => {
            // workaround after we discovered that this started to happen under huge load,
            // should be removed after we better understand the root cause 
            if (err && err.code === 'CERT_HAS_EXPIRED') {
                return true;
            }
            return request.RetryStrategies.NetworkError(err, response) || RETRY_STATUS_CODES.includes(response.statusCode);
        },
        maxAttempts: 5,
        // 'ECONNRESET', 'ENOTFOUND', 'ESOCKETTIMEDOUT', 'ETIMEDOUT', 'ECONNREFUSED', 'EHOSTUNREACH', 'EPIPE', 'EAI_AGAIN'
        retryDelay: process.env.FIREBASE_REQUEST_RETRY_DELAY || 5000,
        promiseFactory: (resolver) => {
            return Q.promise(resolver);
        }
    });

class Client extends EventEmitter {

    constructor(firebaseSecret) {
        super();

        this.queue = [];

        this.firebaseSecret = firebaseSecret;
        this.headers = {
            'User-Agent': 'codefresh-task-logger',
        };
        this.qs = {
            'auth': this.firebaseSecret
        };

        this.on('task-added', this._onTaskAdded.bind(this));
    }

    _catchHandler(err) {
        throw new Error(_.get(err, 'message'));
    }

    _createResponseHandler(opts) {
        return (response) => {
            debug(`got response for: ${JSON.stringify(opts.uri)}`);
            if (response.statusCode >= 400) {
                throw new Error(`Failed to write to ${opts.uri} with error: ${_.get(response, 'body.error', _.get(response, 'body'))}`);
            } else {
                return response.body;
            }
        };
    }

    _getRequestOptions(opts) {
        const finalOptions = _.merge({}, {
            qs: this.qs,
            headers: this.headers,
            json: true
        }, opts);
        finalOptions.uri = `${finalOptions.uri}.json`;
        return finalOptions;
    }

    _sendRequest(httpOpts, opts = { inOrder: true }) {
        const deferred = Q.defer();

        const func = async () => {
            const finalOpts = this._getRequestOptions(httpOpts);
            debug(`going to perform: ${JSON.stringify(finalOpts)}`);
            return request(finalOpts)
                .catch(this._catchHandler.bind(this))
                .then(this._createResponseHandler(finalOpts))
                .then(deferred.resolve.bind(deferred), deferred.reject.bind(deferred));
        };

        if (opts.inOrder) {
            this.queue.push(func);
            setTimeout(() => {
                this.emit('task-added');
            }, 1);
        } else {
            setTimeout(async () => {
                try {
                    await func();
                } catch (err) {
                    deferred.reject(err);
                }
            }, 1);
        }

        return deferred.promise;
    }

    async _onTaskAdded() {
        try {
            if (this.handling === true) {
                return;
            }

            this.handling = true;

            while (this.queue.length) {
                const task = this.queue.shift();
                await task(); // eslint-disable-line no-await-in-loop
            }

            this.handling = false;
        } catch (err) {
            this.handling = false;
        }
    }

    async get(uri, qs = {}, opts = { inOrder: true }) {
        return this._sendRequest({
            uri,
            qs,
            method: 'GET',
        }, opts);
    }

    async set(uri, data, opts = { inOrder: true }) {
        return this._sendRequest({
            uri,
            method: 'PUT',
            body: data
        }, opts)
            .tap(() => {
                this.emit('data-set-successfully');
            });
    }

    async remove(uri, opts = { inOrder: true }) {
        return this._sendRequest({
            uri,
            method: 'DELETE',
        }, opts);
    }

    async push(uri, data, opts = { inOrder: true }) {
        return this._sendRequest({
            uri,
            method: 'POST',
            body: data
        }, opts);
    }
}

module.exports = Client;
