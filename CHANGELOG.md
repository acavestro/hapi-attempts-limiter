# Change Log
All notable changes to this project will be documented in this file.
This project adheres to [Semantic Versioning](http://semver.org/).

## 1.3 - 2017-04-11

## Added

- Added support for x-forwarded-for header

## 1.2 - 2016-10-03

### Added

- The plugin can be also used as a generic rate limiter

## 1.1.3 - 2016-08-26 [YANKED]

### Changed
- Resolved timeout problems with test code

### Fixed
- Status codes of type 2xx but different from 200 were treated as an error

## 1.1.2 - 2016-08-02

### Changed
- Improve documentation about exposed headers

## 1.1.1 - 2016-08-02 [YANKED]

### Changed
- Set Node version in Travis CI configuration

### Fixed

- Limit duration for routes that follow global settings

## 1.1.0 - 2016-08-02 [YANKED]

### Added
- CORS headers support
- TravisCI support

### Changed
- Logging improvements

## 1.0.1 - 2016-08-01

### Changed
- package.json settings

## 1.0.0 - 2016-08-01

### Added
- First implementation of the plugin
- Ability to save context to Redis db
- Test suite
