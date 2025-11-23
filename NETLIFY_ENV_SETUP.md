# Netlify Environment Variable Setup

## CRITICAL: Required Environment Variables

The following environment variable **MUST** be set in your Netlify dashboard for the signature system to work:

### NEXT_PUBLIC_SITE_URL
**Value:** `https://parcelreach.ai`

**Why it's needed:** This variable is used in the email sending API (`/api/send-pa/route.js`) to generate the signature page URLs. Without it, the system defaults to `http://localhost:3000` which doesn't work in production.

## How to Set in Netlify:

1. Go to https://app.netlify.com/
2. Select your `parcelreach` site
3. Go to **Site configuration** → **Environment variables**
4. Click **Add a variable**
5. Set:
   - **Key:** `NEXT_PUBLIC_SITE_URL`
   - **Value:** `https://parcelreach.ai`
   - **Scopes:** All scopes (Production, Deploy Previews, Branch deploys)
6. Click **Create variable**
7. **Trigger a new deploy** for the change to take effect

## Alternative: Use Netlify CLI

```bash
cd /Users/jordanh/parcelreach
npx netlify env:set NEXT_PUBLIC_SITE_URL "https://parcelreach.ai"
npx netlify deploy --prod
```

## Other Environment Variables Already Set:

✅ NEXT_PUBLIC_SUPABASE_URL
✅ NEXT_PUBLIC_SUPABASE_ANON_KEY
✅ SUPABASE_SERVICE_ROLE_KEY
✅ SENDGRID_API_KEY
✅ SENDGRID_FROM_EMAIL

## Testing After Setup:

After setting the variable and deploying:

1. Check it's set: `curl https://parcelreach.ai/api/debug-env | python3 -m json.tool`
2. Should show: `"NEXT_PUBLIC_SITE_URL": "https://parcelreach.ai"`
3. Send a test PA and verify the email link points to `https://parcelreach.ai/sign/[token]` not `localhost`
