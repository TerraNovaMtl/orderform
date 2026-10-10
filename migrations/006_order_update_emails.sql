ALTER TABLE terranova.email_outbox DROP CONSTRAINT email_outbox_order_id_recipient_key;
ALTER TABLE terranova.email_outbox ADD COLUMN order_version integer NOT NULL DEFAULT 0;
ALTER TABLE terranova.email_outbox ADD COLUMN email_kind text NOT NULL DEFAULT 'confirmation' CHECK (email_kind IN ('confirmation','update'));
ALTER TABLE terranova.email_outbox ADD COLUMN email_comments text NOT NULL DEFAULT '';
ALTER TABLE terranova.email_outbox ADD COLUMN order_snapshot jsonb;
ALTER TABLE terranova.email_outbox ADD CONSTRAINT email_outbox_order_recipient_version_key UNIQUE(order_id,recipient,order_version);
