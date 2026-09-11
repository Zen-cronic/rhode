CREATE TABLE visit_time_revisions (
 carrier_id text NOT NULL, id uuid NOT NULL, visit_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision>0), document_id uuid NOT NULL,
 reviewed_by text NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now(),
 fingerprint text NOT NULL, body jsonb NOT NULL,
 PRIMARY KEY(carrier_id,id), UNIQUE(carrier_id,visit_id,revision),
 FOREIGN KEY(carrier_id,visit_id) REFERENCES stop_visits(carrier_id,id),
 FOREIGN KEY(carrier_id,document_id) REFERENCES documents(carrier_id,id)
);
