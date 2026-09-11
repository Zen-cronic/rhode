CREATE TABLE route_receipts (
 carrier_id text, route_revision_id uuid, approved_revision integer NOT NULL,
 driver_id text NOT NULL, acknowledged_by text NOT NULL,
 acknowledged_at timestamptz NOT NULL DEFAULT now(), route_fingerprint text NOT NULL,
 PRIMARY KEY(carrier_id,route_revision_id),
 FOREIGN KEY(carrier_id,route_revision_id) REFERENCES route_revisions(carrier_id,id),
 FOREIGN KEY(carrier_id,driver_id) REFERENCES resources(carrier_id,id)
);
