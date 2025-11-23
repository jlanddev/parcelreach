import { createClient } from '@supabase/supabase-js';

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const testToken = `persist-test-${Date.now()}`;

    const { data, error } = await supabase
      .from('signature_requests')
      .insert([{
        token: testToken,
        pa_html: '<div style="padding: 20px;"><h1>TEST PURCHASE AGREEMENT</h1><p>This is a test agreement for automated testing.</p><p>Property: 123 Test St</p><p>Price: $100,000</p></div>',
        seller_name: 'Test Seller',
        seller_email: 'test@example.com',
        seller_phone: '555-1234',
        buyer_entity: 'Test LLC',
        purchase_price: 100000,
        property_address: '123 Test St',
        status: 'pending'
      }])
      .select()
      .single();

    if (error) throw error;

    return Response.json({
      success: true,
      token: testToken,
      signature_url: `https://parcelreach.ai/sign/${testToken}`,
      api_url: `https://parcelreach.ai/api/signature-request/${testToken}`,
      message: 'Persistent test signature request created. Use DELETE to remove it later.'
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { token } = await request.json();

    if (!token) {
      return Response.json({ error: 'Token required' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    await supabase
      .from('signature_requests')
      .delete()
      .eq('token', token);

    return Response.json({ success: true, message: 'Test signature request deleted' });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
