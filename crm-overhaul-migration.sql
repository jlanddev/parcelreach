-- ParcelReach CRM Overhaul Migration
-- ADDITIVE CHANGES ONLY - Does not modify existing columns or break existing functionality
-- Run this in Supabase SQL Editor

-- ============================================================================
-- PHASE 1: Add new columns to leads table for CRM tracking
-- ============================================================================

-- Pipeline status (separate from existing 'status' column to preserve compatibility)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pipeline_status TEXT DEFAULT 'NEW';

-- Activity tracking
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contact_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS first_contact_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_count INTEGER DEFAULT 0;

-- Priority scoring
ALTER TABLE leads ADD COLUMN IF NOT EXISTS priority_score INTEGER DEFAULT 50;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_hot_lead BOOLEAN DEFAULT false;

-- Callback/follow-up tracking
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_callback_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS callback_notes TEXT;

-- Motivation tracking (extracted from form_data for easier querying)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS motivation_level TEXT; -- 'high', 'medium', 'low'

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_leads_pipeline_status ON leads(pipeline_status);
CREATE INDEX IF NOT EXISTS idx_leads_last_activity ON leads(last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_priority ON leads(priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_next_callback ON leads(next_callback_at);
CREATE INDEX IF NOT EXISTS idx_leads_hot ON leads(is_hot_lead) WHERE is_hot_lead = true;

-- ============================================================================
-- PHASE 2: Activity Log Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Activity type
  activity_type TEXT NOT NULL,
  -- Types: CALL_OUTBOUND, CALL_INBOUND, TEXT_SENT, TEXT_RECEIVED,
  --        EMAIL_SENT, EMAIL_RECEIVED, VOICEMAIL_LEFT, VOICEMAIL_RECEIVED,
  --        OFFER_SENT, OFFER_RESPONSE, CONTRACT_SENT, CONTRACT_SIGNED,
  --        NOTE_ADDED, STATUS_CHANGED, CALLBACK_SET, LEAD_ASSIGNED,
  --        DOCUMENT_UPLOADED, MEETING_SCHEDULED

  -- Activity details
  subject TEXT,
  body TEXT,

  -- For calls
  call_duration INTEGER, -- seconds
  call_outcome TEXT, -- 'connected', 'no_answer', 'voicemail', 'busy', 'wrong_number'

  -- For offers
  offer_amount DECIMAL(12, 2),
  offer_response TEXT, -- 'accepted', 'rejected', 'counter', 'pending'

  -- For status changes
  old_status TEXT,
  new_status TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  activity_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for activity_log
CREATE INDEX IF NOT EXISTS idx_activity_log_lead ON activity_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_team ON activity_log(team_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_type ON activity_log(activity_type);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_lead_created ON activity_log(lead_id, created_at DESC);

-- RLS for activity_log
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view team activities" ON activity_log
  FOR SELECT USING (
    team_id IN (
      SELECT team_id FROM team_members WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Users can insert team activities" ON activity_log
  FOR INSERT WITH CHECK (
    team_id IN (
      SELECT team_id FROM team_members WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================================
-- PHASE 3: Scheduled Tasks Table (Follow-ups, Callbacks, Reminders)
-- ============================================================================

CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Task details
  task_type TEXT NOT NULL, -- 'callback', 'follow_up', 'send_offer', 'send_contract', 'reminder', 'meeting'
  title TEXT NOT NULL,
  description TEXT,

  -- Scheduling
  due_at TIMESTAMP WITH TIME ZONE NOT NULL,
  reminder_at TIMESTAMP WITH TIME ZONE, -- When to send reminder notification

  -- Status
  status TEXT DEFAULT 'pending', -- 'pending', 'completed', 'cancelled', 'snoozed'
  completed_at TIMESTAMP WITH TIME ZONE,
  completed_by UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Priority
  priority TEXT DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for scheduled_tasks
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_lead ON scheduled_tasks(lead_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_team ON scheduled_tasks(team_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_assigned ON scheduled_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_due ON scheduled_tasks(due_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_status ON scheduled_tasks(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_pending_due ON scheduled_tasks(due_at) WHERE status = 'pending';

-- RLS for scheduled_tasks
ALTER TABLE scheduled_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view team tasks" ON scheduled_tasks
  FOR SELECT USING (
    team_id IN (
      SELECT team_id FROM team_members WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Users can manage team tasks" ON scheduled_tasks
  FOR ALL USING (
    team_id IN (
      SELECT team_id FROM team_members WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================================
-- PHASE 4: Lead Status History Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS lead_status_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Status change
  old_status TEXT,
  new_status TEXT NOT NULL,
  reason TEXT, -- Why the status changed

  -- Timestamps
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_status_history_lead ON lead_status_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_status_history_changed ON lead_status_history(changed_at DESC);

-- RLS
ALTER TABLE lead_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view status history" ON lead_status_history
  FOR SELECT USING (
    team_id IN (
      SELECT team_id FROM team_members WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================================
-- PHASE 5: Lead Offers Table (Detailed offer tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS lead_offers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Offer details
  offer_amount DECIMAL(12, 2) NOT NULL,
  offer_type TEXT DEFAULT 'cash', -- 'cash', 'terms', 'hybrid'

  -- For terms offers
  down_payment DECIMAL(12, 2),
  monthly_payment DECIMAL(12, 2),
  term_months INTEGER,
  interest_rate DECIMAL(5, 2),

  -- Status
  status TEXT DEFAULT 'draft', -- 'draft', 'sent', 'viewed', 'accepted', 'rejected', 'countered', 'expired'
  sent_at TIMESTAMP WITH TIME ZONE,
  responded_at TIMESTAMP WITH TIME ZONE,

  -- Counter offer
  counter_amount DECIMAL(12, 2),
  counter_notes TEXT,

  -- Expiration
  expires_at TIMESTAMP WITH TIME ZONE,

  -- Notes
  notes TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lead_offers_lead ON lead_offers(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_offers_team ON lead_offers(team_id);
CREATE INDEX IF NOT EXISTS idx_lead_offers_status ON lead_offers(status);
CREATE INDEX IF NOT EXISTS idx_lead_offers_created ON lead_offers(created_at DESC);

-- RLS
ALTER TABLE lead_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view team offers" ON lead_offers
  FOR SELECT USING (
    team_id IN (
      SELECT team_id FROM team_members WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Users can manage team offers" ON lead_offers
  FOR ALL USING (
    team_id IN (
      SELECT team_id FROM team_members WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================================
-- PHASE 6: Trigger to update last_activity_at on leads
-- ============================================================================

CREATE OR REPLACE FUNCTION update_lead_last_activity()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE leads
  SET last_activity_at = NEW.created_at
  WHERE id = NEW.lead_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_update_lead_activity ON activity_log;
CREATE TRIGGER trigger_update_lead_activity
  AFTER INSERT ON activity_log
  FOR EACH ROW
  EXECUTE FUNCTION update_lead_last_activity();

-- ============================================================================
-- PHASE 7: Function to calculate priority score
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_lead_priority(lead_row leads)
RETURNS INTEGER AS $$
DECLARE
  score INTEGER := 50;
  form_data JSONB;
  acreage NUMERIC;
  why_selling TEXT;
  days_since_activity INTEGER;
BEGIN
  form_data := lead_row.form_data;
  acreage := lead_row.acreage;

  -- Acreage scoring (bigger = higher priority)
  IF acreage IS NOT NULL THEN
    IF acreage >= 100 THEN score := score + 30;
    ELSIF acreage >= 40 THEN score := score + 20;
    ELSIF acreage >= 10 THEN score := score + 10;
    ELSIF acreage >= 5 THEN score := score + 5;
    END IF;
  END IF;

  -- Motivation keywords in why_selling
  IF form_data IS NOT NULL AND form_data->>'whySelling' IS NOT NULL THEN
    why_selling := LOWER(form_data->>'whySelling');
    IF why_selling LIKE '%urgent%' OR why_selling LIKE '%asap%' OR why_selling LIKE '%immediately%' THEN
      score := score + 25;
    ELSIF why_selling LIKE '%inherited%' OR why_selling LIKE '%estate%' OR why_selling LIKE '%divorce%' THEN
      score := score + 20;
    ELSIF why_selling LIKE '%tax%' OR why_selling LIKE '%behind%' OR why_selling LIKE '%owe%' THEN
      score := score + 15;
    END IF;
  END IF;

  -- No home on property = easier deal
  IF form_data IS NOT NULL AND form_data->>'homeOnProperty' = 'no' THEN
    score := score + 10;
  END IF;

  -- Not listed = less competition
  IF form_data IS NOT NULL AND form_data->>'propertyListed' = 'no' THEN
    score := score + 10;
  END IF;

  -- Owned 4+ years = likely has equity
  IF form_data IS NOT NULL AND form_data->>'ownedFourYears' = 'yes' THEN
    score := score + 5;
  END IF;

  -- Recency penalty (leads go cold)
  IF lead_row.last_activity_at IS NOT NULL THEN
    days_since_activity := EXTRACT(DAY FROM NOW() - lead_row.last_activity_at);
    IF days_since_activity > 14 THEN score := score - 20;
    ELSIF days_since_activity > 7 THEN score := score - 10;
    ELSIF days_since_activity > 3 THEN score := score - 5;
    END IF;
  END IF;

  -- Clamp score between 0 and 100
  IF score > 100 THEN score := 100; END IF;
  IF score < 0 THEN score := 0; END IF;

  RETURN score;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PHASE 8: Add columns to team_lead_data for team-specific CRM tracking
-- ============================================================================

ALTER TABLE team_lead_data ADD COLUMN IF NOT EXISTS pipeline_status TEXT DEFAULT 'NEW';
ALTER TABLE team_lead_data ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE team_lead_data ADD COLUMN IF NOT EXISTS last_contact_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE team_lead_data ADD COLUMN IF NOT EXISTS first_contact_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE team_lead_data ADD COLUMN IF NOT EXISTS contact_count INTEGER DEFAULT 0;
ALTER TABLE team_lead_data ADD COLUMN IF NOT EXISTS next_callback_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE team_lead_data ADD COLUMN IF NOT EXISTS callback_notes TEXT;
ALTER TABLE team_lead_data ADD COLUMN IF NOT EXISTS priority_score INTEGER DEFAULT 50;
ALTER TABLE team_lead_data ADD COLUMN IF NOT EXISTS is_hot_lead BOOLEAN DEFAULT false;
ALTER TABLE team_lead_data ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id);

-- Indexes for team_lead_data new columns
CREATE INDEX IF NOT EXISTS idx_team_lead_data_pipeline ON team_lead_data(pipeline_status);
CREATE INDEX IF NOT EXISTS idx_team_lead_data_callback ON team_lead_data(next_callback_at);
CREATE INDEX IF NOT EXISTS idx_team_lead_data_assigned ON team_lead_data(assigned_to);

-- ============================================================================
-- Done! All changes are additive and preserve existing functionality.
-- ============================================================================
