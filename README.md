# GarageLeadly

Exclusive lead generation platform for garage door contractors. Territory-based membership model with instant SMS delivery of verified, exclusive leads.

## Overview

GarageLeadly connects homeowners with garage door problems to professional contractors through an exclusive territory system. Unlike traditional lead services that sell the same lead to multiple contractors, we provide 100% exclusive leads with instant SMS delivery.

## Business Model

- **Territory Fee:** $1,200/year for exclusive county rights
- **Lead Cost:** $40-50 per exclusive lead
- **Distribution:** Round robin among 3-5 contractors per territory
- **Delivery:** Instant SMS notification with full customer details

## Tech Stack

- **Frontend:** Next.js 16 with App Router
- **UI:** React 19.2.0 + Tailwind CSS 3.4
- **Database:** Supabase (PostgreSQL)
- **Payments:** Stripe
- **SMS:** Twilio for notifications and phone verification
- **Hosting:** Netlify

## Features

### Current (MVP)
- Landing page with live SMS lead demo
- Rotating lead examples
- Dashboard/CRM preview
- Pricing information
- Login/signup flows
- Database schema

### Planned
- Lead intake form with Twilio phone verification
- Round robin assignment logic
- Automated SMS notifications to contractors
- Full CRM dashboard for tracking leads
- Stripe payment integration (membership + per-lead)
- Admin panel for managing contractors and territories
- ROI analytics and reporting
- Daily budget controls
- Campaign tracking integration

## Project Structure

```
garageleadly/
├── app/
│   ├── page.js              # Landing page
│   ├── login/page.js         # Login page
│   ├── signup/page.js        # Signup page
│   ├── dashboard/page.js     # Contractor dashboard
│   ├── layout.js             # Root layout
│   └── globals.css           # Global styles
├── lib/
│   └── supabase.js           # Supabase client setup
├── supabase-schema.sql       # Database schema
├── SETUP.md                  # Setup instructions
└── README.md                 # This file
```

## Database Schema

### Tables
- **contractors** - Contractor profiles and membership info
- **territories** - County/territory assignments
- **leads** - Customer lead data
- **lead_assignments** - Round robin tracking
- **transactions** - Payment history

## Setup

1. Clone the repository:
```bash
git clone https://github.com/jlanddev/garageleadly.git
cd garageleadly
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables (create `.env.local`):
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
STRIPE_SECRET_KEY=your_stripe_secret_key
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000)

## Revenue Projections

- **Year 1:** 100 members = $650k revenue
- **Year 3:** 500 members = $3.25M revenue
- **Year 5:** 2,000 members = $13M revenue
- **Exit Potential:** 3-5x revenue = $30-50M

## Market Opportunity

- 100,000+ garage door contractors in the US
- Emergency repair nature = high intent leads
- Local monopoly model with HomeAdvisor/Angi
- Exclusive leads create premium value proposition

## Contributing

This is a private project. For questions or access, contact the project owner.

## License

Private - All Rights Reserved
