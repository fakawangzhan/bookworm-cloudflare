-- Keep the migration path equivalent to the historical schema.sql bootstrap.
CREATE INDEX IF NOT EXISTS bw_book_parts_lookup ON bw_book_parts(owner_id, book_id, part_index);
