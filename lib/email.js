import sgMail from '@sendgrid/mail';

// Initialize SendGrid with API key
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

/**
 * Send notification email via SendGrid
 * @param {Object} params - Email parameters
 * @param {string} params.to - Recipient email address
 * @param {string} params.subject - Email subject
 * @param {string} params.html - HTML email body
 * @param {string} params.text - Plain text email body (optional)
 * @returns {Promise} SendGrid response
 */
export async function sendEmail({ to, subject, html, text }) {
  if (!process.env.SENDGRID_API_KEY || process.env.SENDGRID_API_KEY === 'your_sendgrid_api_key_here') {
    console.warn('SendGrid API key not configured. Email not sent.');
    return { success: false, error: 'SendGrid not configured' };
  }

  const msg = {
    to,
    from: process.env.SENDGRID_FROM_EMAIL || 'notifications@parcelreach.ai',
    subject,
    html,
    text: text || html.replace(/<[^>]*>/g, ''), // Strip HTML for text version if not provided
  };

  try {
    const response = await sgMail.send(msg);
    console.log(`Email sent to ${to}: ${subject}`);
    return { success: true, response };
  } catch (error) {
    console.error('SendGrid Error:', error);
    if (error.response) {
      console.error('Error body:', error.response.body);
    }
    return { success: false, error: error.message };
  }
}

/**
 * Send notification email for @mention
 * @param {Object} params - Mention notification parameters
 * @param {string} params.toEmail - Recipient email
 * @param {string} params.toName - Recipient name
 * @param {string} params.fromName - Person who mentioned them
 * @param {string} params.notePreview - Preview of the note text
 * @param {string} params.link - Link to the notification/lead
 */
export async function sendMentionNotification({ toEmail, toName, fromName, notePreview, link }) {
  const subject = `${fromName} mentioned you on ParcelReach`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #ffffff; padding: 30px; border: 1px solid #e2e8f0; border-top: none; }
        .note-preview { background: #f1f5f9; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 4px; font-style: italic; }
        .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; color: #64748b; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0; font-size: 24px;">🔔 You were mentioned</h1>
        </div>
        <div class="content">
          <p>Hi ${toName || 'there'},</p>
          <p><strong>${fromName}</strong> mentioned you in a note:</p>
          <div class="note-preview">
            ${notePreview}
          </div>
          <p>
            <a href="${link}" class="button">View in ParcelReach →</a>
          </p>
          <p style="color: #64748b; font-size: 14px;">
            You're receiving this email because you were mentioned in ParcelReach. You can manage your notification preferences in your account settings.
          </p>
        </div>
        <div class="footer">
          <p>© 2025 ParcelReach AI. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({ to: toEmail, subject, html });
}

/**
 * Send team invitation email
 * @param {Object} params - Team invite parameters
 * @param {string} params.toEmail - Recipient email
 * @param {string} params.teamName - Name of the team
 * @param {string} params.inviterName - Person who sent the invite
 * @param {string} params.inviteLink - Link to accept invitation
 */
export async function sendTeamInviteEmail({ toEmail, teamName, inviterName, inviteLink }) {
  const subject = `You've been invited to join ${teamName} on ParcelReach`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #ffffff; padding: 30px; border: 1px solid #e2e8f0; border-top: none; }
        .button { display: inline-block; background: #10b981; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; font-size: 16px; }
        .footer { text-align: center; padding: 20px; color: #64748b; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0; font-size: 24px;">✉️ Team Invitation</h1>
        </div>
        <div class="content">
          <p>Hello,</p>
          <p><strong>${inviterName}</strong> has invited you to join <strong>${teamName}</strong> on ParcelReach.</p>
          <p>ParcelReach is an AI-powered land development intelligence platform that helps teams manage and close land deals more effectively.</p>
          <p style="text-align: center;">
            <a href="${inviteLink}" class="button">Accept Invitation →</a>
          </p>
          <p style="color: #64748b; font-size: 14px;">
            This invitation link will expire in 7 days. If you didn't expect this invitation, you can safely ignore this email.
          </p>
        </div>
        <div class="footer">
          <p>© 2025 ParcelReach AI. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({ to: toEmail, subject, html });
}

/**
 * Send lead assignment notification email
 * @param {Object} params - Lead assignment notification parameters
 * @param {string} params.toEmail - Recipient email
 * @param {string} params.toName - Recipient name
 * @param {string} params.leadName - Lead/property owner name
 * @param {string} params.location - Property location
 * @param {string} params.acres - Property acreage
 * @param {string} params.link - Link to view the lead
 */
export async function sendLeadAssignmentNotification({ toEmail, toName, leadName, location, acres, link }) {
  const subject = `New Lead: ${leadName}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #ffffff; padding: 30px; border: 1px solid #e2e8f0; border-top: none; }
        .lead-details { background: #f1f5f9; padding: 20px; margin: 20px 0; border-radius: 6px; border-left: 4px solid #10b981; }
        .detail-row { padding: 8px 0; }
        .detail-label { font-weight: 600; color: #64748b; display: block; font-size: 12px; text-transform: uppercase; }
        .detail-value { color: #0f172a; font-size: 16px; }
        .button { display: inline-block; background: #10b981; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; font-size: 16px; }
        .footer { text-align: center; padding: 20px; color: #64748b; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0; font-size: 24px;">New Lead</h1>
        </div>
        <div class="content">
          <p>Hi ${toName || 'there'},</p>
          <p><strong>We've Got More Land To Check Out.</strong> New lead generated via our PPC campaigns.</p>
          <div class="lead-details">
            <div class="detail-row">
              <span class="detail-label">Property Owner</span>
              <span class="detail-value">${leadName}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Location</span>
              <span class="detail-value">${location}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Acreage</span>
              <span class="detail-value">${acres}</span>
            </div>
          </div>
          <p style="text-align: center;">
            <a href="${link || 'https://parcelreach.ai/dashboard'}" class="button">View Lead Details →</a>
          </p>
          <p style="color: #64748b; font-size: 14px;">
            You're receiving this email because a new lead is available for your team on ParcelReach.
          </p>
        </div>
        <div class="footer">
          <p>© 2025 ParcelReach AI. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({ to: toEmail, subject, html });
}

/**
 * Send team join notification email
 * @param {Object} params - Team join notification parameters
 * @param {string} params.toEmail - Team owner email
 * @param {string} params.toName - Team owner name
 * @param {string} params.memberName - Name of person who joined
 * @param {string} params.teamName - Name of the team
 */
export async function sendTeamJoinNotification({ toEmail, toName, memberName, teamName }) {
  const subject = `${memberName} joined ${teamName}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #ffffff; padding: 30px; border: 1px solid #e2e8f0; border-top: none; }
        .highlight { background: #f1f5f9; padding: 20px; margin: 20px 0; border-radius: 6px; border-left: 4px solid #3b82f6; }
        .button { display: inline-block; background: #3b82f6; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; font-size: 16px; }
        .footer { text-align: center; padding: 20px; color: #64748b; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0; font-size: 24px;">New Team Member</h1>
        </div>
        <div class="content">
          <p>Hi ${toName || 'there'},</p>
          <p><strong>${memberName}</strong> has accepted your invitation and joined <strong>${teamName}</strong>!</p>
          <div class="highlight">
            <p style="margin: 0; font-size: 16px;">Your team is growing! ${memberName} can now access all assigned leads and collaborate with your team.</p>
          </div>
          <p style="text-align: center;">
            <a href="https://parcelreach.ai/dashboard" class="button">View Team →</a>
          </p>
          <p style="color: #64748b; font-size: 14px;">
            You're receiving this email because someone joined your team on ParcelReach.
          </p>
        </div>
        <div class="footer">
          <p>© 2025 ParcelReach AI. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({ to: toEmail, subject, html });
}

/**
 * Send new lead available notification email
 * @param {Object} params - New lead notification parameters
 * @param {string} params.toEmail - Recipient email
 * @param {string} params.toName - Recipient name
 * @param {string} params.leadName - Lead/property owner name
 * @param {string} params.location - Property location
 * @param {string} params.acres - Property acreage
 */
export async function sendLeadAddedNotification({ toEmail, toName, leadName, location, acres }) {
  const subject = `New Lead Available: ${leadName}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #ffffff; padding: 30px; border: 1px solid #e2e8f0; border-top: none; }
        .lead-details { background: #f1f5f9; padding: 20px; margin: 20px 0; border-radius: 6px; border-left: 4px solid #8b5cf6; }
        .detail-row { padding: 8px 0; }
        .detail-label { font-weight: 600; color: #64748b; display: block; font-size: 12px; text-transform: uppercase; }
        .detail-value { color: #0f172a; font-size: 16px; }
        .button { display: inline-block; background: #8b5cf6; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; font-size: 16px; }
        .footer { text-align: center; padding: 20px; color: #64748b; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0; font-size: 24px;">New Lead Available</h1>
        </div>
        <div class="content">
          <p>Hi ${toName || 'there'},</p>
          <p>A new lead is now available in your dashboard!</p>
          <div class="lead-details">
            <div class="detail-row">
              <span class="detail-label">Property Owner</span>
              <span class="detail-value">${leadName}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Location</span>
              <span class="detail-value">${location}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Acreage</span>
              <span class="detail-value">${acres} acres</span>
            </div>
          </div>
          <p style="text-align: center;">
            <a href="https://parcelreach.ai/dashboard" class="button">View Dashboard →</a>
          </p>
          <p style="color: #64748b; font-size: 14px;">
            You're receiving this email because a new lead was added to ParcelReach.
          </p>
        </div>
        <div class="footer">
          <p>© 2025 ParcelReach AI. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({ to: toEmail, subject, html });
}
