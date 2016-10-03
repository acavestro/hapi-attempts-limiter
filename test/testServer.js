'use strict';

const Hapi = require('hapi');

const createServer = function (redisInstance) {

    const server = new Hapi.Server();
    server.connection();

    server.route([
        {
            method: 'POST',
            path: '/test',
            handler: function (request, reply) {

                if (request.payload && request.payload.good) {
                    return reply().code(200);
                }

                return reply().code(403);
            }
        },
        {
            method: 'POST',
            path: '/ratelimited',
            handler: function (request, reply) {

                return reply().code(200);
            },
            config: {
                plugins: {
                    'hapi-attempts-limiter': {
                        genericRateLimiter: true
                    }
                }
            }
        }
    ]);

    server.register({
        register: require('../index'),
        options: {
            redisClient: redisInstance,
            global: {
                duration: 1
            }
        }
    });

    return server;
};



module.exports = createServer;
