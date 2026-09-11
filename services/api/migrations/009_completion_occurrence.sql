-- Legacy completions have no known occurrence timestamp. Do not backfill from receipt time.
ALTER TABLE stop_completions ADD COLUMN occurred_at timestamptz;
