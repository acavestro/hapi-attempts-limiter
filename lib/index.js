'use strict';

const Assert = require('assert');
const Boom = require('boom');
const Hoek = require('hoek');

const pkgAttributes = {
    pkg: require('../package.json')
};

const defaults = {
    namespace: pkgAttributes.pkg.name + '-v' + pkgAttributes.pkg.version,
    errorMessage: function (limit) {

        return Boom.tooManyRequests('Rate limit exceeded, retry in ' + limit.reset + ' seconds');
    },
    global: {
        limit: 5,
        duration: 60, // seconds
        genericRateLimiter: false,
        trustProxy: false
    }
};

const HapiAttemptsLimiter = function (server, options, next) {

    const settings = Hoek.applyToDefaults(defaults, options);

    Assert(typeof options.redisClient === 'object' && options.redisClient.constructor.name === 'RedisClient', pkgAttributes.pkg.name + ': redis instance missing!');
    if (options.errorMessage) {
        Assert(!!(options.errorMessage && options.errorMessage.constructor && options.errorMessage.call && options.errorMessage.apply), pkgAttributes.pkg.name + ': errorMessage must be a function!');
    }

    const redisClient = options.redisClient;
    const attemptsNamespace = settings.namespace + ':';

    const _newLimit = function (limitOptions) {

        const limit = limitOptions.limit || settings.global.limit;
        const duration = limitOptions.duration || settings.global.duration;

        return {
            remaining: limit,
            total: limit,
            duration: duration,
            reset: duration
        };
    };

    const _getLimit = function (id, callback) {

        redisClient.multi()
            .ttl(attemptsNamespace + id)
            .get(attemptsNamespace + id)
            .exec((err, reply) => {

                if (err) {
                    return callback(err);
                }

                if (reply) {
                    const ttl = reply[0];

                    if (ttl < 0) {
                        return callback(null, null);
                    }

                    const limit = JSON.parse(reply[1]);

                    limit.reset = ttl;
                    return callback(null,limit);
                }

                return callback(null, null);
            });
    };

    const _setLimit = function (id, limit) {

        const newLimit = Hoek.clone(limit);

        if (newLimit.reset) {
            delete newLimit.reset;
        }

        redisClient.multi()
            .set(attemptsNamespace + id, JSON.stringify(newLimit))
            .expire(attemptsNamespace + id, newLimit.duration)
            .exec();
    };

    const _updateLimit = function (id, limitOptions, callback) {

        _getLimit(id, (err, limit) => {

            if (err) {
                return callback(err);
            }

            if (!limit) {
                limit = _newLimit(limitOptions);
            }

            if (limit.remaining > 0) {
                limit.remaining -= 1;
            }

            _setLimit(id, limit);

            return callback(null, limit);
        });
    };

    const _getIP = function (request, requestSettings) {

        let ip = request.info.remoteAddress;
        if (requestSettings.trustProxy && request.headers['x-forwarded-for']) {
            const ips = request.headers['x-forwarded-for'].split(',');
            ip = ips[ips.length - 1];
        }

        return ip;

    };

    const _generateErrorMessage = function (request, limit) {

        const settingsErrorMessage = settings.errorMessage(limit);

        if (settingsErrorMessage.isBoom || settingsErrorMessage instanceof Error) {
            return settingsErrorMessage;
        }

        if (typeof settingsErrorMessage === 'string' || settingsErrorMessage instanceof String) {
            return Boom.tooManyRequests(settingsErrorMessage);
        }

        request.log('error', new Error(pkgAttributes.pkg.name + ': cannot use custom error message, it\'s not an error nor a string!'));
        return defaults.errorMessage(limit);

    };

    server.ext('onPreAuth', (request, reply) => {

        const routeSettings = request.route.settings.plugins[pkgAttributes.pkg.name] || {};
        const requestSettings = Hoek.applyToDefaults(settings.global, routeSettings);
        request.plugins[pkgAttributes.pkg.name] = requestSettings;

        const ip = _getIP(request, requestSettings);

        _getLimit(ip + ':' + request.url.path, (err, limit) => {

            if (err) {
                request.log('error', err);
                return reply().code(500).takeover();
            }

            if (!limit) {
                return reply.continue();
            }

            if (limit.remaining > 0) {
                return reply.continue();
            }

            return reply(_generateErrorMessage(request, limit));

        });

    });
    server.ext('onPreResponse', (request, reply) => {

        const response = request.response.output || request.response;

        const limitOptions = request.plugins[pkgAttributes.pkg.name] || settings.global;
        const genericRateLimiter = limitOptions.genericRateLimiter;

        if (!genericRateLimiter && response.statusCode.toString().startsWith('2')) {
            return reply.continue();
        }

        const ip = _getIP(request, limitOptions);

        _updateLimit(ip + ':' + request.url.path, limitOptions, (err, limit) => {

            if (err) {
                request.log('error', err);
                return reply().code(500).takeover();
            }

            response.headers['X-RateLimit-Limit'] = limit.total;
            response.headers['X-RateLimit-Remaining'] = (limit.remaining >= 0) ? limit.remaining : 0;
            response.headers['X-RateLimit-Reset'] = limit.reset;

            return reply.continue();
        });
    });

    return next();
};

HapiAttemptsLimiter.attributes = pkgAttributes;

module.exports = HapiAttemptsLimiter;
