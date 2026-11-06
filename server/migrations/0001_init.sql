CREATE TABLE players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  pw_hash TEXT NOT NULL,
  pw_salt TEXT NOT NULL,
  pw_iter INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES players(id),
  expires_at INTEGER NOT NULL
);

CREATE TABLE saves (
  player_id INTEGER PRIMARY KEY REFERENCES players(id),
  version INTEGER NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE treasury_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  crew_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  actor TEXT NOT NULL,
  kind TEXT NOT NULL,
  item_id TEXT,
  qty INTEGER,
  gold INTEGER,
  note TEXT
);
CREATE INDEX idx_treasury_log_crew ON treasury_log(crew_id, at);
