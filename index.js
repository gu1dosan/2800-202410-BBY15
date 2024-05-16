const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
require('dotenv').config();
const bcrypt = require('bcrypt');
const saltRounds = 12;
require("./utils.js");
var bodyParser = require('body-parser')

const app = express();
const port = process.env.PORT || 3000;

const Joi = require("joi");
const {ObjectId} = require("mongodb");

const expireTime = 60 * 60 * 1000; //expires after 1 hour (minutes * seconds * millis)

const mongodb_host = process.env.MONGODB_HOST;
const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_session_secret = process.env.MONGODB_SESSION_SECRET;
const mongodb_database = process.env.MONGODB_DATABASE;
const node_session_secret = process.env.NODE_SESSION_SECRET;

app.use(express.urlencoded({extended: false}));
var jsonParser = bodyParser.json()

var {database} = include('databaseConnection');

const userCollection = database.db(mongodb_database).collection('users');

var mongoStore = MongoStore.create({
	mongoUrl: `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}/${mongodb_database}`,
    collectionName: 'sessions',
    crypto: {
		secret: mongodb_session_secret
	}
})

app.set('view engine', 'ejs');

app.use(session({ 
    secret: node_session_secret,
	store: mongoStore, //default is memory store 
	saveUninitialized: false, 
	resave: true
}));

function isValidSession(req) {
    if (req.session.authenticated) {
        return true;
    }
    return false;
}

function sessionValidation(req,res,next) {
    if (isValidSession(req)) {
        next();
    }
    else {
        res.redirect('/login');
    }
}

function isAdmin(req) {
    if (req.session.user_type == 'admin') {
        return true;
    }
    return false;
}

function adminAuthorization(req, res, next) {
    if (!isAdmin(req)) {
        res.status(403);
        res.render("errorMessage", {error: "403 - Not Authorized"});
        return;
    }
    else {
        next();
    }
}

app.use((req,res,next) => {
    res.locals.session = req.session;
    next();
});
app.get('/', (req, res) => {
    res.render('index',{session:req.session});
});

app.get('/profile', (req, res) => {

        const name = "victor"; 
        res.render(`profile`, { name });
});

const activities = [
    "Go to the movies",
    "Picnic in the park",
    "Visit a museum",
    "Bowling night",
    "Hiking adventure"
];

app.get('/activityRandomizer', (req, res) => {
    // Randomly select an activity
    const randomActivity = activities[Math.floor(Math.random() * activities.length)];
    res.json({ activity: randomActivity });
});

app.get('/signup', (req, res) => {
    if(req.session.authenticated) {
        res.redirect('/');
    } else {
        var missing={};
        missing.name = req.query.missingName;
        missing.email = req.query.missingEmail;
        missing.password = req.query.missingPassword;
        res.render('signup',{missing:missing});
    }
});
app.post('/signup', async (req,res) => {
    var name = req.body.name;
    var email = req.body.email;
    var password = req.body.password;
    if (!name || !email || !password) {
        res.redirect(`/signup?${!name && '&missingName=1'}${!email && '&missingEmail=1'}${!password && '&missingPassword=1'}`);
    } else {
        const schema = Joi.object({
            name: Joi.string().alphanum().max(20).required(),
            email: Joi.string().email().required(),
            password: Joi.string().max(20).required()
        });
        
        const validationResult = schema.validate({name, email, password});
        if (validationResult.error != null) {
           console.log(validationResult.error);
           res.send(`${validationResult.error.message}<br/> <a href='/signup'>Try again</a>`);
           return;
       }
    
        var hashedPassword = await bcrypt.hash(password, saltRounds);
        
        await userCollection.insertOne({name: name, email:email, user_type: 'user', password: hashedPassword});
        req.session.authenticated = true;
        req.session.email = email;
        req.session.name = name;
        req.session.cookie.maxAge = expireTime;
        res.redirect('/members');
    }
});

app.get('/login', (req, res) => {
    if(req.session.authenticated) {
        res.redirect('/');
    } else {
        res.render('login');
    }
});
app.post('/login', async (req,res) => {
    var email = req.body.email;
    var password = req.body.password;

    const schema = Joi.string().email().required();
	const validationResult = schema.validate(email);
	if (validationResult.error != null) {
	   console.log(validationResult.error);
	   res.send("You must provide a username and password<br/> <a href='/login'>Try again</a>");
	   return;
	}

	const result = await userCollection.find({email: email}).project({email: 1, name:1, user_type:1, password: 1, _id: 1}).toArray();

	// console.log(result);
	if (result.length != 1) {
		// console.log("user not found");
		res.send("Invalid email/password combination<br/> <a href='/login'>Try again</a>");
		return;
	}
	if (await bcrypt.compare(password, result[0].password)) {
		// console.log("correct password");
		req.session.authenticated = true;
        req.session.email = email;
        req.session.name = result[0].name;
        req.session.user_type = result[0].user_type;
        req.session.cookie.maxAge = expireTime;

		res.redirect('/members');
		return;
	} else {
		// console.log("incorrect password");
		res.send("Invalid email/password combination<br/> <a href='/login'>Try again</a>");
		return;
	}
});

app.get('/members', sessionValidation, (req, res) => {
        res.render('members',{session:req.session});
});

app.get('/admin', sessionValidation, adminAuthorization , async (req,res) => {
    const result = await userCollection.find().toArray();
    // console.log(result)
    res.render("admin", {users: result});
});

app.post('/promoteToAdmin', sessionValidation, adminAuthorization, jsonParser, async (req,res) => {
    // console.log(req.body)
    // console.log("promoting " + req.body.id + " to admin")
    const result = await userCollection.updateOne({_id: new ObjectId(req.body.id)}, {$set: {user_type: 'admin'}});
    // console.log(result)
    res.send({success: true});
});
app.post('/demoteToUser', sessionValidation, adminAuthorization, jsonParser, async (req,res) => {
    await userCollection.updateOne({_id: new ObjectId(req.body.id)}, {$set: {user_type: 'user'}});
    res.send({success: true});
});

app.get('/logout', (req, res) => {
    if(req.session.authenticated) {
        req.session.destroy();
        res.redirect("/");
    } else
        res.redirect("/");
});

app.use(express.static(__dirname + "/public"));

app.get("*", (req,res) => {
	res.status(404);
	res.render("404");
})

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});