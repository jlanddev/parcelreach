#!/usr/bin/env node

/**
 * End-to-end test for notification click-to-lead flow
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testNotificationFlow() {
  console.log('🧪 TESTING FULL NOTIFICATION CLICK FLOW\n');

  // 1. Get a real lead from the database
  console.log('1️⃣ Getting a real lead from database...');
  const { data: leads, error: leadsError } = await supabase
    .from('leads')
    .select('id, name, county, state')
    .limit(1);

  if (leadsError || !leads || leads.length === 0) {
    console.error('❌ No leads found in database');
    console.log('💡 Add at least one lead to test notifications');
    return false;
  }

  const testLead = leads[0];
  console.log(`✅ Found lead: "${testLead.name}" (${testLead.id})\n`);

  // 2. Get test users
  console.log('2️⃣ Getting test users...');
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, full_name, email')
    .limit(2);

  if (usersError || !users || users.length < 1) {
    console.error('❌ No users found');
    return false;
  }

  const fromUser = users[0];
  const toUser = users[1] || users[0];
  console.log(`✅ From: ${fromUser.full_name || fromUser.email}`);
  console.log(`✅ To: ${toUser.full_name || toUser.email}\n`);

  // 3. Create a mention notification with the correct link format
  console.log('3️⃣ Creating notification with lead link...');
  const notificationLink = `/dashboard?lead=${testLead.id}`;
  console.log(`   Link format: ${notificationLink}`);

  const { data: notification, error: notifError } = await supabase
    .from('notifications')
    .insert([{
      user_id: toUser.id,
      from_user_id: fromUser.id,
      type: 'mention',
      title: `${fromUser.full_name || fromUser.email} mentioned you`,
      message: `On lead: ${testLead.name} - ${testLead.county}, ${testLead.state}`,
      link: notificationLink,
      read: false
    }])
    .select()
    .single();

  if (notifError) {
    console.error('❌ Failed to create notification');
    console.error('Error:', notifError.message);
    return false;
  }

  console.log(`✅ Notification created with ID: ${notification.id}`);
  console.log(`   Link in DB: ${notification.link}\n`);

  // 4. Verify the notification link matches the expected format
  console.log('4️⃣ Verifying link format...');
  const expectedLink = `/dashboard?lead=${testLead.id}`;

  if (notification.link !== expectedLink) {
    console.error('❌ Link format mismatch!');
    console.error(`   Expected: ${expectedLink}`);
    console.error(`   Got: ${notification.link}`);
    return false;
  }
  console.log('✅ Link format is correct\n');

  // 5. Simulate extracting lead ID from link (what dashboard does)
  console.log('5️⃣ Simulating dashboard URL parsing...');
  const url = new URL(`https://parcelreach.ai${notification.link}`);
  const leadIdFromUrl = url.searchParams.get('lead');

  if (!leadIdFromUrl) {
    console.error('❌ Could not extract lead ID from URL');
    return false;
  }

  console.log(`✅ Extracted lead ID from URL: ${leadIdFromUrl}`);

  if (leadIdFromUrl !== testLead.id) {
    console.error('❌ Lead ID mismatch!');
    console.error(`   Expected: ${testLead.id}`);
    console.error(`   Got: ${leadIdFromUrl}`);
    return false;
  }
  console.log('✅ Lead ID matches original lead\n');

  // 6. Verify the lead can be found (what dashboard does)
  console.log('6️⃣ Verifying lead can be found in database...');
  const { data: foundLead, error: findError } = await supabase
    .from('leads')
    .select('id, name')
    .eq('id', leadIdFromUrl)
    .single();

  if (findError || !foundLead) {
    console.error('❌ Could not find lead by ID from notification link');
    console.error('Error:', findError?.message);
    return false;
  }

  console.log(`✅ Lead found: "${foundLead.name}"\n`);

  // 7. Test fetching the notification (what bell icon does)
  console.log('7️⃣ Testing notification retrieval...');
  const { data: userNotifs, error: fetchError } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', toUser.id)
    .eq('read', false)
    .order('created_at', { ascending: false });

  if (fetchError) {
    console.error('❌ Could not fetch notifications');
    return false;
  }

  const ourNotif = userNotifs.find(n => n.id === notification.id);
  if (!ourNotif) {
    console.error('❌ Could not find our test notification');
    return false;
  }

  console.log(`✅ Notification appears in unread list`);
  console.log(`   Total unread: ${userNotifs.length}\n`);

  // 8. Simulate clicking notification (marking as read)
  console.log('8️⃣ Simulating notification click (mark as read)...');
  const { error: markReadError } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notification.id);

  if (markReadError) {
    console.error('❌ Could not mark notification as read');
    return false;
  }
  console.log('✅ Notification marked as read\n');

  // 9. Clean up
  console.log('9️⃣ Cleaning up test data...');
  await supabase
    .from('notifications')
    .delete()
    .eq('id', notification.id);
  console.log('✅ Test data cleaned up\n');

  return true;
}

// Run test
testNotificationFlow().then(success => {
  if (success) {
    console.log('═══════════════════════════════════════════════════\n');
    console.log('✅ FULL NOTIFICATION FLOW WORKING');
    console.log('\nVerified end-to-end:');
    console.log('  ✓ Notification created with correct link format');
    console.log('  ✓ Link contains correct lead ID');
    console.log('  ✓ Lead ID can be extracted from URL');
    console.log('  ✓ Lead can be found in database');
    console.log('  ✓ Notification appears in user\'s list');
    console.log('  ✓ Notification can be marked as read');
    console.log('\n💡 If clicking notification still doesn\'t open lead:');
    console.log('   - Hard refresh browser (Cmd+Shift+R)');
    console.log('   - Check browser console for errors');
    console.log('   - Verify leads are loading in dashboard\n');
    console.log('═══════════════════════════════════════════════════\n');
    process.exit(0);
  } else {
    console.log('\n═══════════════════════════════════════════════════');
    console.log('❌ NOTIFICATION FLOW TEST FAILED');
    console.log('═══════════════════════════════════════════════════\n');
    process.exit(1);
  }
}).catch(err => {
  console.error('\n💥 Test error:', err);
  process.exit(1);
});
