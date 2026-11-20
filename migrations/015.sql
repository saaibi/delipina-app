ALTER TABLE products ADD COLUMN IF NOT EXISTS allows_fraction boolean NOT NULL DEFAULT false;
UPDATE products SET allows_fraction=true WHERE unit IN ('kg','lb','arroba');
-- Also make the local preview upgrade safely if migration 014 ran during implementation.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_city text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_lat double precision;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_lng double precision;
UPDATE orders o SET delivery_address=COALESCE(o.delivery_address,b.address),delivery_city=COALESCE(o.delivery_city,b.city),delivery_lat=COALESCE(o.delivery_lat,b.lat),delivery_lng=COALESCE(o.delivery_lng,b.lng) FROM branches b WHERE b.id=o.branch_id AND o.delivery_address IS NULL;
