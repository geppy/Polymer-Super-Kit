/// <binding BeforeBuild='before-build' />
/*
Copyright (c) 2015 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

'use strict';

// Include Gulp & Tools We'll Use
var gulp = require('gulp');
var $ = {
  'autoprefixer': require('gulp-autoprefixer'),
  'cache': require('gulp-cache'),
  'changed': require('gulp-changed'),
  'cssmin': require('gulp-cssmin'),
  'if': require('gulp-if'),
  'imagemin': require('gulp-imagemin'),
  'jshint': require('gulp-jshint'),
  'minifyHtml': require('gulp-minify-html'),
  'rename': require('gulp-rename'),
  'size': require('gulp-size'),
  'uglify': require('gulp-uglify'),
  'useref': require('gulp-useref')
};
var connect = require('gulp-connect');
var del = require('del');
var runSequence = require('run-sequence');
var polybuild = require('polybuild');
var merge = require('merge-stream');
var path = require('path');
var fs = require('fs');
var glob = require('glob');
var sass = require('gulp-sass');
var ts = require('gulp-typescript');
var merge = require('merge2');
var replace = require('gulp-replace');

var AUTOPREFIXER_BROWSERS = [
  'ie >= 10',
  'ie_mob >= 10',
  'ff >= 30',
  'chrome >= 34',
  'safari >= 7',
  'opera >= 23',
  'ios >= 7',
  'android >= 4.4',
  'bb >= 10'
];

var styleTask = function (stylesPath, srcs) {
  return gulp.src(srcs.map(function (src) {
    return path.join('.tmp', stylesPath, src);
  }))
    .pipe($.changed(stylesPath, { extension: '.css' }))
    .pipe($.autoprefixer(AUTOPREFIXER_BROWSERS))
    .pipe(gulp.dest('.tmp/' + stylesPath))
    .pipe($.if('*.css', $.cssmin()))
    .pipe(gulp.dest('www/' + stylesPath))
    .pipe($.size({ title: stylesPath }));
};

gulp.task('sass', function () {
  return gulp.src('web/**/*.scss')
    .pipe(sass({
      'includePaths': ['./web/styles/']
    }).on('error', sass.logError))
    .pipe(gulp.dest('.tmp'))
    .pipe(connect.reload());
});

// Compile and Automatically Prefix Stylesheets
gulp.task('styles', function () {
  return styleTask('styles', ['**/*.css']);
});

gulp.task('elements', function () {
  return styleTask('elements', ['**/*.css']);
});

// Lint JavaScript
gulp.task('jshint', function () {
  return gulp.src([
      'web/scripts/**/*.js',
      'web/elements/**/*.js',
      'web/elements/**/*.html'
  ])
    .pipe($.jshint.extract()) // Extract JS from .html files
    .pipe($.jshint())
    .pipe($.jshint.reporter('jshint-stylish'));
});

// Optimize Images
gulp.task('images', function () {
  return gulp.src('web/images/**/*')
    .pipe($.cache($.imagemin({
      progressive: true,
      interlaced: true
    })))
    .pipe(gulp.dest('www/images'))
    .pipe($.size({ title: 'images' }));
});

gulp.task('typescript', function () {
  var tsResult = gulp.src([
    'web/scripts/main.ts',
    'web/elements/**/*.ts',
    'web/scripts/**/*.ts'
  ])
  .pipe(ts({
    target: 'es5',
    noImplicitAny: true,
    suppressImplicitAnyIndexErrors: true,
    sourceMap: true,
    experimentalDecorators: true,
    inlineSourceMap: true,
    inlineSources: true,
    out: 'scripts/output.js'
  }));

  return tsResult.js.pipe(gulp.dest('.tmp'))
      .pipe(connect.reload());
});

// Copy All Files At The Root Level (web)
gulp.task('copy', function () {
  var web = gulp.src([
    '.tmp/**/*.js',
    '.tmp/**/*.css',
    'web/*',
    '!web/test',
    '!web/precache.json'
  ], {
    dot: true
  }).pipe(gulp.dest('www'));

  var media = gulp.src([
    'web/media/**/*'
  ]).pipe(gulp.dest('www/media'));

  var scripts = gulp.src([
    'web/scripts/**/*.js'
  ]).pipe(gulp.dest('www/scripts'));

  var bower = gulp.src([
    'web/bower_components/**/*'
  ]).pipe(gulp.dest('www/bower_components'));

  var elements = gulp.src(['web/elements/**/*.html'])
    .pipe(gulp.dest('www/elements'));

  var swBootstrap = gulp.src(['web/bower_components/platinum-sw/bootstrap/*.js'])
    .pipe(gulp.dest('www/elements/bootstrap'));

  var swToolbox = gulp.src(['web/bower_components/sw-toolbox/*.js'])
    .pipe(gulp.dest('www/sw-toolbox'));

  var polybuilt = gulp.src(['web/index.html'])
    .pipe($.rename('index.build.html'))
    .pipe(gulp.dest('www/'));

  return merge(media, web, scripts, bower, elements, polybuilt, swBootstrap, swToolbox)
    .pipe($.size({ title: 'copy' }));
});

// Copy Web Fonts To www
gulp.task('fonts', function () {
  return gulp.src(['web/fonts/**'])
    .pipe(gulp.dest('www/fonts'))
    .pipe($.size({ title: 'fonts' }));
});

// Scan Your HTML For Assets & Optimize Them
gulp.task('html', function () {
  var assets = $.useref.assets({ searchPath: ['.tmp', 'web', 'www'] });

  return gulp.src(['web/**/*.html', '!web/{elements,test}/**/*.html'])
    // Concatenate And Minify JavaScript
    .pipe($.if('*.js', $.uglify({ preserveComments: 'some' })))
    // Concatenate And Minify Styles
    // In case you are still using useref build blocks
    .pipe($.if('*.css', $.cssmin()))
    .pipe(assets.restore())
    .pipe($.useref())
    // Minify Any HTML
    .pipe($.if('*.html', $.minifyHtml({
      quotes: true,
      empty: true,
      spare: true
    })))
    // Output Files
    .pipe(gulp.dest('www'))
    .pipe($.size({ title: 'html' }));
});

// Vulcanize+Crisper+Polyclean imports
gulp.task('polybuild', function () {
  var DEST_DIR = 'www';

  return gulp.src('www/index.html')
    .pipe(polybuild())
    .pipe(gulp.dest(DEST_DIR))
    .pipe($.size({ title: 'polybuild' }));
});

// Generate a list of files that should be precached when serving from 'www'.
// The list will be consumed by the <platinum-sw-cache> element.
gulp.task('precache', function (callback) {
  var dir = 'www';

  glob('{elements,scripts,styles}/**/*.*', { cwd: dir },
      function (error, files) {
    if (error) {
      callback(error);
    } else {
      files.push('index.html', './',
          'bower_components/webcomponentsjs/webcomponents-lite.min.js');
      var filePath = path.join(dir, 'precache.json');
      fs.writeFile(filePath, JSON.stringify(files), callback);
    }
  });
});

// Clean Output Directory
gulp.task('clean', del.bind(null, ['.tmp', 'www']));

// Watch Files For Changes & Reload
gulp.task('serve',
    ['typescript', 'sass'],
    function () {
  connect.server({
    root: ['.tmp/', 'web'],
    port: 8000,
    livereload: true
  });
  
  gulp.watch([
    'web/elements/**/*.ts',
    'web/scripts/**/*.ts'
  ], ['typescript']);
  gulp.watch([
    'web/elements/**/*.scss',
    'web/styles/**/*.scss'
  ], ['sass']);
});

// Build Production Files, the Default Task
gulp.task('default', ['clean'], function (cb) {
  runSequence(
    'typescript',
    'sass',
    ['copy', 'styles'],
    'elements',
    ['images', 'fonts', 'html'],
    'polybuild',
    cb);
  // Note: add , 'precache' , after 'polybuild', if your are going to use Service Worker
});

// Load tasks for web-component-tester
// Adds tasks for `gulp test:local` and `gulp test:remote`
require('web-component-tester').gulp.init(gulp);

// Load custom tasks from the `tasks` directory
try { require('require-dir')('tasks'); } catch (err) { }