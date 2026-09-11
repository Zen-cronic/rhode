ALTER TABLE assignments ADD COLUMN visit_review_required boolean NOT NULL DEFAULT false;
CREATE TABLE visit_reconciliations (
 carrier_id text NOT NULL, id uuid NOT NULL, assignment_id uuid NOT NULL,
 fingerprint text NOT NULL, reviewed_by text NOT NULL, reason text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now(), body jsonb NOT NULL,
 PRIMARY KEY(carrier_id,id), FOREIGN KEY(carrier_id,assignment_id) REFERENCES assignments(carrier_id,id)
);
ALTER TABLE stop_visits ADD COLUMN superseded_by uuid;
ALTER TABLE stop_visits ADD FOREIGN KEY(carrier_id,superseded_by) REFERENCES visit_reconciliations(carrier_id,id);
DROP INDEX one_open_visit;
CREATE UNIQUE INDEX one_open_visit ON stop_visits(carrier_id,assignment_id,stop_id) WHERE departure IS NULL AND superseded_by IS NULL;
