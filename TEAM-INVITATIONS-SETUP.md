# Team Invitations Setup Guide

## Overview
Complete team invitation system with email notifications via SendGrid.

## Features Built
- ✅ Team invitation API (`/api/team/invite`)
- ✅ Team invitation acceptance page (`/team/join`)
- ✅ Team settings UI (`/team/settings`)
- ✅ SendGrid email integration
- ✅ Token-based invitations with 7-day expiry
- ✅ Email notifications with branded templates

## SQL Migrations Required

### Step 1: Run Notifications Schema
1. Open Supabase Dashboard: https://supabase.com/dashboard
2. Go to your **lead-bid** project (`snfttvopjrpzsypteiby`)
3. Click **SQL Editor** in the left sidebar
4. Click **New Query**
5. Copy and paste the entire contents of `supabase-notifications-schema.sql`
6. Click **Run** (or press Cmd/Ctrl + Enter)
7. Verify success message: "Success. No rows returned"

### Step 2: Run Team Invitations Schema
1. In SQL Editor, click **New Query** again
2. Copy and paste the entire contents of `supabase-team-invitations-schema.sql`
3. Click **Run**
4. Verify success message: "Success. No rows returned"

### Step 3: Verify Tables Created
Run this query to verify both tables exist:
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('notifications', 'team_invitations');
```

You should see both tables listed.

## Environment Variable Issue - IMPORTANT! ⚠️

**There is a mismatch in your `.env.local` file:**

- Your Supabase URL is: `https://snfttvopjrpzsypteiby.supabase.co`
- But your `SUPABASE_SERVICE_ROLE_KEY` is for a different project: `xkeqkmpfjeytlqoomkjw`

### To Fix:
1. Go to Supabase Dashboard
2. Select the **correct project** for lead-bid (snfttvopjrpzsypteiby)
3. Go to **Settings** → **API**
4. Copy the **service_role** key (under "Project API keys")
5. Update `.env.local`:
   ```env
   SUPABASE_SERVICE_ROLE_KEY=<paste_the_correct_service_role_key_here>
   ```
6. Add to Netlify:
   ```bash
   npx netlify env:set SUPABASE_SERVICE_ROLE_KEY "<your_service_role_key>"
   ```

## Testing the Team Invitation Flow

### 1. Send an Invitation
1. Navigate to http://localhost:3001/team/settings
2. Enter a test email address (can be your own or a dummy email)
3. Click "Send Invite"
4. You should see: "Invitation sent to [email]"
5. Check the email inbox for the invitation email

### 2. Accept the Invitation
1. Open the invitation email
2. Click "Accept Invitation" button
3. You'll be redirected to `/team/join?token=...`
4. If not logged in: Click "Sign Up to Accept" → creates account
5. If logged in with matching email: Click "Accept Invitation"
6. Success! Redirected to dashboard

### 3. Verify Team Member Added
1. Go back to `/team/settings`
2. The new member should appear in "Team Members" list
3. The pending invitation should be removed

## Files Created

### API Routes
- `app/api/team/invite/route.js` - Send team invitation
- `app/api/team/accept-invite/route.js` - Accept invitation and join team

### Pages
- `app/team/join/page.js` - Invitation acceptance page
- `app/team/settings/page.js` - Team management UI

### Database Schemas
- `supabase-team-invitations-schema.sql` - Team invitations table
- `supabase-notifications-schema.sql` - Notifications table (for @mentions)

### Email Templates
- `lib/email.js` - Added `sendTeamInviteEmail()` function

## Email Template Preview

The invitation email includes:
- ParcelReach branding
- Team name
- Inviter's name
- Prominent "Accept Invitation" button
- Expiration notice (7 days)
- Professional styling

## Security Features

1. **Token-based invitations** - Secure random tokens
2. **Email verification** - Must sign in with invited email
3. **Expiration** - Tokens expire after 7 days
4. **One-time use** - Invitations marked as accepted
5. **Row Level Security** - Database policies enforce access control
6. **Service role required** - Only server-side code can create invitations

## Next Steps

After running the migrations:
1. Fix the SUPABASE_SERVICE_ROLE_KEY mismatch
2. Test sending an invitation to a dummy email
3. Test accepting the invitation
4. Verify the team member appears in `/team/settings`
5. Optional: Add link to Team Settings from dashboard navigation

## Troubleshooting

**Invitation email not received?**
- Check SendGrid domain verification is complete
- Wait 5-10 minutes for DNS propagation
- Check spam folder
- Verify SENDGRID_API_KEY is set correctly

**"Invalid or expired invitation" error?**
- Check that SQL migrations were run successfully
- Verify token in URL matches database
- Check invitation hasn't expired (7 days)

**"User not found" error?**
- User must create account first before accepting
- Email must match the invitation email exactly

**Database errors?**
- Verify SUPABASE_SERVICE_ROLE_KEY is correct for this project
- Ensure both SQL schemas were run successfully
- Check Supabase logs in dashboard
