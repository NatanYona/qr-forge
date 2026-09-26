CREATE TABLE links (
  slug        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  destination TEXT NOT NULL,
  paused      INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE TABLE scans (
  slug  TEXT NOT NULL REFERENCES links(slug) ON DELETE CASCADE,
  hour  TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (slug, hour)
);
