import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import crypto from 'crypto';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

// Test results collector
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function logTest(name, passed, details = null, error = null) {
  results.tests.push({
    name,
    passed,
    details,
    error: error?.message || error
  });
  if (passed) results.passed++;
  else results.failed++;
}

export async function GET(request) {
  const url = new URL(request.url);
  const runCount = parseInt(url.searchParams.get('rounds') || '1');
  const testType = url.searchParams.get('type') || 'all';

  // Reset results
  results.passed = 0;
  results.failed = 0;
  results.tests = [];

  const supabase = getSupabase();
  const stripe = getStripe();
  const testId = crypto.randomBytes(4).toString('hex');
  const testEmail = `test_${testId}@parcelreach-test.com`;

  console.log(`🧪 Starting E2E tests - ${runCount} round(s), type: ${testType}`);

  for (let round = 1; round <= runCount; round++) {
    const roundId = `${testId}_r${round}`;
    console.log(`\n📍 Round ${round}/${runCount}`);

    try {
      // ============================================
      // 1. DATABASE CONNECTION TEST
      // ============================================
      if (testType === 'all' || testType === 'db') {
        try {
          const { data, error } = await supabase.from('users').select('id').limit(1);
          logTest(`[R${round}] Database Connection`, !error, { rowsFound: data?.length }, error);
        } catch (e) {
          logTest(`[R${round}] Database Connection`, false, null, e);
        }
      }

      // ============================================
      // 2. STRIPE CONNECTION TEST
      // ============================================
      if (testType === 'all' || testType === 'stripe') {
        try {
          const balance = await stripe.balance.retrieve();
          const isTestMode = balance.livemode === false;
          logTest(`[R${round}] Stripe Connection`, true, {
            testMode: isTestMode,
            available: balance.available?.[0]?.amount / 100
          });
        } catch (e) {
          logTest(`[R${round}] Stripe Connection`, false, null, e);
        }
      }

      // ============================================
      // 3. STRIPE CHECKOUT SESSION TEST
      // ============================================
      if (testType === 'all' || testType === 'stripe') {
        try {
          const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
              price_data: {
                currency: 'usd',
                product_data: { name: 'E2E Test Product' },
                unit_amount: 100,
              },
              quantity: 1,
            }],
            mode: 'payment',
            success_url: 'https://parcelreach.ai/test-success',
            cancel_url: 'https://parcelreach.ai/test-cancel',
          });
          logTest(`[R${round}] Stripe Checkout Creation`, !!session.id, {
            sessionId: session.id?.substring(0, 20) + '...',
            url: session.url?.substring(0, 50) + '...'
          });
        } catch (e) {
          logTest(`[R${round}] Stripe Checkout Creation`, false, null, e);
        }
      }

      // ============================================
      // 4. STRIPE SUBSCRIPTION CHECKOUT TEST
      // ============================================
      if (testType === 'all' || testType === 'stripe') {
        try {
          const subSession = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
              price_data: {
                currency: 'usd',
                product_data: { name: 'E2E Test Subscription' },
                unit_amount: 9700,
                recurring: { interval: 'month' },
              },
              quantity: 1,
            }],
            mode: 'subscription',
            subscription_data: { trial_period_days: 7 },
            success_url: 'https://parcelreach.ai/test-success',
            cancel_url: 'https://parcelreach.ai/test-cancel',
          });
          logTest(`[R${round}] Stripe Subscription Checkout`, !!subSession.id, {
            sessionId: subSession.id?.substring(0, 20) + '...',
            hasTrialDays: true
          });
        } catch (e) {
          logTest(`[R${round}] Stripe Subscription Checkout`, false, null, e);
        }
      }

      // ============================================
      // 5. LEADS TABLE ACCESS TEST
      // ============================================
      if (testType === 'all' || testType === 'db') {
        try {
          const { data: leads, error } = await supabase
            .from('leads')
            .select('id, property_county, property_state, price, created_at')
            .order('created_at', { ascending: false })
            .limit(5);
          logTest(`[R${round}] Leads Table Access`, !error, {
            leadsFound: leads?.length,
            hasPrice: leads?.filter(l => l.price)?.length
          }, error);
        } catch (e) {
          logTest(`[R${round}] Leads Table Access`, false, null, e);
        }
      }

      // ============================================
      // 6. TEAMS TABLE ACCESS TEST
      // ============================================
      if (testType === 'all' || testType === 'db') {
        try {
          const { data: teams, error } = await supabase
            .from('teams')
            .select('id, name, subscription_type')
            .limit(5);
          logTest(`[R${round}] Teams Table Access`, !error, {
            teamsFound: teams?.length
          }, error);
        } catch (e) {
          logTest(`[R${round}] Teams Table Access`, false, null, e);
        }
      }

      // ============================================
      // 7. USERS TABLE ACCESS TEST
      // ============================================
      if (testType === 'all' || testType === 'db') {
        try {
          const { data: users, error } = await supabase
            .from('users')
            .select('id, email, full_name')
            .limit(5);
          logTest(`[R${round}] Users Table Access`, !error, {
            usersFound: users?.length
          }, error);
        } catch (e) {
          logTest(`[R${round}] Users Table Access`, false, null, e);
        }
      }

      // ============================================
      // 8. LEAD PURCHASES TABLE TEST
      // ============================================
      if (testType === 'all' || testType === 'db') {
        try {
          const { data: purchases, error } = await supabase
            .from('lead_purchases')
            .select('id, lead_id, user_id, price_paid')
            .order('purchased_at', { ascending: false })
            .limit(5);
          logTest(`[R${round}] Lead Purchases Table`, !error, {
            purchasesFound: purchases?.length
          }, error);
        } catch (e) {
          logTest(`[R${round}] Lead Purchases Table`, false, null, e);
        }
      }

      // ============================================
      // 9. NOTIFICATIONS TABLE TEST
      // ============================================
      if (testType === 'all' || testType === 'db') {
        try {
          const { data: notifs, error } = await supabase
            .from('notifications')
            .select('id, title, type')
            .limit(5);
          logTest(`[R${round}] Notifications Table`, !error, {
            notifsFound: notifs?.length
          }, error);
        } catch (e) {
          logTest(`[R${round}] Notifications Table`, false, null, e);
        }
      }

      // ============================================
      // 10. TEAM INVITATIONS TABLE TEST
      // ============================================
      if (testType === 'all' || testType === 'db') {
        try {
          const { data: invites, error } = await supabase
            .from('team_invitations')
            .select('id, email, accepted')
            .limit(5);
          logTest(`[R${round}] Team Invitations Table`, !error, {
            invitesFound: invites?.length
          }, error);
        } catch (e) {
          logTest(`[R${round}] Team Invitations Table`, false, null, e);
        }
      }

      // ============================================
      // 11. FB CONVERSION API TOKEN CHECK
      // ============================================
      if (testType === 'all' || testType === 'fb') {
        const fbToken = process.env.FB_CONVERSION_API_TOKEN;
        logTest(`[R${round}] FB Conversion API Token`, !!fbToken && fbToken.length > 20, {
          tokenSet: !!fbToken,
          tokenLength: fbToken?.length
        });
      }

      // ============================================
      // 12. SENDGRID CONFIG TEST
      // ============================================
      if (testType === 'all' || testType === 'email') {
        const sgKey = process.env.SENDGRID_API_KEY;
        const sgFrom = process.env.SENDGRID_FROM_EMAIL;
        logTest(`[R${round}] SendGrid Config`, !!sgKey && sgKey !== 'your_sendgrid_api_key_here', {
          apiKeySet: !!sgKey && sgKey !== 'your_sendgrid_api_key_here',
          fromEmail: sgFrom
        });
      }

      // ============================================
      // 13. PRICED LEADS AVAILABLE TEST
      // ============================================
      if (testType === 'all' || testType === 'leads') {
        try {
          const { data: pricedLeads, error } = await supabase
            .from('leads')
            .select('id, price, property_county, acres')
            .not('price', 'is', null)
            .gt('price', 0)
            .limit(10);
          logTest(`[R${round}] Priced Leads Available`, !error && pricedLeads?.length > 0, {
            pricedLeadsCount: pricedLeads?.length,
            samplePrices: pricedLeads?.slice(0, 3).map(l => l.price)
          }, error);
        } catch (e) {
          logTest(`[R${round}] Priced Leads Available`, false, null, e);
        }
      }

      // ============================================
      // 14. LEAD ASSIGNMENTS TABLE TEST
      // ============================================
      if (testType === 'all' || testType === 'db') {
        try {
          const { data: assignments, error } = await supabase
            .from('lead_assignments')
            .select('id, lead_id, team_id')
            .limit(5);
          logTest(`[R${round}] Lead Assignments Table`, !error, {
            assignmentsFound: assignments?.length
          }, error);
        } catch (e) {
          logTest(`[R${round}] Lead Assignments Table`, false, null, e);
        }
      }

      // ============================================
      // 15. TEAM LEAD DATA TABLE TEST
      // ============================================
      if (testType === 'all' || testType === 'db') {
        try {
          const { data: teamLeadData, error } = await supabase
            .from('team_lead_data')
            .select('id, lead_id, team_id, status')
            .limit(5);
          logTest(`[R${round}] Team Lead Data Table`, !error, {
            recordsFound: teamLeadData?.length
          }, error);
        } catch (e) {
          logTest(`[R${round}] Team Lead Data Table`, false, null, e);
        }
      }

      // ============================================
      // 16. STRIPE CUSTOMER CREATION TEST
      // ============================================
      if (testType === 'all' || testType === 'stripe') {
        try {
          const customer = await stripe.customers.create({
            email: `e2e_test_${roundId}@parcelreach-test.com`,
            name: `E2E Test User ${round}`,
            metadata: { test: 'true', round: round.toString() }
          });
          // Immediately delete to clean up
          await stripe.customers.del(customer.id);
          logTest(`[R${round}] Stripe Customer Create/Delete`, true, {
            customerId: customer.id,
            deleted: true
          });
        } catch (e) {
          logTest(`[R${round}] Stripe Customer Create/Delete`, false, null, e);
        }
      }

      // ============================================
      // 17. ENV VARS COMPLETE CHECK
      // ============================================
      if (testType === 'all' || testType === 'env') {
        const requiredEnvs = [
          'NEXT_PUBLIC_SUPABASE_URL',
          'NEXT_PUBLIC_SUPABASE_ANON_KEY',
          'SUPABASE_SERVICE_ROLE_KEY',
          'STRIPE_SECRET_KEY',
          'SENDGRID_API_KEY',
          'NEXT_PUBLIC_BASE_URL'
        ];
        const missing = requiredEnvs.filter(e => !process.env[e]);
        logTest(`[R${round}] Required Env Vars`, missing.length === 0, {
          checked: requiredEnvs.length,
          missing: missing
        });
      }

    } catch (roundError) {
      logTest(`[R${round}] Round Error`, false, null, roundError);
    }
  }

  // Summary
  const summary = {
    timestamp: new Date().toISOString(),
    rounds: runCount,
    testType,
    totalTests: results.tests.length,
    passed: results.passed,
    failed: results.failed,
    passRate: `${((results.passed / results.tests.length) * 100).toFixed(1)}%`,
    tests: results.tests
  };

  console.log(`\n✅ Tests complete: ${results.passed}/${results.tests.length} passed (${summary.passRate})`);

  return NextResponse.json(summary);
}
