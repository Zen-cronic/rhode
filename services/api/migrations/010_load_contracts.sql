CREATE TABLE load_contracts (
 carrier_id text NOT NULL, load_id text NOT NULL, contract_id text NOT NULL,
 bound_by text NOT NULL, bound_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(carrier_id,load_id),
 FOREIGN KEY(carrier_id,load_id) REFERENCES loads(carrier_id,id),
 FOREIGN KEY(carrier_id,contract_id) REFERENCES contracts(carrier_id,id)
);
