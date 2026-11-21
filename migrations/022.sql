ALTER TABLE branches ADD COLUMN location_place_id text;
ALTER TABLE branches ADD COLUMN location_expires_at timestamptz;
ALTER TABLE orders ADD COLUMN delivery_location_expires_at timestamptz;
CREATE FUNCTION retain_google_order_location() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 SELECT location_expires_at INTO NEW.delivery_location_expires_at FROM branches WHERE id=NEW.branch_id AND location_source='google';
 RETURN NEW;
END $$;
CREATE TRIGGER google_order_location BEFORE INSERT ON orders FOR EACH ROW EXECUTE FUNCTION retain_google_order_location();
