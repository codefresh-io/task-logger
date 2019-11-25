const _ = require('lodash');
const Q = require('q');
const debug = require('debug')('codefresh:taskLogger:firebase:restClient');
const EventEmitter = require('events');
let request = require('requestretry');

const RETRY_STATUS_CODES = [502, 503, 504];
request = request.defaults(
    {
        timeout: 5 * 1000,
        retryStrategy: (err, response = {}) => {
            return request.RetryStrategies.NetworkError(err, response) || RETRY_STATUS_CODES.includes(response.statusCode);
        },
        maxAttempts: 5,
        retryDelay: 5 * 1000, // 'ECONNRESET', 'ENOTFOUND', 'ESOCKETTIMEDOUT', 'ETIMEDOUT', 'ECONNREFUSED', 'EHOSTUNREACH', 'EPIPE', 'EAI_AGAIN'
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

    _sendRequest(opts) {
        const deferred = Q.defer();

        const func = async () => {
            const finalOpts = this._getRequestOptions(opts);
            debug(`going to perform: ${JSON.stringify(finalOpts.uri)}`);
            return request(finalOpts)
                .catch(this._catchHandler.bind(this))
                .then(this._createResponseHandler(finalOpts))
                .then(deferred.resolve.bind(deferred), deferred.reject.bind(deferred));
        };

        this.queue.push(func);
        setInterval(() => {
            this.emit('task-added');
        }, 1);

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

    async get(uri, opts = {}) {
        return this._sendRequest({
            uri,
            qs: opts,
            method: 'GET',
        });
    }

    async set(uri, data) {
        return this._sendRequest({
            uri,
            method: 'PUT',
            body: data
        })
            .tap(() => {
                this.emit('data-set-successfully');
            });
    }

    async remove(uri) {
        return this._sendRequest({
            uri,
            method: 'DELETE',
        });
    }

    async push(uri, data) {
        return this._sendRequest({
            uri,
            method: 'POST',
            body: data
        });
    }
}

module.exports = Client;
