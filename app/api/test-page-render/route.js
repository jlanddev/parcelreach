export async function GET() {
  try {
    // Generate test token
    const { createClient } = await import('@supabase/supabase-js');

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const testToken = `rendertest-${Date.now()}`;

    // Create test signature request
    const { data, error } = await supabase
      .from('signature_requests')
      .insert([{
        token: testToken,
        pa_html: '<h1>RENDER TEST</h1>',
        seller_name: 'Render Test',
        seller_email: 'render@test.com',
        seller_phone: '555-0000',
        buyer_entity: 'Test LLC',
        purchase_price: 100000,
        property_address: 'Test Address',
        status: 'pending'
      }])
      .select()
      .single();

    if (error) throw error;

    const signatureUrl = `https://parcelreach.ai/sign/${testToken}`;

    // Fetch the rendered page
    const response = await fetch(signatureUrl);
    const html = await response.text();

    // Check what's in the HTML
    const tests = {
      has_loading: html.includes('Loading...'),
      has_error_text: html.includes('Error') || html.includes('CLIENT JS'),
      has_seller: html.includes('Seller:') || html.includes('Render Test'),
      has_agreement: html.includes('Purchase Agreement') || html.includes('RENDER TEST'),
      has_signature: html.includes('SignatureCanvas') || html.includes('signature'),
      html_length: html.length,
      status: response.status
    };

    // Clean up
    await supabase
      .from('signature_requests')
      .delete()
      .eq('token', testToken);

    return Response.json({
      timestamp: new Date().toISOString(),
      url: signatureUrl,
      tests,
      diagnosis: tests.has_loading ? 'STUCK ON LOADING' :
                 tests.has_error_text ? 'ERROR STATE' :
                 tests.has_agreement ? 'SUCCESS - PAGE LOADED' : 'UNKNOWN STATE',
      sample_html: html.substring(html.indexOf('<body'), html.indexOf('<body') + 500)
    });

  } catch (error) {
    return Response.json({
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}
