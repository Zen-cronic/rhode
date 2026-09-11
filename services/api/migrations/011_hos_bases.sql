CREATE TABLE hos_bases (
 carrier_id text NOT NULL, driver_id text NOT NULL, at timestamptz NOT NULL,
 duty text NOT NULL, budget jsonb NOT NULL, provenance text NOT NULL,
 PRIMARY KEY(carrier_id,driver_id), FOREIGN KEY(carrier_id,driver_id) REFERENCES resources(carrier_id,id)
);
-- Only explicitly labeled original scenario inputs can initialize existing demonstrations.
-- Live/imported drivers require a separately reviewed basis; never infer one from current GPS.
INSERT INTO hos_bases(carrier_id,driver_id,at,duty,budget,provenance)
SELECT s.carrier_id,d->>'id',(d->>'budgetAsOf')::timestamptz,d->>'duty',d->'budget','synthetic'
FROM scenarios s CROSS JOIN LATERAL jsonb_array_elements(s.initial_state->'drivers') d
WHERE s.id='recovery' AND d->>'provenance'='synthetic' AND d->>'budgetAsOf' IS NOT NULL AND jsonb_typeof(d->'budget')='object'
ON CONFLICT DO NOTHING;
