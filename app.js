//jshint esversion:6


// // ************************* Modules *************************
require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const _ = require("lodash");
const mongoose = require("mongoose");

// Session and Passport:
const session = require("express-session");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");

// Require OAuth 2.0
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const findOrCreate = require('mongoose-findorcreate');

// // ************************* Mongoose & Passport *************************
mongoose.connect(process.env.DB_URL);

// Items
const itemSchema = new mongoose.Schema ({
  name: {
    type: String,
    required: [true]
  }
});

const Item = mongoose.model("Item", itemSchema);

const item1 = new Item ({
  name: "Item 1"
});

const item2 = new Item ({
  name: "Item 2"
});

const item3 = new Item ({
  name: "Item 3"
});

const defaultItems = [item1, item2, item3];


// Lists
const listSchema = new mongoose.Schema ({
  name: String,
  userId: String,
  items: [itemSchema]
});

const List = mongoose.model("List", listSchema);

// Users
const userSchema = new mongoose.Schema ({
  username: String,
  password: String,
  googleId: String,
  lists: [listSchema]
});

// Plugin to connect Passport to local Mongoose DB
userSchema.plugin(passportLocalMongoose);
// Plugin for OAuth 2.0
userSchema.plugin(findOrCreate);

const User = new mongoose.model("User", userSchema);

// Passport config
passport.use(User.createStrategy());

// Passport authentication for all types of auth
passport.serializeUser(function(user, done) {
  done(null, user.id);
});
passport.deserializeUser(function(id, done) {
  User.findById(id, function(err, user) {
    done(err, user);
  });
});

// Set OAuth 2.0 for Google
passport.use(new GoogleStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/user",
    userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
  },
  function(accessToken, refreshToken, profile, cb) {
    User.findOrCreate({ googleId: profile.id, username: _.snakeCase(profile.displayName) }, function (err, user) {
      return cb(err, user);
    });
  }
));


// ************************* Init *************************
// App Init
const app = express();
app.set('view engine', 'ejs');
app.use(express.static("public"));
app.use(bodyParser.urlencoded({extended: true}));

// Session Init
app.use(session({
  secret: "cookie_secret",
  resave: false,
  saveUninitialized: false
}));

// Passport Init
app.use(passport.initialize());
app.use(passport.session());

// Functions
function findAndRender(req, res, ejsFile) {
  if (req.isAuthenticated()) {
    List.find({userId: req.user.id}, function(err, foundLists) {
      if (err) {
        res.send(err);
      }
      console.log(foundLists);
      res.render(ejsFile, {isLoggedIn: req.isAuthenticated(), userLists: foundLists});
    });
  } else {
    res.render(ejsFile, {isLoggedIn: req.isAuthenticated()});
  }
}


// ************************* Routes *************************
app.get("/", function(req, res) {
  if (req.isAuthenticated()) {
    findAndRender(req, res, "user");
  } else {
    findAndRender(req, res, "about");
  }
});

// Authentication Routes
app.get("/auth/google",
    passport.authenticate("google", { scope: ["profile"] })
);

app.get('/auth/google/user',
  passport.authenticate('google', { failureRedirect: '/login' }),
  function(req, res) {
    res.redirect('/user');
});


app.get("/register", function(req, res) {
  if (req.isAuthenticated()) {
    res.redirect("/user");
  } else {
    findAndRender(req, res, "register");
  }
});

app.post("/register", function(req, res) {
  User.register({username: req.body.username}, req.body.password, function(err, user){
    if (err) {
      console.log(err);
      res.redirect("/register");
    } else {
      passport.authenticate("local")(req, res, function(){
        res.redirect("/user");
      });
    }
  });
});

app.get("/login", function(req, res) {
  if (req.isAuthenticated()) {
    res.redirect("/user");
  } else {
    findAndRender(req, res, "login");
  }
});

app.post("/login", function(req, res) {
  const userToBeChecked = new User({
    username: req.body.username,
    password: req.body.password
  });
  req.login(userToBeChecked, function(err) {
    if (err) {
      console.log(err);
      res.send(err);
    } else {
      passport.authenticate("local")(req, res, function() {
        res.redirect("/user");
      });
    }
  });
});

app.get("/logout", function(req, res) {
  req.logout();
  res.redirect("/");
});

//  User Routes

app.get("/user", function(req, res) {
  if (req.isAuthenticated()) {
    findAndRender(req, res, "user");
  } else {
    findAndRender(req, res, "login");
  }
});

app.get("/add", function(req, res) {
  if (req.isAuthenticated()) {
    findAndRender(req, res, "add");
  } else {
    findAndRender(req, res, "login");
  }
});

app.post("/add", function(req, res) {
  res.redirect(`/lists/${_.kebabCase(req.body.listName)}`);
});

app.post("/delete", function(req, res) {
  if (req.isAuthenticated()) {

    const listName = _.kebabCase(req.body.list);
    const checkedItemId = req.body.deleteItem;
    List.findOneAndUpdate(
      { userId: req.user.id, name: listName},
      {$pull: {items: {_id: checkedItemId}}},
      function(err, results){
        if (err) {
          console.log(err);
          res.send(err);
        }
        res.redirect(`/lists/${listName}`);
    });

  }
});

app.post("/delete-list", function(req, res) {
  if (req.isAuthenticated()) {

    const listName = _.kebabCase(req.body.list);
    List.findOneAndDelete(
      { userId: req.user.id, name: listName},
      function(err, results){
        if (err) {
          console.log(err);
          res.send(err);
        }
        res.redirect(`/user`);
    });

  }
});

// Dynamic Routes
app.get("/lists/:customListName", function(req, res) {
  if (req.isAuthenticated()) {

    const customListName = _.kebabCase(req.params.customListName);

    List.findOne({ userId: req.user.id, name: customListName}, function (err, foundList) {
      if (err) {
        console.log(err);
        res.send(err);
      } else if (foundList) {
        List.find({userId: req.user.id}, function(err, foundLists) {
          if (err) {
            res.send(err);
          }
          res.render("list", {
            listTitle: _.startCase(customListName),
            items: foundList.items,
            isLoggedIn: req.isAuthenticated(),
            userLists: foundLists
          });
        });
      } else {
        const list = new List({
          name: customListName,
          items: defaultItems,
          userId: req.user.id
        });
        list.save();
        res.redirect(`/lists/${customListName}`);
      }
    });
  }
});

app.post("/lists/:customListName", function(req, res) {
  if (req.isAuthenticated()) {

    const customListName = _.kebabCase(req.params.customListName);
    const newItem = new Item ({
      name: req.body.addItem
    });

    List.updateOne(
      { userId: req.user.id, name: customListName },
      { $push: { items: newItem } },
      function(err) {
        if (err) {
          console.log(err);
          res.send(err);
        }
        res.redirect(`/lists/${customListName}`)
    });

  }
});


// ************************* Start App *************************
app.listen(process.env.PORT || 3000, function() {
  console.log("Server started on port 3000.");
});
