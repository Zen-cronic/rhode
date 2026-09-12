CREATE TABLE axle_assessments (
 carrier_id text NOT NULL, id uuid NOT NULL, load_id text NOT NULL,
 truck_id text NOT NULL, trailer_id text NOT NULL, revision integer NOT NULL CHECK(revision>0),
 document_id uuid NOT NULL, reviewed_by text NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now(),
 body jsonb NOT NULL,
 PRIMARY KEY(carrier_id,id), UNIQUE(carrier_id,load_id,truck_id,trailer_id,revision),
 FOREIGN KEY(carrier_id,load_id) REFERENCES loads(carrier_id,id),
 FOREIGN KEY(carrier_id,truck_id) REFERENCES resources(carrier_id,id),
 FOREIGN KEY(carrier_id,trailer_id) REFERENCES resources(carrier_id,id),
 FOREIGN KEY(carrier_id,document_id) REFERENCES documents(carrier_id,id)
);
CREATE INDEX axle_assessments_vehicle ON axle_assessments(carrier_id,truck_id,trailer_id,load_id,revision DESC);
