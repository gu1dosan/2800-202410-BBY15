const express = require("express");
const session = require("express-session");
const MongoStore = require("connect-mongo");
require("dotenv").config();
const bcrypt = require("bcrypt");
require("./utils.js");
var bodyParser = require("body-parser");
const crypto = require("crypto");
const { v4: uuid } = require("uuid");
var URL = require("url");

const app = express();
const port = process.env.PORT || 3000;

const Joi = require("joi");
const { ObjectId } = require("mongodb");
const sendEmail = require("./utils/sendEmail.js");

const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

const expireTime = 15 * 24 * 60 * 60 * 1000; //expires after 15 days

const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;

const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const cloudinary = require("cloudinary");
const { type } = require("os");
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
var jsonParser = bodyParser.json();

var { database } = include("databaseConnection");

const userCollection = database.db(mongodb_database).collection("users");
const pwRecoveryTokensCollection = database
  .db(mongodb_database)
  .collection("pwRecoveryTokens");
const groupCollection = database.db(mongodb_database).collection("groups");

var mongoStore = MongoStore.create({
  mongoUrl: `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}/${mongodb_database}`,
  collectionName: "sessions",
  crypto: {
    secret: mongodb_session_secret,
  },
});

app.set("view engine", "ejs");

app.use(
  session({
    secret: node_session_secret,
    store: mongoStore, //default is memory store
    saveUninitialized: false,
    resave: true,
    maxAge: expireTime,
  })
);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

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
    if (group && group.admin && group.admin.includes(userEmail)) {
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
    const users = await userCollection
      .find({ email: { $in: emails } })
      .toArray();

    // Initialize an array to store user details
    const userDetails = [];

    // Retrieve the group information
    const group = await groupCollection.findOne({ _id: new ObjectId(groupId) });
    // console.log(group);

    // Iterate over each user and check if they are admins
    for (const user of users) {
      const isAdmin = group.admin?.includes(user.email);
      userDetails.push({
        id: user._id.toString(),
        name: user.name,
        isAdmin,
        email: user.email,
        profilePicture: user.profilePicture,
      });
    }

    return userDetails;
  } catch (error) {
    console.error("Error fetching user details:", error);
    return [];
  }
}

app.use((req, res, next) => {
  res.locals.session = req.session;
  res.locals.pathname = req.url;
  next();
});

app.get("/", sessionValidation, (req, res) => {
  res.redirect("/groups");
});

app.get("/signup", (req, res) => {
  const groupInvite = req.query.groupInvite;
  if (req.session.authenticated) {
    res.redirect("/");
  } else {
    res.render("signup", { groupInvite });
  }
});
app.post("/signup", async (req, res) => {
  const groupInvite = req.query.groupInvite;
  var name = req.body.name;
  var email = req.body.email;
  var password = req.body.password;
  var confirmPassword = req.body.confirmPassword;
  if (!name || !email || !password || !confirmPassword) {
    res.render("signup", {
      missing: {
        name: !name,
        email: !email,
        password: !password,
        confirmPassword: !confirmPassword,
      },
      formData: {
        name: name,
        email: email,
        password: password,
        confirmPassword: confirmPassword,
      },
      groupInvite,
    });
  } else {
    const schema = Joi.object({
      name: Joi.string().required(),
      email: Joi.string().email().required(),
      password: Joi.string().max(20).required(),
      confirmPassword: Joi.ref("password"),
    });

    const validationResult = schema.validate({
      name,
      email,
      password,
      confirmPassword,
    });
    if (validationResult.error != null) {
      // console.log(validationResult.error);
      let error = validationResult.error.message;
      if (error === '"email" must be a valid email')
        error = "Email is not valid";
      if (error === '"confirmPassword" must be [ref:password]')
        error = "Passwords do not match, try again";
      return res.render("signup", {
        error: error,
        formData: {
          name: name,
          email: email,
          password: password,
          confirmPassword: confirmPassword,
        },
        groupInvite,
      });
    }

    var hashedPassword = await bcrypt.hash(
      password,
      Number(process.env.SALTROUNDS)
    );

    const { insertedId } = await userCollection.insertOne({
      name: name,
      email: email,
      password: hashedPassword,
      notifications: [],
    });
    req.session.id = insertedId;
    req.session.authenticated = true;
    req.session.email = email;
    req.session.name = name;
    req.session.cookie.maxAge = expireTime;
    return req.query.groupInvite
      ? res.redirect("/group-invite?id=" + req.query.groupInvite)
      : res.redirect("/");
  }
});

app.get("/login", async (req, res) => {
  const groupInvite = req.query.groupInvite;
  let group;
  if (groupInvite) {
    group = await groupCollection.findOne({ _id: new ObjectId(groupInvite) });
    if (!group) {
      return res.redirect("/");
    }
  }
  if (req.session.authenticated) {
    return res.redirect("/");
  } else {
    res.render("login", { groupInvite, group });
  }
});

app.post("/login", async (req, res) => {
  const groupInvite = req.query.groupInvite;
  let group;
  if (groupInvite) {
    group = await groupCollection.findOne({ _id: new ObjectId(groupInvite) });
    if (!group) {
      return res.redirect("/");
    }
  }

  var email = req.body.email;
  var password = req.body.password;
  if (!email || !password) {
    return res.render("login", {
      error: "You must enter an email and password",
      formData: { email: email, password: password },
      groupInvite,
      group,
    });
  }

  const schema = Joi.string().email().required();
  const validationResult = schema.validate(email);
  if (validationResult.error != null) {
    //    console.log(validationResult.error);
    return res.render("login", {
      error: "Invalid email or password",
      formData: { email: email, password: password },
      groupInvite,
      group,
    });
  }

  const result = await userCollection
    .find({ email: email })
    .project({
      email: 1,
      name: 1,
      user_type: 1,
      password: 1,
      biography: 1,
      profilePicture: 1,
      _id: 1,
    })
    .toArray();

  // console.log(result);
  if (result.length != 1) {
    // console.log("user not found");
    return res.render("login", {
      error: "Invalid email or password",
      formData: { email: email, password: password },
      groupInvite,
      group,
    });
  }
  if (await bcrypt.compare(password, result[0].password)) {
    // console.log("correct password");
    req.session.id = result[0]._id;
    req.session.authenticated = true;
    req.session.email = email;
    req.session.name = result[0].name;
    req.session.profilePicture = result[0].profilePicture; // Retrieve profile picture from database
    req.session.biography = result[0].biography; // Retrieve biography from database
    req.session.cookie.maxAge = expireTime;

    return req.query.groupInvite
      ? res.redirect("/group-invite?id=" + req.query.groupInvite)
      : res.redirect("/");
  } else {
    // console.log("incorrect password");
    return res.render("login", {
      error: "Invalid email or password",
      formData: { email: email, password: password },
      groupInvite,
    });
  }
});

app.get("/password-reset", (req, res) => {
  if (req.session.authenticated) {
    res.redirect("/");
  } else {
    res.render("passwordReset", { success: false });
  }
});
app.post("/password-reset", async (req, res) => {
  try {
    const schema = Joi.object({ email: Joi.string().email().required() });
    const { error } = schema.validate(req.body);
    if (error)
      return res.render("passwordReset", {
        error: "Email is not valid",
        formData: { email: req.body.email },
      });

    const user = await userCollection.findOne({ email: req.body.email });
    if (!user)
      return res.render("passwordReset", {
        success: true,
        email: req.body.email,
      });

    let token = await pwRecoveryTokensCollection.findOne({ userId: user._id });
    if (token) {
      await pwRecoveryTokensCollection.deleteOne({ userId: user._id });
    }
    let newToken = crypto.randomBytes(32).toString("hex");
    await pwRecoveryTokensCollection.insertOne({
      userId: user._id,
      token: newToken,
      createdAt: Date.now(),
    });
    const link = `${process.env.BASE_URL}/password-reset/${user._id}/${newToken}`;
    let emailContent = `Hi ${user.name}, Click this link to reset your NextUp password:\n\n${link}\n\nIf you didn't request this, you can safely ignore this email.`;
    await sendEmail(user.email, "NextUp Password Link", emailContent);

    return res.render("passwordReset", { success: true, email: user.email });
  } catch (error) {
    // console.log(error);
    return res.render("passwordReset", { success: false, error: error });
  }
});

app.get("/password-reset/:userId/:token", async (req, res) => {
  if (req.session.authenticated) {
    res.redirect("/");
  } else {
    // Check if the token exists and is still valid
    const user = await userCollection.findOne({
      _id: new ObjectId(req.params.userId),
    });
    if (!user)
      return res.render("passwordResetForm", {
        error: "Invalid link or expired",
        userId: req.params.userId,
        token: req.params.token,
      });
    const token = await pwRecoveryTokensCollection.findOne({
      userId: user._id,
      token: req.params.token,
    });
    if (!token)
      return res.render("passwordResetForm", {
        error: "Invalid link or expired",
        userId: req.params.userId,
        token: req.params.token,
      });
    return res.render("passwordResetForm", {
      userId: req.params.userId,
      token: req.params.token,
    });
  }
});

app.post("/password-reset/:userId/:token", async (req, res) => {
  try {
    const schema = Joi.object({
      password: Joi.string().required(),
      confirmPassword: Joi.ref("password"),
    });
    let validationResult = schema.validate(req.body);
    if (validationResult.error != null) {
      let error = validationResult.error.message;
      // console.log(error)
      if (error === '"confirmPassword" must be [ref:password]') {
        error = "Passwords do not match, try again";
      } else error = "Invalid password";
      return res.render("passwordResetForm", {
        error: error,
        userId: req.params.userId,
        token: req.params.token,
        formData: {
          password: req.body.password,
          confirmPassword: req.body.confirmPassword,
        },
      });
    }
    const user = await userCollection.findOne({
      _id: new ObjectId(req.params.userId),
    });
    if (!user)
      return res.render("passwordResetForm", {
        error: "Invalid link or expired",
        userId: req.params.userId,
        token: req.params.token,
      });

    const token = await pwRecoveryTokensCollection.findOne({
      userId: user._id,
      token: req.params.token,
    });
    if (!token)
      return res.render("passwordResetForm", {
        error: "Invalid link or expired",
        userId: req.params.userId,
        token: req.params.token,
      });

    var hashedPassword = await bcrypt.hash(
      req.body.password,
      Number(process.env.SALTROUNDS)
    );
    await userCollection.updateOne(
      { _id: new ObjectId(req.params.userId) },
      { $set: { password: hashedPassword } }
    );
    await pwRecoveryTokensCollection.deleteOne({
      userId: user._id,
      token: req.params.token,
    });

    return res.render("passwordResetForm", { success: true });
  } catch (error) {
    console.log(error);
    return res.render("passwordResetForm", {
      error: error,
      userId: req.params.userId,
      token: req.params.token,
      formData: {
        password: req.body.password,
        confirmPassword: req.body.confirmPassword,
      },
    });
  }
});

app.get("/profile", sessionValidation, async (req, res) => {
  const currentUserEmail = req.session.email;

  const user = await userCollection.findOne({ email: currentUserEmail });

  var name = req.session.name;
  var biography = req.session.biography;
  var profilePicture = req.session.profilePicture; // Ensure this is passed

  res.render("profile", { name, biography, profilePicture, user });
});

// GET handler for displaying the form
app.get("/editProfile", sessionValidation, async (req, res) => {
  if (!req.session.name) {
    return res.redirect("/login"); // Redirect if the user is not logged in
  }

  const currentUserEmail = req.session.email;

  const user = await userCollection.findOne({ email: currentUserEmail });

  res.render("editProfile", {
    name: req.session.name,
    biography: req.session.biography,
    profilePicture: req.session.profilePicture,
    user,
  });
});

app.get("/userProfile", sessionValidation, async (req, res) => {
  const userEmail = req.query.email;
  var name = req.session.name;
  var biography = req.session.biography;
  var profilePicture = req.session.profilePicture; // Ensure this is passed

  if (!userEmail) {
    return res
      .status(500)
      .render("errorMessage", { msg: "Email query parameter is required." });
  }

  try {
    const user = await userCollection.findOne({ email: userEmail });

    if (!user) {
      return res.status(500).render("errorMessage", { msg: "User not found." });
    }

    res.render("userProfile", { user });
  } catch (error) {
    console.error("Error fetching user details:", error);
    res
      .status(500)
      .render("errorMessage", { msg: "Error fetching user details." });
  }
});

app.get("/activities", sessionValidation, async (req, res) => {
  const userEmail = req.session.email;
  const user = await userCollection.findOne({ email: userEmail });

  try {
    // Find all groups where the user is a member and a selectedEvent exists
    const groups = await groupCollection
      .find({
        members: userEmail,
        selectedEvent: { $exists: true },
      })
      .toArray();

    // If no groups found, return a 404 status
    if (!groups.length) {
      res.render("errorMessage", { msg: "No activities exist for the group" });
      return;
    }

    // Extract the selected events from each group
    const selectedEvents = groups.map((group) => group.selectedEvent);

    res.render("activities", { selectedEvents, user, formatDateTime });
  } catch (error) {
    console.error("Error fetching user details:", error);
    res
      .status(500)
      .render("errorMessage", { msg: "Error fetching selected events" });
  }
});

app.get("/groups", sessionValidation, async (req, res) => {
  try {
    // Get the email of the current user
    const currentUserEmail = req.session.email;

    const user = await userCollection.findOne({ email: currentUserEmail });

    // Find all groups where the current user is a member
    var groups = await groupCollection
      .find({ members: currentUserEmail })
      .toArray();

    const formatTime = (timeObject) => {
      // using method from selectEvent
      if (
        typeof timeObject === "undefined" ||
        timeObject === "" ||
        timeObject === null
      ) {
        return "No time(s) chosen.";
      } else if (timeObject && timeObject.start) {
        const date = new Date(timeObject.start);
        const formattedTime = date.toLocaleString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        });
        const formattedDate = date.toLocaleString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        });
        return `${formattedTime}, ${formattedDate}`;
      } else {
        return null;
      }
    };

    groups.forEach((group) => {
      group.time = formatTime(group.time);
    });

    // Render groups page and pass the groups data to the template
    res.render("groups", {
      session: req.session,
      groups: groups,
      user,
    });
  } catch (error) {
    console.error("Error fetching groups:", error);
    res.status(500).send("Error fetching groups.");
  }
});

app.post("/createGroup", sessionValidation, async (req, res) => {
  try {
    // Extract group name and user emails from the request body
    const { name, emails } = req.body;

    // Check if the name field is empty
    if (!name || name.trim() === "") {
      res.render("errorMessage", { msg: "Group name is required." });
      return;
    }

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
      admin: [creatorEmail],
      activities: [], // Initialize activities as an empty array
      events: [], // Initialize events as an empty array
      messages: [], // Initialize messages as an empty array
      calendar: [],
    };

    // Insert the new group document into the groups collection
    const result = await groupCollection.insertOne(newGroup);

    console.log("New group created:", result.insertedId);

    // Prepare the query parameters for the redirect
    let queryParams = "?error=false";

    if (invalidEmails.length > 0) {
      queryParams +=
        "&invalidEmails=" + encodeURIComponent(JSON.stringify(invalidEmails));
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

app.get("/groupConfirmation", sessionValidation, async (req, res) => {
  const currentUserEmail = req.session.email;

  const user = await userCollection.findOne({ email: currentUserEmail });
  const error = req.query.error === "true";
  const message = req.query.message;
  const invalidEmails = req.query.invalidEmails
    ? JSON.parse(req.query.invalidEmails)
    : [];

  res.render("GroupCreationConfirmation", {
    error,
    message,
    invalidEmails,
    user,
  });
});

app.get("/group/:groupId", sessionValidation, async (req, res) => {
  try {
    const groupId = req.params.groupId;
    const group = await groupCollection
      .aggregate([
        { $match: { _id: new ObjectId(groupId) } },
        {
          $lookup: {
            from: "users",
            localField: "members",
            foreignField: "email",
            as: "memberDetails",
          },
        },
        {
          $project: {
            name: 1,
            activities: 1,
            events: 1,
            messages: 1,
            memberDetails: {
              _id: 1,
              name: 1,
              email: 1,
              profilePicture: 1,
            },
            selectedEvent: 1,
            time: 1,
          },
        },
      ])
      .toArray();

    if (!group[0]) {
      res.render("errorMessage", { msg: "Group not found." });
      return;
    }

    const deadlineObject = await groupCollection.findOne(
      { _id: new ObjectId(groupId) },
      { projection: { deadline: 1 } }
    );
    const now = new Date();
    const deadlineDate = deadlineObject.deadline;
    const nowPST = new Date(now.getTime() - 7 * 60 * 60 * 1000);

    //console.log(deadlineDate);
    //console.log(nowPST);
    //console.log(JSON.stringify(group[0]));
    // Retrieve the selected event from the group document
    const selectedEvent = group[0].selectedEvent;
    const time = group[0].time ? group[0].time.start : null;

    const currentUserEmail = req.session.email;

    const user = await userCollection.findOne({ email: currentUserEmail });

    //console.log(selectedEvent);

    // Render the group details page with the retrieved group
    res.render("group", {
      selectedEvent,
      group: group[0],
      pageTitle: group[0].name,
      chat: true,
      backButton: "/groups",
      user,
      deadlineDate,
      nowPST,
      time,
    });
  } catch (error) {
    console.error("Error fetching group details:", error);
    res
      .status(500)
      .render("errorMessage", { msg: "Error fetching group details." });
  }
});
io.on("connection", (socket) => {
  // console.log('a user connected');
  // socket.on('disconnect', () => {
  //     console.log('user disconnected');
  // });
  socket.on("join", function (room) {
    socket.join(room);
    // console.log(socket)
  });
});
app.post(
  "/group/:groupId/message",
  sessionValidation,
  jsonParser,
  async (req, res) => {
    // console.log(req.body)
    var message = {
      message: req.body.input,
      user: req.session.email,
      time: new Date(),
      name: req.session.name,
    };
    // console.log(message)
    const groupId = req.params.groupId;

    try {
      await groupCollection.updateOne(
        { _id: new ObjectId(groupId) },
        { $push: { messages: message } }
      );
      io.to(groupId).emit("chat message", message);
      return res.status(204).json({ success: true });
    } catch (error) {
      console.error("Error sending message:", error);
      return res
        .status(500)
        .render("errorMessage", { msg: "Error sending message." });
    }
  }
);

app.get("/group-details/:groupId", sessionValidation, async (req, res) => {
  try {
    const groupId = req.params.groupId;
    const group = await groupCollection.findOne({ _id: new ObjectId(groupId) });
    const userEmail = req.session.email;
    const adminStatus = await isAdmin(userEmail, groupId);

    const user = await userCollection.findOne({ email: userEmail });

    if (adminStatus) {
      // User is an admin, proceed with admin-specific logic
      console.log("You are an admin for this group.");
    } else {
      // User is not an admin
      console.log("You are not an admin for this group.");
    }

    if (!group) {
      // Group not found
      res.status(404).render("errorMessage", { msg: "Group not found." });
      return;
    }

    // Retrieve user details (including id and name) for the members of the group
    const memberEmails = group.members;
    const memberDetails = await getUserDetails(memberEmails, groupId);
    // console.log(memberDetails);

    // Render the group details page with the retrieved group and member details
    res.render("groupDetails", {
      group,
      isAdmin: adminStatus,
      memberDetails,
      user,
      formatDateTime,
    });
  } catch (error) {
    console.error("Error fetching group details:", error);
    res
      .status(500)
      .render("errorMessage", { msg: "Error fetching group details." });
  }
});

app.post("/edit-group-name", sessionValidation, async (req, res) => {
  try {
    const groupId = req.query.groupId;
    const newName = req.body.newName;

    if (!newName || newName.trim() === "") {
      res.render("errorMessage", { msg: "Group name is required." });
      return;
    }

    // Update the group name in the MongoDB collection
    await groupCollection.updateOne(
      { _id: new ObjectId(groupId) },
      { $set: { name: newName } }
    );

    // Redirect to the group details page
    res.redirect(`/group-details/${groupId}`);
  } catch (error) {
    console.error("Error updating group name:", error);
    res
      .status(500)
      .render("errorMessage", { msg: "Error updating group name" });
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
    res.redirect(
      "/groups?error=true&message=" +
      encodeURIComponent("Error deleting group.")
    );
  }
});

app.get("/leave-group", sessionValidation, async (req, res) => {
  const groupId = req.query.groupId;
  const userEmail = req.session.email; // Assuming the user's email is stored in the session

  try {
    const user = await userCollection.findOne({ email: userEmail });

    const notificationsToPull = user.notifications.filter(notification => notification.groupId === groupId).length;
    // Remove the user's email from the group's members array
    await groupCollection.updateOne(
      { _id: new ObjectId(groupId) },
      { $pull: { members: userEmail } }
    );
    // console.log(`User ${userEmail} removed from group with ID ${groupId}`);
    await userCollection.updateOne(
      { email: userEmail },
      {
        $pull: { notifications: { groupId: groupId } },
        $inc: { unreadNotificationCount: -notificationsToPull }
      }
    );

    const group = await groupCollection.findOne({ _id: new ObjectId(groupId) });
    if (group.members.length === 0) {
      await groupCollection.deleteOne({ _id: new ObjectId(groupId) });
    }

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

    const notificationsToPull = user.notifications.filter(notification => notification.groupId === groupId).length;

    if (!user) {
      console.error("User not found");
      return res.status(404).render("errorMessage", { msg: "User not found" });
    }

    const userEmail = user.email;

    // Remove the user's email from the group's members array
    const result = await groupCollection.updateOne(
      { _id: new ObjectId(groupId) },
      { $pull: { members: userEmail } }
    );

    await userCollection.updateOne(
      { email: userEmail },
      {
        $pull: { notifications: { groupId: groupId } },
        $inc: { unreadNotificationCount: -notificationsToPull }
      }
    );


    if (result.modifiedCount === 0) {
      console.error("User not removed from group");
      return res
        .status(500)
        .render("errorMessage", { msg: "Failed to remove user from group" });
    }

    console.log(`User ${userEmail} removed from group with ID ${groupId}`);

    // Send a success response
    res.sendStatus(200);
  } catch (error) {
    console.error("Error removing user from group:", error);
    res
      .status(500)
      .render("errorMessage", { msg: "Error removing user from group" });
  }
});

app.get("/egg", sessionValidation, (req, res) => {
  res.render("egg");
});

app.get("/calendar", sessionValidation, async (req, res) => {
  const groupId = req.query.id;
  const currentUserEmail = req.session.email;

  const user = await userCollection.findOne({ email: currentUserEmail });

  if (!ObjectId.isValid(groupId)) {
    return res
      .status(400)
      .render("errorMessage", { msg: "Invalid group ID format." });
  }

  try {
    const group = await groupCollection.findOne({ _id: new ObjectId(groupId) });

    if (group) {
      if (!group.calendar) {
        group.calendar = [];
        await groupCollection.updateOne(
          { _id: new ObjectId(groupId) },
          { $set: { calendar: group.calendar } }
        );
      }

      res.render("calendar", { group: group, user, times: group.calendar });
    } else {
      res.render("404");
    }
  } catch (error) {
    console.error("Error fetching group details:", error);
    res
      .status(500)
      .render("errorMessage", { msg: "Error fetching group details." });
  }
});

app.post("/save-timestamps", sessionValidation, async (req, res) => {
  const { timestamps } = req.body;
  const groupId = req.query.id;

  console.log("Received timestamps:", timestamps);
  console.log("Received group ID:", groupId);

  if (!Array.isArray(timestamps)) {
    console.error("Invalid timestamps data:", timestamps);
    return res
      .status(400)
      .render("errorMessage", { msg: "Invalid timestamps data." });
  }

  if (!ObjectId.isValid(groupId)) {
    console.error("Invalid group ID format:", groupId);
    return res
      .status(400)
      .render("errorMessage", { msg: "Invalid group ID format." });
  }

  try {
    const group = await groupCollection.findOne({ _id: new ObjectId(groupId) });

    if (!group) {
      console.error("Group not found.");
      return res
        .status(404)
        .render("errorMessage", { msg: "Group not found." });
    }

    // Update the calendar with the new list of timestamps
    group.calendar = timestamps;

    const result = await groupCollection.updateOne(
      { _id: new ObjectId(groupId) },
      { $set: { calendar: group.calendar } }
    );

    if (result.modifiedCount === 0) {
      console.error("No documents were updated.");
      return res
        .status(500)
        .render("errorMessage", { msg: "Failed to save timestamps." });
    }

    console.log("Timestamps saved successfully!");
    res.status(200).send({ message: "Timestamps saved successfully!" });
  } catch (error) {
    console.error("Error saving timestamps:", error);
    res.status(500).render("errorMessage", {
      msg: "An Error ocurred while saving the timestamps",
    });
  }
});

app.post("/toggle-admin-status", sessionValidation, async (req, res) => {
  try {
    const groupId = req.query.groupId;
    const userEmail = req.query.userEmail;

    // Find the group to check if the user is currently an admin
    const group = await groupCollection.findOne({ _id: new ObjectId(groupId) });

    if (!group) {
      return res
        .status(404)
        .render("errorMessage", { msg: "Group not found." });
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

    console.log(
      `User ${userEmail} admin status toggled in group with ID ${groupId}`
    );

    // Redirect to the group details page
    res.redirect(`/group-details/${groupId}`);
  } catch (error) {
    console.error("Error toggling admin status:", error);
    res
      .status(500)
      .render("errorMessage", { msg: "Error toggling admin status" });
  }
});

app.post("/invite", sessionValidation, async (req, res) => {
  try {
    const groupId = req.query.groupId; // Get the group ID from the query parameter
    const { emails } = req.body; // Get the emails from the request body

    const currentUserEmail = req.session.email;

    const user = await userCollection.findOne({ email: currentUserEmail });

    // Split the emails string into an array of email addresses
    const emailArray = emails.split(/[;,]+/).map((email) => email.trim());

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
        const group = await groupCollection.findOne({
          _id: new ObjectId(groupId),
          members: email,
        });
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
      success: validEmails.length > 0 ? "Users were successfully added." : "",
      existingMembers: existingMembers.map(
        (email) => `${email} is already a member.`
      ),
      invalidEmails: invalidEmails, // Just passing the array of invalid emails without modification
      groupID: groupId,
    };

    // Render the InviteConfirmation page with the appropriate message
    res.render("InviteConfirmation", { inviteMessage, user });
  } catch (error) {
    // console.error("Error inviting users to group:", error);
    res.status(500).render("ErrorMessage", { msg: "Internal server error." });
  }
});

app.get("/group-invite", async (req, res) => {
  const groupId = req.query.id;
  if (!groupId) {
    return res.redirect("/");
  }
  if (!isValidSession(req)) {
    res.redirect("/login" + "?groupInvite=" + groupId);
  } else {
    try {
      const group = await groupCollection.findOne({
        _id: new ObjectId(groupId),
      });
      if (!group) {
        return res.redirect("/");
      }
      if (group.members.includes(req.session.email)) {
        return res.redirect("/group/" + groupId);
      }
      const memberEmails = group.members;
      const memberDetails = await getUserDetails(memberEmails, groupId);
      const currentUserEmail = req.session.email;
      const user = await userCollection.findOne({ email: currentUserEmail });
      res.render("groupInvite", { group, memberDetails, user });
    } catch (error) {
      console.error("Error fetching group details:", error);
      res.redirect("/");
    }
  }
});

app.get("/accept-group-invite", sessionValidation, async (req, res) => {
  try {
    const groupId = req.query.id; // Get the group ID from the query parameter
    const email = req.session.email; // Get the emails from the request body

    const validEmails = [];

    // Check if the email exists in the userCollection
    const user = await userCollection.findOne({ email });
    if (user) {
      // Check if the user is already a member of the group
      const group = await groupCollection.findOne({
        _id: new ObjectId(groupId),
        members: email,
      });
      if (!group) {
        // If the user exists and is not already a member, add the email to the list of valid emails
        validEmails.push(email);
      }
    }

    // Update the group document to add the new members
    const result = await groupCollection.updateOne(
      { _id: new ObjectId(groupId) },
      { $addToSet: { members: { $each: validEmails } } }
    );

    // Render the InviteConfirmation page with the appropriate message
    res.redirect("/group/" + groupId);
  } catch (error) {
    console.error("Error inviting users to group:", error);
    // res.status(500).json({ success: false, message: "Internal server error." });
    res.status(500).render("errorMessage", { msg: "Internal server error." });
  }
});

// POST handler for processing the form submission
app.post(
  "/updateProfile",
  sessionValidation,
  upload.single("profilePicture"),
  async (req, res) => {
    const { name, biography } = req.body;
    let profilePictureUrl = null;

    // If a file is uploaded, upload it to Cloudinary
    if (req.file) {
      let buf64 = req.file.buffer.toString("base64");
      try {
        const result = await cloudinary.uploader.upload(
          `data:image/png;base64,${buf64}`,
          { public_id: uuid() }
        );
        profilePictureUrl = result.secure_url; // Use the secure_url provided by Cloudinary
      } catch (error) {
        console.error("Error uploading image to Cloudinary:", error);
        return res
          .status(500)
          .render("errorMessage", { msg: "Error uploading image." });
      }
    }

    // Validation schema
    const schema = Joi.object({
      name: Joi.string().alphanum().max(20).required(),
      biography: Joi.string().max(100).required(),
    });

    // Validate the data
    const validationResult = schema.validate({ name, biography });
    if (validationResult.error != null) {
      console.log(validationResult.error);
      return res
        .status(400)
        .send(
          `${validationResult.error.message}<br/> <a href='/editProfile'>Try again</a>`
        );
    }

    // Insert or update the document in the database
    const updateFields = { name, biography };
    if (profilePictureUrl) {
      updateFields.profilePicture = profilePictureUrl; // Add the profile picture URL to the update fields
    }

    await userCollection.updateOne(
      { email: req.session.email },
      { $set: updateFields },
      { upsert: true }
    );

    // Update session details after successful update
    req.session.authenticated = true;
    req.session.biography = biography;
    req.session.name = name;
    if (profilePictureUrl) {
      req.session.profilePicture = profilePictureUrl; // Update session with the new profile picture URL
    }
    req.session.cookie.maxAge = expireTime;

    res.redirect("/profile");
  }
);

app.get("/randomizer", sessionValidation, async (req, res) => {
  const groupId = req.query.id;
  const currentUserEmail = req.session.email;
  const user = await userCollection.findOne({ email: currentUserEmail });

  if (!ObjectId.isValid(groupId)) {
    res.render("errorMessage", { msg: "Invalid group ID format." });
    return;
  }

  try {
    const group = await groupCollection.findOne({ _id: new ObjectId(groupId) });
    const cal = group.calendar;

    if (!group || !group.events || group.events.length === 0) {
      res.render("errorMessage", { msg: "No events found for this group." });
      return;
    }

    res.render("randomizer", {
      events: group.events,
      groupId: groupId,
      user,
      calendar: cal,
    });
  } catch (error) {
    console.error("Error fetching group details:", error);
    res.render("errorMessage", { msg: "Error fetching group details" });
  }
});

app.post("/selectEvent", sessionValidation, async (req, res) => {
  const { groupId, selectedEvent, selectedTime } = req.body;
  var time = selectedTime;

  if (!ObjectId.isValid(groupId)) {
    return res
      .status(400)
      .render("errorMessage", { msg: "Invalid group ID format." });
  }

  if (selectedTime) {
    await groupCollection.updateOne(
      { _id: new ObjectId(groupId) },
      {
        $set: {
          "events.$[elem].time": new Date(selectedTime.start),
        },
      },
      {
        arrayFilters: [{ "elem._id": new ObjectId(selectedEvent._id) }],
      }
    );
  }

  if (selectedTime) {
    selectedEvent.time = new Date(selectedTime.start);
  }

  try {
    const updateResult = await groupCollection.updateOne(
      { _id: new ObjectId(groupId) },
      { $set: { selectedEvent, time } },
      { upsert: true }
    );

    if (updateResult.matchedCount === 0 && updateResult.upsertedCount === 1) {
      res.status(201).send("Selected event created successfully.");
    } else {
      res.status(200).send("Selected event updated successfully.");
    }
  } catch (error) {
    console.error("Error updating selected event:", error);
    res.status(500).render("errorMessage", { msg: "updating selected event." });
  }

  const group = await groupCollection.findOne({ _id: new ObjectId(groupId) });

  for (let userEmail of group.members) {
    const user = await userCollection.findOne({ email: userEmail });

    if (!user) {
      console.error(`User with email ${userEmail} not found.`);
      continue;
    }

    if (typeof time === "undefined" || time === "" || time === null) {
      time = "No time(s) chosen.";
    } else if (selectedTime && selectedTime.start) {
      const date = new Date(selectedTime.start);
      const formattedTime = date.toLocaleString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const formattedDate = date.toLocaleString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      time = `${formattedTime}, ${formattedDate}`;
    } else {
      time = "No time slots chosen.";
    }

    const notification = {
      _id: new ObjectId(),
      message: `The chosen activity is ${selectedEvent.title}, at: ${time}`,
      groupId: groupId,
      read: false,
      type: "randomizer",
    };

    const existingNotification =
      user.notifications &&
      user.notifications.find(
        (n) => n.groupId === groupId && n.type === "randomizer"
      );

    if (existingNotification) {
      await userCollection.updateOne(
        { _id: new ObjectId(user._id) },
        {
          $pull: { notifications: { groupId: groupId, type: "randomizer" } },
        }
      );
    }

    if (existingNotification && !existingNotification.read) {
      await userCollection.updateOne(
        { _id: new ObjectId(user._id) },
        { $inc: { unreadNotificationCount: -1 } }
      );
    }

    await userCollection.updateOne(
      { _id: new ObjectId(user._id) },
      {
        $push: { notifications: notification },
        $inc: { unreadNotificationCount: 1 },
      }
    );
  }
});

app.get("/notifications", sessionValidation, async (req, res) => {
  const currentUserEmail = req.session.email;

  const user = await userCollection.findOne({ email: currentUserEmail });

  if (!user.notifications) {
    return res
      .status(400)
      .render("errorMessage", { msg: "You currently have no notifications." });
  }

  const userId = user._id;

  const notifications = await Promise.all(
    user.notifications.map(async (notification) => {
      const group = await groupCollection.findOne({
        _id: new ObjectId(notification.groupId),
      });
      return { ...notification, groupTitle: group.name, group: group._id };
    })
  );
  res.render("notifications", {
    notifications: notifications,
    userId: userId,
    user,
  });
});

app.post("/mark_as_read", sessionValidation, async (req, res) => {
  const userId = req.query.userId;
  const notificationId = req.body.notificationId;
  const groupId = req.body.notificationgroup;
  const notificationType = req.body.notificationtype;
  const userEmail = req.session.email;

  const group = await groupCollection.findOne({ _id: new ObjectId(groupId) });

  const isPartOfGroup = group.members.includes(userEmail);

  if (isPartOfGroup) {
    await userCollection.updateOne(
      {
        _id: new ObjectId(userId),
        "notifications._id": new ObjectId(notificationId),
      },
      { $set: { "notifications.$.read": true } }
    );

    await userCollection.updateOne(
      { _id: new ObjectId(userId) },
      { $inc: { unreadNotificationCount: -1 } }
    );

    if (notificationType === "randomizer" || notificationType === "deadline") {
      res.redirect("/group/" + groupId);
    } else {
      res.redirect("/submitted_event?groupId=" + groupId);
    }
  } else {
    await userCollection.updateOne(
      { _id: new ObjectId(userId) },
      { $pull: { notifications: { _id: new ObjectId(notificationId) } } }
    );

    await userCollection.updateOne(
      { _id: new ObjectId(userId) },
      { $inc: { unreadNotificationCount: -1 } }
    );
    res.redirect("/notifications?userId=" + userId);
  }
});

app.post("/delete_notification", sessionValidation, async (req, res) => {
  const userId = req.query.userId;
  const notificationId = req.body.notificationId;

  const user = await userCollection.findOne({ _id: new ObjectId(userId) });
  const notification = user.notifications.find(
    (notification) => notification._id.toString() === notificationId
  );

  if (notification && !notification.read) {
    await userCollection.updateOne(
      { _id: new ObjectId(userId) },
      { $inc: { unreadNotificationCount: -1 } }
    );
  }

  await userCollection.updateOne(
    { _id: new ObjectId(userId) },
    { $pull: { notifications: { _id: new ObjectId(notificationId) } } }
  );

  res.redirect("/notifications?userId=" + userId);
});

app.post("/delete_all_notifications", sessionValidation, async (req, res) => {
  const userId = req.body.userId;

  await userCollection.updateOne(
    { _id: new ObjectId(userId) },
    {
      $set: {
        notifications: [],
        unreadNotificationCount: 0,
      },
    }
  );

  res.sendStatus(200);
});

app.get(
  "/event_submission",
  checkDeadline,
  sessionValidation,
  async (req, res) => {
    const groupId = req.query.groupId;
    const group = await groupCollection.findOne({ _id: new ObjectId(groupId) });
    const currentUserEmail = req.session.email;
    const user = await userCollection.findOne({ email: currentUserEmail });
    const successMessage =
      req.query.success === "true" ? "Event added successfully" : null;
    res.render("event_submission", { group, user });
  }
);

app.get("/submitted_event", sessionValidation, async (req, res) => {
  const groupId = req.query.groupId;
  const group = await groupCollection.findOne({ _id: new ObjectId(groupId) });
  //console.log('groupId:', new ObjectId(groupId));
  const currentUserEmail = req.session.email;
  const user = await userCollection.findOne({ email: currentUserEmail });
  const events = group.events;
  res.render("submitted_event", {
    group,
    session: req.session,
    events,
    convertTo12Hour,
    user,
    groupId,
    formatDateTime,
  });
});

app.get("/editEvent", sessionValidation, async (req, res) => {
  const groupId = req.query.groupId;
  const eventId = req.query.eventId;
  const currentUserEmail = req.session.email;
  const user = await userCollection.findOne({ email: currentUserEmail });
  const group = await groupCollection.findOne(
    { _id: new ObjectId(groupId), "events._id": new ObjectId(eventId) },
    { projection: { "events.$": 1 } }
  );
  const event = group.events[0];

  res.render("editEvent", { group, session: req.session, event, user });
});

app.post("/editEvent", sessionValidation, async (req, res) => {
  const groupId = req.query.groupId;
  const eventId = req.query.eventId;
  const updatedTitle = req.body.eventTitle.trim();
  const updatedDescription = req.body.description.trim();
  const newLocation = req.body.location.trim();
  const updatedInfo = req.body.contactInfo.trim();
  const newCategory = req.body.category;
  const newTime = req.body.eventTime;

  const group = await groupCollection.findOne({ _id: new ObjectId(groupId) });
  const event = group.events.find((event) => event._id.toString() === eventId);

  const updatedLocation = newLocation;
  const updatedCategory = newCategory;
  const updatedTime = newTime;

  const schema = Joi.object({
    title: Joi.string().max(50).allow(""),
    description: Joi.string().max(500).allow(""),
    location: Joi.string().max(50).allow(""),
    info: Joi.string().max(50).allow(""),
  });

  const validationResult = schema.validate({
    title: updatedTitle,
    description: updatedDescription,
    location: updatedLocation,
    info: updatedInfo,
  });

  if (validationResult.error != null) {
    console.log(validationResult.error);
    return res
      .status(400)
      .render("errorMessage", { msg: validationResult.error.message });
    return;
  }

  const updatedEvent = {
    _id: new ObjectId(eventId),
    title: updatedTitle,
    description: updatedDescription,
    location: updatedLocation,
    info: updatedInfo,
    category: updatedCategory,
    time: updatedTime,
  };

  await groupCollection.updateOne(
    { _id: new ObjectId(groupId), "events._id": new ObjectId(eventId) },
    { $set: { "events.$": updatedEvent } }
  );
  //console.log('event in edit:', new ObjectId(eventId));

  if (group.selectedEvent && group.selectedEvent._id.toString() === eventId) {
    await groupCollection.updateOne(
      { _id: new ObjectId(groupId) },
      { $set: { selectedEvent: updatedEvent } }
    );
  }

  for (let userEmail of group.members) {
    const user = await userCollection.findOne({ email: userEmail });

    const notification = {
      _id: new ObjectId(),
      message: `The selected activity '${updatedTitle}' has been updated in ${group.name}.`,
      groupId: groupId,
      read: false,
      type: "editEvent",
    };

    await userCollection.updateOne(
      { _id: new ObjectId(user._id) },
      {
        $push: { notifications: notification },
        $inc: { unreadNotificationCount: 1 },
      }
    );
  }

  console.log("Event updated");
  res.redirect("/submitted_event?groupId=" + groupId);
});

app.post("/deleteEvent", sessionValidation, async (req, res) => {
  const groupId = req.query.groupId;
  const eventId = req.query.eventId;

  const groupBeforeUpdate = await groupCollection.findOne({
    _id: new ObjectId(groupId),
  });

  if (groupBeforeUpdate.selectedEvent) {
    const title = groupBeforeUpdate.selectedEvent.title;
  }

  await groupCollection.updateOne(
    { _id: new ObjectId(groupId) },
    {
      $pull: {
        events: { _id: new ObjectId(eventId) },
      },
      $unset: { selectedEvent: "" },
    }
  );

  const groupAfterUpdate = await groupCollection.findOne({
    _id: new ObjectId(groupId),
  });

  if (groupBeforeUpdate.selectedEvent && !groupAfterUpdate.selectedEvent) {
    for (let userEmail of groupBeforeUpdate.members) {
      const user = await userCollection.findOne({ email: userEmail });

      const notification = {
        _id: new ObjectId(),
        message: `The chosen activity has been removed in ${groupBeforeUpdate.name}.`,
        groupId: groupId,
        read: false,
        type: "randomizer",
      };

      const existingNotification = user.notifications.find(
        (notification) =>
          notification.groupId === groupId && notification.type === "randomizer"
      );

      if (existingNotification && !existingNotification.read) {
        await userCollection.updateOne(
          { _id: new ObjectId(user._id) },
          { $inc: { unreadNotificationCount: -1 } }
        );
      }

      if (existingNotification) {
        await userCollection.updateOne(
          { _id: new ObjectId(user._id) },
          {
            $pull: { notifications: { groupId: groupId, type: "randomizer" } },
          }
        );
      }

      await userCollection.updateOne(
        { _id: new ObjectId(user._id) },
        {
          $push: { notifications: notification },
          $inc: { unreadNotificationCount: 1 },
        }
      );
    }
  }

  res.redirect("/submitted_event" + "?groupId=" + groupId);
});

app.get("/deleteAllEventsExceptSelected", async (req, res) => {
  const groupId = req.query.groupId;
  const group = await groupCollection.findOne({ _id: new ObjectId(groupId) });

  if (group) {
    const selectedEventId = group.selectedEvent
      ? group.selectedEvent._id
      : null;
    await groupCollection.updateOne(
      { _id: new ObjectId(groupId) },
      {
        $pull: {
          events: { _id: { $ne: new ObjectId(selectedEventId) } },
        },
      }
    );
  }

  res.redirect("/submitted_event" + "?groupId=" + groupId);
});

app.post("/mark_all_as_read", async (req, res) => {
  const userId = req.body.userId;

  await userCollection.updateMany(
    { _id: new ObjectId(userId), "notifications.read": false },
    { $set: { "notifications.$[].read": true, unreadNotificationCount: 0 } }
  );

  res.sendStatus(200);
});

app.post("/event_submission", sessionValidation, async (req, res) => {
  const groupId = req.query.groupId;
  //console.log('groupId:', new ObjectId(groupId))
  var userId = req.session.user_ID;

  var title = req.body.eventTitle.trim();
  var description = req.body.description.trim();
  var location = req.body.location.trim();
  var info = req.body.contactInfo.trim();
  var category = req.body.category;
  var time = req.body.eventTime;

  if (!title || !category) {
    res.send(
      "You must provide a title and category<br/> <a href='/event_submission'>Try again</a>"
    );
    return;
  }

  const schema = Joi.object({
    title: Joi.string().max(50).required(),
    description: Joi.string().max(500).allow(""),
    location: Joi.string().max(50).allow(""),
    info: Joi.string().max(50).allow(""),
  });

  const validationResult = schema.validate({
    title,
    description,
    location,
    info,
  });

  if (validationResult.error != null) {
    console.log(validationResult.error);
    return res
      .status(400)
      .render("errorMessage", { msg: validationResult.error.message });
  }

  const newEvent = {
    _id: new ObjectId(),
    title: title,
    description: description,
    location: location,
    info: info,
    category: category,
    time: time,
  };

  await groupCollection.updateOne(
    { _id: new ObjectId(groupId) }, // need some way to get the group id
    { $push: { events: newEvent } }
    //console.log('groupId:', new ObjectId(groupId))
  );

  const group = await groupCollection.findOne({ _id: new ObjectId(groupId) });

  for (let userEmail of group.members) {
    const user = await userCollection.findOne({ email: userEmail });

    const notification = {
      _id: new ObjectId(),
      message: `${title} has been suggested in ${group.name}.`,
      groupId: groupId,
      read: false,
      type: "event",
    };

    await userCollection.updateOne(
      { _id: new ObjectId(user._id) },
      {
        $push: { notifications: notification },
        $inc: { unreadNotificationCount: 1 },
      }
    );
  }

  console.log("Event added");
  res.redirect("/submitted_event" + "?groupId=" + groupId);
});

app.post("/addDeadline", sessionValidation, async (req, res) => {
  const deadline = req.body.deadline;
  const groupId = req.query.groupId;
  const group = await groupCollection.findOne({ _id: new ObjectId(groupId) });
  const deadlineDate = new Date(deadline);
  const deadlinePST = new Date(deadlineDate.getTime() - 7 * 60 * 60 * 1000);

  const formattedDeadline = deadlineDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  });

  await groupCollection.updateOne(
    { _id: new ObjectId(groupId) },
    { $set: { deadline: deadlinePST } }
  );

  for (let userEmail of group.members) {
    const user = await userCollection.findOne({ email: userEmail });

    if (!user) {
      console.error(`User with email ${userEmail} not found.`);
      continue;
    }

    const notification = {
      _id: new ObjectId(),
      message: `The Deadline to Submit an activity is ${formattedDeadline}.`,
      groupId: groupId,
      read: false,
      type: "deadline",
    };

    const existingNotification = user.notifications.find(
      (notification) =>
        notification.groupId === groupId && notification.type === "deadline"
    );

    if (existingNotification && !existingNotification.read) {
      await userCollection.updateOne(
        { _id: new ObjectId(user._id) },
        { $inc: { unreadNotificationCount: -1 } }
      );
    }

    if (existingNotification) {
      await userCollection.updateOne(
        { _id: new ObjectId(user._id) },
        {
          $pull: { notifications: { groupId: groupId, type: "deadline" } },
        }
      );
    }

    await userCollection.updateOne(
      { _id: new ObjectId(user._id) },
      {
        $push: { notifications: notification },
        $inc: { unreadNotificationCount: 1 },
      }
    );
  }

  res.redirect("/group-details/" + groupId);
});

function convertTo12Hour(time) {
  let [hours, minutes] = time.split(":");
  let period = +hours >= 12 ? "PM" : "AM";
  hours = +hours % 12 || 12;
  return `${hours}:${minutes} ${period}`;
}

async function checkDeadline(req, res, next) {
  const now = new Date();
  const groupId = req.query.groupId;
  const nowPST = new Date(now.getTime() - 7 * 60 * 60 * 1000);

  const group = await groupCollection.findOne({ _id: new ObjectId(groupId) });

  if (group && nowPST > group.deadline) {
    res.sendStatus(204);
  } else {
    next();
  }
}

function formatDateTime(dateTime) {
  let eventTime = dateTime;
  let date;
  let formattedDate = "";
  if (typeof eventTime === "string") {
    eventTime = convertTo12Hour(eventTime);
  } else {
    date = new Date(eventTime);
    if (Object.prototype.toString.call(date) === "[object Date]") {
      eventTime = date.toLocaleString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
      formattedDate = date.toLocaleString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    }
  }
  return `${eventTime}${formattedDate ? ", " + formattedDate : ""}`;
}

app.get("/logout", sessionValidation, (req, res) => {
  if (req.session.authenticated) {
    req.session.destroy();
    res.redirect("/");
  } else res.redirect("/");
});

app.get("403", (req, res) => {
  res.status(403);
  res.render("errorMessage", { msg: message });
});

app.use("/", express.static("public"));

app.get("*", (req, res) => {
  res.status(404);
  res.render("404");
});

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
