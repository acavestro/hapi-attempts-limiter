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
    const ttlNamespace = settings.namespace + ':ttl:';

    const _newLimit = function () {
        return {
            remaining: settings.global.limit - 1,
            total: settings.global.limit,
            duration: settings.global.duration
        };
    };

    const _getLimit = function (id, callback) {

        redisClient.multi()
            .ttl(ttlNamespace + id)
            .get(attemptsNamespace + id)
            .exec(function (err, reply) {

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

    const _setLimit = function (id, callback) {

        _getLimit(id, function (err, limit) {

            if (err) {
                return callback(err);
            }

            if (!limit) {
                const newLimit = _newLimit();

                redisClient.multi()
                    .set(attemptsNamespace + id, JSON.stringify(newLimit))
                    .expire(attemptsNamespace + id, newLimit.duration)
                    .set(ttlNamespace + id, attemptsNamespace + id)
                    .expire(ttlNamespace + id, newLimit.duration)
                    .exec();

                newLimit.reset = settings.global.duration;
                return callback(null, newLimit);
            }

            if (limit.remaining > 0) {
                limit.remaining -= 1;

                const reset = limit.reset;
                delete limit.reset;

                redisClient.multi()
                    .set(attemptsNamespace + id, JSON.stringify(limit))
                    .expire(attemptsNamespace + id, limit.duration)
                    .exec();

                limit.reset = reset;
                return callback(null, limit);
            }

            return callback(null, limit);
        });
    };

    server.ext('onRequest', function (request, reply) {

        _getLimit(request.info.remoteAddress + ':' + request.url.path, function (err, limit) {

            if (err) {
                console.error(err);
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
    server.ext('onPreResponse', function (request, reply) {

        const response = request.response.output || request.response ;

        if (response.statusCode === 200) {
            return reply.continue();
        }

        _setLimit(request.info.remoteAddress + ':' + request.url.path, function (err, limit) {

            if (err) {
                console.error(err);
                return reply().code(500).takeover();
            }

            response.headers['X-RateLimit-Limit'] = limit.total;
            response.headers['X-RateLimit-Remaining'] = limit.remaining;
            response.headers['X-RateLimit-Reset'] = limit.reset;

            return reply.continue();
        });
    });

    return next();
};

HapiAttemptsLimiter.attributes = pkgAttributes;

module.exports = HapiAttemptsLimiter;
