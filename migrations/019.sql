CREATE TABLE maintenance_archives(id uuid PRIMARY KEY,actor_id uuid NOT NULL REFERENCES users,created_at timestamptz NOT NULL DEFAULT now(),summary jsonb NOT NULL,payload bytea NOT NULL);
