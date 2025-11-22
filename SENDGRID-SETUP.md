# SendGrid Email Setup for ParcelReach

## Why You Need This

The team invite feature creates invitations in the database successfully, but emails aren't being sent because SendGrid isn't configured. Without email delivery, invited users won't receive their invite links.

## Current Status

- ✅ Invite API working (creates invitations in database)
- ✅ SendGrid package installed (`@sendgrid/mail`)
- ❌ SendGrid API key not configured
- ❌ Emails not being sent (`emailSent: false`)

## Quick Setup (5 minutes)

### Step 1: Get a SendGrid API Key

1. Go to https://signup.sendgrid.com/ (free tier is fine)
2. Create an account and verify your email
3. Go to **Settings > API Keys**
4. Click **"Create API Key"**
5. Name it: `ParcelReach Production`
6. Select **"Full Access"** permissions
7. Click **Create & View**
8. **COPY THE KEY NOW** (you won't see it again!)

### Step 2: Verify Your Sender Email

1. In SendGrid, go to **Settings > Sender Authentication**
2. Click **"Verify a Single Sender"**
3. Enter your details:
   - From Email: `noreply@parcelreach.ai` (or use your domain)
   - From Name: `ParcelReach`
4. Click through the verification process
5. Check your email and click the verification link

**IMPORTANT**: You can only send emails from verified addresses!

### Step 3: Configure Netlify

1. Go to https://app.netlify.com/
2. Find your ParcelReach site
3. Go to **Site configuration > Environment variables**
4. Add these two variables:

```
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxx
SENDGRID_FROM_EMAIL=noreply@parcelreach.ai
```

5. Click **Save**
6. Go to **Deploys** and click **Trigger deploy > Deploy site**

### Step 4: Test It

Wait for the deploy to finish (2-3 minutes), then run:

```bash
bash test-invite-api.sh
```

Look for:
```json
{
  "success": true,
  "emailSent": true   ← Should now be TRUE!
}
```

## Local Testing (Optional)

If you want to test emails locally:

1. Create `.env.local` file:
```bash
cp .env.example .env.local
```

2. Add your SendGrid credentials to `.env.local`:
```
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxx
SENDGRID_FROM_EMAIL=noreply@parcelreach.ai
```

3. Run the test script:
```bash
node test-sendgrid.js your-email@example.com
```

4. Check your inbox!

## Troubleshooting

### Error: "Unauthorized" (401)
- Your API key is invalid or expired
- Create a new API key in SendGrid

### Error: "Forbidden" (403)
- Your sender email isn't verified
- Go to SendGrid > Settings > Sender Authentication
- Verify your email address

### Emails going to spam
- Set up domain authentication (SPF/DKIM)
- In SendGrid: Settings > Sender Authentication > Authenticate Your Domain
- Follow the DNS configuration steps

### Still showing `emailSent: false`
- Environment variables not saved in Netlify
- Site not redeployed after adding variables
- Check Netlify deploy logs for errors

## Testing Team Invites

After setup, test the full flow:

1. Go to https://parcelreach.ai/team/settings
2. Enter an email address and click "Send Invite"
3. Check the email inbox
4. Click the invite link
5. User should be able to create account OR log in
6. User automatically joins the team

## Free Tier Limits

SendGrid's free tier includes:
- **100 emails/day** (plenty for team invites)
- Email tracking and analytics
- API access

For most use cases, the free tier is sufficient.

## Support

If you run into issues:
1. Check Netlify deploy logs
2. Check SendGrid Activity Feed (Settings > Activity)
3. Run `node test-sendgrid.js` locally to isolate the issue
