#!/usr/bin/env node

/**
 * Test script to verify notification system is working
 * Tests: notification creation, database insertion, API endpoints
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testNotifications() {
  console.log('🧪 Testing Notification System...\n');

  // Test 1: Check if notifications table exists
  console.log('1️⃣ Checking if notifications table exists...');
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('id')
      .limit(1);

    if (error) {
      console.error('❌ Notifications table does NOT exist or is not accessible');
      console.error('Error:', error.message);
      console.log('\n💡 Run this migration in Supabase SQL Editor:');
      console.log('   File: supabase-notifications-schema.sql\n');
      return false;
    }
    console.log('✅ Notifications table exists\n');
  } catch (err) {
    console.error('❌ Error checking table:', err.message);
    return false;
  }

  // Test 2: Get a test user
  console.log('2️⃣ Getting test user...');
  const { data: users, error: userError } = await supabase
    .from('users')
    .select('id, full_name, email')
    .limit(1);

  if (userError || !users || users.length === 0) {
    console.error('❌ No users found in database');
    return false;
  }

  const testUser = users[0];
  console.log(`✅ Found test user: ${testUser.full_name || testUser.email} (${testUser.id})\n`);

  // Test 3: Create a test notification
  console.log('3️⃣ Creating test notification...');
  const testNotification = {
    user_id: testUser.id,
    from_user_id: testUser.id,
    type: 'mention',
    title: 'Test Notification',
    message: 'This is a test notification from the test script',
    link: '/dashboard',
    read: false
  };

  const { data: notification, error: notifError } = await supabase
    .from('notifications')
    .insert([testNotification])
    .select()
    .single();

  if (notifError) {
    console.error('❌ Failed to create notification');
    console.error('Error:', notifError.message);
    return false;
  }
  console.log(`✅ Created test notification: ${notification.id}\n`);

  // Test 4: Verify notification was created
  console.log('4️⃣ Verifying notification in database...');
  const { data: verifyNotif, error: verifyError } = await supabase
    .from('notifications')
    .select('*')
    .eq('id', notification.id)
    .single();

  if (verifyError || !verifyNotif) {
    console.error('❌ Could not verify notification in database');
    return false;
  }
  console.log('✅ Notification verified in database\n');

  // Test 5: Test notification API endpoint
  console.log('5️⃣ Testing notification API endpoint...');
  try {
    const response = await fetch('http://localhost:3000/api/notifications/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: testUser.id,
        fromUserId: testUser.id,
        type: 'mention',
        title: 'API Test Notification',
        message: 'Testing API endpoint',
        link: '/dashboard',
        sendEmail: false
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API endpoint returned error:', response.status);
      console.error('Response:', errorText);
      console.log('\n💡 Make sure dev server is running on localhost:3000');
      return false;
    }

    const result = await response.json();
    if (!result.success) {
      console.error('❌ API returned success: false');
      console.error('Result:', result);
      return false;
    }
    console.log('✅ API endpoint working correctly\n');
  } catch (err) {
    console.error('❌ Could not reach API endpoint');
    console.error('Error:', err.message);
    console.log('\n💡 Make sure dev server is running: npm run dev');
    return false;
  }

  // Test 6: Clean up test notifications
  console.log('6️⃣ Cleaning up test notifications...');
  await supabase
    .from('notifications')
    .delete()
    .or(`title.eq.Test Notification,title.eq.API Test Notification`);
  console.log('✅ Cleaned up test data\n');

  return true;
}

// Run tests
testNotifications().then(success => {
  if (success) {
    console.log('🎉 All notification tests PASSED!\n');
    console.log('✅ Notifications are working correctly');
    console.log('✅ Ready to deploy to production\n');
    process.exit(0);
  } else {
    console.log('\n❌ Some tests FAILED');
    console.log('❌ Fix issues before deploying\n');
    process.exit(1);
  }
}).catch(err => {
  console.error('\n💥 Test script error:', err);
  process.exit(1);
});
