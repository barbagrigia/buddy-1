'use strict';

const buildFactory = require('./lib/build');
const chalk = require('chalk');
const cnsl = require('./lib/utils/cnsl');
const compact = require('lodash/compact');
const config = require('./lib/config');
const fileCache = require('./lib/utils/fileCache');
const fileFactory = require('./lib/file');
const flatten = require('lodash/flatten');
const path = require('path');
const series = require('async').series;
const spawn = require('child_process').spawn;

const bell = cnsl.BELL;
const debug = cnsl.debug;
const error = cnsl.error;
const print = cnsl.print;
const strong = cnsl.strong;
let serverfarm = null;

/**
 * Buddy instance factory
 * @returns {Buddy}
 */
module.exports = function builderFactory () {
  return new Buddy();
};

class Buddy {
  /**
   * Constructor
   */
  constructor () {
    this.initialized = false;
    this.building = false;
    this.builds = [];
    this.config = null;
  }

  /**
   * Build sources based on build targets specified in config
   * @param {String|Object} configpath [file name | JSON Object]
   * @param {Object} options
   * @param {Function} fn
   */
  build (configpath, options, fn) {
    cnsl.start('build');
    this.init(configpath, options);

    // Build targets
    this.run(this.builds, (err, filepaths) => {
      if (err) return fn ? fn(err) : error(err, 2);
      print('completed build in ' + chalk.cyan((cnsl.stop('build') / 1000) + 's'), 1);
      // Run script
      this.executeScript();
      if (fn) fn(null, filepaths);
    });
  }

  /**
   * Build sources and watch for changes
   * @param {String|Object} configpath (file name|JSON Object)
   * @param {Object} options
   * @param {Function} fn
   */
  watch (configpath, options, fn) {
    // Build first
    this.build(configpath, options, (err, filepaths) => {
      if (err) return fn ? fn(err) : error(err, 2);

      if (this.config.runtimeOptions.reload || this.config.runtimeOptions.serve) {
        // Protect against uninstalled add-on
        try {
          serverfarm = require('./utils/serverfarm');
        } catch (tryError) {
          return error('buddy-server add-on missing. Install \'buddy-server\' with npm', 2, true);
        }
        // Start servers
        serverfarm.start(this.config.runtimeOptions.serve, this.config.runtimeOptions.reload, this.config.server, (serverError) => {
          if (serverError) { /* Ignore and keep watching */ }
        });
      } else {
        print('watching files for changes:', 1);
      }
    });
  }

  /**
   * Build and compress sources based on targets specified in configuration
   * @param {String|Object} configpath [file name | JSON Object]
   * @param {Object} options
   * @returns {Promise}
   */
  deploy (configpath, options) {
    options.compress = true;
    return this.build(configpath, options);
  }

  /**
   * Cleanup after unhandled exception
   */
  exceptionalCleanup () {
    if (serverfarm) serverfarm.stop();
  }

  /**
   * Reset
   */
  destroy () {
    this.exceptionalCleanup();
    fileFactory.cache.flush();

    this.initialized = false;
    this.config = null;
    this.builds = [];
  }

  /**
   * Initialize based on configuration located at 'configpath'
   * The directory tree will be walked if no 'configpath' specified
   * @param {String|Object} configpath [file name | JSON Object]
   * @param {Object} options
   * @returns {Boolean}
   */
  init (configpath, options) {
    options = options || {};

    // Set console behaviour
    cnsl.verbose = options.verbose;

    if (!this.initialized) {
      // Load configuration
      this.config = config.load(configpath, options);

      // Create cache
      fileFactory.cache = fileCache(this.config.runtimeOptions.watch);

      // Setup watch
      if (this.config.runtimeOptions.watch) {
        fileFactory.cache.on('change', this.onFileCacheChange.bind(this));
        // TODO: add error listener
      }

      // Initialize targets
      this.builds = this.initBuilds(this.config);

      this.initialized = true;

      return this.initialized;
    }
  }

  /**
   * Recursively initialize all valid build instances specified in configuration
   * @param {Options} config
   * @returns {Array}
   */
  initBuilds (config) {
    function init (builds) {
      return builds.map((build) => {
        const instance = buildFactory(build);

        // Traverse
        if (instance.hasChildren) instance.build = init(instance.build);
        return instance;
      });
    }

    return init(config.build);
  }

  /**
   * Run all build targets
   * @param {Array} builds
   * @param {Function} fn(err, filepaths)
   */
  run (builds, fn) {
    let filepaths = [];

    this.building = true;

    // Execute builds in sequence
    series(builds.map((build) => {
      return build.run.bind(build);
    }), (err, results) => {
      if (err) return fn(err);
      // Persist file references created on build
      filepaths = filepaths.concat(compact(flatten(results)));
      this.building = false;
      fn(null, filepaths);
    });
  }

  /**
   * Run the script defined in config 'script'
   */
  executeScript () {
    let hasErrored = false;
    let args, command, script;

    if (this.config.runtimeOptions.script && (script = this.config.script)) {
      script = script.split(' ');
      command = script.shift();
      args = script;

      print('executing script...', 1);
      debug('execute: ' + strong(this.config.script), 3);

      script = spawn(command, args, { cwd: process.cwd() });

      script.stdout.on('data', (data) => {
        process.stdout.write(data.toString());
      });

      script.stderr.on('data', (data) => {
        process.stderr.write(data.toString());
        hasErrored = true;
      });

      script.on('close', (code) => {
        if (hasErrored) process.stderr.write(bell);
      });
    }
  }

  /**
   * Handle cache changes
   * @param {File} file
   */
  onFileCacheChange (file) {
    const now = new Date();
    const builds = this.builds.filter((build) => {
      return build.hasFile(file);
    });
    // Determine if any changes to app server code that needs a restart
    const servers = builds.filter((build) => {
      return build.isAppServer;
    });

    if (!this.building) {
      print('['
        + now.toLocaleTimeString()
        + '] '
        + chalk.yellow('changed')
        + ' '
        + strong(path.relative(process.cwd(), file.filepath)), 1);

      cnsl.start('watch');

      this.run(builds, (err, filepaths) => {
        // Don't throw
        if (err) {
          error(err, 2, false);
        } else {
          if (serverfarm) {
            // Trigger partial refresh if only 1 css file, full reload if not
            const filepath = (filepaths.length == 1 && path.extname(filepaths[0]) == '.css')
              ? filepaths[0]
              : 'foo.js';

            // Restart app server
            if (servers.length) {
              serverfarm.restart((err) => {
                if (err) { /* ignore */ }
                // Refresh browser
                serverfarm.refresh(path.basename(filepath));
              });
            } else {
              // Refresh browser
              serverfarm.refresh(path.basename(filepath));
            }
          }
          print('completed build in ' + chalk.cyan((cnsl.stop('watch') / 1000) + 's'), 1);
          // Run test script
          this.executeScript();
        }
      });
    }
  }
}