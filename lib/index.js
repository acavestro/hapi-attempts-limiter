'use strict';

const Assert = require('assert');
const Hoek = require('hoek');

const pkgAttributes = {
    pkg: require('../package.json')
};

const defaults = {
    namespace: pkgAttributes.pkg.name + '-v' + pkgAttributes.pkg.version,
    global: {
        limit: 5,
        duration: 60 // seconds
    }
};

const HapiAttemptsLimiter = function (server, options, next) {

    const settings = Hoek.applyToDefaults(defaults, options);

    Assert(typeof options.redisClient === 'object' && options.redisClient.constructor.name === 'RedisClient', pkgAttributes.pkg.name + ' needs a redis instance!');

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

    server.ext('onPreAuth', (request, reply) => {

        _getLimit(request.info.remoteAddress + ':' + request.url.path, (err, limit) => {

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

            return reply('Rate limit exceeded, retry in ' + limit.reset + ' seconds').code(429).takeover();

        });

    });
    server.ext('onPreResponse', (request, reply) => {

        const response = request.response.output || request.response;

        if (response.statusCode === 200) {
            return reply.continue();
        }

        let limitOptions = defaults.global;
        if (request.route.settings.plugins[pkgAttributes.pkg.name]) {
            limitOptions = Hoek.applyToDefaults(limitOptions, request.route.settings.plugins[pkgAttributes.pkg.name]);
        }

        _updateLimit(request.info.remoteAddress + ':' + request.url.path, limitOptions, (err, limit) => {

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
