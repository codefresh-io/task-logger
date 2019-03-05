const Q = require('q');
const retry = require('retry');


/**
 * wrap a function with retry.
 * default will be 10 attempts spread over 2 (60 * 2) minutes
 */

const defaultRetryOptions = { retries: 60, factor: 1, minTimeout: 1, errorAfterTimeout: 2000 };

const wrapWithRetry = (funcToRetry,
    opts = defaultRetryOptions) => {
    const finalRetryOptions = Object.assign(defaultRetryOptions, opts);

    const deferred = Q.defer();

    const operation = retry.operation(finalRetryOptions);
    operation.attempt(() => {
        let finished = false;
        setTimeout(() => {
            if (finished) {
                return;
            }

            finished = true;
            if (operation.retry(new Error('function timed out'))) {
                return;
            }

            deferred.reject(operation.mainError());
        }, finalRetryOptions.errorAfterTimeout);
        return funcToRetry()
            .then((res) => {
                if (finished) {
                    return;
                }

                finished = true;
                deferred.resolve(res);
            })
            .catch((err) => {
                if (finished) {
                    return;
                }

                finished = true;
                if (operation.retry(err)) {
                    return;
                }

                deferred.reject(operation.mainError());
            });
    });

    return deferred.promise;
};

module.exports = {
    wrapWithRetry
};
