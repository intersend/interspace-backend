require('dotenv').config();
const sgMail = require('@sendgrid/mail');

// Get API key from environment
const API_KEY = process.env.SENDGRID_API_KEY;
if (!API_KEY) {
  console.error('❌ SENDGRID_API_KEY not found in environment');
  process.exit(1);
}
sgMail.setApiKey(API_KEY);

const msg = {
  to: 'test@example.com',
  from: 'hello@interspace.fi',
  subject: 'Direct SendGrid Test',
  text: 'Testing direct SendGrid integration',
  html: '<p>Testing direct SendGrid integration</p>',
};

console.log('🧪 Direct SendGrid Test');
console.log('From:', msg.from);
console.log('To:', msg.to);

sgMail
  .send(msg)
  .then(() => {
    console.log('✅ Email sent successfully!');
  })
  .catch((error) => {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Details:', JSON.stringify(error.response.body, null, 2));
    }
  });