-- ============================================================================
-- ONE-SHOT CLEANUP — clears the 295-task pile and aligns task assignment
-- with current lead ownership.
-- Paste into Supabase SQL Editor → Run.
-- ============================================================================

-- 1. Cancel pending tasks for leads that are already in a terminal status
--    (CLOSED, DEAD, ARCHIVED, NURTURE, UNDER_CONTRACT). These were lingering
--    from before status changes auto-cancelled tasks.
UPDATE scheduled_tasks
SET status = 'cancelled', completed_at = NOW()
WHERE status = 'pending'
  AND lead_id IN (
    SELECT id FROM leads
    WHERE UPPER(COALESCE(pipeline_status, status, '')) IN ('CLOSED', 'DEAD', 'ARCHIVED', 'NURTURE', 'UNDER_CONTRACT')
  );

-- 2. Re-route remaining pending tasks to whoever currently owns the lead.
--    This moves your overflowing rundown to Anthony where it belongs.
UPDATE scheduled_tasks t
SET assigned_to = l.current_owner_id
FROM leads l
WHERE t.lead_id = l.id
  AND t.status = 'pending'
  AND l.current_owner_id IS NOT NULL
  AND t.assigned_to IS DISTINCT FROM l.current_owner_id;

-- Sanity: how many pending tasks per owner after cleanup?
SELECT
  u.email,
  u.role,
  COUNT(t.id) AS pending_tasks
FROM scheduled_tasks t
LEFT JOIN users u ON u.id = t.assigned_to
WHERE t.status = 'pending'
GROUP BY u.email, u.role
ORDER BY pending_tasks DESC;
