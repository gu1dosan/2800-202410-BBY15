# NextUp

## Project Description: 

NextUP is an event planning app that helps groups of students and young working adults who struggle with decision-making by randomly selecting an activity idea that is submitted by members each week.

## Technologies used:

**Frontend:**
- HTML
- CSS
- Javascript
- EJS
- Tailwindcss

**Backend:**
- node.js
- Express
- nodemailer
- socket.io
- Cloudinary

**Database:**
- MongoDB

## Folder structure:

├── databaseConnection.js  
├── index.js  
├── package-lock.json  
├── package.json  
├── public  
│   ├── images  
│   │   ├── 403.png  
│   │   ├── 404.png  
│   │   ├── Activity.png  
│   │   ├── account-filled.svg  
│   │   ├── account-rounded.svg  
│   │   ├── activities-filled.svg  
│   │   ├── activities-rounded.svg  
│   │   ├── add.png  
│   │   ├── back-button.png  
│   │   ├── backButton.png  
│   │   ├── check-circle.svg  
│   │   ├── clearLogo.png  
│   │   ├── clock.svg  
│   │   ├── copy.svg  
│   │   ├── dog.jpeg  
│   │   ├── empty-profile-pic.png  
│   │   ├── event.png  
│   │   ├── favicon.png  
│   │   ├── gamecube.gif  
│   │   ├── home-filled.svg  
│   │   ├── home-rounded.svg  
│   │   ├── home.png  
│   │   ├── logo.png  
│   │   ├── notification-fill.svg  
│   │   ├── notification.png  
│   │   ├── notification.svg  
│   │   ├── profile.png  
│   │   ├── search-filled.svg  
│   │   ├── search-rounded.svg  
│   │   ├── search.png  
│   │   └── send-rounded.svg  
│   ├── scripts  
│   │   └── script.js  
│   ├── socket.io  
│   │   └── socket.io.js  
│   └── styles  
│       ├── loginStyles.css  
│       ├── output.css  
│       ├── styles.css  
│       └── tailwind.css  
├── readme.md  
├── tailwind.config.js  
├── utils  
│   └── sendEmail.js  
├── utils.js  
└── views  
    ├── 404.ejs  
    ├── GroupCreationConfirmation.ejs  
    ├── InviteConfirmation.ejs  
    ├── activities.ejs  
    ├── admin.ejs  
    ├── calendar.ejs  
    ├── editEvent.ejs  
    ├── editProfile.ejs  
    ├── egg.ejs  
    ├── errorMessage.ejs  
    ├── event_submission.ejs  
    ├── group.ejs  
    ├── groupDetails.ejs  
    ├── groupInvite.ejs  
    ├── groups.ejs  
    ├── index.ejs  
    ├── login.ejs  
    ├── members.ejs  
    ├── notifications.ejs  
    ├── passwordReset.ejs  
    ├── passwordResetForm.ejs  
    ├── profile.ejs  
    ├── randomizer.ejs  
    ├── signup.ejs  
    ├── submitted_event.ejs  
    ├── templates  
    │   ├── footer.ejs  
    │   ├── header.ejs  
    │   ├── headerV2.ejs  
    │   ├── noAuthHeader.ejs  
    │   └── user.ejs  
    └── userProfile.ejs  
        
## How to install or run the project

1. clone this repository
2. make a copy of ```.env.example``` called just ```.env``` and complete details with mongodb, cloudinary, email and other credentials.
3. run ```npm install```
5. Project is ready to go, to run it: ```npm run start:dev```

## How to use the product (Core Features)

**Group Creation**  
![image](https://github.com/gu1dosan/2800-202410-BBY15/assets/30122825/0f453da5-9931-46c8-88d8-d7f42a3e3f5f)
![image](https://github.com/gu1dosan/2800-202410-BBY15/assets/30122825/fd8f1765-c95a-439a-b3f5-da35bcddb750)

**Activity submission and random picker**  
![image](https://github.com/gu1dosan/2800-202410-BBY15/assets/30122825/86152f35-c09c-4d17-82bd-523d37e7d138)
![image](https://github.com/gu1dosan/2800-202410-BBY15/assets/30122825/10fcc2fe-1edf-49be-9984-e694ff41b282)
![image](https://github.com/gu1dosan/2800-202410-BBY15/assets/30122825/d8d9e52b-3b5e-47db-936d-664ddbd1ac83)\

**Real-time group chat**  
![image](https://github.com/gu1dosan/2800-202410-BBY15/assets/30122825/849bd9c7-7185-4bf4-9e34-fb5003d8ddce)

## Credits, References, and Licenses

We took some design inspiration from other social messaging apps like FB Messenger and Whatsapp.

## How did you use AI? Tell us exactly what AI services and products you used and how you used them. Be very specific:
1. Did you use AI to help create your app? If so, how? Be specific.
   - We leveraged AI to help us create some images and graphics for the logo and for some error pages to make our app more friendly.
2. Did you use AI to create data sets or clean data sets? If so, how? Be specific.
   - We did not.
3. Does your app use AI? If so, how? Be specific.
   - It does not.
4. Did you encounter any limitations? What were they, and how did you overcome them? Be specific.
   - At the start we planned to use React for the front-end, but we were not planning to implement a separate back-end server which would be necsary to maintain a layer of security between the client and our database. We decided to not compromise on security and just use a nodejs server that serves HTML using EJS templates.

## Contact Information

ghe16@my.bcit.ca
victor_wong444@hotmail.com
henrytann00@gmail.com
liam.jaenicke@gmail.com
steven.ly236@gmail.com
