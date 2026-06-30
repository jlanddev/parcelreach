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

// Who to @mention (tag) in the update bubble, per board id, a list so a board
// can ping multiple partner contacts. The tag is what notifies the partner.
const BOARD_MENTIONS = {
  '6560911783': [{ userId: 60588779, name: 'D. Browne' }],                                          // LS -> Daniel
  '6560915772': [{ userId: 60686744, name: 'Larry Jarnigo' }, { userId: 61680150, name: 'Brittany Linko' }], // Land Exit Solutions -> Larry + Brittany
};

const escapeHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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

// Map our lead onto the board's columns by matching column titles. Uses the
// clean, verified fields (top-level address, parcel_id, numeric acreage) NOT the
// seller-typed form junk (form_data.streetAddress / "10-20 Acres" range).
function buildColumnValues(columns, lead) {
  const address = lead.street_address || lead.address || lead.form_data?.streetAddress || '';
  const county = lead.property_county || lead.county || lead.form_data?.propertyCounty || '';
  const acres = lead.acreage || lead.acres || '';
  const apn = lead.parcel_id || lead.form_data?.parcelId || lead.parcel_apn || lead.apn || '';
  const phone = (lead.phone || '').replace(/[^0-9]/g, '');

  const values = {};
  for (const c of columns) {
    const t = norm(c.title);
    if (c.type === 'name' || t === 'subitems') continue;
    let v = null;
    if (t.includes('seller') || (t.includes('name') && !t.includes('board'))) v = lead.name || lead.full_name || '';
    else if (t.includes('phone')) v = phone;
    else if (t.includes('address')) v = address;
    else if (t.includes('apn') || t.includes('parcel')) v = String(apn || '');
    else if (t.includes('acre')) v = acres === '' ? '' : String(acres);
    else if (t.includes('county')) v = county;
    if (v === null || v === '') continue;

    if (c.type === 'phone') values[c.id] = { phone: v, countryShortName: 'US' };
    else if (c.type === 'numbers') values[c.id] = String(v).replace(/[^0-9.]/g, '');
    else values[c.id] = String(v);
  }
  return values;
}

// Monday's exact mention markup (an <a> with data-mention-id) so the partner is
// really tagged and notified. Reverse-engineered from existing LS updates.
const MONDAY_ACCOUNT_URL = 'https://landreach.monday.com';
const userSlug = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
function mentionTag(m) {
  return `<a class="user_mention_editor router" href="${MONDAY_ACCOUNT_URL}/users/${m.userId}-${userSlug(m.name)}" data-mention-type="User" data-mention-id="${m.userId}" target="_blank" rel="noopener noreferrer">@${escapeHtml(m.name)}</a>`;
}

export async function createItem(boardId, groupId, itemName, columnValues) {
  const data = await mondayQuery(
    'mutation ($b:ID!,$g:String!,$n:String!,$c:JSON!){ create_item(board_id:$b, group_id:$g, item_name:$n, column_values:$c){ id } }',
    { b: String(boardId), g: groupId, n: itemName, c: JSON.stringify(columnValues) }
  );
  return data.create_item.id;
}

// Explicit bell notification to a user pointing at the item. API-created update
// mentions don't fire notifications on their own, so we send this too.
export async function createNotification(userId, itemId, text) {
  await mondayQuery(
    'mutation ($u:ID!,$t:ID!,$txt:String!){ create_notification(user_id:$u, target_id:$t, text:$txt, target_type:Project){ id } }',
    { u: String(userId), t: String(itemId), txt: text }
  );
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

// Full push: item + columns + update bubble (the @mention tag) + map image.
// Returns a per-step report so the UI can show exactly what landed and the
// caller never silently loses the tag or the map.
export async function pushLeadToBoard(boardId, lead) {
  const meta = await getBoardMeta(boardId);
  if (!meta) throw new Error('Board not found');
  const group = pickGroup(meta.groups);
  if (!group) throw new Error('No group on board');
  const itemName = lead.name || lead.full_name || 'New Lead';
  const columnValues = buildColumnValues(meta.columns, lead);
  const itemId = await createItem(boardId, group.id, itemName, columnValues);

  const mentions = BOARD_MENTIONS[String(boardId)] || [];
  const tags = mentions.map(mentionTag).join(' ');
  const tagged = mentions.map((m) => m.name).join(', ') || null;
  const warnings = [];

  // 1) The update bubble carrying the @mention tag. If Monday rejects the
  // mention HTML for any reason, retry with a plain-text body so the bubble
  // (and the map) still land. We then rely on create_notification for the ping.
  let updateId = null;
  let updatePosted = false;
  let tagInBubble = false;
  const tagBody = `<p>${tags || 'New lead from ParcelReach'}</p>`;
  try {
    updateId = await createUpdate(itemId, tagBody);
    updatePosted = true;
    tagInBubble = !!tags;
  } catch (e) {
    warnings.push('tag bubble failed: ' + (e?.message || e));
    try {
      const plain = tagged ? `New lead from ParcelReach (for ${tagged})` : 'New lead from ParcelReach';
      updateId = await createUpdate(itemId, plain);
      updatePosted = true;
    } catch (e2) {
      warnings.push('plain update failed: ' + (e2?.message || e2));
    }
  }

  // 2) The parcel map image, attached to the update bubble.
  let mapUploaded = false;
  if (lead.map_image_url && updateId) {
    try { await addFileToUpdate(updateId, lead.map_image_url); mapUploaded = true; }
    catch (e) { warnings.push('map upload failed: ' + (e?.message || e)); }
  } else if (!lead.map_image_url) {
    warnings.push('no map on this lead to push');
  }

  // 3) Explicit bell notification so each partner actually gets pinged (API
  // update mentions alone do not fire a notification).
  let notified = 0;
  for (const m of mentions) {
    try { await createNotification(m.userId, itemId, `New lead from ParcelReach: ${itemName}`); notified++; }
    catch (e) { warnings.push(`notify ${m.name} failed: ` + (e?.message || e)); }
  }

  // 4) Verify against the board itself: read the item back and confirm the
  // update (and its file) actually persisted. This catches the case where the
  // mutation returned ok but nothing shows on the partner's board.
  let verifiedUpdates = null;
  try {
    const check = await mondayQuery(
      'query ($id:[ID!]) { items(ids:$id) { updates { id assets { id } } } }',
      { id: [String(itemId)] }
    );
    const ups = check.items?.[0]?.updates || [];
    verifiedUpdates = ups.length;
    if (ups.length === 0) warnings.push('verify: no update is on the item after push');
    else if (lead.map_image_url && !ups.some((u) => (u.assets || []).length)) warnings.push('verify: update has no file attached');
  } catch (e) {
    warnings.push('verify failed: ' + (e?.message || e));
  }

  return { itemId, board: meta.name, group: group.title, updatePosted, tagInBubble, mapUploaded, tagged, notified, verifiedUpdates, warnings };
}
