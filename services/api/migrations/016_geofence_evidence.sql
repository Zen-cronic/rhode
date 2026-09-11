-- Derived facility-identity evidence stays separate from the immutable source body.
ALTER TABLE telemetry ADD COLUMN geofence_evidence jsonb;
