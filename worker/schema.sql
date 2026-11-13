-- Anti-Slop telemetry: daily totals only. No identifiers, no URLs, no text.
CREATE TABLE IF NOT EXISTS hidden (
  day  TEXT NOT NULL,              -- YYYY-MM-DD, the user's local day the posts were hidden
  site TEXT NOT NULL,              -- x | linkedin | tiktok | instagram
  kind TEXT NOT NULL,              -- signal (AI-sounding) | label (platform AI label) | keyword
  n    INTEGER NOT NULL DEFAULT 0, -- posts hidden
  PRIMARY KEY (day, site, kind)
);
CREATE TABLE IF NOT EXISTS installs (
  day TEXT NOT NULL, ext TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0,  -- new installs per day per version
  PRIMARY KEY (day, ext)
);
CREATE TABLE IF NOT EXISTS reports (
  day TEXT NOT NULL, ext TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0,  -- installs that sent counts for that day
  PRIMARY KEY (day, ext)
);
