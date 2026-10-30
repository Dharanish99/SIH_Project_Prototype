import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

export const SCHEMA_VERSION = 1;
/** A clean submission database: the earlier local prototype remains separate. */
export function openDatabase(filename: string) {
  if (filename !== ":memory:")
    mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(
    "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;",
  );
  const version = Number(
    db.prepare("PRAGMA user_version").get()?.user_version ?? 0,
  );
  if (version > SCHEMA_VERSION) {
    db.close();
    throw new Error("The database is newer than this application.");
  }
  if (version === 0) {
    const previous = db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='records'",
      )
      .get();
    if (previous) {
      db.close();
      throw new Error(
        "Legacy prototype database detected. Use a new DATA_DIR; never silently rewrite existing evidence.",
      );
    }
    db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE control(id INTEGER PRIMARY KEY CHECK(id=1), reset_allowed INTEGER NOT NULL DEFAULT 0 CHECK(reset_allowed IN(0,1)));
      INSERT INTO control(id) VALUES(1);
      CREATE TABLE records(
        id TEXT PRIMARY KEY, tenant TEXT NOT NULL, version INTEGER NOT NULL CHECK(version>0), data TEXT NOT NULL,
        UNIQUE(tenant,id), CHECK(json_valid(data)),
        CHECK(COALESCE(json_extract(data,'$.id')=id AND json_extract(data,'$.tenant')=tenant AND json_extract(data,'$.version')=version,0))
      );
      CREATE TABLE revisions(
        id INTEGER PRIMARY KEY, record_id TEXT NOT NULL REFERENCES records(id), version INTEGER NOT NULL CHECK(version>0),
        data TEXT NOT NULL CHECK(json_valid(data)), reason TEXT NOT NULL, created TEXT NOT NULL, UNIQUE(record_id,version)
      );
      CREATE TABLE cases(
        id TEXT PRIMARY KEY, tenant TEXT NOT NULL, record_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN('open','resolved','declined')), data TEXT NOT NULL CHECK(json_valid(data)),
        FOREIGN KEY(tenant,record_id) REFERENCES records(tenant,id)
      );
      CREATE UNIQUE INDEX one_open_case ON cases(tenant,record_id) WHERE status='open';
      CREATE TABLE imports(
        id TEXT PRIMARY KEY, tenant TEXT NOT NULL, fingerprint TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN('preview','committed','replayed')), data TEXT NOT NULL CHECK(json_valid(data))
      );
      CREATE UNIQUE INDEX committed_fingerprint ON imports(tenant,fingerprint) WHERE status='committed';
      CREATE INDEX imports_scope ON imports(tenant,status);
      CREATE TABLE snapshots(
        id TEXT PRIMARY KEY, tenant TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN('approved','superseded')),
        data TEXT NOT NULL CHECK(json_valid(data)), UNIQUE(tenant,id)
      );
      CREATE UNIQUE INDEX one_current_snapshot ON snapshots(tenant) WHERE status='approved';
      CREATE TABLE grants(
        id TEXT PRIMARY KEY, tenant TEXT NOT NULL, record_id TEXT NOT NULL, recipient TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN('active','revoked')), data TEXT NOT NULL CHECK(json_valid(data)),
        FOREIGN KEY(tenant,record_id) REFERENCES records(tenant,id)
      );
      CREATE INDEX grants_recipient ON grants(tenant,recipient,status);
      CREATE TABLE sessions(token_hash TEXT PRIMARY KEY, expires INTEGER NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)));
      CREATE INDEX sessions_expiry ON sessions(expires);
      CREATE TABLE events(
        seq INTEGER PRIMARY KEY, tenant TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL,
        detail TEXT NOT NULL, created TEXT NOT NULL, previous TEXT NOT NULL, digest TEXT NOT NULL
      );
      CREATE INDEX events_scope ON events(tenant,seq);
      CREATE TRIGGER revision_no_update BEFORE UPDATE ON revisions BEGIN SELECT RAISE(ABORT,'Source revisions cannot be changed'); END;
      CREATE TRIGGER revision_no_delete BEFORE DELETE ON revisions WHEN (SELECT reset_allowed FROM control WHERE id=1)=0 BEGIN SELECT RAISE(ABORT,'Source revisions cannot be deleted'); END;
      CREATE TRIGGER audit_no_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT,'Audit events cannot be changed'); END;
      CREATE TRIGGER audit_no_delete BEFORE DELETE ON events WHEN (SELECT reset_allowed FROM control WHERE id=1)=0 BEGIN SELECT RAISE(ABORT,'Audit events cannot be deleted'); END;
      CREATE TRIGGER snapshot_evidence_no_update BEFORE UPDATE OF data ON snapshots BEGIN SELECT RAISE(ABORT,'Frozen snapshot evidence cannot be changed'); END;
      CREATE TRIGGER grant_evidence_no_update BEFORE UPDATE OF data ON grants BEGIN SELECT RAISE(ABORT,'Signed grant evidence cannot be changed'); END;
      PRAGMA user_version=1;
      COMMIT;`);
  }
  return db;
}
