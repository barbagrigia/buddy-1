var path = require('path')
	, fs = require('fs')
	, co = require('co')
	, should = require('should')
	, rimraf = require('rimraf')
	, fileFactory = require('../lib/core/file')
	, targetFactory = require('../lib/core/target');

describe('target', function () {
	before(function () {
		process.chdir(path.resolve(__dirname, 'fixtures/target'));
	});
	beforeEach(function () {
		if (!fs.existsSync(path.resolve('temp'))) fs.mkdirSync(path.resolve('temp'));
	});
	afterEach(function () {
		fileFactory.cache.flush();
		rimraf.sync(path.resolve('temp'));
	});

	describe('factory', function () {
		it('should decorate a new Target instance with passed data', function () {
			var target = targetFactory({type: 'js', input: 'src/some.coffee', output: 'js', runtimeOptions: {}, fileExtensions: ['js', 'json', 'coffee', 'hbs', 'handlebars', 'dust', 'jade']});
			target.should.have.property('output', 'js');
		});
	});

	describe('parse', function () {
		beforeEach(function () {
			this.target = targetFactory({type:'js', outputPath: path.resolve('temp'), fileExtensions:['js', 'coffee'], sources:['src'], runtimeOptions:{}});
		});
		it('should parse a file "input" and return a File instance', function (done) {
			co(function* () {
				var files = yield this.target.parse(false, path.resolve('src/js/foo.js'), null, this.target.runtimeOptions);
				files.should.have.length(1);
				done();
			}).call(this);
		});
		it('should parse a directory "input" and return several File instances', function (done) {
			co(function* () {
				this.target.inputPath = path.resolve('src/js');
				this.target.isDir = true;
				files = yield this.target.parse(true, path.resolve('src/js'), null, this.target.runtimeOptions);
				files.should.have.length(4);
				done();
			}).call(this);
		});
	});

	describe('process', function () {
		before(function () {
			this.target = targetFactory({type:'js', fileExtensions:[], sources:[], runtimeOptions: {}});
		});
		it('should serially apply a set of commands to a collection of items', function (done) {
			co(function* () {
				var file1 = fileFactory(path.resolve('src/js/foo.js'), {type: 'js'})
					, file2 = fileFactory(path.resolve('src/js/bar.js'), {type: 'js'})
					, files = yield this.target.process([file1, file2], [['load'], ['compile']]);
				files[1].content.should.eql("var bat = require(\'./bat\')\n\t, baz = require(\'./baz\')\n\t, bar = this;");
				done();
			}).call(this);
		});
		it('should return several file references when processing a file with dependencies', function (done) {
			co(function* () {
				var file1 = fileFactory(path.resolve('src/js/foo.js'), {type: 'js'})
					, files = yield this.target.process([file1], [['load', 'parse', 'wrap']]);
				files.should.have.length(4);
				files[0].content.should.eql("require.register(\'src/js/foo\', function(module, exports, require) {\n  var bar = require(\'./bar\')\n  \t, foo = this;\n});");
				done();
			}).call(this);
		});
	});

	describe('build', function () {
		beforeEach(function () {
			fileFactory.cache.flush();
			this.target = targetFactory({type:'js', outputPath: path.resolve('temp'), fileExtensions:['js', 'coffee'], sources:['src'], runtimeOptions:{}});
		});
		afterEach(function () {
			this.target.reset();
		});
		it('should execute a "before" hook before running the build', function (done) {
			co(function* () {
				this.target.before = new Function('global', 'process', 'console', 'require', 'context', 'options', 'done', 'context.foo="foo";done();');
				this.target.inputPath = path.resolve('src/js/foo.js');
				this.target.workflow = [['load', 'compile']];
				this.target.foo = 'bar';
				var filepaths = yield this.target.build();
				this.target.foo.should.eql('foo');
				done();
			}).call(this);
		});
		it('should execute an "after" hook after running the build', function (done) {
			co(function* () {
				this.target.before = new Function('global', 'process', 'console', 'require', 'context', 'options', 'done', 'context.foo="foo";done();');
				this.target.inputPath = path.resolve('src/js/foo.js');
				this.target.workflow = [['load', 'compile']];
				this.target.foo = 'bar';
				var filepaths = yield this.target.build();
				filepaths[0].should.eql(path.resolve('temp/js/foo.js'))
				this.target.foo.should.eql('foo');
				done();
			}).call(this);
		});
		it('should execute an "afterEach" hook after each processed file is ready to write to disk', function (done) {
			co(function* () {
				this.target.afterEach = new Function('global', 'process', 'console', 'require', 'context', 'options', 'done', 'context.content="foo";done();');
				this.target.inputPath = path.resolve('src/js/foo.js');
				this.target.workflow = [['load', 'compile']];
				var filepaths = yield this.target.build();
				filepaths[0].should.eql(path.resolve('temp/js/foo.js'))
				fs.readFileSync(filepaths[0], 'utf8').should.eql('foo');
				done();
			}).call(this);
		});
		it('should return an error if a "before" hook returns an error', function (done) {
			co(function* () {
				this.target.before = new Function('global', 'process', 'console', 'require', 'context', 'options', 'callback', 'done("oops");');
				this.target.inputPath = path.resolve('src/js/foo.js');
				this.target.workflow = [['load', 'compile']];
				try {
					yield this.target.build();
				} catch (err) {
					should.exist(err);
					done();
				}
			}).call(this);
		});
		it('should return an error if an "after" hook returns an error', function (done) {
			co(function* () {
				this.target.after = new Function('global', 'process', 'console', 'require', 'context', 'options', 'callback', 'done("oops");');
				this.target.inputPath = path.resolve('src/js/foo.js');
				this.target.workflow = [['load', 'compile']];
				try {
					yield this.target.build();
				} catch (err) {
					should.exist(err);
					done();
				}
			}).call(this);
		});
	});
});
