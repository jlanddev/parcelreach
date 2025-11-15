# GarageLeadly - Ready to Launch

## ✅ WHAT'S BUILT (Just Now)

### Dynamic Pricing System
- ✅ Database schema created (`dynamic-pricing-schema.sql`)
- ✅ Pricing calculator lib (`lib/pricing.js`)
- ✅ Lead routing updated with dynamic pricing
- ✅ Instant Stripe charge logic (ready to activate)
- ✅ Transaction records include Google Ads cost + margin

### How It Works
1. Lead comes in from TexasGarageFix
2. System calculates: Google Ads cost × 1.20 = Platform price
3. Lead assigned to contractor
4. Stripe charges contractor instantly
5. SMS sent to contractor
6. Everything recorded in database

---

## 🚀 WHAT YOU NEED TO DO RIGHT NOW

### 1. Run Database Migration (5 mins)
```bash
# Go to Supabase SQL Editor:
https://supabase.com/dashboard/project/xkeqkmpfjeyltqoomkjw/sql

# Copy and paste the contents of:
/Users/jordanh/Southerly-Website/garageleadly/dynamic-pricing-schema.sql

# Click "Run" to create the new tables
```

### 2. Get Stripe Keys (5 mins)
```bash
# Go to: https://dashboard.stripe.com/test/apikeys
# Copy your keys and add to .env.local:

STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_... (after setting up webhook)
```

### 3. Add Missing Env Vars
```bash
# Add to garageleadly/.env.local:
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

---

## 📋 STILL NEED TO BUILD

### Campaign Creation (High Priority)
Contractors need to create campaigns to receive leads. Build:
- `/dashboard/campaigns/new` page
- Form to set:
  - County selection
  - Daily lead cap
  - Job types (residential/commercial)
- Save to `campaigns` table

### Stripe Customer Creation
During contractor signup:
- Create Stripe customer
- Save `stripe_customer_id` to contractors table
- Use for instant per-lead charging

### Fix Twilio SMS
- Get valid Messaging Service SID OR
- Use phone number directly instead

---

## 🧪 TESTING FLOW

Once database + Stripe are set up:

1. **Test Lead Submission**
```bash
# Visit: http://localhost:3002
# Submit a lead
# Check console logs for:
#   - "💰 Dynamic pricing: { platformPrice: 30.00 }"
#   - "💳 Would charge contractor: $30.00"
```

2. **Check Database**
```sql
SELECT * FROM lead_costs ORDER BY created_at DESC LIMIT 1;
-- Should show Google cost, margin, platform price

SELECT * FROM transactions ORDER BY created_at DESC LIMIT 1;
-- Should show transaction with google_ads_cost and margin_applied
```

---

## 💰 CURRENT PRICING SETUP

- **Google Ads fallback:** $25.00 per lead
- **Platform margin:** 20%
- **Contractor pays:** $30.00 per lead

You can change these anytime in `platform_settings` table:
```sql
UPDATE platform_settings SET setting_value = '0.25' WHERE setting_key = 'platform_margin';
```

---

## 🎯 LAUNCH CHECKLIST

- [ ] Run dynamic pricing SQL migration
- [ ] Add Stripe keys to .env.local
- [ ] Build campaign creation page
- [ ] Add Stripe customer creation to signup
- [ ] Test full flow: signup → campaign → lead → charge
- [ ] Fix Twilio SMS
- [ ] Deploy to production
- [ ] Start running Google Ads!

---

## 📁 FILES CREATED

- `dynamic-pricing-schema.sql` - Database migration
- `lib/pricing.js` - Pricing calculator
- `app/api/create-checkout-session/route.js` - Stripe checkout
- `app/api/webhooks/stripe/route.js` - Stripe webhook handler
- `app/signup/success/page.js` - Payment success page

Updated:
- `texasgaragefix/app/api/leads/route.js` - Now uses dynamic pricing
