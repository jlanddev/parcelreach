import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export async function GET(request) {
  const supabase = getSupabase();
  const results = [];

  try {
    // Test 1: Check if price column exists
    const { data: testPrice, error: priceError } = await supabase
      .from('leads')
      .select('id, price')
      .limit(1);

    results.push({
      test: 'Price column exists',
      success: !priceError,
      error: priceError?.message
    });

    // Test 2: Check if lead_purchases table exists
    const { data: testPurchases, error: purchasesError } = await supabase
      .from('lead_purchases')
      .select('*')
      .limit(1);

    results.push({
      test: 'Lead purchases table exists',
      success: !purchasesError,
      error: purchasesError?.message
    });

    // Test 3: Create test lead with price
    const { data: testLead, error: leadError } = await supabase
      .from('leads')
      .insert([{
        name: 'API Test Lead',
        full_name: 'API Test Lead',
        email: 'apitest@test.com',
        phone: '555-0000',
        property_state: 'TX',
        property_county: 'Travis',
        acres: 25,
        price: 197.00,
        source: 'api-test',
        latitude: 30.2672,
        longitude: -97.7431
      }])
      .select()
      .single();

    results.push({
      test: 'Create priced lead',
      success: !leadError,
      data: testLead,
      error: leadError?.message
    });

    // Test 4: Query priced leads
    const { data: pricedLeads, error: queryError } = await supabase
      .from('leads')
      .select('*')
      .not('price', 'is', null)
      .limit(5);

    results.push({
      test: 'Query priced leads',
      success: !queryError,
      count: pricedLeads?.length,
      data: pricedLeads,
      error: queryError?.message
    });

    // Test 5: Check lead_assignments
    const { data: assignments, error: assignError } = await supabase
      .from('lead_assignments')
      .select('*')
      .limit(5);

    results.push({
      test: 'Query lead assignments',
      success: !assignError,
      count: assignments?.length,
      data: assignments,
      error: assignError?.message
    });

    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      results
    });

  } catch (error) {
    return Response.json({
      success: false,
      error: error.message,
      results
    }, { status: 500 });
  }
}
