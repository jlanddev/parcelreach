import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const results = {
    timestamp: new Date().toISOString(),
    tests: [],
    passed: 0,
    failed: 0
  };

  const addTest = (name, passed, message, data = null) => {
    results.tests.push({ name, passed, message, data });
    if (passed) results.passed++;
    else results.failed++;
  };

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // TEST 1: Create signature request
    const testToken = `flowtest-${Date.now()}`;
    const { data: createData, error: createError } = await supabase
      .from('signature_requests')
      .insert([{
        token: testToken,
        pa_html: '<h1>FLOW TEST</h1><p>Testing complete signature flow</p>',
        seller_name: 'Flow Test Seller',
        seller_email: 'flow@test.com',
        seller_phone: '555-0000',
        buyer_entity: 'Flow Test LLC',
        purchase_price: 150000,
        property_address: 'Flow Test Address',
        status: 'pending'
      }])
      .select()
      .single();

    if (createError) {
      addTest('Create Signature Request', false, createError.message);
      return Response.json(results, { status: 500 });
    }

    addTest('Create Signature Request', true, 'Successfully created', { token: testToken });

    // TEST 2: Fetch via API route
    try {
      const apiResponse = await fetch(`https://parcelreach.ai/api/signature-request/${testToken}`);
      const apiData = await apiResponse.json();

      if (!apiResponse.ok) {
        addTest('API Route Fetch', false, apiData.error || 'API returned error');
      } else if (!apiData.data) {
        addTest('API Route Fetch', false, 'API returned no data');
      } else if (apiData.data.seller_name !== 'Flow Test Seller') {
        addTest('API Route Fetch', false, 'Data mismatch');
      } else {
        addTest('API Route Fetch', true, 'API returned correct data', {
          seller_name: apiData.data.seller_name,
          status: apiData.data.status
        });
      }
    } catch (err) {
      addTest('API Route Fetch', false, `Fetch failed: ${err.message}`);
    }

    // TEST 3: Simulate signature submission
    const testSignature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    try {
      const submitResponse = await fetch(`https://parcelreach.ai/api/signature-request/${testToken}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signatureData: testSignature })
      });

      const submitData = await submitResponse.json();

      if (!submitResponse.ok) {
        addTest('Signature Submission', false, submitData.error || 'Submission failed');
      } else {
        addTest('Signature Submission', true, 'Signature submitted successfully');
      }
    } catch (err) {
      addTest('Signature Submission', false, `Submit failed: ${err.message}`);
    }

    // TEST 4: Verify signature was saved
    const { data: verifyData, error: verifyError } = await supabase
      .from('signature_requests')
      .select('*')
      .eq('token', testToken)
      .single();

    if (verifyError) {
      addTest('Verify Signature Saved', false, verifyError.message);
    } else if (verifyData.status !== 'signed') {
      addTest('Verify Signature Saved', false, `Status is ${verifyData.status}, expected 'signed'`);
    } else if (!verifyData.seller_signature) {
      addTest('Verify Signature Saved', false, 'Signature data not saved');
    } else {
      addTest('Verify Signature Saved', true, 'Signature saved correctly', {
        status: verifyData.status,
        signed_at: verifyData.seller_signed_at
      });
    }

    // TEST 5: Verify signed request returns correctly
    try {
      const signedResponse = await fetch(`https://parcelreach.ai/api/signature-request/${testToken}`);
      const signedData = await signedResponse.json();

      if (!signedResponse.ok) {
        addTest('Fetch Signed Request', false, 'API returned error');
      } else if (signedData.data.status !== 'signed') {
        addTest('Fetch Signed Request', false, 'Status not updated');
      } else {
        addTest('Fetch Signed Request', true, 'Signed request fetches correctly');
      }
    } catch (err) {
      addTest('Fetch Signed Request', false, err.message);
    }

    // Clean up
    await supabase
      .from('signature_requests')
      .delete()
      .eq('token', testToken);

    results.summary = `${results.passed}/${results.tests.length} tests passed`;
    results.allPassed = results.failed === 0;

    if (results.allPassed) {
      results.conclusion = '✅ SIGNATURE FLOW WORKING - All backend systems operational. Page will work in browser.';
    } else {
      results.conclusion = '❌ ISSUES DETECTED - Check failed tests above';
    }

    return Response.json(results, {
      status: results.failed > 0 ? 500 : 200
    });

  } catch (error) {
    results.tests.push({ name: 'Unexpected Error', passed: false, message: error.message });
    results.failed++;
    return Response.json(results, { status: 500 });
  }
}
