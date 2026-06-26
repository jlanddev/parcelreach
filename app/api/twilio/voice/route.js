// TwiML for outbound browser calls. Twilio hits this when the Voice SDK places
// a call; we dial the lead from a caller ID that's valid on THIS account.
// (Project Blue's own TwiML endpoint returned a caller ID not valid for this
// account, causing 31005 hangups.)
const xmlEscape = (s) => String(s || '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

async function handle(request) {
  let to = '';
  try {
    const form = await request.formData();
    to = form.get('To') || form.get('to') || form.get('phone') || form.get('number') || form.get('PhoneNumber') || '';
  } catch {
    to = new URL(request.url).searchParams.get('To') || '';
  }
  const callerId = process.env.TWILIO_CALLER_ID || '+18323860032';
  const twiml = to
    ? `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${xmlEscape(callerId)}" answerOnBridge="true" record="record-from-answer-dual" timeout="40">
    <Number>${xmlEscape(to)}</Number>
  </Dial>
</Response>`
    : `<?xml version="1.0" encoding="UTF-8"?>
<Response><Say>No number to dial.</Say></Response>`;
  return new Response(twiml, { headers: { 'Content-Type': 'text/xml' } });
}

export const POST = handle;
export const GET = handle;
