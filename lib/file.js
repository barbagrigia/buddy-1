'use strict';

var chalk = require('chalk')
	, clone = require('lodash/lang/clone')
	, cnsl = require('./utils/cnsl')
	, comment = require('./utils/comment')
	, compact = require('lodash/array/compact')
	, fileCache = require('./utils/fileCache')
	, filetype = require('./utils/filetype')
	, flatten = require('lodash/array/flatten')
	, fs = require('fs')
	, idResource = require('identify-resource')
	, merge = require('lodash/object/merge')
	, path = require('path')
	, series = require('async').series
	, truncate = require('./utils/truncate')

	, BOILERPLATE = fs.readFileSync(require.resolve('simple-browser-require'), 'utf8')
	, HEADER = 'generated by Buddy '
	  // Native Node modules to ignore
	, NATIVE_MODULES = [
			'assert',
			'buffer',
			'child_process',
			'cluster',
			'crypto',
			'dgram',
			'dns',
			'domain',
			'events',
			'fs',
			'http',
			'net',
			'os',
			'path',
			'punycode',
			'querystring',
			'readline',
			'repl',
			'stream',
			'string_decoder',
			'sys',
			'tls',
			'tty',
			'url',
			'util',
			'vm',
			'zlib'
		]
	  // Test to determine if file has already been generated by buddy/browserify/component
	, RE_BROWSERIFY_BUILT = /(?:\[function\(require,\s?module,\s?exports\))/
	, RE_BUDDY_BUILT = /\/\* generated by Buddy/

	, debug = cnsl.debug
	, hasMultipleVersions = idResource.hasMultipleVersions
	, helpers = {
			write: require('./helpers/write'),
			compile: require('transfigure').compile,
			compress: require('./helpers/compress'),
			concat: require('./helpers/concat'),
			inline: require('./helpers/inline'),
			lint: require('./helpers/lint'),
			escape: require('./helpers/escape'),
			parse: require('./helpers/parse'),
			replace: require('./helpers/replace'),
			wrap: require('./helpers/wrap')
		}
	, identify = idResource.identify
	, print = cnsl.print
	, resolve = idResource.resolve
	, strong = cnsl.strong
	, warn = cnsl.warn;

/**
 * File instance factory
 * @param {String} filepath
 * @param {String} type
 * @param {Object} options
 * @returns {File}
 */
var factory = module.exports = function (filepath, type, options) {
	var opts = clone(options)
		, file, id;

	// Retrieve by filename
	if (factory.cache.hasFile(filepath)) {
		file = factory.cache.getFile(filepath);
		file.type = type;
	} else if (id = identify(filepath, opts)) {
		// Retrieve by id
		if (factory.cache.hasFile(type + ':' + id)) {
			file = factory.cache.getFile(type + ':' + id);
		// Create new
		} else {
			file = new File(id, filepath, type, options);
			factory.cache.addFile(file);
			// Warn of multiple versions
			if (hasMultipleVersions(id)) {
				var name = path.basename(id).split(idResource.VERSION_DELIMITER)[0];
				warn('more than one version of '
					+ strong(name)
					+ ' exists ('
					+ strong(file.relpath)
					+ ')', 3);
			}
		}
	}

	return file;
};

/*
 * Default file cache
 */
module.exports.cache = fileCache();

/**
 * Constructor
 * @param {String} id
 * @param {String} filepath
 * @param {String} type
 * @param {Object} options
 */
function File (id, filepath, type, options) {
	this.options = options;
	this.type = type;
	this.id = id;
	this.filepath = filepath;
	this.relpath = truncate(path.relative(process.cwd(), filepath));
	this.extension = path.extname(this.filepath).slice(1);
	this.name = path.basename(this.filepath);
	this.content = '';
	this.fileContent = '';
	this.compiledContent = '';
	this.dependencies = [];
	this.dependencyReferences = [];
	this.workflow = null;
	this.isDependency = false;
	this.isLocked = false;
	this.isBuddyBuilt = false;
	this.isBrowserifyBuilt = false;

	debug('created File instance ' + strong(this.relpath), 3);
}

/**
 * Retrieve writeable state
 * @returns {Boolean}
 */
File.prototype.getIsWriteable = function () {
	return !this.isDependency;
};

/**
 * Retrieve flattened dependency tree
 * @param {Boolean} asReferences
 * @returns {Array}
 */
File.prototype.getAllDependencies = function (asReferences) {
	var self = this
		, deps = []
		, key = asReferences ? 'dependencyReferences' : 'dependencies';

	function add (dependency, dependant) {
		if ((dependency.instance || dependency) !== self && !~deps.indexOf(dependency)) {
			deps.push(dependency);
			// Add children
			(dependency.instance || dependency)[key].forEach(function (dep) {
				// Protect against circular references
				if ((dep.instance || dep) != dependant) add(dep, dependency);
			});
		}
	};

	this[key].forEach(add);

	return deps;
};

/**
 * Run 'workflows' tasks in sequence
 * @param {Array} workflow
 * @param {Function} fn(err, dependencies)
 */
File.prototype.run = function (workflow, fn) {
	var self = this
		, dependencies;

	if (workflow && this.workflow != workflow) {
		this.workflow = workflow;

		series(workflow.map(function (task) {
			return self[task].bind(self);
		}), function (err, dependencies) {
			// Return dependencies
			fn(err, flatten(compact(dependencies)));
		});
	} else {
		fn();
	}
};

/**
 * Read and store file contents
 * @param {Function} fn(err)
 */
File.prototype.load = function (fn) {
	if (!this.fileContent) {
		var content = fs.readFileSync(this.filepath, 'utf8');
		this.content = this.fileContent = content;
		// Determine if file has already been generated
		this.isBuddyBuilt = (this.type == 'js') && RE_BUDDY_BUILT.test(content);
		this.isBrowserifyBuilt = (this.type == 'js') && RE_BROWSERIFY_BUILT.test(content);
		debug('load: ' + strong(this.relpath), 4);
	} else {
		this.content = this.fileContent;
	}

	fn();
};

/**
 * Compile file contents
 * @param {Function} fn(err)
 */
File.prototype.compile = function (fn) {
	// Only compile if not already
	if (!this.compiledContent) {
		var options = {}
			, self = this
			, dataUrl;

		// Expose properties for compilers
		options.id = this.id;
		options.type = this.type;
		if (this.type == 'html') {
			// Gather all dependencies
			options.includes = this.getAllDependencies()
				.map(function (dependency) {
					var id = dependency.id
						, idx = id.indexOf('@');
					// Strip version
					if (idx != -1) id = id.slice(0, idx);
					return {
						id: id,
						content: dependency.content,
						filepath: dependency.filepath
					}
				});
			// Check/load data json file of same name in same directory
			if (fs.existsSync((dataUrl = path.resolve(path.dirname(this.filepath), this.name.replace(this.extension, 'json'))))) {
				options.data = require(dataUrl);
			}
		} else if (this.type == 'css') {
			// Gather all directories
			options.paths = factory.cache.getDirs();
		}

		helpers.compile(this.filepath, this.content, options, function (err, content) {
			if (err) return fn(err);
			debug('compile: ' + strong(self.relpath), 4);
			self.content = self.compiledContent = content;
			fn();
		});
	} else {
		this.content = this.compiledContent;
		fn();
	}
};

/**
 * Parse file contents for dependency references
 * @param {Function} fn(err, dependencies)
 */
File.prototype.parse = function (fn) {
	// Only parse unbuilt files
	if (!this.isBuddyBuilt || !this.isBrowserifyBuilt) {
		var self = this;

		helpers.parse(this.filepath, this.type, this.content, function (err, deps) {
			if (err) return fn(err);

			debug('parse: ' + strong(self.relpath), 4);

			if (deps) {
				deps.forEach(function (dep) {
					// Validate and add
					var filepath = resolve(self.filepath, dep.filepath, self.options)
						, instance;

					if (filepath) {
						var type = filetype(filepath, false, self.type, self.options.fileExtensions);

						if (instance = factory(filepath, type, self.options)) {
							// Save context for future inlining
							self.dependencyReferences.push(dep);
							// Store instance
							dep.instance = instance;
							// Process if not locked (parent target files are locked)
							if (!instance.isLocked) {
								// Store if not already stored
								if (!~self.dependencies.indexOf(instance)) {
									instance.isDependency = true;
									self.dependencies.push(instance);
								}
							}
						}
					}

					// Unable to resolve filepath
					if (!instance) {
						// Ignore native Node modules
						if (!(self.type == 'js' && ~NATIVE_MODULES.indexOf(dep.filepath))) {
							warn('dependency '
								+ strong(dep.filepath)
								+ ' for '
								+ strong(self.id)
								+ ' not found', 4);
						}
					}
				});
			}

			fn(null, self.dependencies);
		});
	}
};

/**
 * Inline dependency content
 * @param {Function} fn(err)
 */
File.prototype.inline = function (fn) {
	var deps = (this.type == 'html')
			? this.getAllDependencies(true)
			: this.dependencyReferences
		, self = this;

	helpers.inline(this.type, this.content, deps, function (err, content) {
		if (err) return fn(err);
		debug('inline: ' + strong(self.relpath), 4);
		self.content = content;
		fn();
	});
};

/**
 * Replace relative dependency references with fully resolved
 * @param {Function} fn(err)
 */
File.prototype.replaceReferences = function (fn) {
	this.content = helpers.replace.references(this.content, this.type, this.dependencyReferences);
	debug('replace dependency references: ' + strong(this.relpath), 4);
	fn();
};

/**
 * Replace process.env references with values
 * @param {Function} fn(err)
 */
File.prototype.replaceEnvironment = function (fn) {
	this.content = helpers.replace.environment(this.content, this.dependencyReferences);
	debug('replace environment vars: ' + strong(this.relpath), 4);
	fn();
};

/**
 * Lint file contents
 * @param {Function} fn(err, warnings)
 */
File.prototype.lint = function (fn) {
	var warnings;

	// Don't lint compiled files, 3rd party modules, or built files
	if (this.extension == this.type
		&& !~this.filepath.indexOf('node_modules')
		&& !this.isBuddyBuilt
		&& !this.isBrowserifyBuilt) {
			if (warnings = helpers.lint(this.type, this.content)) {
				warn('linting ' + strong(this.relpath), 3);
				warnings.forEach(function (item) {
					if (item) {
						print('[line '
							+ chalk.cyan(item.line)
							+ ':'
							+ chalk.cyan(item.col)
							+ '] '
							+ item.reason
							+ ':', 4);
						if (item.evidence) print(strong(item.evidence), 5);
					}
				});
			} else {
				debug('lint: ' + strong(this.relpath), 4);
			}
	}

	if (fn) return fn();
	// Smelly test hook
	return warnings;
};

/**
 * Escape file contents for lazy js modules
 * @param {Function} fn(err)
 */
File.prototype.escape = function (fn) {
	this.content = helpers.escape(this.content);
	debug('escape: ' + strong(this.relpath), 4);
	fn();
};

/**
 * Compress file contents
 * @param {Function} fn(err)
 */
File.prototype.compress = function (fn) {
	try {
		this.content = helpers.compress(this.type, this.content);
		debug('compressed: ' + strong(this.relpath), 4);
		fn();
	} catch (err) {
		fn(err);
	}
};

/**
 * Wrap JS file contents in a module definition
 * @param {Function} fn(err)
 */
File.prototype.wrap = function (fn) {
	// Allow wrapping of browserified bundles
	if (!this.isBuddyBuilt) {
		var lazy = this.options.runtimeOptions
			? this.options.runtimeOptions.lazy
			: false;

		this.content = helpers.wrap(this.id, this.content, lazy);
		debug('wrap: ' + strong(this.relpath), 4);
	}
	fn();
};

/**
 * Concatenate file contents
 * @param {Function} fn(err)
 */
File.prototype.concat = function (fn) {
	this.content = helpers.concat(this.type, this.content, this.getAllDependencies().reverse());
	debug('concat: ' + strong(this.relpath), 4);
	fn();
};

/**
 * Write file contents to disk
 * @param {String} filepath
 * @param {Object} options
 * @returns {String}
 */
File.prototype.write = function (filepath, options) {
	var self = this;

	options = options || {};

	// Add require boilerplate
	if (options.boilerplate) {
		this.content = BOILERPLATE
			+ '\n'
			+ this.content;
	}

	// Add header
	if (this.type != 'html') {
		this.content = comment(HEADER + (this.options.runtimeOptions.version || ''), this.type)
			+ '\n\n'
			+ this.content;
	}

	// Add bootstrap call
	if (options.bootstrap) {
		this.content += '\nrequire(\'' + this.id + '\');'
	}

	// Write
	helpers.write(filepath, this.content);
	print(chalk.green('built'
		+ (self.options.runtimeOptions.compress ? ' and compressed ' : ' '))
		+ strong(truncate(path.relative(process.cwd(), filepath))), 3);

	return filepath;
};

/**
 * Reset content
 * @param {Boolean} hard
 */
File.prototype.reset = function (hard) {
	this.workflow = null;
	this.isLocked = false;
	this.isDependency = false;
	this.dependencies = [];
	this.dependencyReferences = [];
	if (this.type != 'js') {
		this.content = this.fileContent;
		this.compiledContent = '';
	} else {
		this.content = this.compiledContent || this.fileContent;
	}
	if (hard) {
		this.content = this.fileContent = this.compiledContent = '';
		// Following are set on load
		this.isBuddyBuilt = false;
		this.isBrowserifyBuilt = false;
	}
	this.type = '';
	debug('reset' + (hard ? ' (hard)' : '') + ': ' + strong(this.relpath), 4);
};

/**
 * Destroy instance
 */
File.prototype.destroy = function () {
	this.reset(true);
	this.options = null;
};