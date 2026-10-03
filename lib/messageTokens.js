// One place that turns {{tokens}} in a message into real values from a lead.
// Rules that keep us from ever texting a literal "{{first}}" again:
//  - token matching is case-insensitive and tolerant of spaces/underscores
//    so {{first}}, {{First Name}}, {{first_name}} and {{name}} all work.
//  - name/county tokens fall back to a sensible word ("there" / "your area")
//    when the lead is missing that field, never an empty gap.
//  - ANY leftover {{...}} token we don't recognize is stripped, and spacing
//    is tidied, so a bad template can never send raw braces.

const firstNameOf = (l) => String(l?.full_name || l?.name || '').trim().split(/\s+/)[0] || '';
const fullNameOf = (l) => String(l?.full_name || l?.name || '').trim();
const countyOf = (l) => {
  const c = l?.property_county || l?.county || l?.form_data?.propertyCounty || l?.form_data?.county || '';
  return String(c).trim().replace(/\s*county\s*$/i, ''); // normalize "Travis County" -> "Travis"
};

export function fillTokens(message, lead = {}, extra = {}) {
  let out = String(message || '');
  const first = firstNameOf(lead);
  const full = fullNameOf(lead);
  const county = countyOf(lead);
  // Resolved values (empty string means "use the fallback below").
  const values = {
    first, firstname: first, 'first name': first, first_name: first, name: first,
    fullname: full, 'full name': full, full_name: full,
    county, 'county name': county,
    sender: 'Jordan', rep: 'Jordan',
  };
  for (const [k, v] of Object.entries(extra || {})) values[k.toLowerCase()] = v == null ? '' : String(v);
  // Fallbacks so a blank field never leaves an awkward gap.
  const fallback = {
    first: 'there', firstname: 'there', 'first name': 'there', first_name: 'there', name: 'there',
    county: 'your area', 'county name': 'your area',
  };
  out = out.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, raw) => {
    const key = String(raw).toLowerCase().trim();
    if (values[key]) return values[key];
    if (key in fallback) return fallback[key];
    return ''; // unknown or empty token: drop it entirely, never send raw braces
  });
  // Any stray single/double braces left over get removed too, then tidy spacing.
  out = out.replace(/\{\{[^}]*\}?\}?/g, '').replace(/\{\{|\}\}/g, '');
  out = out.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+([,.!?;:])/g, '$1').trim();
  return out;
}
