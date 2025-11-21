const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration() {
  console.log('Running database migration...');
  
  const { data, error } = await supabase.rpc('exec_sql', {
    sql: `
      ALTER TABLE lead_notes ADD COLUMN IF NOT EXISTS parent_note_id UUID REFERENCES lead_notes(id) ON DELETE CASCADE;
      CREATE INDEX IF NOT EXISTS idx_lead_notes_parent_note_id ON lead_notes(parent_note_id);
      CREATE INDEX IF NOT EXISTS idx_lead_notes_parent_null ON lead_notes(lead_id) WHERE parent_note_id IS NULL;
    `
  });
  
  if (error) {
    console.error('Migration failed:', error);
    console.log('Trying alternative method...');
    
    // Try direct table alteration
    const { error: alterError } = await supabase
      .from('lead_notes')
      .select('parent_note_id')
      .limit(1);
    
    if (alterError && alterError.message.includes('column')) {
      console.log('Column does not exist, but cannot be added via client.');
      console.log('You need to run this SQL in Supabase dashboard:');
      console.log('ALTER TABLE lead_notes ADD COLUMN parent_note_id UUID REFERENCES lead_notes(id) ON DELETE CASCADE;');
    } else {
      console.log('Column already exists!');
    }
  } else {
    console.log('Migration successful!');
  }
}

runMigration();
