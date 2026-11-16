CREATE TABLE invoice_photos(invoice_id uuid PRIMARY KEY REFERENCES invoices ON DELETE CASCADE,mime text NOT NULL,data bytea NOT NULL);
