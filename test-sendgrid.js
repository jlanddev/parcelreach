#!/usr/bin/env node

/**
 * SendGrid Email Test Script
 *
 * This script tests if your SendGrid configuration is working.
 *
 * Usage:
 *   1. Create a .env.local file with your SendGrid credentials
 *   2. Run: node test-sendgrid.js <recipient-email>
 *
 * Example:
 *   node test-sendgrid.js testuser@example.com
 */

require('dotenv').config({ path: '.env.local' });
const sgMail = require('@sendgrid/mail');

const recipientEmail = process.argv[2];

if (!recipientEmail) {
  console.error('❌ Error: Please provide a recipient email address');
  console.log('\nUsage: node test-sendgrid.js <recipient-email>');
  console.log('Example: node test-sendgrid.js testuser@example.com\n');
  process.exit(1);
}

console.log('🧪 SendGrid Email Test');
console.log('======================\n');

// Check environment variables
console.log('📋 Checking configuration...');
const apiKey = process.env.SENDGRID_API_KEY;
const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@parcelreach.ai';

if (!apiKey || apiKey === 'your_sendgrid_api_key_here') {
  console.error('❌ SENDGRID_API_KEY not configured!');
  console.log('\nPlease set up your .env.local file with:');
  console.log('SENDGRID_API_KEY=your_actual_api_key_here');
  console.log('SENDGRID_FROM_EMAIL=noreply@parcelreach.ai\n');
  console.log('See .env.example for instructions on how to get a SendGrid API key.\n');
  process.exit(1);
}

console.log(`✅ API Key: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}`);
console.log(`✅ From Email: ${fromEmail}`);
console.log(`✅ Recipient: ${recipientEmail}\n`);

// Set API key
sgMail.setApiKey(apiKey);

// Prepare test email
const msg = {
  to: recipientEmail,
  from: fromEmail,
  subject: 'ParcelReach Email Test',
  text: 'This is a test email from ParcelReach to verify SendGrid is working correctly.',
  html: `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #ffffff; padding: 30px; border: 1px solid #e2e8f0; }
        .success { background: #10b981; color: white; padding: 15px; border-radius: 6px; text-align: center; font-weight: 600; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0;">✅ Email Test Successful</h1>
        </div>
        <div class="content">
          <p>This is a test email from <strong>ParcelReach</strong>.</p>
          <div class="success">
            🎉 SendGrid is configured correctly!
          </div>
          <p>Your email system is now ready to send:</p>
          <ul>
            <li>Team invitation emails</li>
            <li>Lead assignment notifications</li>
            <li>@mention notifications</li>
          </ul>
          <p style="color: #64748b; font-size: 14px; margin-top: 30px;">
            Sent at: ${new Date().toLocaleString()}
          </p>
        </div>
      </div>
    </body>
    </html>
  `,
};

// Send email
console.log('📤 Sending test email...\n');

sgMail
  .send(msg)
  .then(() => {
    console.log('✅ SUCCESS! Email sent successfully!\n');
    console.log('📧 Check your inbox at', recipientEmail);
    console.log('\nYour SendGrid configuration is working correctly.');
    console.log('Team invites will now send emails properly.\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ FAILED to send email\n');

    if (error.response) {
      console.error('Status Code:', error.code);
      console.error('Error Message:', error.message);
      console.error('\nResponse Body:', JSON.stringify(error.response.body, null, 2));

      // Provide helpful error messages
      if (error.code === 401) {
        console.log('\n💡 Common fix: Your API key may be invalid or expired.');
        console.log('   Create a new API key at https://app.sendgrid.com/settings/api_keys\n');
      } else if (error.code === 403) {
        console.log('\n💡 Common fix: Your sender email may not be verified.');
        console.log('   Verify your sender at https://app.sendgrid.com/settings/sender_auth\n');
      }
    } else {
      console.error('Error:', error.message);
    }

    process.exit(1);
  });
