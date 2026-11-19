ALTER TABLE products ADD COLUMN image_updated_at timestamptz;
CREATE TABLE product_photos(product_id uuid PRIMARY KEY REFERENCES products ON DELETE CASCADE,mime text NOT NULL,data bytea NOT NULL);
