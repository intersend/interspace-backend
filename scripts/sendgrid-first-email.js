// using Twilio SendGrid's v3 Node.js Library
// https://github.com/sendgrid/sendgrid-nodejs

require('dotenv').config();
const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);
// sgMail.setDataResidency('eu'); 
// uncomment the above line if you are sending mail using a regional EU subuser

// Get sender from environment or use default
const FROM_EMAIL = 'hello@interspace.fi';  // Hardcoded verified sender
const FROM_NAME = process.env.FROM_NAME || 'Interspace';
const TO_EMAIL = process.env.TEST_EMAIL || 'test@example.com';

console.log('📧 Email Configuration:');
console.log(`From: ${FROM_NAME} <${FROM_EMAIL}>`);
console.log(`To: ${TO_EMAIL}`);
console.log('');

const msg = {
  to: TO_EMAIL, // Change to your recipient
  from: {
    email: FROM_EMAIL, // Must be verified in SendGrid
    name: FROM_NAME
  },
  subject: 'Sending with SendGrid is Fun',
  text: 'and easy to do anywhere, even with Node.js',
  html: '<strong>and easy to do anywhere, even with Node.js</strong>',
};

sgMail
  .send(msg)
  .then(() => {
    console.log('Email sent');
  })
  .catch((error) => {
    console.error('❌ Error:', error.message);
    if (error.response && error.response.body) {
      console.error('\nError details:', JSON.stringify(error.response.body, null, 2));
      console.log('\n⚠️  Action Required:');
      console.log(`1. Go to https://app.sendgrid.com/settings/sender_auth`);
      console.log(`2. Verify the sender email: ${FROM_EMAIL}`);
      console.log(`3. Or change FROM_EMAIL in .env to a verified sender`);
    }
  });