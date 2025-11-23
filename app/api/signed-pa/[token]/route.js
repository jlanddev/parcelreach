import { createClient } from '@supabase/supabase-js';

export async function GET(request, { params }) {
  try {
    const { token } = await params;

    if (!token) {
      return Response.json({ error: 'No token provided' }, { status: 400 });
    }

    // Use service role to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data, error } = await supabase
      .from('signature_requests')
      .select('*')
      .eq('token', token)
      .single();

    if (error) {
      console.error('Supabase error:', error);
      return Response.json({ error: error.message }, { status: 404 });
    }

    if (!data) {
      return Response.json({ error: 'Signature request not found' }, { status: 404 });
    }

    if (data.status !== 'signed') {
      return Response.json({ error: 'Agreement not yet signed' }, { status: 400 });
    }

    // Parse the signature data
    let signatureData;
    try {
      signatureData = JSON.parse(data.seller_signature);
    } catch {
      // If it's not JSON, it might be an old canvas signature (base64)
      signatureData = { name: data.seller_name, date: new Date(data.seller_signed_at).toLocaleDateString() };
    }

    // Generate the signed PA HTML with signature
    const signedPA = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Signed Purchase Agreement - ${data.seller_name}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      background: white;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      border-radius: 10px;
      margin-bottom: 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
    }
    .status-badge {
      background: #10b981;
      color: white;
      padding: 8px 16px;
      border-radius: 20px;
      display: inline-block;
      margin-top: 10px;
      font-weight: bold;
    }
    .signature-section {
      margin-top: 60px;
      border-top: 2px solid #ddd;
      padding-top: 40px;
    }
    .signature-box {
      border: 2px solid #4F46E5;
      border-radius: 8px;
      padding: 20px;
      background: #F9FAFB;
      margin: 20px 0;
    }
    .signature-name {
      font-family: 'Dancing Script', cursive;
      font-size: 32px;
      color: #1F2937;
      margin-bottom: 10px;
    }
    .signature-date {
      color: #6B7280;
      font-size: 14px;
    }
    .signed-stamp {
      text-align: center;
      margin: 40px 0;
    }
    .signed-stamp-box {
      display: inline-block;
      border: 4px solid #10b981;
      color: #10b981;
      padding: 15px 30px;
      border-radius: 10px;
      font-size: 24px;
      font-weight: bold;
      transform: rotate(-5deg);
    }
    @media print {
      .header {
        background: #667eea !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Signed Purchase Agreement</h1>
    <div class="status-badge">✓ Electronically Signed</div>
  </div>

  <div>
    <p><strong>Property:</strong> ${data.property_address || 'N/A'}</p>
    <p><strong>Purchase Price:</strong> $${data.purchase_price?.toLocaleString() || 'N/A'}</p>
    <p><strong>Seller:</strong> ${data.seller_name}</p>
    <p><strong>Buyer:</strong> ${data.buyer_entity}</p>
    <p><strong>Signed Date:</strong> ${new Date(data.seller_signed_at).toLocaleString()}</p>
  </div>

  <hr style="margin: 30px 0;">

  ${data.pa_html}

  <div class="signature-section">
    <h2>Electronic Signatures</h2>

    <div class="signed-stamp">
      <div class="signed-stamp-box">SIGNED</div>
    </div>

    <div class="signature-box">
      <strong>Seller Signature:</strong>
      <div class="signature-name">${signatureData.name}</div>
      <div class="signature-date">Signed on: ${signatureData.date}</div>
    </div>

    <p style="color: #6B7280; font-size: 12px; margin-top: 40px;">
      This document was electronically signed using ParcelReach's secure e-signature platform.
      The signature above constitutes a legally binding agreement between the parties.
    </p>
  </div>
</body>
</html>
    `;

    return new Response(signedPA, {
      headers: {
        'Content-Type': 'text/html',
      },
    });

  } catch (error) {
    console.error('Error fetching signed PA:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
