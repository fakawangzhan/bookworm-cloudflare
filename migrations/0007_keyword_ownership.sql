-- Preserve the existing library. New provenance restricts ordinary accounts
-- to their own contributions; administrators retain access to legacy entries.
CREATE TABLE IF NOT EXISTS bw_keyword_sources (
  owner_id TEXT NOT NULL, book_id TEXT NOT NULL, term_id INTEGER NOT NULL,
  PRIMARY KEY(owner_id,book_id,term_id)
);
CREATE TABLE IF NOT EXISTS bw_keyword_owner_aliases (
  owner_id TEXT NOT NULL, term_id INTEGER NOT NULL, alias TEXT NOT NULL,
  PRIMARY KEY(owner_id,term_id,alias)
);
