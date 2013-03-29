var path = require('path')
	, fs = require('fs')
	, should = require('should')
	, fileFactory = require('../lib/core/file')
	, compress = require('../lib/core/file/compress')
	, escape = require('../lib/core/file/escape')
	, parse = require('../lib/core/file/parse')
	, wrap = require('../lib/core/file/wrap');

describe('file', function() {
	before(function() {
		process.chdir(path.resolve(__dirname, 'fixtures/file'));
	});
	describe('factory', function() {
		it('should decorate a new File instance with passed data', function() {
			fileFactory(path.resolve('src/main.js'), {type:'js', sources:[path.resolve('src')]}, function(err, instance) {
				instance.should.have.property('type', 'js');
			});
		});
		it('should resolve a module id for a File instance', function() {
			fileFactory(path.resolve('src/main.js'), {type:'js', sources:[path.resolve('src')]}, function(err, instance) {
				instance.should.have.property('id', 'main');
			});
		});
		it('should resolve a module id for an "index" File instance', function() {
			fileFactory(path.resolve('src/index.js'), {type:'js', sources:[path.resolve('src')]}, function(err, instance) {
				instance.should.have.property('id', 'src');
			});
		});
		it('should resolve a module id for a node_module "index" File instance ', function() {
			fileFactory(path.resolve('node_modules/foo/index.js'), {type:'js', sources:[path.resolve('node_modules')]}, function(err, instance) {
				instance.should.have.property('id', 'foo');
			});
		});
		it('should resolve a module id for a node_modules package.json "main" File instance', function() {
			fileFactory(path.resolve('node_modules/bar/bar.js'), {type:'js', sources:[path.resolve('node_modules')]}, function(err, instance) {
				instance.should.have.property('id', 'bar');
			});
		});
	});

	describe.only('workflow', function() {
		describe('read', function() {
			it('should read and store js file contents', function(done) {
				fileFactory(path.resolve('src/main.js'), {type:'js', sources:[path.resolve('src')]}, function(err, instance) {
					instance.read(function(err, instance) {
						instance.content.should.eql(instance.originalContent);
						instance.content.should.eql("var bar = require('./package/bar')\n\t, foo = require('./package/foo');");
						done();
					});
				});
			});
			it('should not overwrite previously read file contents', function(done) {
				fileFactory(path.resolve('src/main.js'), {type:'js', sources:[path.resolve('src')]}, function(err, instance) {
					instance.content = instance.originalContent = 'foo';
					instance.read(function(err, instance) {
						instance.content.should.eql(instance.originalContent);
						instance.content.should.eql("foo");
						done();
					});
				});
			});
		});
		describe('escape', function() {
			it('should transform js file contents into an escaped string', function(done) {
				fileFactory(path.resolve('src/main.js'), {type:'js', sources:[path.resolve('src')]}, function(err, instance) {
					instance.content = fs.readFileSync(instance.filepath, 'utf8');
					instance.escape(null, function(err, instance) {
						instance.content.should.eql("\"var bar = require('./package/bar')\\n\t, foo = require('./package/foo');\"");
						done();
					});
				});
			});
		});
		describe('compress', function() {
			it('should compress js file contents', function(done) {
				fileFactory(path.resolve('src/main.js'), {type:'js', sources:[path.resolve('src')]}, function(err, instance) {
					instance.content = fs.readFileSync(instance.filepath, 'utf8');
					instance.compress(null, function(err, instance) {
						should.not.exist(err);
						instance.content.should.eql('var bar=require("./package/bar"),foo=require("./package/foo");');
						done();
					});
				});
			});
			it('should compress css file contents', function(done) {
				fileFactory(path.resolve('src/main.css'), {type:'css', sources:[path.resolve('src')]}, function(err, instance) {
					instance.content = fs.readFileSync(instance.filepath, 'utf8');
					instance.compress(null, function(err, instance) {
						should.not.exist(err);
						instance.content.should.eql("@import 'package/foo';body{background-color:#000}");
						done();
					});
				});
			});
		});
		describe('wrap', function() {
			var instance = null;
			before(function(done) {
				fileFactory(path.resolve('src/main.js'), {type:'js', sources:[path.resolve('src')]}, function(err, file) {
					instance = file;
					file.id = 'main';
					done();
				});
			});
			beforeEach(function() {
				instance.content = fs.readFileSync(instance.filepath, 'utf8');
			});
			it('should wrap js file contents in a module definition', function(done) {
				instance.wrap({lazy:false}, function(err, file) {
					should.not.exist(err);
					file.content.should.eql("require.register(\'main\', function(module, exports, require) {\n  var bar = require(\'./package/bar\')\n  \t, foo = require(\'./package/foo\');\n});");
					done();
				});
			});
			it('should wrap js file contents in a lazy module definition', function(done) {
				instance.wrap({lazy:true}, function(err, file) {
					should.not.exist(err);
					file.content.should.eql("require.register(\'main\', var bar = require(\'./package/bar\')\n\t, foo = require(\'./package/foo\'););");
					done();
				});
			});
		});
		describe('parse', function() {
			it('should store an array of js dependency objects', function(done) {
				fileFactory(path.resolve('src/main.js'), {type:'js', sources:[path.resolve('src')]}, function(err, instance) {
					instance.content = fs.readFileSync(instance.filepath, 'utf8');
					instance.parse(null, function(err, instance) {
						should.not.exist(err);
						instance.dependencies.should.eql([
							{id:'./package/bar', filepath:path.resolve('src/package/bar.js'), instance:null},
							{id:'./package/foo', filepath:path.resolve('src/package/foo.js'), instance:null}
						]);
						done();
					});
				});
			});
			it('should store an array of coffee dependency objects', function(done) {
				fileFactory(path.resolve('src/main.coffee'), {type:'js', sources:[path.resolve('src')], fileExtensions:['coffee']}, function(err, instance) {
					instance.content = fs.readFileSync(instance.filepath, 'utf8');
					instance.parse(null, function(err, instance) {
						should.not.exist(err);
						instance.dependencies.should.eql([
							{id:'./package/class', filepath:path.resolve('src/package/class.coffee'), instance:null},
							{id:'./package/classcamelcase', filepath:path.resolve('src/package/classcamelcase.coffee'), instance:null}
						]);
						done();
					});
				});
			});
			it('should store an array of css dependency objects', function(done) {
				fileFactory(path.resolve('src/main.css'), {type:'css', sources:[path.resolve('src')]}, function(err, instance) {
					instance.content = fs.readFileSync(instance.filepath, 'utf8');
					instance.parse(null, function(err, instance) {
						should.not.exist(err);
						instance.dependencies.should.eql([
							{id:'package/foo', filepath:path.resolve('src/package/foo.css'), instance:null}
						]);
						done();
					});
				});
			});
			it('should not overwrite previously parsed dependencies', function(done) {
				fileFactory(path.resolve('src/main.js'), {type:'js', sources:[path.resolve('src')]}, function(err, instance) {
					instance.content = fs.readFileSync(instance.filepath, 'utf8');
					instance.dependencies = ['foo', 'bar']
					instance.parse(null, function(err, instance) {
						should.not.exist(err);
						instance.dependencies.should.eql(['foo', 'bar']);
						done();
					});
				});
			});
			it('should only store 1 dependency object when there are duplicates', function(done) {
				fileFactory(path.resolve('src/package/bat.js'), {type:'js', sources:[path.resolve('src')]}, function(err, instance) {
					instance.content = fs.readFileSync(instance.filepath, 'utf8');
					instance.parse(null, function(err, instance) {
						should.not.exist(err);
						instance.dependencies.should.eql([{id:'./foo', filepath:path.resolve('src/package/foo.js'), instance:null}]);
						done();
					});
				});
			});
		});
		describe('concat', function() {
			it('should replace css @import rules with file contents', function(done) {
				var opts = {
					type: 'css',
					sources: [path.resolve('src')]
				}
				fileFactory(path.resolve('src/package/foo.css'), opts, function(err, foo) {
					foo.content = fs.readFileSync(foo.filepath, 'utf8');
					foo.dependencies = [];
					fileFactory(path.resolve('src/main.css'), opts, function(err, main) {
						main.content = fs.readFileSync(main.filepath, 'utf8');
						main.dependencies = [{id:'package/foo', filepath:foo.filepath, instance:foo}];
						main.concat(null, function(err) {
							main.content.should.eql('div {\n\twidth: 50%;\n}\n\nbody {\n\tbackground-color: black;\n}');
							done();
						});
					});
				})
			});
			it('should replace css @import rules with file contents, allowing duplicates', function(done) {
				var opts = {
					type: 'css',
					sources: [path.resolve('src')]
				}
				fileFactory(path.resolve('src/package/foo.css'), opts, function(err, foo) {
					foo.content = fs.readFileSync(foo.filepath, 'utf8');
					foo.dependencies = [];
					fileFactory(path.resolve('src/package/bar.css'), opts, function(err, main) {
						main.content = fs.readFileSync(main.filepath, 'utf8');
						main.dependencies = [{id:'foo', filepath:foo.filepath, instance:foo}];
						main.concat(null, function(err) {
							main.content.should.eql('div {\n\twidth: 50%;\n}\n\ndiv {\n\twidth: 50%;\n}\n');
							done();
						});
					});
				})
			});
		});
	});
});
