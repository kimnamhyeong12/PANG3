-- XLSX has a 65-character media type. Widen the field for existing installations.
ALTER TABLE support_attachments ALTER COLUMN content_type TYPE varchar(100);
