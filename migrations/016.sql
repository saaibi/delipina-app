CREATE TABLE route_geometry_cache(key text PRIMARY KEY,geometry jsonb NOT NULL,expires_at timestamptz NOT NULL);
CREATE INDEX route_geometry_cache_expiration ON route_geometry_cache(expires_at);
