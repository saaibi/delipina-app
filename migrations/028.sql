ALTER TABLE payments ADD COLUMN rejected_at timestamptz;
ALTER TABLE payments ADD COLUMN rejection_reason text;
ALTER TABLE payments ADD COLUMN reviewed_by uuid REFERENCES users(id);
CREATE INDEX payments_client_created_idx ON payments(client_id,created_at DESC);
ALTER TABLE payments ADD CONSTRAINT payment_review_exclusive CHECK (NOT (verified AND rejected_at IS NOT NULL));
CREATE INDEX payments_pending_review_idx ON payments(created_at DESC) WHERE NOT verified AND rejected_at IS NULL;
