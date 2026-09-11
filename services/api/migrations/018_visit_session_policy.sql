-- Name the existing strict accuracy-disk/no-grace behavior on retained visits.
-- No observed timestamps, visit identities or invoice revisions are rewritten.
ALTER TABLE stop_visits ADD COLUMN session_policy text NOT NULL DEFAULT 'confidence-disk-split-v1';
