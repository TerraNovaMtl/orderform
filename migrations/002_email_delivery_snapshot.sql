ALTER TABLE terranova.email_outbox ADD COLUMN delivery_payload jsonb;
ALTER TABLE terranova.email_outbox ADD COLUMN first_attempt_at timestamptz;
