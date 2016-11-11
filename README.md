# hapi-attempts-limiter

![TravisCI build status](https://travis-ci.org/acavestro/hapi-attempts-limiter.svg?branch=master)

An hapi.js plugin that limits the number of failed attempts, based on IP and called route,
using Redis to store attempts count. Useful for preventing brute force attacks.

## Installation

```
npm install --save hapi-attempts-limiter
```

## Usage

You need to register the plugin in you hapi server instance, providing some configuration attributes:

* **redisClient**: an instance of Redis
* **namespace**: a prefix for the items saved to Redis by the plugin (optional)
* **errorMessage**: a function that can be used to generate a custom error message (optional). Read the dedicated chapter for details.
* **global.limit**: the number of maximum failed attempts in the current time window (default: 5)
* **global.duration**: the length of the time window in **seconds** (default: 60 seconds)
* **global.genericRateLimiter**: a flag to transform the plugin in a generic rate limiter (default: false)
* **global.trustProxy**: a flag to use the *latest* IP address of x-forwarded-for header (AWS ELB format), if present (default: false)

```javascript
server.register({
  register: require('hapi-attempts-limiter'),
  options: {
    namespace: 'FOO',
    redisClient: yourRedisInstance
    global: {
      limit: 5,
      duration: 60
    }
  }
});
```

Starting from the first failed attempt, the plugin will exposed three headers:
- **X-RateLimit-Limit**: the number of maximum failed attempts in the current time window
- **X-RateLimit-Remaining**: the number of remaining failed attempts in the current time window
- **X-RateLimit-Reset**: the seconds until the expiration of the current time window

### CORS

If you are working with cross-domain requests using [CORS](http://www.w3.org/TR/cors/) protocol and you want to access
X-RateLimit-* headers from your client, you have to expose them by adjusting the route configuration (or the global one):

```javascript
cors: {
    origin: ['*'],
    additionalExposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset']
}
```

### Route custom settings

Additionally, you can define for every route a custom limit and a custom duration. You just need to add some parameters
to your route configuration object:

```javascript
{
  method: 'POST',
  path: '/login',
  handler: loginUser,
  config: {
    description: 'User login route',
    plugins: {
      'hapi-attempts-limiter': {
          limit: 3, // a custom limit
          duration: 120 // a custom duration, in seconds
      }
    }
  }
}
//
{
  method: 'POST',
  path: '/heavy',
  handler: heavyRouteHandler,
  config: {
    description: 'Route to be called in moderation',
    plugins: {
      'hapi-attempts-limiter': {
          genericRateLimiter: true
      }
    }
  }
}
```

### Custom error message

You can specify a custom error message by defining the function `errorMessage` in the plugin settings.

```javascript
server.register({
  register: require('hapi-attempts-limiter'),
  options: {
    namespace: 'FOO',
    redisClient: yourRedisInstance,
    errorMessage: function (limit) {
      /*
       * Limit is an object that contains the following properties:
       * limit.remaining: the number of remaining attempts (0, in case of error)
       * limit.total: the number of available attempts
       * limit.duration: the length of the time window
       * limit.reset: the remaining time to the time window expiration
       *
       * You can return a Boom instance, an Error instance or a string that will be converted to a Boom 429 error.
      */
      return Boom.tooManyRequests('Rate limit exceeded, retry in ' + limit.reset + ' seconds');
    }
    global: {
      limit: 5,
      duration: 60
    }
  }
});
```

Happy coding!
