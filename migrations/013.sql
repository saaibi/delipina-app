ALTER TABLE branches ADD COLUMN lat double precision;
ALTER TABLE branches ADD COLUMN lng double precision;
ALTER TABLE branches ADD COLUMN location_source text;
ALTER TABLE branches ADD CONSTRAINT branch_coordinates CHECK ((lat IS NULL AND lng IS NULL) OR (lat IS NOT NULL AND lng IS NOT NULL AND lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180));
CREATE TABLE route_matrix_cache(key text PRIMARY KEY,durations jsonb NOT NULL,expires_at timestamptz NOT NULL);
CREATE INDEX route_matrix_cache_expiration ON route_matrix_cache(expires_at);
-- Fictitious map points for the explicitly marked route demo, not verified customer locations.
UPDATE branches SET lat=CASE city WHEN 'Piedecuesta' THEN 6.9871 WHEN 'Floridablanca' THEN 7.0628 WHEN 'Girón' THEN 7.0732 WHEN 'Bucaramanga' THEN 7.1193 WHEN 'Bogotá' THEN 4.5981 END + CASE WHEN address LIKE '%Calle%' THEN 0.003 ELSE 0 END,lng=CASE city WHEN 'Piedecuesta' THEN -73.0495 WHEN 'Floridablanca' THEN -73.0860 WHEN 'Girón' THEN -73.1681 WHEN 'Bucaramanga' THEN -73.1227 WHEN 'Bogotá' THEN -74.0760 END,location_source='demo' WHERE id IN(SELECT unnest(branch_ids) FROM demo_batches);

-- Public plaza reference: Alcaldía de Bucaramanga, OATIC I trimestre 2022. Editable by administration.
UPDATE settings SET data=data || '{"originLocation":{"lat":7.13488,"lng":-73.12438}}'::jsonb WHERE data->>'origin' ILIKE '%San Francisco%' AND data->>'originLocation' IS NULL;
