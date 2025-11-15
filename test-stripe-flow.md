# Testing Stripe Charges in Sandbox

## You're in TEST MODE - No Real Money!
Your keys start with `pk_test_` and `sk_test_` - all charges are fake.

## Testing Flow:

### 1. Run Database Migration
Go to: https://supabase.com/dashboard/project/xkeqkmpfjeyltqoomkjw/sql
Paste and run: stripe-billing-schema.sql

### 2. Create Stripe Customers
```bash
cd garageleadly
node setup-stripe-customers.js
```
This creates Stripe customers for your 3 test contractors.

### 3. Test Payment Method Setup (Optional)
Go to http://localhost:3000 (GarageLeadly dashboard)
Add test card:
- Card: 4242 4242 4242 4242
- Expiry: 12/25
- CVC: 123
- ZIP: 77001

### 4. Test Lead Charge
Submit a lead on TexasGarageFix: http://localhost:3002

What happens:
1. Lead comes in
2. System finds contractor (Harris County)
3. Checks budget: spent_today < daily_budget
4. **Charges $30 to Stripe (TEST CHARGE)**
5. Updates spent_today
6. Sends SMS to contractor

### 5. View Test Charges
Go to Stripe Dashboard:
https://dashboard.stripe.com/test/payments

You'll see all test charges there!

## Stripe Test Cards

**Success:**
- 4242 4242 4242 4242 (Visa - always succeeds)

**Failure (to test retry system):**
- 4000 0000 0000 0002 (Declined)
- 4000 0000 0000 9995 (Insufficient funds)

## What You'll See

**In Stripe Dashboard:**
- Customer created: harris@test.com
- Charge: $30.00 USD
- Status: Succeeded
- Description: "Lead charge for lead_abc123"

**In Supabase:**
- `lead_charges` table: Record of charge
- `contractors.spent_today`: Increased by $30
- `leads` table: Assigned to contractor

**In Terminal:**
```
✅ Charged contractor: harris@test.com $30.00
Stripe charge ID: ch_test_abc123
```

## No Webhook Needed for Testing!
Charges work instantly. Webhooks are only for:
- Payment method attached events
- Failed charge notifications
- Subscription changes (future)
