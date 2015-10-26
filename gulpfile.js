'use strict';

var path = require('path');
var fs = require('fs');
var gulp = require('gulp');
var browserSync = require('browser-sync');
var reload = browserSync.reload;
var $ = require('gulp-load-plugins')();
var markJSON = require('markit-json');
var docUtil = require('amazeui-doc-util');
var through = require('through2');
var Sequelize = require('sequelize');
var runSequence = require('run-sequence');
var del = require('del');
var pkg = require('../amazeui/package.json');

var docsPath = {
  docset: {
    root: 'dist/AmazeUI.docset/Contents/',
    sqlite: 'Resources/docSet.dsidx',
    html: 'Resources/Documents/',
    assets: 'assets/',
    css: 'css',
    js: 'js'
  },
  docs: {
    root: 'dist/',
    sqlite: 'docSet.dsidx',
    assets: 'assets/',
    html: '',
    icon: 'i',
    css: 'css',
    js: 'js'
  }
};

var paths, docsType = 'docset';

function generatorPath(type){
  docsType = type || 'docset';
  paths = {
    mdDocs: './amazeui/docs/**/*.md',
    dist: {
      //html: 'dist/AmazeUI.docset/Contents/Resources/Documents',
      html: docsPath[docsType].root + docsPath[docsType].html,

      //assets: 'dist/AmazeUI.docset/Contents/Resources/Documents/assets/',
      assets: docsPath[docsType].root + docsPath[docsType].html + docsPath[docsType].assets
    },
    docsets: docsPath[docsType].root,
    sqlite: docsPath[docsType].root + docsPath[docsType].sqlite
  };
}
generatorPath('docset');


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
  sequelize.sync().then(function() {
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

    if (relative.indexOf('styleguide') > -1) {
      type = 'Section';
    } else if (relative.indexOf('javascript') > -1) {
      type = 'Plugin';
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
    '!amazeui/docs/en/**/*',
    '!amazeui/docs/about/**/*',
    '!amazeui/docs/about.md',
    '!amazeui/docs/amaze.md',
    '!amazeui/docs/customize.md',
    '!amazeui/docs/javascript/share.md',
    '!amazeui/docs/javascript/pureview.md',
    '!amazeui/docs/css/mixins.md',
    '!amazeui/docs/css/variables.md',
    // '!amazeui/docs/getting-started/layouts.md',
    '!amazeui/docs/getting-started/team.md'
  ])
    .pipe(markJSON(docUtil.markedOptions))
    //.pipe($.if(docsType === 'docset', setAsserts() ) )
    .pipe(setAsserts())//这里生成 docs 时，报 unable to open database file
    .pipe(docUtil.applyTemplate(tpl))
    .pipe($.rename(function(file) {
      file.extname = '.html';
      if (file.basename === 'getting-started') {
        file.basename = 'index';
      }
    }))
    .pipe(gulp.dest(paths.dist.html));
});

gulp.task('misc:info', function() {
  return gulp.src('template/dash/Info.plist')
    .pipe(gulp.dest(paths.docsets))
});

gulp.task('misc:icon', function() {
  return gulp.src([
      // 'template/docsets/i/icon.png'
      '**/*'
    ], {
      cwd: './amazeui/dist/i/'
    })
    .pipe(gulp.dest(paths.dist.assets + 'i'));
});

gulp.task('misc:amui', function() {
  return gulp.src([
    '*/amazeui.min.css',
    '*/amazeui.min.js',
    '*/*.otf',
    '*/fontawesome*'
  ], {
    // cwd: 'node_modules/amazeui/dist'
    cwd: './amazeui/dist'
  })
    .pipe(gulp.dest(paths.dist.assets));
});

gulp.task('misc:jq', function() {
  return gulp.src('*.min.js', {
    cwd: 'node_modules/jquery/dist/'
  })
    .pipe($.rename('jquery.min.js'))
    .pipe(gulp.dest(paths.dist.assets + 'js'));
});

gulp.task('misc', ['misc:info', 'misc:icon', 'misc:amui', 'misc:jq']);

gulp.task('clean', function(cb) {
  del('dist', cb);
});

gulp.task('zip', function(cb) {
  return gulp.src(['dist/**/*', '!dist/*.zip'])
    .pipe($.zip('AmazeUI.Docsets-' + pkg.version + '.zip'))
    .pipe(gulp.dest('dist'));
});

gulp.task('deploy', function() {
  return gulp.src('dist/*.zip')
    .pipe($.ghPages())
});

gulp.task('watch', function() {
  gulp.watch('amazeui/docs/**/*', ['markdown']);
});

// default task  Docset
gulp.task('default', function(cb) {
  generatorPath('docset');
  runSequence('clean', 'less', ['misc', 'markdown'], 'watch', cb);
});


var distRoot = 'dist'
var config = {
  //预览服务器
  browserSync: {
    // port: 5000, //默认3000
    // ui: {    //更改默认端口weinre 3001
    //     port: 5001,
    //     weinre: {
    //         port: 9090
    //     }
    // },
    // server: {
    //   baseDir: 'dist/docs'
    // },
    open: "local", //external
    notify: true,
    logPrefix: 'happyCoding',
    server: distRoot
  },
  // watch files and reload browserSync
  bsWatches: distRoot + '/**/*',
};
gulp.task('server', function() {
  var bs = browserSync(config.browserSync);

  if (config.bsWatches) {
    gulp.watch(config.bsWatches, bs.reload);
  }
});



//生成 html 文档

gulp.task('docs', function(cb) {
  generatorPath('docs');
  runSequence('clean', 'less', ['misc', 'markdown'], 'watch', 'server', cb);
});