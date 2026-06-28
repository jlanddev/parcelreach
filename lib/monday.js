// Monday.com push: create a lead as an item in a partner board's "New Leads"
// group, fill the standard columns by matching their titles, then post an
// update (the bubble) with the property notes and the parcel map image.
//
// Columns are resolved by TITLE at runtime so this works across every partner
// board without hardcoding column ids per board.

const MONDAY_URL = 'https://api.monday.com/v2';

function token() {
  const t = process.env.MONDAY_API_TOKEN;
  if (!t) throw new Error('MONDAY_API_TOKEN not configured');
  return t;
}

export async function mondayQuery(query, variables = {}) {
  const res = await fetch(MONDAY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token(), 'API-Version': '2024-01' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error('Monday: ' + JSON.stringify(json.errors));
  return json.data;
}

// The only partner boards we push to. Match by exact board name (case-insensitive).
const ALLOWED_BOARDS = ['ls', 'land exit solutions'];

export async function listPartnerBoards() {
  const data = await mondayQuery('query { boards(limit:100, state: active) { id name } }');
  return (data.boards || [])
    .filter((b) => ALLOWED_BOARDS.includes((b.name || '').trim().toLowerCase()))
    .map((b) => ({ id: String(b.id), name: b.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getBoardMeta(boardId) {
  const data = await mondayQuery(
    'query ($id:[ID!]) { boards(ids:$id) { name groups { id title } columns { id title type } } }',
    { id: [String(boardId)] }
  );
  return data.boards?.[0] || null;
}

const norm = (s) => (s || '').toLowerCase();

// Pick the group new leads should land in (falls back to the first group).
function pickGroup(groups = []) {
  return (
    groups.find((g) => /new lead/i.test(g.title)) ||
    groups.find((g) => /review|inbound/i.test(g.title)) ||
    groups[0]
  );
}

// Map our lead onto the board's columns by matching column titles.
function buildColumnValues(columns, lead) {
  const street = lead.form_data?.streetAddress || lead.street_address || lead.address || '';
  const county = lead.property_county || lead.county || lead.form_data?.propertyCounty || '';
  const state = lead.property_state || lead.state || lead.form_data?.propertyState || '';
  const acres = lead.acres || lead.acreage || lead.form_data?.acres || '';
  const apn = lead.parcel_apn || lead.apn || lead.form_data?.apn || lead.form_data?.parcelNumber || '';
  const phone = (lead.phone || '').replace(/[^0-9]/g, '');
  const fullAddress = [street, county && `${county} County`, state].filter(Boolean).join(', ');

  const values = {};
  for (const c of columns) {
    const t = norm(c.title);
    if (c.type === 'name' || t === 'subitems') continue;
    let v = null;
    if (t.includes('seller') || (t.includes('name') && !t.includes('board'))) v = lead.name || lead.full_name || '';
    else if (t.includes('phone')) v = phone;
    else if (t.includes('address')) v = fullAddress || street;
    else if (t.includes('apn') || t.includes('parcel')) v = String(apn || '');
    else if (t.includes('acre')) v = String(acres || '');
    else if (t.includes('county')) v = county;
    if (v === null || v === '') continue;

    if (c.type === 'phone') values[c.id] = { phone: v, countryShortName: 'US' };
    else if (c.type === 'numbers') values[c.id] = String(v).replace(/[^0-9.]/g, '');
    else values[c.id] = String(v);
  }
  return values;
}

// The bubble text: property notes that go with the map.
function buildUpdateBody(lead) {
  const street = lead.form_data?.streetAddress || lead.street_address || lead.address || '';
  const county = lead.property_county || lead.county || lead.form_data?.propertyCounty || '';
  const state = lead.property_state || lead.state || lead.form_data?.propertyState || '';
  const acres = lead.acres || lead.acreage || lead.form_data?.acres || '';
  const apn = lead.parcel_apn || lead.apn || lead.form_data?.apn || lead.form_data?.parcelNumber || '';
  const why = lead.form_data?.whySelling || lead.why_selling || '';
  const offer = lead.offer_amount ? `$${Number(lead.offer_amount).toLocaleString()}` : '';
  const lines = [
    street && `Location: ${street}`,
    (county || state) && `${county}${county && state ? ', ' : ''}${state}`,
    acres && `Acreage: ${acres}`,
    apn && `APN: ${apn}`,
    lead.phone && `Phone: ${lead.phone}`,
    offer && `Our offer: ${offer}`,
    why && `\nWhy selling: ${why}`,
  ].filter(Boolean);
  return lines.join('\n');
}

export async function createItem(boardId, groupId, itemName, columnValues) {
  const data = await mondayQuery(
    'mutation ($b:ID!,$g:String!,$n:String!,$c:JSON!){ create_item(board_id:$b, group_id:$g, item_name:$n, column_values:$c){ id } }',
    { b: String(boardId), g: groupId, n: itemName, c: JSON.stringify(columnValues) }
  );
  return data.create_item.id;
}

export async function createUpdate(itemId, body) {
  const data = await mondayQuery(
    'mutation ($i:ID!,$b:String!){ create_update(item_id:$i, body:$b){ id } }',
    { i: String(itemId), b: body }
  );
  return data.create_update.id;
}

// Upload an image (from a URL) to an update as a file, per Monday's file endpoint.
export async function addFileToUpdate(updateId, fileUrl, filename = 'parcel-map.png') {
  const imgRes = await fetch(fileUrl);
  if (!imgRes.ok) throw new Error('Could not fetch map image');
  const blob = await imgRes.blob();
  const form = new FormData();
  form.append('query', `mutation ($file: File!) { add_file_to_update(update_id: ${Number(updateId)}, file: $file) { id } }`);
  form.append('variables[file]', blob, filename);
  const res = await fetch(MONDAY_URL + '/file', { method: 'POST', headers: { Authorization: token() }, body: form });
  const json = await res.json();
  if (json.errors) throw new Error('Monday file: ' + JSON.stringify(json.errors));
  return json.data?.add_file_to_update?.id;
}

// Full push: item + columns + update bubble with notes + map image.
export async function pushLeadToBoard(boardId, lead) {
  const meta = await getBoardMeta(boardId);
  if (!meta) throw new Error('Board not found');
  const group = pickGroup(meta.groups);
  if (!group) throw new Error('No group on board');
  const itemName = lead.name || lead.full_name || 'New Lead';
  const columnValues = buildColumnValues(meta.columns, lead);
  const itemId = await createItem(boardId, group.id, itemName, columnValues);

  const body = buildUpdateBody(lead);
  let mapUploaded = false;
  if (body || lead.map_image_url) {
    const updateId = await createUpdate(itemId, body || 'Lead pushed from ParcelReach');
    if (lead.map_image_url) {
      try { await addFileToUpdate(updateId, lead.map_image_url); mapUploaded = true; } catch { /* map optional */ }
    }
  }
  return { itemId, board: meta.name, group: group.title, mapUploaded };
}
