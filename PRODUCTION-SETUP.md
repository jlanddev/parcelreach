# GarageLeadly - Production Setup Guide

## 🚀 GET THIS RUNNING IN 30 MINUTES

### 1️⃣ Stripe Setup (10 mins)

**Get API Keys:**
```
1. Go to: https://dashboard.stripe.com/register
2. Create account (or login)
3. Go to: Developers → API Keys
4. Copy these keys:
   - Secret key: sk_live_... (or sk_test_... for testing)
   - Publishable key: pk_live_... (or pk_test_...)
```

**Add to Both Projects:**

`garageleadly/.env.local`:
```bash
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

`texasgaragefix/.env.local`:
```bash
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

**Set up Webhook (for membership payments):**
```
1. Go to: https://dashboard.stripe.com/webhooks
2. Click "Add endpoint"
3. Endpoint URL: https://your-domain.com/api/webhooks/stripe
4. Select events: checkout.session.completed
5. Copy webhook signing secret: whsec_...
6. Add to garageleadly/.env.local:
   STRIPE_WEBHOOK_SECRET=whsec_...
```

---

### 2️⃣ Google Ads Conversion Tracking (5 mins)

**Get Conversion ID:**
```
1. Go to: https://ads.google.com
2. Tools → Conversions → New conversion
3. Choose "Website"
4. Category: "Lead"
5. Copy Conversion ID and Label
```

**Already Added to Code** - Just update these values in:
- `texasgaragefix/app/api/leads/route.js` (look for Google Ads tracking comment)

---

### 3️⃣ Run Database Migration (2 mins)

```
1. Go to: https://supabase.com/dashboard/project/xkeqkmpfjeyltqoomkjw/sql
2. Copy contents of: dynamic-pricing-schema.sql
3. Paste and click "Run"
```

---

### 4️⃣ Create Dummy Contractor Accounts (5 mins)

**Run this script:**
```bash
cd garageleadly
node setup-dummy-contractors.js
```

This creates 3 test contractors in Harris, Fort Bend, and Montgomery counties.

---

### 5️⃣ Deploy to Netlify (10 mins)

**Deploy GarageLeadly (contractor platform):**
```bash
cd garageleadly
npx netlify deploy --prod

# When prompted:
# Build command: npm run build
# Publish directory: .next
```

**Deploy TexasGarageFix (consumer site):**
```bash
cd texasgaragefix
npx netlify deploy --prod

# When prompted:
# Build command: npm run build
# Publish directory: .next
```

**Add Environment Variables in Netlify:**
```
For both sites, go to: Site settings → Environment variables
Add all vars from .env.local
```

---

## 🧪 TESTING CHECKLIST

### Day 1: Setup Test
- [ ] Submit test lead on TexasGarageFix
- [ ] Verify SMS received by contractor
- [ ] Check Supabase - lead assigned
- [ ] Check Supabase - transaction created with pricing

### Day 2-5: Run Ads
- [ ] Launch Google Ads campaign ($50/day budget)
- [ ] Point ads to: https://texasgaragefix.netlify.app
- [ ] Monitor leads coming in
- [ ] Check Stripe charges going through
- [ ] Verify contractors receiving SMS

### Week 1 Review
- [ ] Check Google Ads cost per lead
- [ ] Verify 20% margin is being applied
- [ ] Adjust margin if needed in platform_settings
- [ ] Scale budget up if profitable

---

## 💰 PRICING CONFIG

**Current Setup:**
- Google Ads fallback: $25/lead
- Platform margin: 20%
- Contractor pays: $30/lead

**To change margin:**
```sql
UPDATE platform_settings
SET setting_value = '0.30'
WHERE setting_key = 'platform_margin';
-- Now contractors pay: $25 × 1.30 = $32.50
```

---

## 📞 TWILIO SMS (Optional - Fix Later)

For now, SMS will fail but leads will still be assigned. To fix:
```
1. Go to: https://www.twilio.com/console
2. Get phone number or Messaging Service SID
3. Add to texasgaragefix/.env.local:
   TWILIO_MESSAGING_SERVICE_SID=MG...
```

---

## 🎯 READY TO LAUNCH

Once all above is done:
1. Submit test lead
2. Verify it works end-to-end
3. Launch Google Ads campaign
4. Monitor for 3-5 days
5. Adjust pricing/margins as needed
6. Scale up!
