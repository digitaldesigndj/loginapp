var express = require('express')
  , passport = require('passport')
  , util = require('util')
  , path = require('path')
  , GoogleStrategy = require('passport-google-oauth').OAuthStrategy
  , SteamStrategy = require('passport-steam').Strategy
  , couchbase = require('couchbase')
  , fs = require('fs')
  , _ = require('underscore')
  , $ = require('jquery')
  , connect = require('connect');
// "localhost:8091"
var hostname = 'db.hyprtxt.com:8091';

var db = new couchbase.Connection({ host: hostname, bucket: "users" }, function(err) {
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

// Use the SteamStrategy within Passport.
//   Strategies in passport require a `validate` function, which accept
//   credentials (in this case, an OpenID identifier and profile), and invoke a
//   callback with a user object.
passport.use(new SteamStrategy({
    returnURL: 'http://hyprtxt.com/auth/steam/return',
    realm: 'http://hyprtxt.com/'
  },
  function(identifier, profile, done) {
    // asynchronous verification, for effect...
    process.nextTick(function () {

      // To keep the example simple, the user's Steam profile is returned to
      // represent the logged-in user.  In a typical application, you would want
      // to associate the Steam account with a user record in your database,
      // and return that user instead.
      profile.identifier = identifier;
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
app.use(express.cookieParser('your secret here for nother one'));
app.use(connect.cookieSession({ secret: 'new one this secure later', cookie: { maxAge: 60 * 60 * 1000 }}));
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


// GET REMOTE JSON = All Players
var http = require('http');
var ALL_PLAYERS = {};
var req = http.get('http://boundstar.com/all_players.json', function(res) {
  console.log('STATUS: ' + res.statusCode);
  console.log('HEADERS: ' + JSON.stringify(res.headers));

  // Buffer the body entirely for processing as a whole.
  var bodyChunks = [];
  res.on('data', function(chunk) {
    // You can process streamed parts here...
    bodyChunks.push(chunk);
  }).on('end', function() {
    var body = Buffer.concat(bodyChunks);
    console.log('BODY: ' + body);
    ALL_PLAYERS = JSON.parse(body);
    // ...and/or process the entire body here.
  })
});

req.on('error', function(e) {
  console.log('ERROR: ' + e.message);
});

app.get('/', function(req, res){
  res.render('index', { user: req.user });
});

app.get('/admin', ensureAdminAuthenticated, function(req, res){
  res.render('index', { user: { displayName:'WELCOME SUPERADMIN' } });
});


var ENTRIES_PER_PAGE = 10;
function list_players(req, res) {
  var q = {
    limit : ENTRIES_PER_PAGE,   // configure max number of entries.
    stale : false               // We don't want stale views here.
  };

  db.view( "players", "by_name", q).query(function(err, values) {
    var keys = _.pluck(values, 'id');
    db.getMulti( keys, null, function(err, results) {

      // Add the id to the document before sending to template
      var players = _.map(results, function(v, k) {
        v.value.id = k;
        return v.value;
      });
      res.render('players', {user: req.user, 'players':players});
    })
  });
}
app.get('/players', list_players);


function remove_upload(req, res) {
  console.log( req.query.index );
  db.get( req.user.id, function(err, result) {
    if (err) throw err;
    var user = result.value;
    console.log( user );
    if ( req.query.index > -1 ) {
      user.files.splice( req.query.index, 1 );
    }
    console.log( user );
    db.set( req.user.id, user, function(err, result) {
      if (err) throw err;
      res.redirect("back");
    });
  });
}
app.get('/remove_upload', remove_upload);

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
    req.user.player = '';
    req.user.rank = 'player';
    req.user.achievements = ['registered'];

    // var user = {
    //   provider: 'google',
    //   id: 'tdy721@gmail.com',
    //   displayName: 'Taylor Young',
    //   emails: [ { value: 'taylor@reapmarketing.com' } ],
    //   files: [],
    //   player: '',
    //   playerData: {}
    //   rank: 'player',
    //   achievements: ['registered']
    // };

    db.get( req.user.id, function(err, result) {
      if (err) {
        db.set( req.user.id, req.user, function(err, result) {
          if (err) throw err;
          console.log( 'Created A New User: ' + req.user.id );
          res.redirect('/account');
        });
      } else {
        console.log( 'User logged in: ' + req.user.id );
        res.redirect('/account');
      }
    });
  });



app.post('/update_player', ensureAuthenticated, function(req, res){
  console.log( req.body.player );
  console.log( req.body );
  // console.log( req.user );

  db.get( req.user.id, function(err, result) {
    if (err) throw err;
    user = result.value;
    user.player = req.body.player;
    user.displayName = req.body.displayName;
    user.playerData = _.find(ALL_PLAYERS, function(player){ return player.name == user.player; });
    db.set( req.user.id, user, function(err, result) {
      if (err) throw err;
      console.log( 'Updated Profile: ' + req.user.id );
      console.log( user );
      res.redirect('/account');
    });
  });
});

// GET /auth/steam
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  The first step in Steam authentication will involve redirecting
//   the user to steam.com.  After authenticating, Steam will redirect the
//   user back to this application at /auth/steam/return
app.get('/auth/steam',
  passport.authenticate('steam', { failureRedirect: '/login' }),
  function(req, res) {
    res.redirect('/');
  });

// GET /auth/steam/return
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  If authentication fails, the user will be redirected back to the
//   login page.  Otherwise, the primary route function function will be called,
//   which, in this example, will redirect the user to the home page.
app.get('/auth/steam/return',
  passport.authenticate('steam', { failureRedirect: '/login' }),
  function(req, res) {
    req.user.files = [];
    req.user.provider = 'steam';
    req.user.id = req.user.identifier.replace('http://steamcommunity.com/openid/id/','');
    if( req.user.displayName == 'undefined' ) {
      req.user.displayName = 'unknown';
    }
    delete req.user.identifier;
    delete req.user.name;
    req.user.player = '';
    req.user.playerData = '';
    req.user.rank = 'player';
    req.user.achievements = ['registered'];

    // var user = {
    //   provider: 'google',
    //   id: 'tdy721@gmail.com',
    //   displayName: 'Taylor Young',
    //   emails: [ { value: 'taylor@reapmarketing.com' } ],
    //   files: [],
    //   player: '',
    //   playerData: {}
    //   rank: 'player',
    //   achievements: ['registered']
    // };

    db.get( req.user.id, function(err, result) {
      if (err) {
        db.set( req.user.id, req.user, function(err, result) {
          if (err) throw err;
          console.log( 'Created A New User: ' + req.user.id );
          res.redirect('/account');
        });
      } else {
        console.log( 'User logged in: ' + req.user.id );
        res.redirect('/account');
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

function ensureAdminAuthenticated(req, res, next) {
  if ( req.isAuthenticated() && req.user.id === 'tdy721@gmail.com' ) { return next(); }
  res.redirect('/login');
}
