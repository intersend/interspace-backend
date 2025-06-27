import sgMail from '@sendgrid/mail';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testSendGridSimple() {
  console.log('🧪 Testing SendGrid API Key');
  console.log('===========================');
  
  const apiKey = process.env.SENDGRID_API_KEY;
  
  if (!apiKey) {
    console.error('❌ SENDGRID_API_KEY not found in environment');
    process.exit(1);
  }
  
  console.log('✅ API Key found');
  console.log(`📏 API Key length: ${apiKey.length} characters`);
  console.log(`🔑 API Key prefix: ${apiKey.substring(0, 7)}...`);
  
  // Set the API key
  sgMail.setApiKey(apiKey);
  
  // Try a simple send
  const msg = {
    to: 'test@example.com',
    from: 'noreply@interspace.app',
    subject: 'SendGrid Test',
    text: 'Testing SendGrid integration',
    html: '<p>Testing SendGrid integration</p>',
  };
  
  try {
    console.log('\n📤 Sending test email...');
    const response = await sgMail.send(msg);
    console.log('✅ Email sent successfully!');
    console.log('Response status:', response[0].statusCode);
    console.log('Response headers:', response[0].headers);
  } catch (error: any) {
    console.error('\n❌ SendGrid Error:', error.message);
    
    if (error.response) {
      const body = error.response.body;
      console.error('\nFull error response:');
      console.error(JSON.stringify(body, null, 2));
      
      if (body.errors) {
        console.error('\nDetailed errors:');
        body.errors.forEach((err: any, index: number) => {
          console.error(`\nError ${index + 1}:`);
          console.error('Message:', err.message);
          if (err.field) console.error('Field:', err.field);
          if (err.help) console.error('Help:', err.help);
        });
      }
    }
    
    console.log('\n📋 Troubleshooting steps:');
    console.log('1. Verify API key is correct and active in SendGrid dashboard');
    console.log('2. Check if sender domain/email is verified in SendGrid');
    console.log('3. Ensure API key has "Mail Send" permission');
    console.log('4. Try generating a new API key in SendGrid');
    console.log('\n🔗 SendGrid Dashboard: https://app.sendgrid.com/');
  }
}

testSendGridSimple().catch(console.error);