import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const results = {
    timestamp: new Date().toISOString(),
    tests: [],
    passed: 0,
    failed: 0,
    warnings: 0
  };

  const addTest = (name, passed, message, data = null) => {
    results.tests.push({ name, passed, message, data });
    if (passed === true) results.passed++;
    else if (passed === false) results.failed++;
    else results.warnings++;
  };

  try {
    // Test 1: Environment Variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      addTest('Environment Variables', false, 'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
      return Response.json(results);
    }
    addTest('Environment Variables', true, 'All required env vars present');

    // Test 2: Supabase Connection
    try {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { error } = await supabase.from('signature_requests').select('count').limit(1);

      if (error) throw error;
      addTest('Supabase Connection', true, 'Successfully connected to Supabase');
    } catch (err) {
      addTest('Supabase Connection', false, `Connection failed: ${err.message}`);
      return Response.json(results);
    }

    // Test 3: Table Schema Check
    try {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data, error } = await supabase
        .from('signature_requests')
        .select('*')
        .limit(1);

      if (error) throw error;
      addTest('Table Schema', true, 'signature_requests table exists and accessible');
    } catch (err) {
      addTest('Table Schema', false, `Table check failed: ${err.message}. Run the SQL schema!`);
      return Response.json(results);
    }

    // Test 4: Create Test Signature Request
    try {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const testToken = `apitest-${Date.now()}`;

      const { data, error: insertError } = await supabase
        .from('signature_requests')
        .insert([{
          token: testToken,
          pa_html: '<div><h1>API AUTO TEST</h1><p>This was created by automated API test</p></div>',
          seller_name: 'API Test Seller',
          seller_email: 'apitest@example.com',
          seller_phone: '555-9999',
          buyer_entity: 'API Test LLC',
          purchase_price: 123456,
          property_address: 'API Test Address',
          status: 'pending'
        }])
        .select()
        .single();

      if (insertError) throw insertError;

      addTest('Create Signature Request', true, 'Successfully created test request', { token: testToken, id: data.id });

      // Test 5: Fetch Test Request
      const { data: fetchedData, error: fetchError } = await supabase
        .from('signature_requests')
        .select('*')
        .eq('token', testToken)
        .single();

      if (fetchError) throw fetchError;

      addTest('Fetch Signature Request', true, 'Successfully fetched test request', {
        seller_name: fetchedData.seller_name,
        status: fetchedData.status
      });

      // Test 6: Generate Signature URL
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
      const signatureUrl = `${baseUrl}/sign/${testToken}`;

      addTest('URL Generation', true, 'Generated signature URL', { url: signatureUrl });

      // Test 7: Check if signature page is accessible
      try {
        const response = await fetch(signatureUrl, { method: 'HEAD' });
        addTest('Page Accessibility', response.ok, `Signature page returned ${response.status}`, {
          status: response.status,
          url: signatureUrl
        });
      } catch (err) {
        addTest('Page Accessibility', null, `Could not verify: ${err.message}`, { url: signatureUrl });
      }

      // Clean up test data
      await supabase
        .from('signature_requests')
        .delete()
        .eq('token', testToken);

    } catch (err) {
      addTest('Create Signature Request', false, err.message);
    }

  } catch (err) {
    addTest('Unexpected Error', false, err.message);
  }

  results.summary = `${results.passed} passed, ${results.failed} failed, ${results.warnings} warnings`;
  results.allPassed = results.failed === 0;

  return Response.json(results, {
    status: results.failed > 0 ? 500 : 200,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}
