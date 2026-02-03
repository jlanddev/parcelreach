-- ParcelReach Smart Lead Platform Migration
-- Run this in Supabase SQL Editor

-- ============================================================================
-- 1. ADD NEW COLUMNS TO LEADS TABLE
-- ============================================================================

ALTER TABLE leads ADD COLUMN IF NOT EXISTS temperature VARCHAR(20) DEFAULT 'HOT';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS cadence_name VARCHAR(50) DEFAULT 'NEW_LEAD';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS cadence_step INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS cadence_started_at TIMESTAMP DEFAULT NOW();
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_action_type VARCHAR(30);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_action_due TIMESTAMP;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_action_script TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_activity_type VARCHAR(30);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_activity_outcome VARCHAR(30);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS touch_count INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS call_count INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS text_count INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email_count INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS nurture_until DATE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS dead_reason TEXT;

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_leads_temperature ON leads(temperature);
CREATE INDEX IF NOT EXISTS idx_leads_next_action_due ON leads(next_action_due);
CREATE INDEX IF NOT EXISTS idx_leads_last_activity ON leads(last_activity_at);

-- ============================================================================
-- 2. CREATE ACTIVITIES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),

  -- Activity info
  activity_type VARCHAR(30) NOT NULL, -- CALL, TEXT, EMAIL, NOTE, OFFER, STATUS_CHANGE
  direction VARCHAR(10), -- OUTBOUND, INBOUND (null for notes)
  outcome VARCHAR(30), -- NO_ANSWER, LEFT_VM, SPOKE, SENT, RECEIVED, etc.

  -- Details
  duration_seconds INTEGER, -- For calls
  message_content TEXT, -- For texts/emails
  note_content TEXT, -- For notes
  offer_amount DECIMAL(12,2), -- For offers
  offer_terms JSONB, -- For offers

  -- Cadence tracking
  cadence_step INTEGER, -- Which step this fulfilled
  was_scheduled BOOLEAN DEFAULT FALSE,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_activities_lead ON activities(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(activity_type, created_at DESC);

-- RLS
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to view activities" ON activities
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to insert activities" ON activities
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ============================================================================
-- 3. CREATE CADENCE TEMPLATES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS cadence_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  steps JSONB NOT NULL,
  total_steps INTEGER NOT NULL,
  total_days INTEGER NOT NULL,
  on_complete_action VARCHAR(30),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert cadence templates
INSERT INTO cadence_templates (name, description, total_steps, total_days, on_complete_action, steps) VALUES (
  'NEW_LEAD',
  'Initial outreach cadence for new PPC leads',
  12,
  21,
  'MARK_DEAD',
  '[
    {"step": 1, "day": 0, "delay_hours": 0, "action": "CALL", "note": "Call immediately"},
    {"step": 2, "day": 0, "delay_hours": 0.5, "action": "TEXT", "note": "Intro text if no answer"},
    {"step": 3, "day": 0, "delay_hours": 3, "action": "CALL", "note": "Second attempt"},
    {"step": 4, "day": 1, "delay_hours": null, "action": "CALL", "note": "Day 1 follow-up"},
    {"step": 5, "day": 1, "delay_hours": null, "action": "EMAIL", "note": "Intro email"},
    {"step": 6, "day": 2, "delay_hours": null, "action": "CALL", "note": "Day 2 call"},
    {"step": 7, "day": 3, "delay_hours": null, "action": "TEXT", "note": "Direct question"},
    {"step": 8, "day": 5, "delay_hours": null, "action": "CALL", "note": "Day 5 call"},
    {"step": 9, "day": 7, "delay_hours": null, "action": "TEXT", "note": "Offer mention"},
    {"step": 10, "day": 10, "delay_hours": null, "action": "CALL", "note": "Day 10 call"},
    {"step": 11, "day": 14, "delay_hours": null, "action": "TEXT", "note": "Break-up text"},
    {"step": 12, "day": 21, "delay_hours": null, "action": "CALL", "note": "Final attempt"}
  ]'::jsonb
) ON CONFLICT (name) DO NOTHING;

INSERT INTO cadence_templates (name, description, total_steps, total_days, on_complete_action, steps) VALUES (
  'CONTACTED',
  'Follow-up cadence after making contact',
  7,
  21,
  'MOVE_TO_NURTURE',
  '[
    {"step": 1, "day": 0, "delay_hours": 2, "action": "TEXT", "note": "Recap text after call"},
    {"step": 2, "day": 2, "delay_hours": null, "action": "CALL", "note": "Deliver promise / check in"},
    {"step": 3, "day": 4, "delay_hours": null, "action": "TEXT", "note": "Check if reviewed"},
    {"step": 4, "day": 7, "delay_hours": null, "action": "CALL", "note": "Follow-up call"},
    {"step": 5, "day": 10, "delay_hours": null, "action": "TEXT", "note": "Value add"},
    {"step": 6, "day": 14, "delay_hours": null, "action": "CALL", "note": "Direct ask"},
    {"step": 7, "day": 21, "delay_hours": null, "action": "TEXT", "note": "Final check"}
  ]'::jsonb
) ON CONFLICT (name) DO NOTHING;

INSERT INTO cadence_templates (name, description, total_steps, total_days, on_complete_action, steps) VALUES (
  'OFFER_MADE',
  'Follow-up cadence after sending offer',
  6,
  21,
  'MOVE_TO_NURTURE',
  '[
    {"step": 1, "day": 0, "delay_hours": 2, "action": "TEXT", "note": "Confirm receipt"},
    {"step": 2, "day": 2, "delay_hours": null, "action": "CALL", "note": "Check in"},
    {"step": 3, "day": 5, "delay_hours": null, "action": "CALL", "note": "Discuss offer"},
    {"step": 4, "day": 7, "delay_hours": null, "action": "TEXT", "note": "Soft urgency"},
    {"step": 5, "day": 10, "delay_hours": null, "action": "CALL", "note": "Direct conversation"},
    {"step": 6, "day": 14, "delay_hours": null, "action": "TEXT", "note": "Final push"}
  ]'::jsonb
) ON CONFLICT (name) DO NOTHING;

INSERT INTO cadence_templates (name, description, total_steps, total_days, on_complete_action, steps) VALUES (
  'NURTURE',
  'Long-term nurture for not-ready leads',
  5,
  365,
  'REVIEW',
  '[
    {"step": 1, "day": 30, "delay_hours": null, "action": "TEXT", "note": "30-day check"},
    {"step": 2, "day": 60, "delay_hours": null, "action": "TEXT", "note": "60-day value add"},
    {"step": 3, "day": 90, "delay_hours": null, "action": "CALL", "note": "90-day re-engage"},
    {"step": 4, "day": 180, "delay_hours": null, "action": "TEXT", "note": "6-month check"},
    {"step": 5, "day": 365, "delay_hours": null, "action": "CALL", "note": "Annual reactivation"}
  ]'::jsonb
) ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- DONE
-- ============================================================================
