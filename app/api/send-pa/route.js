import { createClient } from '@supabase/supabase-js';
import sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export async function POST(request) {
  try {
    // Use service role to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const {
      leadId,
      teamId,
      paHtml,
      sellerName,
      sellerEmail,
      sellerPhone,
      buyerEntity,
      purchasePrice,
      propertyAddress
    } = await request.json();

    // Generate unique token for signature page
    const token = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Create signature request in database
    const { data: sigRequest, error: insertError } = await supabase
      .from('signature_requests')
      .insert([{
        lead_id: leadId,
        team_id: teamId,
        token,
        pa_html: paHtml,
        seller_name: sellerName,
        seller_email: sellerEmail,
        seller_phone: sellerPhone,
        buyer_entity: buyerEntity,
        purchase_price: purchasePrice,
        property_address: propertyAddress,
        status: 'pending'
      }])
      .select()
      .single();

    if (insertError) {
      console.error('Error creating signature request:', insertError);
      return Response.json({ error: insertError.message }, { status: 500 });
    }

    // Create signature link
    const signatureUrl = `https://parcelreach.ai/sign/${token}`;

    // Send email to seller
    const msg = {
      to: sellerEmail,
      from: process.env.SENDGRID_FROM_EMAIL || 'noreply@parcelreach.com',
      subject: `Purchase Agreement - ${propertyAddress || 'Property'} - Signature Required`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Purchase Agreement Ready for Signature</h2>

          <p>Hello ${sellerName},</p>

          <p>You have received a Purchase Agreement from <strong>${buyerEntity}</strong> for the property located at:</p>

          <p style="background: #f5f5f5; padding: 15px; border-left: 4px solid #4F46E5;">
            <strong>${propertyAddress || 'Property Address'}</strong><br>
            Purchase Price: <strong>$${purchasePrice?.toLocaleString() || 'TBD'}</strong>
          </p>

          <p>Please review and sign the agreement by clicking the button below:</p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${signatureUrl}"
               style="background: #4F46E5; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
              Review & Sign Agreement
            </a>
          </div>

          <p style="color: #666; font-size: 14px;">
            This link will expire in 30 days.<br>
            If you have any questions, please contact us at ${sellerPhone || 'the number provided'}.
          </p>

          <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

          <p style="color: #999; font-size: 12px;">
            This is an automated message. Please do not reply to this email.
          </p>
        </div>
      `
    };

    await sgMail.send(msg);

    // Update lead status
    await supabase
      .from('team_lead_data')
      .update({
        contract_status: 'sent',
        contract_sent_date: new Date().toISOString()
      })
      .eq('lead_id', leadId)
      .eq('team_id', teamId);

    return Response.json({
      success: true,
      token,
      signatureUrl
    });

  } catch (error) {
    console.error('Error sending PA:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
