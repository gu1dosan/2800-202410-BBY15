const express = require("express");
const session = require("express-session");
const MongoStore = require("connect-mongo");
require("dotenv").config();
const bcrypt = require("bcrypt");
require("./utils.js");
var bodyParser = require("body-parser");
const crypto = require("crypto");

const app = express();
const port = process.env.PORT || 3000;

const Joi = require("joi");
const { ObjectId } = require("mongodb");
const sendEmail = require("./utils/sendEmail.js");

const expireTime = 15 * 24 * 60 * 60 * 1000; //expires after 15 days

const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;

const cloudinary = require("cloudinary");
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_CLOUD_KEY,
  api_secret: process.env.CLOUDINARY_CLOUD_SECRET,
});

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
const pwRecoveryTokensCollection = database.db(mongodb_database).collection('pwRecoveryTokens');
const groupCollection = database.db(mongodb_database).collection('groups');



var mongoStore = MongoStore.create({
    mongoUrl: `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}/${mongodb_database}`,
    collectionName: 'sessions',
    crypto: {
        secret: mongodb_session_secret
    }
})

app.set("view engine", "ejs");

app.use(
  session({
    secret: node_session_secret,
    store: mongoStore, //default is memory store 
    saveUninitialized: false,
    resave: true,
    maxAge: expireTime,
}));

function isValidSession(req) {
  if (req.session.authenticated) {
    return true;
  }
  return false;
}

function sessionValidation(req, res, next) {
  if (isValidSession(req)) {
    return next();
  } else {
    res.redirect("/login");
  }
}


async function isAdmin(userEmail, groupId) {
  try {
    // Find the group with the specified ID
    const group = await groupCollection.findOne({ _id: new ObjectId(groupId) });

    // Check if the group exists and if the email is in the admin array
    if (group && group.admin.includes(userEmail)) {
      return true;
    }
    return false;
  } catch (error) {
    console.error("Error checking admin status:", error);
    return false;
  }
}

async function getUserDetails(emails, groupId) {
    try {
        // Find users with matching email addresses
        const users = await userCollection.find({ email: { $in: emails } }).toArray();

        // Initialize an array to store user details
        const userDetails = [];

        // Retrieve the group information
        const group = await groupCollection.findOne({ _id: new ObjectId(groupId) });
        console.log(group);

        // Iterate over each user and check if they are admins
        for (const user of users) {
            const isAdmin = group.admin.includes(user.email);
            userDetails.push({ id: user._id.toString(), name: user.name, isAdmin, email: user.email });
        }

        return userDetails;
    } catch (error) {
        console.error("Error fetching user details:", error);
        return [];
    }

}






// function adminAuthorization(req, res, next) {
//     if (!isAdmin(req)) {
//         res.status(403);
//         res.render("errorMessage", { error: "403 - Not Authorized" });
//         return;
//     } else {
//         next();
//     }
// }

app.use((req, res, next) => {
    res.locals.session = req.session;
    res.locals.pathname = req.url;
    next();
  });

app.get("/test", (req, res) => {
  res.render("test");
});

app.get("/", sessionValidation, (req, res) => {
  res.redirect("/groups");
});

app.get('/signup', (req, res) => { 
    if (req.session.authenticated) { 
        res.redirect('/'); 
    } else { 
        res.render('signup'); 
    } 
}); 
app.post('/signup', async (req, res) => { 
    var name = req.body.name; 
    var email = req.body.email; 
    var password = req.body.password; 
    var confirmPassword = req.body.confirmPassword; 
    if (!name || !email || !password || !confirmPassword) { 
        res.render('signup',{missing:{name: !name, email: !email, password: !password, confirmPassword: !confirmPassword},formData:{name: name, email: email, password: password, confirmPassword: confirmPassword}}); 
    } else { 
        const schema = Joi.object({ 
            name: Joi.string().alphanum().max(20).required(), 
            email: Joi.string().email().required(), 
            password: Joi.string().max(20).required(), 
            confirmPassword: Joi.ref('password'), 
        }); 
         
        const validationResult = schema.validate({name, email, password, confirmPassword}); 
        if (validationResult.error != null) { 
            // console.log(validationResult.error); 
            let error = validationResult.error.message; 
            if(error==="\"email\" must be a valid email") error = "Email is not valid"; 
            if(error==="\"confirmPassword\" must be [ref:password]") error = "Passwords do not match, try again"; 
            return res.render('signup',{error: error,formData:{name: name, email: email, password: password, confirmPassword: confirmPassword}});  
        } 
     
        var hashedPassword = await bcrypt.hash(password, Number(process.env.SALTROUNDS)); 
         
        await userCollection.insertOne({name: name, email:email, user_type: 'user', password: hashedPassword}); 
        req.session.authenticated = true; 
        req.session.email = email; 
        req.session.name = name; 
        req.session.cookie.maxAge = expireTime; 
        return res.redirect('/'); 
    } 
}); 
 
app.get('/login', (req, res) => { 
    if(req.session.authenticated) { 
        return res.redirect('/'); 
    } else { 
        // if(req.query.error == 'noemailorpw') { 
        //     return res.render('login',{error: 'You must enter an email and password'}); 
        // } 
        // if(req.query.error == 'invaliddetails') { 
        //     return res.render('login',{error: 'Invalid email or password'}); 
        // } 
        res.render('login'); 
    } 
}); 
app.post('/login', async (req, res) => { 
    var email = req.body.email; 
    var password = req.body.password; 
    if (!email || !password) { 
        return res.render('login',{error: 'You must enter an email and password',formData:{email: email, password: password}}); 
    } 
 
    const schema = Joi.string().email().required(); 
	const validationResult = schema.validate(email); 
	if (validationResult.error != null) { 
	//    console.log(validationResult.error); 
	//    return res.redirect('/login?error=noemailorpw'); 
        return res.render('login',{error: 'Invalid email or password',formData:{email: email, password: password}}); 
	} 
 
    const result = await userCollection.find({ email: email }).project({ email: 1, name: 1, user_type: 1, password: 1, _id: 1 }).toArray(); 
 
	// console.log(result); 
	if (result.length != 1) { 
		// console.log("user not found"); 
        // return res.redirect('/login?error=invaliddetails'); 
        return res.render('login',{error: 'Invalid email or password'}); 
	} 
	if (await bcrypt.compare(password, result[0].password)) { 
		// console.log("correct password"); 
		req.session.authenticated = true; 
        req.session.email = email; 
        req.session.name = result[0].name; 
        req.session.user_type = result[0].user_type; 
        req.session.cookie.maxAge = expireTime; 
 
		return res.redirect('/'); 
	} else { 
		// console.log("incorrect password"); 
		return res.render('login',{error: 'Invalid email or password'}); 
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
        if (error) return res.render('passwordReset',{error: 'Email is not valid',formData:{email: req.body.email}}); 
 
        const user = await userCollection.findOne({ email: req.body.email }); 
        if (!user) 
            return res.render("passwordReset",{success:true, email: req.body.email}); 
 
        let token = await pwRecoveryTokensCollection.findOne({ userId: user._id }); 
        if(token){ 
            await pwRecoveryTokensCollection.deleteOne({userId: user._id}); 
        }  
        let newToken = crypto.randomBytes(32).toString("hex") 
        await pwRecoveryTokensCollection.insertOne({userId:user._id, token: newToken,createdAt: Date.now()}); 
        const link = `${process.env.BASE_URL}/password-reset/${user._id}/${newToken}`; 
        let emailContent = `Hi ${user.name}, Click this link to reset your NextUp password:\n\n${link}\n\nIf you didn't request this, you can safely ignore this email.` 
        await sendEmail(user.email, "NextUp Password Link", emailContent); 
 
        return res.render("passwordReset",{success:true, email: user.email}); 
    } catch (error) { 
        // console.log(error); 
        return res.render('passwordReset',{success:false, error:error}); 
    } 
}); 
 
app.get("/password-reset/:userId/:token", async (req, res) => { 
    if(req.session.authenticated) { 
        res.redirect('/'); 
    } else { 
        // Check if the token exists and is still valid 
        const user = await userCollection.findOne({_id: new ObjectId(req.params.userId)}); 
        if (!user) return res.render('passwordResetForm',{error:'Invalid link or expired', userId: req.params.userId, token: req.params.token}); 
        const token = await pwRecoveryTokensCollection.findOne({ 
            userId: user._id, 
            token: req.params.token, 
        }); 
        if (!token) return res.render('passwordResetForm',{error:'Invalid link or expired', userId: req.params.userId, token: req.params.token}); 
        return res.render('passwordResetForm',{userId: req.params.userId, token: req.params.token}); 
    } 
}); 
app.post("/password-reset/:userId/:token", async (req, res) => { 
    try { 
        const schema = Joi.object({ password: Joi.string().required(), confirmPassword: Joi.ref('password')}); 
        let validationResult = schema.validate(req.body); 
        if (validationResult.error != null) { 
            let error = validationResult.error.message; 
            // console.log(error) 
            if(error==="\"confirmPassword\" must be [ref:password]") { 
                error = "Passwords do not match, try again" 
            } else error = "Invalid password";  
            return res.render('passwordResetForm',{error:error, userId: req.params.userId, token: req.params.token,formData:{password: req.body.password, confirmPassword: req.body.confirmPassword}}); 
        } 
        const user = await userCollection.findOne({_id: new ObjectId(req.params.userId)}); 
        if (!user) return res.render('passwordResetForm',{error:'Invalid link or expired', userId: req.params.userId, token: req.params.token}); 
 
        const token = await pwRecoveryTokensCollection.findOne({ 
            userId: user._id, 
            token: req.params.token, 
        }); 
        if (!token) return res.render('passwordResetForm',{error:'Invalid link or expired', userId: req.params.userId, token: req.params.token}); 
 
        var hashedPassword = await bcrypt.hash(req.body.password, Number(process.env.SALTROUNDS)); 
        await userCollection.updateOne({_id: new ObjectId(req.params.userId)}, {$set: {password: hashedPassword}}); 
        await pwRecoveryTokensCollection.deleteOne({ 
            userId: user._id, 
            token: req.params.token, 
        }) 
 
        return res.render('passwordResetForm',{success:true}); 
    } catch (error) { 
        console.log(error); 
        return res.render('passwordResetForm',{error:error, userId: req.params.userId, token: req.params.token,formData:{password: req.body.password, confirmPassword: req.body.confirmPassword}}); 
    } 
}); 

app.get("/profile", (req, res) => {
    var name = req.session.name;
    var biography = req.session.biography;
  
    res.render(`profile`, { name, biography });
  });
  
// GET handler for displaying the form
app.get("/editProfile", (req, res) => {
if (!req.session.name) {
    return res.redirect("/login"); // Redirect if the user is not logged in
}
res.render("editProfile", { name: req.session.name });
});

app.get("/groups", sessionValidation, async (req, res) => {
  try {
    // Get the email of the current user
    const currentUserEmail = req.session.email;

    // Find all groups where the current user is a member
    const groups = await groupCollection
      .find({ members: currentUserEmail })
      .toArray();

    // Render groups page and pass the groups data to the template
    res.render("groups", { session: req.session, groups: groups });
  } catch (error) {
    console.error("Error fetching groups:", error);
    res.status(500).send("Error fetching groups.");
  }
});

app.post("/createGroup", sessionValidation, async (req, res) => {
    try {
        // Extract group name and user emails from the request body
        const { name, emails } = req.body;

        // Initialize arrays for valid and invalid emails
        const invalidEmails = [];
        const validEmails = [];

        // Split the emails string into an array of email addresses if the field is not empty
        if (emails) {
            const emailArray = emails.split(/[;,]+/).map((email) => email.trim());

            // Check if all entered emails are associated with users in the database
            for (const email of emailArray) {
                const user = await userCollection.findOne({ email });
                if (!user) {
                    invalidEmails.push(email);
                } else {
                    validEmails.push(email);
                }
            }
        }

        // Get the email of the user who is creating the group
        const creatorEmail = req.session.email;

        // Create a new group object using only the valid emails
        const newGroup = {
            name: name,
            members: [creatorEmail, ...validEmails], // Include the creator's email in the members array
            admin: [creatorEmail]
        };

        // Insert the new group document into the groups collection
        const result = await groupCollection.insertOne(newGroup);

        console.log("New group created:", result.insertedId);

        // Prepare the query parameters for the redirect
        let queryParams = "?error=false";

        if (invalidEmails.length > 0) {
            queryParams += "&invalidEmails=" + encodeURIComponent(JSON.stringify(invalidEmails));
        }

        // Redirect to the confirmation page with the appropriate query parameters
        res.redirect("/groupConfirmation" + queryParams);
    } catch (error) {
        console.error("Error creating group:", error);
        res.redirect(
            "/groupConfirmation?error=true&message=" +
            encodeURIComponent("Error creating group.")
        );
    }
});

  

app.get("/groupConfirmation", sessionValidation, (req, res) => {
  const error = req.query.error === "true";
  const message = req.query.message;
  const invalidEmails = req.query.invalidEmails
    ? JSON.parse(req.query.invalidEmails)
    : [];

  res.render("GroupCreationConfirmation", { error, message, invalidEmails });
});

app.get("/group/:groupId", sessionValidation, async (req, res) => {
  try {
    const groupId = req.params.groupId;
    const group = await groupCollection.findOne({ _id: new ObjectId(groupId) });

    if (!group) {
      // Group not found
      res.status(404).send("Group not found.");
      return;
    }

    // Render the group details page with the retrieved group
    res.render("group", { group });
  } catch (error) {
    console.error("Error fetching group details:", error);
    res.status(500).send("Error fetching group details.");
  }
});

app.get("/group-details/:groupId", sessionValidation, async (req, res) => {
    try {
        const groupId = req.params.groupId;
        const group = await groupCollection.findOne({ _id: new ObjectId(groupId) });
        const userEmail = req.session.email;
        const adminStatus = await isAdmin(userEmail, groupId);
        
        if (adminStatus) {
            // User is an admin, proceed with admin-specific logic
            console.log("You are an admin for this group.");
        } else {
            // User is not an admin
            console.log("You are not an admin for this group.");
        }

        if (!group) {
            // Group not found
            res.status(404).send("Group not found.");
            return;
        }
  
        // Retrieve user details (including id and name) for the members of the group
        const memberEmails = group.members;
        const memberDetails = await getUserDetails(memberEmails, groupId);
        console.log(memberDetails);
        
        // Render the group details page with the retrieved group and member details
        res.render("groupDetails", { group, isAdmin: adminStatus, memberDetails});
    } catch (error) {
        console.error("Error fetching group details:", error);
        res.status(500).send("Error fetching group details.");
    }
});



  app.post("/edit-group-name", sessionValidation, async (req, res) => {
    try {
        const groupId = req.query.groupId;
        const newName = req.body.newName;

        // Update the group name in the MongoDB collection
        await groupCollection.updateOne(
            { _id: new ObjectId(groupId) },
            { $set: { name: newName } }
        );

        // Redirect to the group details page
        res.redirect(`/group-details/${groupId}`);
    } catch (error) {
        console.error("Error updating group name:", error);
        res.status(500).send("Error updating group name.");
    }
});


app.get("/delete-group", sessionValidation, async (req, res) => {
    const groupId = req.query.groupId;

    try {
        // Delete the group from the groups collection
        await groupCollection.deleteOne({ _id: new ObjectId(groupId) });
        console.log(`Group with ID ${groupId} deleted`);

        // Redirect to the groups page
        res.redirect("/groups");
    } catch (error) {
        console.error("Error deleting group:", error);
        res.redirect("/groups?error=true&message=" + encodeURIComponent("Error deleting group."));
    }
});

app.get("/leave-group", sessionValidation, async (req, res) => {
    const groupId = req.query.groupId;
    const userEmail = req.session.email; // Assuming the user's email is stored in the session

    try {
        // Remove the user's email from the group's members array
        await groupCollection.updateOne(
            { _id: new ObjectId(groupId) },
            { $pull: { members: userEmail } }
        );
        console.log(`User ${userEmail} removed from group with ID ${groupId}`);

        // Redirect to the groups page
        res.redirect("/groups");
    } catch (error) {
        console.error("Error leaving group:", error);
        res.redirect("/groups?error=true");
    }
});

app.delete("/remove-member", sessionValidation, async (req, res) => {
    const groupId = req.query.groupId;
    const userId = req.query.userId;

    try {
        // Find the user by userId to get the email
        const user = await userCollection.findOne({ _id: new ObjectId(userId) });

        if (!user) {
            console.error("User not found");
            return res.status(404).send("User not found");
        }

        const userEmail = user.email;

        // Remove the user's email from the group's members array
        const result = await groupCollection.updateOne(
            { _id: new ObjectId(groupId) },
            { $pull: { members: userEmail } }
        );

        if (result.modifiedCount === 0) {
            console.error("User not removed from group");
            return res.status(500).send("Failed to remove user from group");
        }

        console.log(`User ${userEmail} removed from group with ID ${groupId}`);

        // Send a success response
        res.sendStatus(200);
    } catch (error) {
        console.error("Error removing user from group:", error);
        res.status(500).send("Error removing user from group");
    }
});


app.post("/toggle-admin-status", sessionValidation, async (req, res) => {
    try {
        const groupId = req.query.groupId;
        const userEmail = req.query.userEmail;

        // Find the group to check if the user is currently an admin
        const group = await groupCollection.findOne({ _id: new ObjectId(groupId) });
        
        if (!group) {
            return res.status(404).send("Group not found.");
        }

        const isAdmin = group.admin.includes(userEmail);

        // Toggle admin status
        if (isAdmin) {
            // Remove user from admins
            await groupCollection.updateOne(
                { _id: new ObjectId(groupId) },
                { $pull: { admin: userEmail } }
            );
        } else {
            // Add user to admins
            await groupCollection.updateOne(
                { _id: new ObjectId(groupId) },
                { $addToSet: { admin: userEmail } }
            );
        }

        console.log(`User ${userEmail} admin status toggled in group with ID ${groupId}`);

        // Redirect to the group details page
        res.redirect(`/group-details/${groupId}`);
    } catch (error) {
        console.error("Error toggling admin status:", error);
        res.status(500).send("Error toggling admin status.");
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
            invalidEmails: invalidEmails, // Just passing the array of invalid emails without modification
            groupID: groupId 
        }; 
 
        // Render the InviteConfirmation page with the appropriate message 
        res.render('InviteConfirmation', { inviteMessage }); 
    } catch (error) { 
        console.error('Error inviting users to group:', error); 
        res.status(500).json({ success: false, message: 'Internal server error.' }); 
    } 
});


app.get('/profile', sessionValidation, (req, res) => {

        var name = req.session.name;
        var biography = req.session.biography;

        res.render(`profile`, { name, biography });
});

// GET handler for displaying the form
app.get('/editProfile', sessionValidation, (req, res) => {
    if (!req.session.name) {
        return res.redirect('/login');  // Redirect if the user is not logged in
    }
    res.render('editProfile', { name: req.session.name});
});

// POST handler for processing the form submission
app.post('/updateProfile', sessionValidation, async (req, res) => {
    const { name, biography } = req.body;

    // Validation schema
    const schema = Joi.object({
        name: Joi.string().alphanum().max(20).required(),
        biography: Joi.string().max(100).required()
    });

    // Validate the data
    const validationResult = schema.validate({ name, biography });
    if (validationResult.error != null) {
        console.log(validationResult.error);
        res.send(`${validationResult.error.message}<br/> <a href='/editProfile'>Try again</a>`);
        return;
    }

    // Insert or update the document in the database
    await userCollection.updateOne(
        { email: req.session.email },
        { $set: { name: name, biography: biography } },
        { upsert: true }
    );

    // Update session details after successful update
    req.session.authenticated = true;
    req.session.biography = biography;
    req.session.name = name;
    req.session.cookie.maxAge = expireTime;

    res.redirect('/profile');
});

app.get('/randomizer', async (req, res) => { 
    const groupId = req.query.id; 
 
    if (!ObjectId.isValid(groupId)) { 
        return res.status(400).send("Invalid group ID format."); 
    } 
 
    try { 
        const group = await groupCollection.findOne({ _id: new ObjectId(groupId) }); 
 
        if (!group || !group.events || group.events.length === 0) { 
            return res.status(404).send("No events found for this group."); 
        } 
 
        const randomEvent = group.events[Math.floor(Math.random() * group.events.length)]; 
 
        res.render('randomizer', { event: randomEvent }); 
    } catch (error) { 
        console.error("Error fetching group details:", error); 
        res.status(500).send("Error fetching group details."); 
    } 
}); 

app.get('/event_submission', sessionValidation, async (req, res) => {
    const groupId = req.query.groupId;
    const group = await groupCollection.findOne({ _id: new ObjectId(groupId) });
    const successMessage = req.query.success === 'true' ? 'Event added successfully' : null;
    res.render('event_submission', { group });
});

app.get('/submitted_event', sessionValidation, async (req, res) => {
    const groupId = req.query.groupId;
    const group = await groupCollection.findOne({ _id: new ObjectId(groupId) });
    console.log('groupId:', new ObjectId(groupId));
    const events = group.events;
    res.render('submitted_event', { group, session: req.session, events });
});

app.get('/editEvent', sessionValidation, async (req, res) => {
    const groupId = req.query.groupId;
    const eventId = req.query.eventId;
    const group = await groupCollection.findOne(
        { _id: new ObjectId(groupId), "events._id": new ObjectId(eventId) },
        { projection: { "events.$": 1 } }
    );
    const event = group.events[0];
    

    res.render('editEvent', { group, session: req.session, event });

});

app.post('/editEvent', sessionValidation, async (req, res) => {
    const groupId = req.query.groupId;
    const eventId = req.query.eventId;
    const title = req.body.eventTitle;
    const description = req.body.description;
    const location = req.body.location;
    const info = req.body.contactInfo;
    const category = req.body.category;

    if (!title || !category) {
        res.send("You must provide a title and category<br/> <a href='/editEvent'>Try again</a>");
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
        res.send("/editEvent");
        return;
    }

    const updatedEvent = {
        _id: new ObjectId(eventId),
        title: title,
        description: description,
        location: location,
        info: info,
        category: category
    }

    await groupCollection.updateOne(
        { _id: new ObjectId(groupId), "events._id": new ObjectId(eventId) },
        { $set: { "events.$": updatedEvent } }
    );
    console.log('event in edit:', new ObjectId(eventId));

    console.log("Event updated");
    res.redirect('/group?id=' + groupId);
});

// app.use('/test', sessionValidation);
// app.get('/test', (req, res) => {
//     if(!req.session.authenticated) {
//         res.redirect('/login');
//         return;
//     }
//     res.render('event_submission');
// });

app.post('/event_submission', sessionValidation, async (req, res) => {
    const groupId = req.query.groupId;
    console.log('groupId:', new ObjectId(groupId))
    var userId = req.session.user_ID;

    var title = req.body.eventTitle;
    var description = req.body.description;
    var location = req.body.location;
    var info = req.body.contactInfo;
    var category = req.body.category;

    if (!title || !category) {
        res.send("You must provide a title and category<br/> <a href='/event_submission'>Try again</a>");
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
        res.send("/event_submission");
        return;
    }

    const newEvent = {
        _id : new ObjectId(),
        title: title,
        description: description,
        location: location,
        info: info,
        category: category
    }

    await groupCollection.updateOne(
        { _id: new ObjectId(groupId) }, // need some way to get the group id
        { $push: { events: newEvent } },
        console.log('groupId:', new ObjectId(groupId))
    );

    console.log("Event added");
    res.redirect('/group?id=' + groupId);
});

// app.get("/admin", sessionValidation, adminAuthorization, async (req, res) => {
//   const result = await userCollection.find().toArray();
//   // console.log(result)
//   res.render("admin", { users: result });
// });

// app.post('/promoteToAdmin', sessionValidation, adminAuthorization, jsonParser, async (req, res) => {
//     // console.log(req.body)
//     // console.log("promoting " + req.body.id + " to admin")
//     const result = await userCollection.updateOne({ _id: new ObjectId(req.body.id) }, { $set: { user_type: 'admin' } });
//     // console.log(result)
//     res.send({ success: true });
// });
// app.post('/demoteToUser', sessionValidation, adminAuthorization, jsonParser, async (req, res) => {
//     await userCollection.updateOne({ _id: new ObjectId(req.body.id) }, { $set: { user_type: 'user' } });
//     res.send({ success: true });
// });

app.get("/logout", sessionValidation, (req, res) => {
  if (req.session.authenticated) {
    req.session.destroy();
    res.redirect("/");
  } else res.redirect("/");
});

app.use('/',express.static("public"));

app.get("*", (req, res) => {
    res.status(404);
    res.render("404");
})

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
