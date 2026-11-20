ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK(role IN ('admin','courier','client','preparation','plant_admin'));
ALTER TABLE products DROP CONSTRAINT products_unit_check;
ALTER TABLE products ADD CONSTRAINT products_unit_check CHECK(unit IN ('kg','lb','arroba','pack'));
-- Precios ficticios autorizados por el usuario; no sobrescribe catálogo existente.
INSERT INTO products(id,name,presentation,unit,price,active,image_key)
SELECT md5('delipina:initial:'||p.name||':'||u.unit)::uuid,p.name,u.presentation,u.unit,
CASE WHEN p.name='Panela' THEN u.price+100000 ELSE u.price END,true,p.image_key
FROM (VALUES ('Entera','entera'),('En trozos','trozos'),('Picada','picada'),('Rayada','rayada'),('Panela',NULL),('Azúcar',NULL)) p(name,image_key)
CROSS JOIN (VALUES ('kg','Por kilogramo',500000),('lb','Por libra (500 g)',250000),('arroba','Arroba colombiana (25 libras / 12,5 kg)',6000000)) u(unit,presentation,price)
WHERE NOT EXISTS(SELECT 1 FROM products x WHERE lower(x.name)=lower(p.name) AND x.unit=u.unit AND x.presentation=u.presentation);
