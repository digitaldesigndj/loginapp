var express = require('express')
  , passport = require('passport')
  , util = require('util')
  , path = require('path')
  , GoogleStrategy = require('passport-google-oauth').OAuthStrategy
  , couchbase = require('couchbase')
  , fs = require('fs');

var db = new couchbase.Connection({bucket: "users"}, function(err) {
  if (err) throw err;
});

// API Access link for creating consumer key and secret:
// https://developers.google.com/accounts/docs/RegistrationForWebAppsAuto
// https://accounts.google.com/ManageDomains
var GOOGLE_CONSUMER_KEY = process.env.GOOGLE_CONSUMER_KEY;
var GOOGLE_CONSUMER_SECRET = process.env.GOOGLE_CONSUMER_SECRET;
var GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL;

// Passport session setup.
//   To support persistent login sessions, Passport needs to be able to
//   serialize users into and deserialize users out of the session.  Typically,
//   this will be as simple as storing the user ID when serializing, and finding
//   the user by ID when deserializing.  However, since this example does not
//   have a database of user records, the complete Google profile is
//   serialized and deserialized.
passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  done(null, obj);
});


// Use the GoogleStrategy within Passport.
//   Strategies in passport require a `verify` function, which accept
//   credentials (in this case, a token, tokenSecret, and Google profile), and
//   invoke a callback with a user object.
passport.use(new GoogleStrategy({
    consumerKey: GOOGLE_CONSUMER_KEY,
    consumerSecret: GOOGLE_CONSUMER_SECRET,
    callbackURL: GOOGLE_CALLBACK_URL
  },
  function(token, tokenSecret, profile, done) {
    // asynchronous verification, for effect...
    process.nextTick(function () {
      
      // To keep the example simple, the user's Google profile is returned to
      // represent the logged-in user.  In a typical application, you would want
      // to associate the Google account with a user record in your database,
      // and return that user instead.
      return done(null, profile);
    });
  }
));




var app = express();

// all environments
// app.set('port', process.env.PORT || 3000);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.json());
app.use(express.urlencoded());
app.use(express.methodOverride());
app.use(express.cookieParser('your secret here'));
app.use(express.session({ secret: 'keyboard cat likes tuna' }));
app.use(express.bodyParser());
// Initialize Passport!  Also use passport.session() middleware, to support
// persistent login sessions (recommended).
app.use(passport.initialize());
app.use(passport.session());
app.use(app.router);
app.use(require('stylus').middleware(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'uploads')));


app.get('/', function(req, res){
  res.render('index', { user: req.user });
});


app.post('/upload', function (req, res) {
  // var imagename = "_profile." + req.files.file.name.split('.').pop();
  // @ todo JPG and PNG only.
  console.log( req.files.file );
  // console.log( req.session );
  fs.readFile(req.files.file.path, function (err, data) {
    console.log( req.query.user );
    var newPath = __dirname + "/uploads/" + req.files.file.name;
    fs.writeFile(newPath, data, function (err) {
      db.get( req.user.id, function(err, result) {
        if (err) throw err;
        result.value.files.push( req.files.file.name );
        db.set( req.user.id, result.value, function(err, result) {
          if (err) throw err;
          res.redirect("back");
        });
      });
    });
  });
});

app.get('/account', ensureAuthenticated, function(req, res){
  db.get( req.user.id, function(err, result) {
    if (err) throw err;
    res.render('account', { user: req.user, data: result.value });
  });
});

app.get('/login', function(req, res){
  res.render('login', { user: req.user });
});

// GET /auth/google
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  The first step in Google authentication will involve redirecting
//   the user to google.com.  After authorization, Google will redirect the user
//   back to this application at /auth/google/callback
app.get('/auth/google',
  passport.authenticate('google', { scope: 'https://www.google.com/m8/feeds' }),
  function(req, res){
    // The request will be redirected to Google for authentication, so this
    // function will not be called.
  });

// GET /auth/google/callback
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  If authentication fails, the user will be redirected back to the
//   login page.  Otherwise, the primary route function function will be called,
//   which, in this example, will redirect the user to the home page.
app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login' }),
  function(req, res) {
    // if( req.user.id.indexOf('reapmarketing.com') != -1 ) {
    //  res.redirect('/logout'); 
    // } else {}
    delete req.user._json;
    delete req.user._raw;
    req.user.files = [];

    // user {
    //   provider: 'google',
    //   id: 'tdy721@gmail.com',
    //   displayName: 'Taylor Young',
    //   emails: [ { value: 'taylor@reapmarketing.com' } ],
    //   files: []
    // }

    db.get( req.user.id, function(err, result) {
      if (err) {
        db.set( req.user.id, req.user, function(err, result) {
          if (err) throw err;
          console.log( 'Created A New User: ' + req.user.id );
          res.redirect('/');
        });
      } else {
        console.log( 'User logged in: ' + req.user.id );
        res.redirect('/');
      }
    });
  });

app.get('/logout', function(req, res){
  req.logout();
  res.redirect('/');
});

console.log( "listen: " + process.env.PORT||3000 );
app.listen(process.env.PORT||3000);


// Simple route middleware to ensure user is authenticated.
//   Use this route middleware on any resource that needs to be protected.  If
//   the request is authenticated (typically via a persistent login session),
//   the request will proceed.  Otherwise, the user will be redirected to the
//   login page.
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  res.redirect('/login');
}
