const nodemailer = require("nodemailer");
const { google } = require("googleapis");
 const OAuth2 = google.auth.OAuth2;

const createTransporter = async () => {
  try {
    const oauth2Client = new OAuth2(
        process.env.EMAIL_CLIENT_ID,
        process.env.EMAIL_CLIENT_SECRET,
        "https://developers.google.com/oauthplayground"
      );

      oauth2Client.setCredentials({
        refresh_token: process.env.EMAIL_REFRESH_TOKEN,
      });

      const accessToken = await new Promise((resolve, reject) => {
        oauth2Client.getAccessToken((err, token) => {
          if (err) {
            console.log("*ERR: ", err)
            reject();
          }
          resolve(token); 
        });
      });

      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          type: "OAuth2",
          user: process.env.EMAIL_USER,
          accessToken,
          clientId: process.env.EMAIL_CLIENT_ID,
          clientSecret: process.env.EMAIL_CLIENT_SECRET,
          refreshToken: process.env.EMAIL_REFRESH_TOKEN,
        },
      });
      return transporter;
  } catch (err) {
    console.log(err)
    return err
  }
};

const sendEmail = async (email, subject, text) => {
  try {
    const mailOptions = {
      from: process.env.USER_EMAIL,
      to: email,
      subject: subject,
      text: text,
    }

    let emailTransporter = await createTransporter();
    await emailTransporter.sendMail(mailOptions);
    console.log("email sent sucessfully");
  } catch (err) {
    console.log("ERROR: ", err)
  }
};

module.exports = sendEmail;