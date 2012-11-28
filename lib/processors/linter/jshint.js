// Generated by CoffeeScript 1.4.0
var jshint;

jshint = require('jshint').JSHINT;

module.exports = {
  name: 'jshint',
  category: 'js',
  type: 'linter',
  options: {
    curly: true,
    eqeqeq: true,
    immed: true,
    latedef: true,
    newcap: true,
    noarg: true,
    undef: true,
    eqnull: true,
    es5: true,
    esnext: true,
    bitwise: true,
    strict: false,
    trailing: true,
    smarttabs: true,
    node: true
  },
  lint: function(data, fn) {
    var items, result;
    result = jshint(data, this.options, {});
    if (!result) {
      items = jshint.errors.map(function(error) {
        return {
          line: error.line,
          col: error.character,
          reason: error.reason
        };
      });
      return fn({
        items: items
      });
    }
  }
};