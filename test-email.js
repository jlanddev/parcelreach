require('dotenv').config({ path: '.env.local' });
const sgMail = require('@sendgrid/mail');

const apiKey = process.env.SENDGRID_API_KEY;
console.log('API Key configured:', !!apiKey && apiKey !== 'your_sendgrid_api_key_here');
console.log('API Key starts with:', apiKey?.substring(0, 10));
console.log('From email:', process.env.SENDGRID_FROM_EMAIL);

if (!apiKey || apiKey === 'your_sendgrid_api_key_here') {
  console.error('❌ SendGrid API key not properly configured!');
  process.exit(1);
}

sgMail.setApiKey(apiKey);

async function testEmail() {
  try {
    const msg = {
      to: 'test@example.com',
      from: process.env.SENDGRID_FROM_EMAIL || 'notifications@parcelreach.ai',
      subject: 'Test Email',
      text: 'This is a test email',
      html: '<p>This is a test email</p>',
    };
    
    console.log('Testing email send...');
    await sgMail.send(msg);
    console.log('✅ Email sent successfully!');
  } catch (error) {
    console.error('❌ Email send failed:', error.message);
    if (error.response) {
      console.error('Response body:', error.response.body);
    }
  }
}

testEmail();
