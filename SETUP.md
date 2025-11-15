# GarageLeadly Setup Guide

## What's Been Built

✅ Complete Next.js app with Tailwind CSS
✅ Landing page with pricing and features
✅ Multi-step signup flow (company info → territory → account)
✅ Login page with authentication
✅ Member dashboard with:
  - Overview stats (leads, spend, revenue, ROI)
  - Full CRM for tracking leads
  - Budget management
  - Settings panel

## What You Need To Do

### 1. Create Supabase Project

1. Go to https://supabase.com
2. Create a new project
3. Wait for it to provision (~2 minutes)
4. Go to SQL Editor
5. Copy and paste the entire contents of `supabase-schema.sql`
6. Click "Run" to create all tables

### 2. Get Supabase Credentials

1. In Supabase, go to Settings → API
2. Copy your Project URL
3. Copy your `anon` public key
4. Open `.env.local` in this project
5. Replace these values:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_actual_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_actual_anon_key
   ```

### 3. Set Up Stripe (Optional for now)

1. Go to https://stripe.com
2. Create account or login
3. Go to Developers → API Keys
4. Copy Secret Key and Publishable Key
5. Add to `.env.local`:
   ```
   STRIPE_SECRET_KEY=sk_test_...
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
   ```

### 4. Test The App

The dev server is already running at **http://localhost:3000**

Try these flows:
1. Visit landing page
2. Click "Sign Up" and go through the 3-step form
3. Create an account (will fail until Supabase is configured)
4. Login after creating account
5. Explore the dashboard

### 5. Enable Supabase Auth

1. In Supabase, go to Authentication → Providers
2. Enable Email provider
3. Configure email templates (optional)

## Current Status

**WORKING:**
- Landing page design
- Signup/Login UI
- Dashboard UI
- CRM interface
- All frontend components

**NEEDS SUPABASE:**
- User registration
- Login authentication
- Database queries
- Lead data

**NOT YET BUILT:**
- Stripe payment flow (pending)
- Admin dashboard (pending)
- Lead routing system (pending)
- SMS delivery (pending)

## Next Steps

1. **Set up Supabase** (15 minutes)
   - Create project
   - Run SQL schema
   - Add credentials to .env.local

2. **Test signup/login** (5 minutes)
   - Create a test account
   - Login to dashboard
   - Verify it works

3. **Add Stripe integration** (1-2 hours)
   - Build payment flow
   - Connect to membership fee
   - Handle subscription

4. **Build admin dashboard** (2-3 hours)
   - View all members
   - Approve/reject signups
   - Manage territories
   - View revenue

5. **Implement lead routing** (3-4 hours)
   - API endpoint to receive leads
   - Match to county members
   - Round-robin distribution
   - Budget tracking

6. **Add SMS delivery** (1 hour)
   - Set up Twilio
   - Send lead via SMS
   - Track delivery

## Environment Variables

Make sure `.env.local` has all these:

```bash
# Supabase (REQUIRED)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here

# Stripe (for payments)
STRIPE_SECRET_KEY=your_stripe_secret_key_here
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key_here

# Twilio (for SMS delivery)
TWILIO_ACCOUNT_SID=your_twilio_sid_here
TWILIO_AUTH_TOKEN=your_twilio_auth_token_here
TWILIO_PHONE_NUMBER=your_twilio_phone_here
```

## Tech Stack

- **Frontend:** Next.js 16, React 19, Tailwind CSS
- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth
- **Payments:** Stripe
- **SMS:** Twilio
- **Hosting:** Netlify (recommended)

## Project Structure

```
garageleadly/
├── app/
│   ├── page.js              # Landing page
│   ├── login/page.js        # Login
│   ├── signup/page.js       # Signup (3 steps)
│   ├── dashboard/page.js    # Member dashboard + CRM
│   ├── layout.js            # Root layout
│   └── globals.css          # Global styles
├── lib/
│   └── supabase.js          # Supabase client
├── .env.local               # Environment variables
├── supabase-schema.sql      # Database schema
├── next.config.js           # Next.js config
└── tailwind.config.js       # Tailwind config
```

## Questions?

The app is fully functional on the frontend. Once you set up Supabase (15 minutes), the entire signup/login/dashboard flow will work end-to-end!
