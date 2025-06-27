import dotenv from 'dotenv';
import { emailService } from '../src/services/emailService';

// Load environment variables
dotenv.config();

async function testSendGrid() {
  console.log('🧪 Testing SendGrid Email Service');
  console.log('================================');
  
  // Check if SendGrid API key is set
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    console.error('❌ SENDGRID_API_KEY is not set in environment variables');
    console.log('\nTo set it, add to your .env file:');
    console.log('SENDGRID_API_KEY=your-api-key-here');
    process.exit(1);
  }
  
  console.log('✅ SendGrid API key is configured');
  console.log(`📧 FROM_EMAIL: hello@interspace.fi (hardcoded verified sender)`);
  console.log(`📧 FROM_NAME: ${process.env.FROM_NAME || 'Interspace'}`);
  
  // Test sending a verification code
  const testEmail = process.env.TEST_EMAIL || 'test@example.com';
  const testCode = '123456';
  
  console.log(`\n📤 Attempting to send verification code to: ${testEmail}`);
  console.log(`🔑 Test verification code: ${testCode}`);
  
  try {
    await emailService.sendVerificationCode(testEmail, testCode);
    console.log('✅ Email sent successfully via SendGrid!');
    console.log('\nSendGrid implementation is working correctly.');
  } catch (error: any) {
    console.error('❌ Failed to send email:', error.message);
    if (error.response) {
      console.error('SendGrid error details:', JSON.stringify(error.response.body, null, 2));
      if (error.response.body.errors) {
        console.error('\nError messages:');
        error.response.body.errors.forEach((err: any) => {
          console.error(`- ${err.message}`);
          if (err.field) console.error(`  Field: ${err.field}`);
          if (err.help) console.error(`  Help: ${err.help}`);
        });
      }
    }
    console.log('\n⚠️  Common issues:');
    console.log('1. Invalid API key - check if the key is correct');
    console.log('2. Sender not verified - you may need to verify the sender email/domain in SendGrid');
    console.log('3. API key permissions - ensure the key has "Mail Send" permission');
    process.exit(1);
  }
}

// Run the test
testSendGrid().catch(console.error);