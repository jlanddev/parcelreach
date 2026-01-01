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
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1e293b; margin: 0; padding: 0; background: #f1f5f9; }
        .wrapper { background: #f1f5f9; padding: 40px 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); }
        .header { background: #0f172a; padding: 32px; text-align: center; }
        .logo { max-width: 200px; height: auto; }
        .content { padding: 32px; }
        .note-preview { background: #f8fafc; border-left: 4px solid #3b82f6; padding: 16px 20px; margin: 24px 0; border-radius: 0 8px 8px 0; font-style: italic; color: #475569; }
        .button { display: inline-block; background: #3b82f6; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; }
        .button-container { text-align: center; margin: 24px 0; }
        .footer { background: #f8fafc; padding: 24px 32px; text-align: center; border-top: 1px solid #e2e8f0; }
        .footer-text { color: #64748b; font-size: 13px; margin: 0; }
        .footer-link { color: #3b82f6; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="container">
          <div class="header">
            <img src="https://parcelreach.ai/parcelreach-logo.png" alt="ParcelReach" class="logo" />
          </div>
          <div class="content">
            <p style="margin-top: 0;">Hi ${toName || 'there'},</p>
            <p><strong>${fromName}</strong> mentioned you in a note:</p>
            <div class="note-preview">
              "${notePreview}"
            </div>
            <div class="button-container">
              <a href="${link}" class="button">View in ParcelReach</a>
            </div>
          </div>
          <div class="footer">
            <p class="footer-text">
              You received this email because you were mentioned in ParcelReach.<br />
              <a href="https://parcelreach.ai" class="footer-link">parcelreach.ai</a>
            </p>
          </div>
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
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1e293b; margin: 0; padding: 0; background: #f1f5f9; }
        .wrapper { background: #f1f5f9; padding: 40px 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); }
        .header { background: #0f172a; padding: 32px; text-align: center; }
        .logo { max-width: 200px; height: auto; }
        .content { padding: 32px; }
        .invite-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; margin: 24px 0; text-align: center; }
        .team-name { font-size: 20px; font-weight: 600; color: #0f172a; margin-bottom: 8px; }
        .inviter { color: #64748b; font-size: 14px; }
        .button { display: inline-block; background: #10b981; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; }
        .button-container { text-align: center; margin: 24px 0; }
        .footer { background: #f8fafc; padding: 24px 32px; text-align: center; border-top: 1px solid #e2e8f0; }
        .footer-text { color: #64748b; font-size: 13px; margin: 0; }
        .footer-link { color: #3b82f6; text-decoration: none; }
        .expire-note { color: #94a3b8; font-size: 13px; margin-top: 16px; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="container">
          <div class="header">
            <img src="https://parcelreach.ai/parcelreach-logo.png" alt="ParcelReach" class="logo" />
          </div>
          <div class="content">
            <p style="margin-top: 0;">Hello,</p>
            <p>You've been invited to collaborate on land deals with a team on ParcelReach.</p>

            <div class="invite-card">
              <div class="team-name">${teamName}</div>
              <div class="inviter">Invited by ${inviterName}</div>
            </div>

            <p>ParcelReach is an AI-powered land development intelligence platform that helps teams manage and close land deals more effectively.</p>

            <div class="button-container">
              <a href="${inviteLink}" class="button">Accept Invitation</a>
            </div>

            <p class="expire-note">This invitation link will expire in 7 days. If you didn't expect this invitation, you can safely ignore this email.</p>
          </div>
          <div class="footer">
            <p class="footer-text">
              <a href="https://parcelreach.ai" class="footer-link">parcelreach.ai</a>
            </p>
          </div>
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
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1e293b; margin: 0; padding: 0; background: #f1f5f9; }
        .wrapper { background: #f1f5f9; padding: 40px 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); }
        .header { background: #0f172a; padding: 32px; text-align: center; }
        .logo { max-width: 200px; height: auto; }
        .content { padding: 32px; }
        .lead-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; margin: 24px 0; }
        .lead-title { font-size: 18px; font-weight: 600; color: #0f172a; margin-bottom: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; }
        .detail-grid { display: grid; gap: 12px; }
        .detail-item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
        .detail-item:last-child { border-bottom: none; }
        .detail-label { color: #64748b; font-size: 14px; }
        .detail-value { color: #0f172a; font-weight: 500; font-size: 14px; }
        .button { display: inline-block; background: #10b981; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; }
        .button-container { text-align: center; margin: 24px 0; }
        .footer { background: #f8fafc; padding: 24px 32px; text-align: center; border-top: 1px solid #e2e8f0; }
        .footer-text { color: #64748b; font-size: 13px; margin: 0; }
        .footer-link { color: #3b82f6; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="container">
          <div class="header">
            <img src="https://parcelreach.ai/parcelreach-logo.png" alt="ParcelReach" class="logo" />
          </div>
          <div class="content">
            <p style="margin-top: 0;">Hi ${toName || 'there'},</p>
            <p>A new lead has been assigned to your team and is ready for follow-up.</p>

            <div class="lead-card">
              <div class="lead-title">Lead Details</div>
              <div class="detail-grid">
                <div class="detail-item">
                  <span class="detail-label">Property Owner</span>
                  <span class="detail-value">${leadName}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Location</span>
                  <span class="detail-value">${location}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Acreage</span>
                  <span class="detail-value">${acres} acres</span>
                </div>
              </div>
            </div>

            <div class="button-container">
              <a href="${link || 'https://parcelreach.ai/dashboard'}" class="button">View Lead Details</a>
            </div>
          </div>
          <div class="footer">
            <p class="footer-text">
              You received this email because a lead was assigned to your team.<br />
              <a href="https://parcelreach.ai" class="footer-link">parcelreach.ai</a>
            </p>
          </div>
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
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1e293b; margin: 0; padding: 0; background: #f1f5f9; }
        .wrapper { background: #f1f5f9; padding: 40px 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); }
        .header { background: #0f172a; padding: 32px; text-align: center; }
        .logo { max-width: 200px; height: auto; }
        .content { padding: 32px; }
        .member-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; margin: 24px 0; text-align: center; }
        .member-name { font-size: 20px; font-weight: 600; color: #0f172a; margin-bottom: 8px; }
        .team-info { color: #64748b; font-size: 14px; }
        .button { display: inline-block; background: #3b82f6; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; }
        .button-container { text-align: center; margin: 24px 0; }
        .footer { background: #f8fafc; padding: 24px 32px; text-align: center; border-top: 1px solid #e2e8f0; }
        .footer-text { color: #64748b; font-size: 13px; margin: 0; }
        .footer-link { color: #3b82f6; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="container">
          <div class="header">
            <img src="https://parcelreach.ai/parcelreach-logo.png" alt="ParcelReach" class="logo" />
          </div>
          <div class="content">
            <p style="margin-top: 0;">Hi ${toName || 'there'},</p>
            <p>Great news! A new member has joined your team.</p>

            <div class="member-card">
              <div class="member-name">${memberName}</div>
              <div class="team-info">Joined ${teamName}</div>
            </div>

            <p>They can now access all assigned leads and collaborate with your team on ParcelReach.</p>

            <div class="button-container">
              <a href="https://parcelreach.ai/dashboard" class="button">View Team</a>
            </div>
          </div>
          <div class="footer">
            <p class="footer-text">
              <a href="https://parcelreach.ai" class="footer-link">parcelreach.ai</a>
            </p>
          </div>
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
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1e293b; margin: 0; padding: 0; background: #f1f5f9; }
        .wrapper { background: #f1f5f9; padding: 40px 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); }
        .header { background: #0f172a; padding: 32px; text-align: center; }
        .logo { max-width: 200px; height: auto; }
        .content { padding: 32px; }
        .lead-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; margin: 24px 0; }
        .lead-title { font-size: 18px; font-weight: 600; color: #0f172a; margin-bottom: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; }
        .detail-grid { display: grid; gap: 12px; }
        .detail-item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
        .detail-item:last-child { border-bottom: none; }
        .detail-label { color: #64748b; font-size: 14px; }
        .detail-value { color: #0f172a; font-weight: 500; font-size: 14px; }
        .button { display: inline-block; background: #8b5cf6; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; }
        .button-container { text-align: center; margin: 24px 0; }
        .footer { background: #f8fafc; padding: 24px 32px; text-align: center; border-top: 1px solid #e2e8f0; }
        .footer-text { color: #64748b; font-size: 13px; margin: 0; }
        .footer-link { color: #3b82f6; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="container">
          <div class="header">
            <img src="https://parcelreach.ai/parcelreach-logo.png" alt="ParcelReach" class="logo" />
          </div>
          <div class="content">
            <p style="margin-top: 0;">Hi ${toName || 'there'},</p>
            <p>A new lead is now available in your dashboard.</p>

            <div class="lead-card">
              <div class="lead-title">Property Details</div>
              <div class="detail-grid">
                <div class="detail-item">
                  <span class="detail-label">Property Owner</span>
                  <span class="detail-value">${leadName}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Location</span>
                  <span class="detail-value">${location}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Acreage</span>
                  <span class="detail-value">${acres} acres</span>
                </div>
              </div>
            </div>

            <div class="button-container">
              <a href="https://parcelreach.ai/dashboard" class="button">View Dashboard</a>
            </div>
          </div>
          <div class="footer">
            <p class="footer-text">
              You received this email because a new lead was added to ParcelReach.<br />
              <a href="https://parcelreach.ai" class="footer-link">parcelreach.ai</a>
            </p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({ to: toEmail, subject, html });
}

/**
 * Send priced lead available notification email (marketplace)
 * @param {Object} params - Priced lead notification parameters
 * @param {string} params.toEmail - Recipient email
 * @param {string} params.toName - Recipient name
 * @param {string} params.location - Property location (county, state)
 * @param {string} params.acres - Property acreage
 * @param {string} params.price - Lead price
 */
export async function sendPricedLeadAvailableNotification({ toEmail, toName, location, acres, price }) {
  const subject = `New Lead Available - ${location} - $${price}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1e293b; margin: 0; padding: 0; background: #f1f5f9; }
        .wrapper { background: #f1f5f9; padding: 40px 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); }
        .header { background: #0f172a; padding: 32px; text-align: center; }
        .logo { max-width: 200px; height: auto; }
        .content { padding: 32px; }
        .lead-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; margin: 24px 0; }
        .lead-title { font-size: 18px; font-weight: 600; color: #0f172a; margin-bottom: 16px; }
        .detail-grid { display: grid; gap: 12px; }
        .detail-item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
        .detail-item:last-child { border-bottom: none; }
        .detail-label { color: #64748b; font-size: 14px; }
        .detail-value { color: #0f172a; font-weight: 500; font-size: 14px; }
        .price-section { background: #0f172a; color: white; padding: 20px; text-align: center; border-radius: 8px; margin: 24px 0; }
        .price-label { font-size: 13px; color: #94a3b8; margin-bottom: 4px; }
        .price-value { font-size: 36px; font-weight: 700; }
        .button { display: inline-block; background: #3b82f6; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; }
        .button-container { text-align: center; margin: 24px 0; }
        .footer { background: #f8fafc; padding: 24px 32px; text-align: center; border-top: 1px solid #e2e8f0; }
        .footer-text { color: #64748b; font-size: 13px; margin: 0; }
        .footer-link { color: #3b82f6; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="container">
          <div class="header">
            <img src="https://parcelreach.ai/parcelreach-logo.png" alt="ParcelReach" class="logo" />
          </div>
          <div class="content">
            <p style="margin-top: 0;">Hi ${toName || 'there'},</p>
            <p>A new land lead is available for purchase in your marketplace.</p>

            <div class="lead-card">
              <div class="lead-title">Property Details</div>
              <div class="detail-grid">
                <div class="detail-item">
                  <span class="detail-label">Location</span>
                  <span class="detail-value">${location}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Acreage</span>
                  <span class="detail-value">${acres} acres</span>
                </div>
              </div>
            </div>

            <div class="price-section">
              <div class="price-label">Lead Price</div>
              <div class="price-value">$${price}</div>
            </div>

            <p>Purchase this lead to unlock full property owner details including name, email, phone number, and exact parcel location.</p>

            <div class="button-container">
              <a href="https://parcelreach.ai/dashboard" class="button">View Lead Details</a>
            </div>
          </div>
          <div class="footer">
            <p class="footer-text">
              You received this email because you have an active ParcelReach account.<br />
              <a href="https://parcelreach.ai" class="footer-link">parcelreach.ai</a>
            </p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({ to: toEmail, subject, html });
}

/**
 * Send lead purchase confirmation email
 * @param {Object} params - Purchase confirmation parameters
 * @param {string} params.toEmail - Recipient email
 * @param {string} params.toName - Recipient name
 * @param {string} params.leadName - Property owner name
 * @param {string} params.location - Property location
 * @param {string} params.acres - Property acreage
 * @param {string} params.price - Amount paid
 * @param {string} params.email - Owner email
 * @param {string} params.phone - Owner phone
 * @param {string} params.address - Property address
 */
export async function sendLeadPurchaseConfirmation({ toEmail, toName, leadName, location, acres, price, email, phone, address }) {
  const subject = `Purchase Confirmed - ${leadName} Property`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1e293b; margin: 0; padding: 0; background: #f1f5f9; }
        .wrapper { background: #f1f5f9; padding: 40px 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); }
        .header { background: #0f172a; padding: 32px; text-align: center; }
        .logo { max-width: 200px; height: auto; }
        .content { padding: 32px; }
        .success-banner { background: #10b981; color: white; padding: 16px 24px; border-radius: 8px; text-align: center; margin-bottom: 24px; }
        .success-text { font-size: 16px; font-weight: 600; margin: 0; }
        .price-section { background: #0f172a; color: white; padding: 20px; text-align: center; border-radius: 8px; margin: 24px 0; }
        .price-label { font-size: 13px; color: #94a3b8; margin-bottom: 4px; }
        .price-value { font-size: 36px; font-weight: 700; }
        .lead-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; margin: 24px 0; }
        .lead-title { font-size: 18px; font-weight: 600; color: #0f172a; margin-bottom: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; }
        .detail-grid { display: grid; gap: 12px; }
        .detail-item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
        .detail-item:last-child { border-bottom: none; }
        .detail-label { color: #64748b; font-size: 14px; }
        .detail-value { color: #0f172a; font-weight: 500; font-size: 14px; text-align: right; }
        .button { display: inline-block; background: #3b82f6; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; }
        .button-container { text-align: center; margin: 24px 0; }
        .footer { background: #f8fafc; padding: 24px 32px; text-align: center; border-top: 1px solid #e2e8f0; }
        .footer-text { color: #64748b; font-size: 13px; margin: 0; }
        .footer-link { color: #3b82f6; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="container">
          <div class="header">
            <img src="https://parcelreach.ai/parcelreach-logo.png" alt="ParcelReach" class="logo" />
          </div>
          <div class="content">
            <div class="success-banner">
              <p class="success-text">Purchase Successful</p>
            </div>

            <p style="margin-top: 0;">Hi ${toName || 'there'},</p>
            <p>Your lead purchase was successful! You now have full access to the property owner details below.</p>

            <div class="price-section">
              <div class="price-label">Amount Paid</div>
              <div class="price-value">$${price}</div>
            </div>

            <div class="lead-card">
              <div class="lead-title">Owner Contact Information</div>
              <div class="detail-grid">
                <div class="detail-item">
                  <span class="detail-label">Owner Name</span>
                  <span class="detail-value">${leadName}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Email</span>
                  <span class="detail-value">${email || 'N/A'}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Phone</span>
                  <span class="detail-value">${phone || 'N/A'}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Address</span>
                  <span class="detail-value">${address || 'N/A'}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Location</span>
                  <span class="detail-value">${location}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Acreage</span>
                  <span class="detail-value">${acres} acres</span>
                </div>
              </div>
            </div>

            <p>This lead is now available in your dashboard with full details. Start reaching out to the property owner to begin your deal!</p>

            <div class="button-container">
              <a href="https://parcelreach.ai/dashboard" class="button">View in Dashboard</a>
            </div>
          </div>
          <div class="footer">
            <p class="footer-text">
              Questions? Contact us at notifications@parcelreach.ai<br />
              <a href="https://parcelreach.ai" class="footer-link">parcelreach.ai</a>
            </p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({ to: toEmail, subject, html });
}

/**
 * Send welcome email to new users after signup
 * @param {Object} params - Welcome email parameters
 * @param {string} params.toEmail - Recipient email
 * @param {string} params.firstName - User's first name
 */
export async function sendWelcomeEmail({ toEmail, firstName }) {
  const subject = `Welcome to ParcelReach`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1e293b; margin: 0; padding: 0; background: #f1f5f9; }
        .wrapper { background: #f1f5f9; padding: 40px 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); }
        .header { background: #0f172a; padding: 32px; text-align: center; }
        .logo { max-width: 200px; height: auto; }
        .content { padding: 32px; }
        .welcome-title { font-size: 24px; font-weight: 700; color: #0f172a; margin-bottom: 16px; }
        .feature-list { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; margin: 24px 0; }
        .feature-item { display: flex; align-items: flex-start; padding: 12px 0; border-bottom: 1px solid #e2e8f0; }
        .feature-item:last-child { border-bottom: none; }
        .feature-icon { width: 24px; height: 24px; background: #10b981; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 12px; flex-shrink: 0; color: white; font-size: 14px; }
        .feature-text { color: #475569; font-size: 15px; }
        .button { display: inline-block; background: #3b82f6; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; }
        .button-container { text-align: center; margin: 24px 0; }
        .footer { background: #f8fafc; padding: 24px 32px; text-align: center; border-top: 1px solid #e2e8f0; }
        .footer-text { color: #64748b; font-size: 13px; margin: 0; }
        .footer-link { color: #3b82f6; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="container">
          <div class="header">
            <img src="https://parcelreach.ai/parcelreach-logo.png" alt="ParcelReach" class="logo" />
          </div>
          <div class="content">
            <div class="welcome-title">Welcome to ParcelReach, ${firstName || 'there'}!</div>
            <p style="margin-top: 0;">Your account is ready. You now have access to high-quality land leads generated through our targeted PPC campaigns.</p>

            <div class="feature-list">
              <div class="feature-item">
                <div class="feature-icon">1</div>
                <div class="feature-text"><strong>Browse Leads</strong> - View available land leads in your dashboard with property details, acreage, and location.</div>
              </div>
              <div class="feature-item">
                <div class="feature-icon">2</div>
                <div class="feature-text"><strong>Purchase Leads</strong> - Buy leads to unlock full owner contact information including phone, email, and address.</div>
              </div>
              <div class="feature-item">
                <div class="feature-icon">3</div>
                <div class="feature-text"><strong>Close Deals</strong> - Reach out to motivated sellers and close more land deals.</div>
              </div>
            </div>

            <p>New leads are added regularly. We'll notify you when new properties matching your interests become available.</p>

            <div class="button-container">
              <a href="https://parcelreach.ai/dashboard" class="button">Go to Dashboard</a>
            </div>
          </div>
          <div class="footer">
            <p class="footer-text">
              Questions? Reply to this email or contact us at support@parcelreach.ai<br />
              <a href="https://parcelreach.ai" class="footer-link">parcelreach.ai</a>
            </p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({ to: toEmail, subject, html });
}
