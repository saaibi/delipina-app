CREATE TABLE demo_batches(id uuid PRIMARY KEY,client_id uuid NOT NULL REFERENCES users,created_by uuid NOT NULL REFERENCES users,created_at timestamptz NOT NULL DEFAULT now(),branch_ids uuid[] NOT NULL DEFAULT '{}',order_ids uuid[] NOT NULL DEFAULT '{}',UNIQUE(client_id));
ALTER TABLE orders ADD COLUMN demo_batch_id uuid REFERENCES demo_batches;
CREATE INDEX orders_demo_batch ON orders(demo_batch_id) WHERE demo_batch_id IS NOT NULL;
