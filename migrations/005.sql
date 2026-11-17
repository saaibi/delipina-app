CREATE TABLE business_days(day date PRIMARY KEY,closed_at timestamptz,closed_by uuid REFERENCES users,summary jsonb);
