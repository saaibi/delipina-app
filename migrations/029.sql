CREATE TABLE inventory_suppliers(id uuid PRIMARY KEY,name text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX inventory_suppliers_name_idx ON inventory_suppliers(lower(name));
CREATE TABLE inventory_stock(unit text PRIMARY KEY CHECK(unit IN ('kg')),quantity numeric(18,3) NOT NULL DEFAULT 0 CHECK(quantity>=0));
INSERT INTO inventory_stock(unit) VALUES('kg');
CREATE TABLE inventory_movements(id uuid PRIMARY KEY,kind text NOT NULL CHECK(kind IN ('purchase','consumption','waste','adjustment','order','reversal')),unit text NOT NULL REFERENCES inventory_stock(unit),quantity numeric(18,3) NOT NULL CHECK(quantity<>0),purchase_unit text,original_quantity numeric(18,3),total_cost bigint CHECK(total_cost>=0),supplier_id uuid REFERENCES inventory_suppliers(id),occurred_on date NOT NULL,notes text NOT NULL DEFAULT '',actor_id uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),balance_after numeric(18,3) NOT NULL CHECK(balance_after>=0));
CREATE INDEX inventory_movements_date_idx ON inventory_movements(occurred_on DESC,created_at DESC,id);
CREATE INDEX inventory_movements_supplier_idx ON inventory_movements(supplier_id,occurred_on DESC);

ALTER TABLE inventory_movements ADD COLUMN order_id uuid REFERENCES orders(id);
CREATE TABLE inventory_rules(product_id uuid REFERENCES products(id),maturity text NOT NULL DEFAULT 'en_punto' CHECK(maturity IN ('en_punto','verde','madura')),raw_kg numeric(18,6) NOT NULL CHECK(raw_kg>0),output_quantity numeric(18,6) NOT NULL CHECK(output_quantity>0),active boolean NOT NULL DEFAULT true,PRIMARY KEY(product_id,maturity));
CREATE TABLE inventory_order_effects(order_id uuid PRIMARY KEY REFERENCES orders(id),raw_kg numeric(18,3) NOT NULL CHECK(raw_kg>0),refunded boolean NOT NULL DEFAULT false,details jsonb NOT NULL);

CREATE TABLE inventory_lots(id uuid PRIMARY KEY REFERENCES inventory_movements(id),remaining_kg numeric(18,3) NOT NULL CHECK(remaining_kg>=0),maturity text NOT NULL CHECK(maturity IN ('en_punto','verde','madura')),received_on date NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE INDEX inventory_lots_fifo_idx ON inventory_lots(received_on,created_at,id) WHERE remaining_kg>0;
ALTER TABLE inventory_movements ADD COLUMN maturity text;

ALTER TABLE inventory_lots ADD COLUMN yields jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE TABLE inventory_pending(order_id uuid PRIMARY KEY REFERENCES orders(id),reason text NOT NULL,actor_id uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now());
