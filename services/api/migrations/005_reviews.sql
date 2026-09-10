CREATE TABLE facility_notes(carrier_id text, id uuid, load_id text, stop_id text, document_id uuid, document_version integer NOT NULL, instructions text NOT NULL, reviewed_by text NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(carrier_id,id), FOREIGN KEY(carrier_id,load_id,stop_id) REFERENCES stops(carrier_id,load_id,id), FOREIGN KEY(carrier_id,document_id) REFERENCES documents(carrier_id,id));
ALTER TABLE maintenance_holds ADD COLUMN resolved_at timestamptz;
ALTER TABLE maintenance_holds ADD COLUMN recorded_by text;
