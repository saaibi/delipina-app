ALTER TABLE products ADD COLUMN image_key text CHECK(image_key IN ('entera','trozos','picada','rayada'));
UPDATE products SET image_key=CASE WHEN lower(name)='entera' THEN 'entera' WHEN lower(name) IN ('en trozos','trozos') THEN 'trozos' WHEN lower(name)='picada' THEN 'picada' WHEN lower(name) IN ('rayada','rallada') THEN 'rayada' ELSE NULL END;
