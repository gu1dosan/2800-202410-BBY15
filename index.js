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
const { ObjectId } = require("mongodb");


const expireTime = 60 * 60 * 1000; //expires after 1 hour (minutes * seconds * millis)

const mongodb_host = process.env.MONGODB_HOST;
const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_session_secret = process.env.MONGODB_SESSION_SECRET;
const mongodb_database = process.env.MONGODB_DATABASE;
const node_session_secret = process.env.NODE_SESSION_SECRET;

app.use(express.urlencoded({ extended: false }));
var jsonParser = bodyParser.json()

var { database } = include('databaseConnection');

const userCollection = database.db(mongodb_database).collection('users');
const groupCollection = database.db(mongodb_database).collection('groups');


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

function sessionValidation(req, res, next) {
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
        res.render("errorMessage", { error: "403 - Not Authorized" });
        return;
    }
    else {
        next();
    }
}

app.use((req, res, next) => {
    res.locals.session = req.session;
    next();
});
app.get('/', (req, res) => {
    res.render('index', { session: req.session });
});

app.get('/test', (req, res) => {
    const successMessage = req.query.success === 'true' ? 'Event added successfully' : null;
    res.render('event_submission');
});

// app.use('/test', sessionValidation);
// app.get('/test', (req, res) => {
//     if(!req.session.authenticated) {
//         res.redirect('/login');
//         return;
//     }
//     res.render('event_submission');
// });

app.post('/test', async (req, res) => {
    var title = req.body.eventTitle;
    var description = req.body.description;
    var location = req.body.location;
    var info = req.body.contactInfo;
    var category = req.body.category;

    if (!title || !category) {
        res.send("You must provide a title and category<br/> <a href='/test'>Try again</a>");
        return
    }

    const schema = Joi.object(
        {
            title: Joi.string().max(50).required(),
            description: Joi.string().max(500),
            location: Joi.string().max(50),
            info: Joi.string().max(50),
        });

    const validationResult = schema.validate({ title, description, location, info });

    if (validationResult.error != null) {
        console.log(validationResult.error);
        res.send("/test");
        return;
    }

    const newEvent = {
        title: title,
        description: description,
        location: location,
        info: info,
        category: category,
        submittedBy: req.session.user_ID
    }

    await database.db(mongodb_database).collection('groups').updateOne(
        { _id: ObjectId(groupId) }, // need some way to get the group id
        { $push: { events: newEvent } }
    );

    console.log("Event added");
    res.redirect('/test?success=true');
});



app.get('/signup', (req, res) => {
    if (req.session.authenticated) {
        res.redirect('/');
    } else {
        var missing = {};
        missing.name = req.query.missingName;
        missing.email = req.query.missingEmail;
        missing.password = req.query.missingPassword;
        res.render('signup', { missing: missing });
    }
});
app.post('/signup', async (req, res) => {
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

        const validationResult = schema.validate({ name, email, password });
        if (validationResult.error != null) {
            console.log(validationResult.error);
            res.send(`${validationResult.error.message}<br/> <a href='/signup'>Try again</a>`);
            return;
        }

        var hashedPassword = await bcrypt.hash(password, saltRounds);

        await userCollection.insertOne({ name: name, email: email, user_type: 'user', password: hashedPassword });
        req.session.authenticated = true;
        req.session.email = email;
        req.session.name = name;
        req.session.cookie.maxAge = expireTime;
        res.redirect('/members');
    }
});

app.get('/login', (req, res) => {
    if (req.session.authenticated) {
        res.redirect('/');
    } else {
        res.render('login');
    }
});
app.post('/login', async (req, res) => {
    var email = req.body.email;
    var password = req.body.password;

    const schema = Joi.string().email().required();
    const validationResult = schema.validate(email);
    if (validationResult.error != null) {
        console.log(validationResult.error);
        res.send("You must provide a username and password<br/> <a href='/login'>Try again</a>");
        return;
    }

    const result = await userCollection.find({ email: email }).project({ email: 1, name: 1, user_type: 1, password: 1, _id: 1 }).toArray();

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

app.get('/groups', sessionValidation, async (req, res) => {
    try {
        // Get the email of the current user
        const currentUserEmail = req.session.email;

        // Find all groups where the current user is a member
        const groups = await groupCollection.find({ members: currentUserEmail }).toArray();

        // Render groups page and pass the groups data to the template
        res.render('groups', { session: req.session, groups: groups });
        
    } catch (error) {
        console.error('Error fetching groups:', error);
        res.status(500).send('Error fetching groups.');
    }
});


app.post('/createGroup', sessionValidation, async (req, res) => {
    try {
        // Extract group name and user emails from the request body
        const { name, emails } = req.body;

        // Split the emails string into an array of email addresses
        const emailArray = emails.split(/[;,]+/).map(email => email.trim());

        // Get the email of the user who is creating the group
        const creatorEmail = req.session.email;

        // Check if all entered emails are associated with users in the database
        const invalidEmails = [];
        const validEmails = [];
        for (const email of emailArray) {
            const user = await userCollection.findOne({ email });
            if (!user) {
                invalidEmails.push(email);
            } else {
                validEmails.push(email);
            }
        }

        // Create a new group object using only the valid emails
        const newGroup = {
            name: name,
            members: [creatorEmail, ...validEmails] // Include the creator's email in the members array
        };

        // Insert the new group document into the groups collection
        const result = await groupCollection.insertOne(newGroup);

        console.log('New group created:', result.insertedId);

        // Redirect to the confirmation page and pass necessary data
        res.redirect('/groupConfirmation?error=false&invalidEmails=' + encodeURIComponent(JSON.stringify(invalidEmails)));
    } catch (error) {
        console.error('Error creating group:', error);
        res.redirect('/groupConfirmation?error=true&message=' + encodeURIComponent('Error creating group.'));
    }
});

app.get('/groupConfirmation', sessionValidation, (req, res) => {
    const error = req.query.error === 'true';
    const message = req.query.message;
    const invalidEmails = req.query.invalidEmails ? JSON.parse(req.query.invalidEmails) : [];

    res.render('GroupCreationConfirmation', { error, message, invalidEmails });
});


app.get('/group',sessionValidation ,async (req, res) => {
    try {
        const groupId = req.query.id; // Assuming the query parameter is named "id"
        const group = await groupCollection.findOne({ _id: new ObjectId(groupId) });

        if (!group) {
            // Group not found
            res.status(404).send('Group not found.');
            return;
        }

        // Render the group details page with the retrieved group
        res.render('groupDetails', { group });
    } catch (error) {
        console.error('Error fetching group details:', error);
        res.status(500).send('Error fetching group details.');
    }
});

app.post('/invite', sessionValidation, async (req, res) => {
    try {
        const groupId = req.query.groupId; // Get the group ID from the query parameter
        const { emails } = req.body; // Get the emails from the request body

        // Split the emails string into an array of email addresses
        const emailArray = emails.split(/[;,]+/).map(email => email.trim());

        // Check each email individually
        const invalidEmails = [];
        const existingMembers = [];
        const validEmails = [];
        for (const email of emailArray) {
            // Check if the email exists in the userCollection
            const user = await userCollection.findOne({ email });
            if (!user) {
                // If the user doesn't exist, add the email to the list of invalid emails
                invalidEmails.push(email);
            } else {
                // Check if the user is already a member of the group
                const group = await groupCollection.findOne({ _id: new ObjectId(groupId), members: email });
                if (group) {
                    // If the user is already a member, add the email to the list of existing members
                    existingMembers.push(email);
                } else {
                    // If the user exists and is not already a member, add the email to the list of valid emails
                    validEmails.push(email);
                }
            }
        }

        // Update the group document to add the new members
        const result = await groupCollection.updateOne(
            { _id: new ObjectId(groupId) },
            { $addToSet: { members: { $each: validEmails } } }
        );

        // Prepare the message to be passed to the InviteConfirmation page
        const inviteMessage = {
            success: validEmails.length > 0 ? 'Users were successfully added.' : '',
            existingMembers: existingMembers.map(email => `${email} is already a member.`),
            invalidEmails: invalidEmails.map(email => `${email} is not associated with any user.`),
            groupID: groupId
        };

        // Render the InviteConfirmation page with the appropriate message
        res.render('InviteConfirmation', { inviteMessage });
    } catch (error) {
        console.error('Error inviting users to group:', error);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});


app.get('/admin', sessionValidation, adminAuthorization, async (req, res) => {
    const result = await userCollection.find().toArray();
    // console.log(result)
    res.render("admin", { users: result });
});


app.post('/promoteToAdmin', sessionValidation, adminAuthorization, jsonParser, async (req, res) => {
    // console.log(req.body)
    // console.log("promoting " + req.body.id + " to admin")
    const result = await userCollection.updateOne({ _id: new ObjectId(req.body.id) }, { $set: { user_type: 'admin' } });
    // console.log(result)
    res.send({ success: true });
});
app.post('/demoteToUser', sessionValidation, adminAuthorization, jsonParser, async (req, res) => {
    await userCollection.updateOne({ _id: new ObjectId(req.body.id) }, { $set: { user_type: 'user' } });
    res.send({ success: true });
});

app.get('/logout', (req, res) => {
    if (req.session.authenticated) {
        req.session.destroy();
        res.redirect("/");
    } else
        res.redirect("/");
});

app.use(express.static(__dirname + "/public"));

app.get("*", (req, res) => {
    res.status(404);
    res.render("404");
})

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});