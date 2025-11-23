const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testNotification() {
  console.log('🔍 Testing notification with lead_assigned type...\n');

  const { data: purchase } = await supabase
    .from('lead_purchases')
    .select('user_id, lead_id')
    .order('purchased_at', { ascending: false })
    .limit(1)
    .single();

  // Try with 'lead_assigned' type since that's what exists
  const { data: newNotif, error: notifError } = await supabase
    .from('notifications')
    .insert([{
      user_id: purchase.user_id,
      lead_id: purchase.lead_id,
      title: 'Lead Purchased',
      message: 'You purchased a lead: 15.2 acres in Travis, TX for $197',
      type: 'lead_assigned',  // Using valid type
      read: false
    }])
    .select();

  if (notifError) {
    console.error('\n❌ Failed:', notifError.message);
  } else {
    console.log('\n✅ SUCCESS! Notification created!');
    console.log('Notification ID:', newNotif[0].id);
    console.log('Check your notifications panel - you should see it!');
  }
}

testNotification();
