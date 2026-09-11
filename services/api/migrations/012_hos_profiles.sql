-- Explicit reviewed profiles are opt-in; existing declared-budget scenarios stay unchanged.
-- Revisions preserve source history rather than overwriting reviewed evidence.
CREATE TABLE hos_profiles (
 carrier_id text NOT NULL, driver_id text NOT NULL, revision integer NOT NULL CHECK(revision>0),
 body jsonb NOT NULL, provenance text NOT NULL CHECK(provenance IN ('synthetic','live','imported-historical')),
 source_ref text NOT NULL, reviewed_by text NOT NULL, reviewed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(carrier_id,driver_id,revision),
 FOREIGN KEY(carrier_id,driver_id) REFERENCES resources(carrier_id,id)
);
