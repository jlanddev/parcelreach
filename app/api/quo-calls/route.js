import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');

    if (!phone) {
      return NextResponse.json({ error: 'Missing phone param' }, { status: 400 });
    }

    const formatted = phone.startsWith('+') ? phone : `+1${phone.replace(/\D/g, '')}`;

    // Fetch calls from all Quo numbers for this contact
    const quoNumbers = ['PNSKvaYA7i', 'PNllzT20fb', 'PN9evaaFme', 'PNRdl0HPXh', 'PNUbcs71Da'];
    let allCalls = [];

    for (const phoneNumberId of quoNumbers) {
      const res = await fetch(
        `https://api.openphone.com/v1/calls?phoneNumberId=${phoneNumberId}&participants=${encodeURIComponent(formatted)}&maxResults=10`,
        {
          headers: { 'Authorization': process.env.QUO_API_KEY }
        }
      );

      if (res.ok) {
        const data = await res.json();
        if (data.data?.length) {
          allCalls.push(...data.data);
        }
      }
    }

    // Sort by date descending
    allCalls.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return NextResponse.json({ calls: allCalls.slice(0, 20) });
  } catch (err) {
    console.error('[Quo Calls Error]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
