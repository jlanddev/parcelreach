import { NextResponse } from 'next/server';
import crypto from 'crypto';

const PIXEL_ID = '1541281450393771';
const ACCESS_TOKEN = process.env.FB_CONVERSION_API_TOKEN;

// Hash function for user data (required by Facebook)
function hashData(data) {
  if (!data) return null;
  return crypto.createHash('sha256').update(data.toLowerCase().trim()).digest('hex');
}

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      eventName,
      email,
      firstName,
      lastName,
      phone,
      value,
      currency = 'USD',
      contentName,
      eventId
    } = body;

    if (!eventName) {
      return NextResponse.json({ error: 'Event name required' }, { status: 400 });
    }

    // Build user data with hashed PII
    const userData = {
      client_ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
      client_user_agent: request.headers.get('user-agent'),
    };

    if (email) userData.em = [hashData(email)];
    if (firstName) userData.fn = [hashData(firstName)];
    if (lastName) userData.ln = [hashData(lastName)];
    if (phone) userData.ph = [hashData(phone.replace(/\D/g, ''))];

    // Build event data
    const eventData = {
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      event_source_url: request.headers.get('referer') || 'https://parcelreach.ai',
      user_data: userData,
    };

    // Add event_id for deduplication with browser pixel
    if (eventId) {
      eventData.event_id = eventId;
    }

    // Add custom data for purchase/value events
    if (value || contentName) {
      eventData.custom_data = {};
      if (value) {
        eventData.custom_data.value = value;
        eventData.custom_data.currency = currency;
      }
      if (contentName) {
        eventData.custom_data.content_name = contentName;
      }
    }

    // Send to Facebook Conversion API
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${PIXEL_ID}/events`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: [eventData],
          access_token: ACCESS_TOKEN,
        }),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error('Facebook Conversion API error:', result);
      return NextResponse.json({ error: result.error?.message || 'Facebook API error' }, { status: 500 });
    }

    return NextResponse.json({ success: true, events_received: result.events_received });

  } catch (error) {
    console.error('FB Conversion API error:', error);
    return NextResponse.json({ error: 'Failed to send conversion event' }, { status: 500 });
  }
}
