const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
require('dotenv').config();
const bcrypt = require('bcrypt');
require("./utils.js");
var bodyParser = require('body-parser')
const crypto = require("crypto");

const app = express();
const port = process.env.PORT || 3000;

const Joi = require("joi");
const {ObjectId} = require("mongodb");
const sendEmail = require('./utils/sendEmail.js');

const expireTime = 15 * 24 * 60 * 60 * 1000; //expires after 15 days

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
const pwRecoveryTokensCollection = database.db(mongodb_database).collection('pwRecoveryTokens');

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
    if (isValidSession(req)){
        return next();
    } else {
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
    } else {
        next();
    }
}

app.use((req,res,next) => {
    res.locals.session = req.session;
    next();
});

app.get('/', sessionValidation, (req, res) => {
    res.render('index',{session:req.session});
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
    
        var hashedPassword = await bcrypt.hash(password, Number(process.env.SALTROUNDS));
        
        await userCollection.insertOne({name: name, email:email, user_type: 'user', password: hashedPassword});
        req.session.authenticated = true;
        req.session.email = email;
        req.session.name = name;
        req.session.cookie.maxAge = expireTime;
        res.redirect('/');
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

		res.redirect('/');
		return;
	} else {
		// console.log("incorrect password");
		res.send("Invalid email/password combination<br/> <a href='/login'>Try again</a>");
		return;
	}
});

app.get('/password-reset', (req, res) => {
    if(req.session.authenticated) {
        res.redirect('/');
    } else {
        res.render('passwordReset',{success:false});
    }
});
app.post("/password-reset", async (req, res) => {
    try {
        const schema = Joi.object({ email: Joi.string().email().required() });
        const { error } = schema.validate(req.body);
        if (error) return res.status(400).send(error.details[0].message);

        const user = await userCollection.findOne({ email: req.body.email });
        if (!user)
            return;

        let token = await pwRecoveryTokensCollection.findOne({ userId: user._id });
        if(token){
            await pwRecoveryTokensCollection.deleteOne({userId: user._id});
        } 
        const newToken = crypto.randomBytes(32).toString("hex")
        await pwRecoveryTokensCollection.insertOne({userId:user._id, token: newToken,createdAt: Date.now()});
        
        const link = `${process.env.BASE_URL}/password-reset/${user._id}/${newToken}`;
        await sendEmail(user.email, "NextUp Password Link", link);
        return res.render("passwordReset",{success:true, email: user.email});
    } catch (error) {
        console.log(error);
        return res.render('passwordReset',{success:false});
    }
});

app.get("/password-reset/:userId/:token", async (req, res) => {
    // Check if the token exists and is still valid
    const user = await userCollection.findOne({_id: new ObjectId(req.params.userId)});
    if (!user) return res.status(400).send("invalid link or expired");
    const token = await pwRecoveryTokensCollection.findOne({
        userId: user._id,
        token: req.params.token,
    });
    if (!token) return res.status(400).send("Invalid link or expired");
    res.render('passwordResetForm',{userId: req.params.userId, token: req.params.token, success:false});
});
app.post("/password-reset/:userId/:token", async (req, res) => {
    try {
        const schema = Joi.object({ password: Joi.string().required() });
        const { error } = schema.validate(req.body);
        if (error) return res.status(400).send(error.details[0].message);

        const user = await userCollection.findOne({_id: new ObjectId(req.params.userId)});
        if (!user) return res.status(400).send("invalid link or expired");

        const token = await pwRecoveryTokensCollection.findOne({
            userId: user._id,
            token: req.params.token,
        });
        if (!token) return res.status(400).send("Invalid link or expired");

        var hashedPassword = await bcrypt.hash(req.body.password, Number(process.env.SALTROUNDS));
        await userCollection.updateOne({_id: new ObjectId(req.params.userId)}, {$set: {password: hashedPassword}});
        await pwRecoveryTokensCollection.deleteOne({
            userId: user._id,
            token: req.params.token,
        })

        return res.render('passwordResetForm',{success:true});
    } catch (error) {
        console.log(error);
        return res.send("An error occured");
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

app.get('/logout', sessionValidation, (req, res) => {
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