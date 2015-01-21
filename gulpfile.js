'use strict';

var path = require('path');
var fs = require('fs');
var gulp = require('gulp');
var $ = require('gulp-load-plugins')();
var markJSON = require('markit-json');
var docUtil = require('amazeui-doc-util');
var through = require('through2');
var Sequelize = require('sequelize');
var runSequence = require('run-sequence');
var del = require('del');

var paths = {
  mdDocs: './amazeui/docs/**/*.md',
  dist: {
    html: 'dist/amazeui.docset/Contents/Resources/Documents',
    assets: 'dist/amazeui.docset/Contents/Resources/Documents/assets/'
  },
  docsets: 'dist/amazeui.docset/Contents/',
  sqlite: 'dist/amazeui.docset/Contents/Resources/docSet.dsidx'
};

var tpl = fs.readFileSync('template/docsets/default.hbs', {
  encoding: 'utf8'
});

var sequelize = new Sequelize(null, null, null, {
  dialect: 'sqlite',
  storage: paths.sqlite
});

// Dash Docsets Search Index
var SearchIndex = sequelize.define('searchIndex', {
  id: {
    type: Sequelize.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  name: {
    type: Sequelize.STRING
  },
  type: {
    type: Sequelize.STRING
  },
  path: {
    type: Sequelize.STRING
  }
}, {
  freezeTableName: true,
  timestamps: false
});

var createIndex = function(data) {
  sequelize.sync({force: true}).then(function() {
    SearchIndex.create({
      name: data.name,
      type: data.type,
      path: data.path
    }).then(function() {
      console.log('[CreateIndex] inserted: %s', data.path);
    }, function() {
      console.error('[CreateIndex] error: %s', data.path);
    });
  });
};

var setAsserts = function() {
  return through.obj(function(input, enc, callback) {
    var relative = input.relative.replace('.json', '');
    var data = JSON.parse(input.contents.toString());
    var assets = 'assets/';
    var type = 'Guide';
    if (relative.indexOf('/') > -1 ) {
      assets = '../' + assets;
    }

    if (relative.indexOf('javascript') > -1) {
      type = 'Plugin';
    } else if (relative.indexOf('styleguide') > -1) {
      type = 'Section';
    } else if (relative.indexOf('css') > -1) {
      type = 'Style';
    }

    if (relative !== 'getting-started') {
      createIndex({
        name: relative,
        type: type,
        path: relative + '.html'
      });
    }

    data.assets = assets;
    input.contents = new Buffer(JSON.stringify(data));
    this.push(input);
    callback();
  });
};

gulp.task('less', function() {
  return gulp.src('template/docsets/less/app.less')
    .pipe($.less())
    .pipe(gulp.dest(paths.dist.assets + 'css'));
});

gulp.task('markdown', function() {
  return gulp.src([
    paths.mdDocs,
    '!amazeui/docs/about/**/*',
    '!amazeui/docs/about.md',
    '!amazeui/docs/amaze.md',
    '!amazeui/docs/customize.md',
    '!amazeui/docs/javascript/share.md',
    '!amazeui/docs/javascript/pureview.md',
    '!amazeui/docs/css/mixins.md',
    '!amazeui/docs/css/variables.md'
  ])
    .pipe(markJSON(docUtil.markedOptions))
    .pipe(setAsserts())
    .pipe(docUtil.applyTemplate(tpl))
    .pipe($.rename(function(file) {
      file.extname = '.html';
      if (file.basename === 'getting-started') {
        file.basename = 'index';
      }
    }))
    .pipe(gulp.dest(paths.docsets + 'Resources/Documents'));
});

gulp.task('misc:info', function() {
  return gulp.src('template/dash/Info.plist')
    .pipe(gulp.dest(paths.docsets))
});

gulp.task('misc:icon', function() {
  return gulp.src('template/docsets/i/icon.png')
    .pipe(gulp.dest('dist/amazeui.docset/'));
});

gulp.task('misc:amui', function() {
  return gulp.src([
    '*/amazeui.min.css',
    '*/amazeui.min.js',
    '*/*.otf',
    '*/fontawesome*'
  ], {
    cwd: 'node_modules/amazeui/dist'
  })
    .pipe(gulp.dest(paths.dist.assets));
});

gulp.task('misc:jq', function() {
  return gulp.src('*.min.js', {
    cwd: 'node_modules/jquery/dist/cdn'
  })
    .pipe($.rename('jquery.min.js'))
    .pipe(gulp.dest(paths.dist.assets + 'js'));
});

gulp.task('misc', ['misc:info', 'misc:icon', 'misc:amui', 'misc:jq']);

gulp.task('clean', function(cb) {
  del('dist', cb);
});

// default task
gulp.task('default', function(cb) {
  runSequence('clean', 'less', ['misc', 'markdown'], cb);
});
