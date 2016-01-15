'use strict';

const babel = require('babel-core')

  , BOILERPLATE = 'var global = window.global = window;\n\n'
  , DEFAULT_HELPERS = [
      'classCallCheck',
      'createClass',
      'defineProperty',
      'get',
      'inherits',
      'possibleConstructorReturn',
      'taggedTemplateLiteral',
      'typeof'
    ]
  , HELPERS = babel.buildExternalHelpers(DEFAULT_HELPERS)
  , SETTINGS = {
      plugins: [
        require('babel-plugin-external-helpers-2'),
        require('babel-plugin-transform-es3-property-literals'),
        require('babel-plugin-transform-es3-member-expression-literals')
      ],
      presets: [
        require('babel-preset-es2015'),
        require('babel-preset-react')
      ]
    };

/**
 * Retrieve registration data
 */
exports.registration = {
  name: 'babel',
  extensions: {
    js: [
      'js',
      'jsx'
    ]
  }
};

/**
 * Compile 'content'
 * @param {String} content
 * @param {Object} options
 * @param {Function} fn(err, content)
 * @returns {null}
 */
exports.compile = function (content, options, fn) {
  // Skip node_modules files
  if (~options.filepath.indexOf('node_modules')) return fn(null, content);

  try {
    const transform = babel.transform(content, Object.assign({}, SETTINGS));

    // Store helper boilerplate
    if (~transform.code.indexOf('babelHelpers')) {
      options.cache.setSource('js-helpers', BOILERPLATE + HELPERS);
    }

    fn(null, transform.code);
  } catch (err) {
    err.filepath = options.filepath;
    fn(err);
  }
};