CREATE TABLE road_closures (
 carrier_id text, id uuid, assignment_id uuid NOT NULL, area jsonb NOT NULL,
 observed_at timestamptz NOT NULL, source_ref text NOT NULL, reason text NOT NULL,
 provenance text NOT NULL, recorded_by text NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(carrier_id,id), FOREIGN KEY(carrier_id,assignment_id) REFERENCES assignments(carrier_id,id)
);
CREATE INDEX road_closures_trip ON road_closures(carrier_id,assignment_id,recorded_at);
CREATE TABLE route_revisions (
 carrier_id text, id uuid, assignment_id uuid NOT NULL, revision integer NOT NULL DEFAULT 1,
 status text NOT NULL CHECK(status IN ('pending','unresolved','approved')),
 body jsonb NOT NULL, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 approved_by text, approved_at timestamptz,
 PRIMARY KEY(carrier_id,id), FOREIGN KEY(carrier_id,assignment_id) REFERENCES assignments(carrier_id,id)
);
CREATE INDEX route_revisions_trip ON route_revisions(carrier_id,assignment_id,created_at);
