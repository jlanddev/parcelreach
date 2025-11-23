require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSetup() {
  // Check if notifications table exists
  const { data: notifs, error: notifsError } = await supabase
    .from('notifications')
    .select('*')
    .limit(1);
  
  console.log('Notifications table exists:', !notifsError);
  if (notifsError) console.error('Error:', notifsError.message);
  
  // Check if team_invitations table exists
  const { data: invites, error: invitesError } = await supabase
    .from('team_invitations')
    .select('*')
    .limit(1);
    
  console.log('Team invitations table exists:', !invitesError);
  if (invitesError) console.error('Error:', invitesError.message);
  
  // Check lead_notes table
  const { data: notes, error: notesError } = await supabase
    .from('lead_notes')
    .select('*')
    .limit(1);
    
  console.log('Lead notes table exists:', !notesError);
  if (notesError) console.error('Error:', notesError.message);
}

checkSetup();
