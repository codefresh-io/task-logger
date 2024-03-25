// @ts-check
const debug = require('debug')('codefresh:taskLogger:firebase:restClient');
const EventEmitter = require('events');
/**
 * Polyfill of `Promise.withResolvers`, TC39 Stage 4 proposal.
 * @see https://github.com/tc39/proposal-promise-with-resolvers
 */
const getPromiseWithResolvers = require('core-js-pure/es/promise/with-resolvers');

/**
 * @typedef {import('got/dist/source/index').Got} HttpClient
 * @typedef {import('got/dist/source/index').OptionsOfJSONResponseBody} RequestOptions
 * @typedef {import('got/dist/source/index').SearchParameters | URLSearchParams} SearchParameters
 * @typedef {import('got/dist/source/index').RequestError} RequestError
 * @typedef {import('got/dist/source/index').Response} Response
 *
 * @typedef {object} QueueOptions
 * @property {boolean} inOrder
 *
 * @typedef {object} PlatformClientOptions
 * @property {true} isPlatform Defines if the Client was initiated on the Platform or not
 * @property {string} firebaseIdToken Initial Firebase ID token
 * @property {() => Promise<string>} getNewFirebaseIdToken Callback to retrieve renewed Firebase ID token
 *
 * @typedef {object} NonPlatformClientOptions
 * @property {false} isPlatform Defines if the Client was initiated on the Platform or not
 * @property {string} firebaseIdToken Initial Firebase ID token
 * @property {string} codefreshApiUrl Codefresh API URL
 * @property {string} codefreshApiKey Codefresh API key
 * @property {string} progressId Progress ID
 *
 * @typedef {PlatformClientOptions | NonPlatformClientOptions} ClientOptions
 */

const SECRET_REPLACEMENT = '<redacted>';
const RETRY_ERROR_CODES = [
    'ESOCKETTIMEDOUT',
    'EHOSTUNREACH',
    /**
     * ⬇️ @denis-codefresh: workaround after we discovered that this started to happen under huge load,
     * should be removed after we better understand the root cause
     */
    'CERT_HAS_EXPIRED',
];

class Client extends EventEmitter {
    #codefreshApiKey;

    #codefreshApiUrl;

    #codefreshClient;

    #firebaseClient;

    #firebaseIdToken;

    #getNewFirebaseIdToken;

    #progressId;

    #queue;

    /**
     * @param {HttpClient} httpClient HTTP client
     * @param {ClientOptions} options Rest Client options
     */
    constructor(httpClient, options) {
        super();

        this.#firebaseIdToken = options.firebaseIdToken;
        if (options.isPlatform) {
            this.#getNewFirebaseIdToken = options.getNewFirebaseIdToken;
        } else {
            this.#codefreshApiUrl = options.codefreshApiUrl;
            this.#codefreshApiKey = options.codefreshApiKey;
            this.#progressId = options.progressId;
            /**
             * @returns {Promise<string>}
             */
            this.#getNewFirebaseIdToken = async function () {
                const body = await this.#codefreshClient.get('user/firebaseAuth', {
                    searchParams: { progressId: this.#progressId },
                }).json();
                return body.accessToken;
            };
        }

        const baseHttpClient = httpClient.extend({
            mutableDefaults: true, // Required for token renewal in hooks when it expires
            // responseType: 'json', // Commented out because of known issue with “afterResponse” hooks: https://github.com/sindresorhus/got/issues/2273
            timeout: {
                request: Number(process.env.FIREBASE_REQUEST_TIMEOUT || 20 * 1000),
            },
            retry: {
                limit: 5,
                errorCodes: [
                    ...(httpClient.defaults.options.retry.errorCodes ?? []),
                    ...RETRY_ERROR_CODES,
                ],
            },
            hooks: {
                beforeRequest: [
                    this.#logRequests.bind(this),
                ],
                afterResponse: [
                    this.#logResponses.bind(this),
                    this.#renewFirebaseTokenAndRetry.bind(this),
                ],
                beforeError: [
                    this.#logErrors.bind(this),
                ],
            },
            headers: {
                'User-Agent': 'codefresh-task-logger',
            }
        });
        this.#firebaseClient = baseHttpClient.extend({
            searchParams: {
                'auth': this.#firebaseIdToken,
            },
        });
        this.#codefreshClient = baseHttpClient.extend({
            headers: {
                'Authorization': this.#codefreshApiKey,
            },
            prefixUrl: this.#codefreshApiUrl,
        });

        this.#queue = [];
        this.on('task-added', this.#onTaskAdded.bind(this));
    }

    /**
     * Masks token in URL
     * @param {URL | string} url URL to mask
     * @returns {string}
     */
    #maskTokenInURL(url) {
        return url.toString().replace(new RegExp(this.#firebaseIdToken, 'g'), SECRET_REPLACEMENT);
    }

    /**
     * @param {RequestOptions} options Request options
     */
    #logRequests(options) {
        debug(`Going to perform request: ${JSON.stringify({
            ...(options.url && { url: this.#maskTokenInURL(options.url) }),
            method: options.method,
            body: options.json ?? options.body,
        })}`);
    }

    /**
     * @param {Response} response Response
     * @returns {Response}
     */
    #logResponses(response) {
        debug(`Got response for: ${JSON.stringify({
            url: this.#maskTokenInURL(response.url),
            method: response.request.options.method,
            status: response.statusCode,
        })}`);
        return response;
    }

    /**
     * @param {RequestError} error Request error
     * @returns {RequestError}
     */
    #logErrors(error) {
        const { response } = error;
        error.message = `Failed to perform HTTP request: ${response
            ? JSON.stringify({
                path: this.#maskTokenInURL(response.url),
                error: response.body?.error ? response.body.error : response.body,
                statusCode: response.statusCode,
            })
            : error
        }`;
        debug(error.message);
        return error;
    }

    /**
     * @param {Response} response Response
     * @param {any} retryWithMergedOptions Retry function
     * @returns {Promise<Response>}
     */
    async #renewFirebaseTokenAndRetry(response, retryWithMergedOptions) {
        if (response.statusCode === 401) {
            debug(`Getting new Firebase ID token`);
            this.#firebaseIdToken = await this.#getNewFirebaseIdToken();
            const newOptions = {
                searchParams: { 'auth': this.#firebaseIdToken },
            };
            this.#firebaseClient.defaults.options.merge(newOptions);
            return retryWithMergedOptions(newOptions);
        }
        return response;
    }

    /**
     * @param {RequestOptions} opts Request options
     * @returns {RequestOptions}
     */
    #getRequestOptions(opts) {
        return {
            ...globalThis.structuredClone(opts),
            url: `${opts.url?.toString()}.json`
        };
    }

    /**
     * @param {RequestOptions} httpOpts
     * @param {QueueOptions} opts
     * @returns {Promise<any>}
     */
    #sendRequest(httpOpts, opts = { inOrder: true }) {
        const deferred = getPromiseWithResolvers();

        const task = () => {
            const finalOpts = this.#getRequestOptions(httpOpts);
            return this.#firebaseClient(finalOpts)
                .json()
                .then(deferred.resolve.bind(deferred))
                .catch(deferred.reject.bind(deferred));
        };

        if (opts.inOrder) {
            this.#queue.push(task);
            setTimeout(() => {
                this.emit('task-added');
            }, 1);
        } else {
            setTimeout(async () => {
                try {
                    await task();
                } catch (err) {
                    deferred.reject(err);
                }
            }, 1);
        }

        return deferred.promise;
    }

    async #onTaskAdded() {
        try {
            if (this.handling === true) {
                return;
            }

            this.handling = true;

            while (this.#queue.length) {
                const task = this.#queue.shift();
                await task(); // eslint-disable-line no-await-in-loop
            }

            this.handling = false;
        } catch (err) {
            this.handling = false;
        }
    }

    /**
     * @param {string | URL} url URL
     * @param {SearchParameters} searchParams Search params
     * @param {QueueOptions} opts Options
     * @returns {Promise<any>}
     */
    async get(url, searchParams = {}, opts = { inOrder: true }) {
        return this.#sendRequest({
            url,
            method: 'GET',
            searchParams,
        }, opts);
    }

    /**
     * @param {string | URL} url URL
     * @param {unknown} data Body to sent
     * @param {QueueOptions} opts Options
     * @returns {Promise<any>}
     */
    async set(url, data, opts = { inOrder: true }) {
        const response = await this.#sendRequest({
            url,
            method: 'PUT',
            json: data
        }, opts);
        this.emit('data-set-successfully');
        return response;
    }

    /**
     * @param {string | URL} url URL
     * @param {QueueOptions} opts Options
     * @returns {Promise<any>}
     */
    async remove(url, opts = { inOrder: true }) {
        return this.#sendRequest({
            url,
            method: 'DELETE',
        }, opts);
    }

    /**
     * @param {string | URL} url URL
     * @param {unknown} data Body to sent
     * @param {QueueOptions} opts Options
     * @returns {Promise<any>}
     */
    async push(url, data, opts = { inOrder: true }) {
        return this.#sendRequest({
            url,
            method: 'POST',
            json: data
        }, opts);
    }
}

module.exports = Client;
