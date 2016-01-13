'use strict';

const Builder = require('../lib/builder')
  , exec = require('child_process').exec
  , expect = require('expect.js')
  , fs = require('fs')
  , path = require('path')
  , rimraf = require('rimraf');

let builder;

describe('Builder', () => {
  before(() => {
    process.chdir(path.resolve(__dirname, 'fixtures/builder'));
  });
  beforeEach(() => {
    builder = new Builder();
  });
  afterEach(() => {
    builder = null;
    rimraf.sync(path.resolve('output'));
  });

  describe('init', () => {
    before(() => {
      process.chdir(path.resolve(__dirname, 'fixtures/builder/init'));
    });

    it('should initialize a single target', () => {
      const targets = builder.initTargets([{
        inputpath: path.resolve('target/foo.js'),
        input: 'target/foo.js',
        output: 'main.js'
      }], { runtimeOptions: {}});

      expect(targets).to.have.length(1);
    });
    it('should initialize a single target with nested child target', () => {
      const targets = builder.initTargets([{
        inputpath: path.resolve('target/foo.js'),
        input: 'target/foo.js',
        output: 'main.js',
        hasChildren: true,
        targets: [{
          inputpath: path.resolve('target/lib'),
          input: 'target/lib',
          output: '../js'
        }]
      }], { runtimeOptions: {}});

      expect(targets).to.have.length(1);
      expect(targets[0].targets).to.have.length(1);
    });
  });

  describe('build', () => {
    before(() => {
      process.chdir(path.resolve(__dirname, 'fixtures/builder/build'));
    });

    it('should build a js file when passed a json config path', (done) => {
      builder.build('buddy-single-file.json', null, (err, filepaths) => {
        expect(fs.existsSync(filepaths[0])).to.be(true);
        expect(fs.readFileSync(filepaths[0], 'utf8')).to.contain("require.register(\'foo.js\', function(require, module, exports) {\n    var foo = this;\n});")
        done();
      });
    });
    it('should build a js file when passed a js config path', (done) => {
      builder.build('buddy-single-file.js', null, (err, filepaths) => {
        expect(fs.existsSync(filepaths[0])).to.be(true);
        expect(fs.readFileSync(filepaths[0], 'utf8')).to.contain("require.register(\'foo.js\', function(require, module, exports) {\n    var foo = this;\n});")
        done();
      });
    });
    it('should build a js file when passed a json config object', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: 'foo.js',
              output: 'output'
            }
          ]
        }
      }, null, (err, filepaths) => {
        expect(fs.existsSync(filepaths[0])).to.be(true);
        expect(fs.readFileSync(filepaths[0], 'utf8')).to.contain("require.register(\'foo.js\', function(require, module, exports) {\n    var foo = this;\n});")
        done();
      });
    });
    it('should build a js file with 1 dependency', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: 'bar.js',
              output: 'output'
            }
          ]
        }
      }, null, (err, filepaths) => {
        expect(fs.existsSync(filepaths[0])).to.be(true);
        expect(fs.readFileSync(filepaths[0], 'utf8')).to.contain("require.register(\'foo.js\', function(require, module, exports) {\n    var foo = this;\n});\nrequire.register(\'bar.js\', function(require, module, exports) {\n    var foo = require(\'foo.js\')\n    \t, bar = this;\n});")
        done();
      });
    });
    it('should build a js file with node_modules dependencies', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: 'bat.js',
              output: 'output'
            }
          ]
        }
      }, null, (err, filepaths) => {
        expect(filepaths).to.have.length(1);
        expect(fs.existsSync(filepaths[0])).to.be(true);
        const content = fs.readFileSync(filepaths[0], 'utf8');

        expect(content).to.contain("require.register('bar/bar.js#0.0.0'");
        expect(content).to.contain("require.register('foo/foo.js#0.0.0'");
        expect(content).to.contain("require.register('bat.js'");
        done();
      });
    });
    it('should build a js file with relative node_modules dependencies', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: 'boo.js',
              output: 'output'
            }
          ]
        }
      }, null, (err, filepaths) => {
        expect(filepaths).to.have.length(1);
        expect(fs.existsSync(filepaths[0])).to.be(true);
        const content = fs.readFileSync(filepaths[0], 'utf8');

        expect(content).to.contain("require.register('bar/dist/commonjs/lib/bar.js#0.0.0'");
        expect(content).to.contain("var bar = require('bar/dist/commonjs/lib/bar.js#0.0.0')");
        done();
      });
    });
    it('should build a js file with node_modules dependencies with missing "main" reference', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: 'zong.js',
              output: 'output'
            }
          ]
        }
      }, null, (err, filepaths) => {
        expect(filepaths).to.have.length(1);
        expect(fs.existsSync(filepaths[0])).to.be(true);
        const content = fs.readFileSync(filepaths[0], 'utf8');

        expect(content).to.contain("require.register('foo.js/index.js#1.0.0'");
        done();
      });
    });
    it('should build a js file with json dependency', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: 'bing.js',
              output: 'output'
            }
          ]
        }
      }, null, (err, filepaths) => {
        expect(filepaths).to.have.length(1);
        expect(fs.existsSync(filepaths[0])).to.be(true);
        const content = fs.readFileSync(filepaths[0], 'utf8');

        expect(content).to.contain("require.register('bing.js'");
        expect(content).to.contain("var json = {\n  \"content\": \"foo\"\n};");
        done();
      });
    });
    it('should build a js file with json node_modules dependency', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: 'zing.js',
              output: 'output'
            }
          ]
        }
      }, null, (err, filepaths) => {
        expect(filepaths).to.have.length(1);
        expect(fs.existsSync(filepaths[0])).to.be(true);
        const content = fs.readFileSync(filepaths[0], 'utf8');

        expect(content).to.contain("require.register('zing.js'");
        expect(content).to.contain("var json = {\n  \"boo\": \"boo\"\n};");
        done();
      });
    });
    it('should build a js file with disabled dependency', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: 'bong.js',
              output: 'output'
            }
          ]
        }
      }, null, (err, filepaths) => {
        expect(filepaths).to.have.length(1);
        expect(fs.existsSync(filepaths[0])).to.be(true);
        const content = fs.readFileSync(filepaths[0], 'utf8');

        expect(content).to.contain("require.register('bong.js'");
        expect(content).to.contain("var bat = {};");
        done();
      });
    });
    it('should build a js file with disabled native dependency', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: 'native.js',
              output: 'output'
            }
          ]
        }
      }, null, (err, filepaths) => {
        expect(filepaths).to.have.length(1);
        expect(fs.existsSync(filepaths[0])).to.be(true);
        const content = fs.readFileSync(filepaths[0], 'utf8');

        expect(content).to.contain("require.register('native.js'");
        expect(content).to.contain("var http = {};");
        done();
      });
    });
    it('should build a prewrapped js file', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: 'wrapped.js',
              output: 'output'
            }
          ]
        }
      }, null, (err, filepaths) => {
        expect(fs.existsSync(filepaths[0])).to.be(true);
        expect(fs.readFileSync(filepaths[0], 'utf8')).to.contain("register.require(\'wrapped.js\', function (require, module, exports) {\n\tmodule.exports = \'wrapped\';\n});");
        done();
      });
    });
    it.skip('should build an es6 file', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: 'foo.es6',
              output: 'output'
            }
          ]
        }
      }, null, (err, filepaths) => {
        expect(fs.existsSync(filepaths[0])).to.be(true);
        const content = fs.readFileSync(filepaths[0], 'utf8');

        expect(content).to.contain("nums.map((n) {");
        expect(content).to.contain("return { x: x, y: y };");
        done();
      });
    });
    it.skip('should build an es6 file with global helpers', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: 'bar.es6',
              output: 'output'
            }
          ]
        }
      }, null, (err, filepaths) => {
        expect(fs.existsSync(filepaths[0])).to.be(true);
        const content = fs.readFileSync(filepaths[0], 'utf8');

        expect(content).to.contain("var global = window.global = window;");
        done();
      });
    });
    it('should build a handlebars html file', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: 'foo.handlebars',
              output: 'output'
            }
          ]
        }
      }, null, (err, filepaths) => {
        expect(fs.existsSync(filepaths[0])).to.be(true);
        const content = fs.readFileSync(filepaths[0], 'utf8');

        expect(content).to.equal('<div class="entry">\n  <h1></h1>\n  <div class="body">\n    \n  </div>\n</div>');
        done();
      });
    });
    it('should build a dust html file with sidecar data file and includes', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: 'foo.dust',
              output: 'output'
            }
          ]
        }
      }, null, (err, filepaths) => {
        expect(filepaths).to.have.length(1);
        expect(fs.existsSync(filepaths[0])).to.be(true);
        const content = fs.readFileSync(filepaths[0], 'utf8');

        expect(content).to.equal('<!DOCTYPE html>\n<html>\n<head>\n\t<title>Title</title>\n</head>\n<body>\n\t<h1>Title</h1>\n\t<footer>\n\t<p>Footer</p>\n\t<div>foo</div>\n</footer>\n</body>\n</html>');
        done();
      });
    });
    it('should build a stylus file', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: 'foo.styl',
              output: 'output'
            }
          ]
        }
      }, null, (err, filepaths) => {
        expect(fs.existsSync(filepaths[0])).to.be(true);
        const content = fs.readFileSync(filepaths[0], 'utf8');

        expect(content).to.contain('body {\n  color: #fff;\n  font-size: 12px;\n}\nbody p {\n  font-size: 10px;\n}\n');
        done();
      });
    });
    it('should build a less file', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: 'foo.less',
              output: 'output'
            }
          ]
        }
      }, null, (err, filepaths) => {
        expect(fs.existsSync(filepaths[0])).to.be(true);
        const content = fs.readFileSync(filepaths[0], 'utf8');

        expect(content).to.contain('header {\n  color: #333333;\n  border-left: 1px;\n  border-right: 2px;\n}\n#footer {\n  color: #114411;\n  border-color: #7d2717;\n}\n');
        done();
      });
    });
    it('should build a js file with unique hashed name', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: 'foo.js',
              output: 'output/foo-%hash%.js'
            }
          ]
        }
      }, null, (err, filepaths) => {
        expect(fs.existsSync(filepaths[0])).to.be(true);
        expect(path.basename(filepaths[0])).to.eql('foo-0f1d8c291e764ab11cf16a0123a62c9d.js');
        done();
      });
    });
    it('should build an html template file with js dependency', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: 'foo.nunjs',
              output: 'output'
            }
          ]
        }
      }, null, (err, filepaths) => {
        expect(filepaths).to.have.length(1);
        expect(fs.existsSync(filepaths[0])).to.be(true);
        const content = fs.readFileSync(filepaths[0], 'utf8');

        expect(content).to.contain("<script>var foo = this;</script>");
        done();
      });
    });
    it('should build an html template file with inline svg dependency', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: 'bar.nunjs',
              output: 'output'
            }
          ]
        }
      }, null, (err, filepaths) => {
        expect(filepaths).to.have.length(1);
        expect(fs.existsSync(filepaths[0])).to.be(true);
        const content = fs.readFileSync(filepaths[0], 'utf8');

        expect(content).to.contain('<svg x="0px" y="0px" viewBox="0 0 100 100" version="1.1" id="Layer_1" enable-background="new 0 0 100 100" xml:space="preserve">\n<circle cx="50" cy="50" r="25"/>\n</svg>');
        done();
      });
    });
    it('should build a directory of 3 js files', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: 'js-directory/flat',
              output: 'output'
            }
          ]
        }
      }, null, (err, filepaths) => {
        expect(filepaths).to.have.length(3);
        filepaths.forEach((filepath) => {
          expect(fs.existsSync(filepath)).to.be(true);
          expect(fs.readFileSync(filepath, 'utf8')).to.contain('require.register(');
          expect(fs.readFileSync(filepath, 'utf8')).to.contain('generated by Buddy');
        });
        done();
      });
    });
    it('should build a directory of 3 unwrapped js files if "modular" is false', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: 'js-directory/flat',
              output: 'output',
              "modular": false
            }
          ]
        }
      }, null, (err, filepaths) => {
        expect(filepaths).to.have.length(3);
        filepaths.forEach((filepath) => {
          expect(fs.existsSync(filepath)).to.be(true);
          expect(fs.readFileSync(filepath, 'utf8')).to.not.contain('require.register(');
        });
        done();
      });
    });
    it('should build a directory of unwrapped js files if "modular" is false, including dependencies', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: 'js-directory/dependant',
              output: 'output',
              "modular": false
            }
          ]
        }
      }, null, (err, filepaths) => {
        expect(filepaths).to.have.length(3);
        filepaths.forEach((filepath) => {
          expect(fs.existsSync(filepath)).to.be(true);
          expect(fs.readFileSync(filepath, 'utf8')).to.not.contain('require.register(');
          expect(fs.readFileSync(filepath, 'utf8')).to.not.contain('generated by Buddy');
        });
        done();
      });
    });
    it('should build a directory of 3 js files, including nested directories', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: 'js-directory/nested',
              output: 'output'
            }
          ]
        }
      }, null, (err, filepaths) => {
        expect(filepaths).to.have.length(3);
        filepaths.forEach((filepath) => {
          expect(fs.existsSync(filepath)).to.be(true);
          expect(fs.readFileSync(filepath, 'utf8')).to.contain('require.register(');
        });
        done();
      });
    });
    it('should build a directory of 2 js files, including dependencies in nested directories', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: 'js-directory/dependant',
              output: 'output'
            }
          ]
        }
      }, null, (err, filepaths) => {
        expect(filepaths).to.have.length(2);
        filepaths.forEach((filepath) => {
          expect(fs.existsSync(filepath)).to.be(true);
          expect(fs.readFileSync(filepath, 'utf8')).to.contain('require.register(');
        });
        done();
      });
    });
    it('should build a directory of 2 css files', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: 'css-directory',
              output: 'output'
            }
          ]
        }
      }, null, (err, filepaths) => {
        expect(filepaths).to.have.length(2);
        filepaths.forEach((filepath) => {
          expect(fs.existsSync(filepath)).to.be(true);
        });
        done();
      });
    });
    it('should build multiple css files with shared dependencies', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: ['one.styl', 'two.styl'],
              output: 'output'
            }
          ]
        }
      }, null, (err, filepaths) => {
        expect(filepaths).to.have.length(2);
        expect(fs.existsSync(filepaths[0])).to.be(true);
        const content1 = fs.readFileSync(filepaths[0], 'utf8')
          , content2 = fs.readFileSync(filepaths[1], 'utf8');

        expect(content1).to.eql(content2);
        expect(content1).to.contain("colour: '#ffffff';");
        expect(content2).to.contain("colour: '#ffffff';");
        done();
      });
    });
    it('should build a directory with mixed content, including dependencies', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: 'mixed-directory',
              output: 'output'
            }
          ]
        }
      }, null, (err, filepaths) => {
        expect(filepaths).to.have.length(2);
        filepaths.forEach((filepath) => {
          expect(fs.existsSync(filepath)).to.be(true);
          const ext = path.extname(filepath)
            , content = fs.readFileSync(filepath, 'utf8');

          if (ext == '.js') {
            expect(content).to.contain("require.register('mixed-directory/bar.js'");
            expect(content).to.contain("require.register('mixed-directory/foo.js'");
          } else {
            expect(content).to.contain("body {");
            expect(content).to.contain("h1 {");
          }
        });
        done();
      });
    });
    it('should build a globbed collection of js files', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: 'js-directory/flat/{foo,bar}.js',
              output: 'output'
            }
          ]
        }
      }, null, (err, filepaths) => {
        expect(filepaths).to.have.length(2);
        filepaths.forEach((filepath) => {
          expect(fs.existsSync(filepath)).to.be(true);
          expect(fs.readFileSync(filepath, 'utf8')).to.contain('require.register(');
        });
        done();
      });
    });
    it('should build a globbed collection of mixed files', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: 'mixed-directory/foo.{js,styl}',
              output: 'output'
            }
          ]
        }
      }, null, (err, filepaths) => {
        expect(filepaths).to.have.length(2);
        filepaths.forEach((filepath) => {
          expect(fs.existsSync(filepath)).to.be(true);
          const ext = path.extname(filepath)
            , content = fs.readFileSync(filepath, 'utf8');

          if (ext == '.js') {
            expect(content).to.contain("require.register('mixed-directory/bar.js'");
            expect(content).to.contain("require.register('mixed-directory/foo.js'");
          } else {
            expect(content).to.contain("body {");
            expect(content).to.contain("h1 {");
          }
        });
        done();
      });
    });
    it('should build an array of js files', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: ['js-directory/flat/foo.js', 'js-directory/nested/bar.js'],
              output: 'output'
            }
          ]
        }
      }, null, (err, filepaths) => {
        expect(filepaths).to.have.length(2);
        filepaths.forEach((filepath) => {
          expect(fs.existsSync(filepath)).to.be(true);
          expect(fs.readFileSync(filepath, 'utf8')).to.contain('require.register(');
        });
        done();
      });
    });
    it('should build an array of mixed files', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: ['mixed-directory/foo.js', 'mixed-directory/foo.styl'],
              output: 'output'
            }
          ]
        }
      }, null, (err, filepaths) => {
        expect(filepaths).to.have.length(2);
        filepaths.forEach((filepath) => {
          expect(fs.existsSync(filepath)).to.be(true);
          const ext = path.extname(filepath)
            , content = fs.readFileSync(filepath, 'utf8');

          if (ext == '.js') {
            expect(content).to.contain("require.register('mixed-directory/bar.js'");
            expect(content).to.contain("require.register('mixed-directory/foo.js'");
          } else {
            expect(content).to.contain("body {");
            expect(content).to.contain("h1 {");
          }
        });
        done();
      });
    });
    it('should build a stringified js file if "lazy" is true', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: 'foo.js',
              output: 'output'
            }
          ]
        }
      }, { lazy: true }, (err, filepaths) => {
        expect(filepaths).to.have.length(1);
        expect(fs.existsSync(filepaths[0])).to.be(true);
        const content = fs.readFileSync(filepaths[0], 'utf8');

        expect(content).to.contain('require.register(\'foo.js\', "var foo = this;");');
        done();
      });
    });
    it('should build a minified js file if "compress" is true', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: 'bar.js',
              output: 'output'
            }
          ]
        }
      }, { compress: true }, (err, filepaths) => {
        expect(filepaths).to.have.length(1);
        expect(fs.existsSync(filepaths[0])).to.be(true);
        const content = fs.readFileSync(filepaths[0], 'utf8');

        expect(content).to.contain('require.register("foo.js",function(r,e,i){}),require.register("bar.js",function(r,e,i){r("foo.js")});');
        done();
      });
    });
    it('should build a minified css file if "compress" is true', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: 'foo.css',
              output: 'output'
            }
          ]
        }
      }, { compress: true }, (err, filepaths) => {
        expect(filepaths).to.have.length(1);
        expect(fs.existsSync(filepaths[0])).to.be(true);
        const content = fs.readFileSync(filepaths[0], 'utf8');

        expect(content).to.contain('body{color:#fff;font-size:12px}body p{font-size:10px}');
        done();
      });
    });
    it('should build a minified and stringified js file if "compress" and "lazy" are true', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: 'bar.js',
              output: 'output'
            }
          ]
        }
      }, { compress: true, lazy: true }, (err, filepaths) => {
        expect(filepaths).to.have.length(1);
        expect(fs.existsSync(filepaths[0])).to.be(true);
        const content = fs.readFileSync(filepaths[0], 'utf8');

        expect(content).to.contain('require.register("foo.js","var foo=this;"),require.register("bar.js",\'var foo=require("foo.js"),bar=this;\');');
        done();
      });
    });
    it('should build a js file with require boilerplate if "boilerplate" is true', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: 'foo.js',
              output: 'output',
              boilerplate: true
            }
          ]
        }
      }, null, (err, filepaths) => {
        expect(filepaths).to.have.length(1);
        expect(fs.existsSync(filepaths[0])).to.be(true);
        const content = fs.readFileSync(filepaths[0], 'utf8');

        expect(content).to.contain("})((typeof window !== 'undefined') ? window : global);");
        expect(content).to.contain("require.register('foo.js'");
        done();
      });
    });
    it('should build a bootstrapped js file if "bootstrap" is true', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: 'foo.js',
              output: 'output',
              bootstrap: true
            }
          ]
        }
      }, null, (err, filepaths) => {
        expect(filepaths).to.have.length(1);
        expect(fs.existsSync(filepaths[0])).to.be(true);
        const content = fs.readFileSync(filepaths[0], 'utf8');

        expect(content).to.contain("require.register('foo.js'");
        expect(content).to.contain("require('foo.js');");
        done();
      });
    });
    it('should copy an image directory', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: 'image-directory',
              output: 'output'
            }
          ]
        }
      }, null, (err, filepaths) => {
        expect(filepaths).to.have.length(2);
        expect(fs.existsSync(filepaths[0])).to.be(true);
        done();
      });
    });
    it('should compress and copy an image directory', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: 'image-directory',
              output: 'output'
            }
          ]
        }
      }, { compress: true }, (err, filepaths) => {
        expect(filepaths).to.have.length(2);
        expect(fs.existsSync(filepaths[0])).to.be(true);
        expect(fs.readFileSync(filepaths[0], 'utf8')).to.eql('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="25"/></svg>');
        done();
      });
    });
  });

  describe('script', () => {
    before(() => {
      process.chdir(path.resolve(__dirname, 'fixtures/builder/script'));
    });

    it('should run a script after successful build', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: 'foo.js',
              output: 'output'
            }
          ]
        },
        script: 'node mod.js output/foo.js'
      }, { script: true }, (err, filepaths) => {
        setTimeout(() => {
          expect(fs.existsSync(filepaths[0])).to.be(true);
          const content = fs.readFileSync(filepaths[0], 'utf8');

          expect(content).to.eql("oops!");
          done();
        }, 1000);
      });
    });
  });

  describe('grep', () => {
    before(() => {
      process.chdir(path.resolve(__dirname, 'fixtures/builder/grep'));
    });

    it('should only build matching targets', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: 'foo.js',
              output: 'output'
            },
            {
              input: 'foo.css',
              output: 'output'
            }
          ]
        }
      }, { grep: '*.js' }, (err, filepaths) => {
        expect(filepaths).to.have.length(1);
        expect(fs.existsSync(filepaths[0])).to.be(true);
        expect(filepaths[0]).to.eql(path.resolve('output/foo.js'));
        done();
      });
    });
    it('should only build matching targets when globbing input', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: '*.js',
              output: 'output'
            },
            {
              input: 'foo.css',
              output: 'output'
            }
          ]
        }
      }, { grep: 'foo.*' }, (err, filepaths) => {
        expect(filepaths).to.have.length(2);
        expect(filepaths[0]).to.match(/foo\./);
        expect(filepaths[1]).to.match(/foo\./);
        done();
      });
    });
    it('should only build matching targets when using "--invert" option', (done) => {
      builder.build({
        build: {
          targets: [
            {
              input: 'foo.js',
              output: 'output'
            },
            {
              input: 'foo.css',
              output: 'output'
            }
          ]
        }
      }, { grep: '*.js', invert: true }, (err, filepaths) => {
        expect(filepaths).to.have.length(1);
        expect(fs.existsSync(filepaths[0])).to.be(true);
        expect(filepaths[0]).to.eql(path.resolve('output/foo.css'));
        done();
      });
    });
  });

  describe('watch', () => {
    before(() => {
      process.chdir(path.resolve(__dirname, 'fixtures/builder/watch'));
    });

    if (process.platform != 'win32') {
      it('should rebuild a watched file on change', (done) => {
        const child = exec('NODE_ENV=dev && ../../../../bin/buddy watch buddy-watch-file.js', {}, (err, stdout, stderr) => {
              console.log(arguments);
              done(err);
            })
          , foo = fs.readFileSync(path.resolve('foo.js'), 'utf8');

        setTimeout(() => {
          fs.writeFileSync(path.resolve('foo.js'), 'var foo = "foo";', 'utf8');
          setTimeout(() => {
            const content = fs.readFileSync(path.resolve('output/foo.js'), 'utf8');

            expect(content).to.contain("require.register(\'foo.js\', function(require, module, exports) {\n    var foo = \"foo\";\n});");
            fs.writeFileSync(path.resolve('foo.js'), foo);
            child.kill();
            done();
          }, 100);
        }, 4000);
      });
    }
  });
});