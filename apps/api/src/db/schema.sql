-- TulaSetu repository schema.
--
-- Design rule (CLAUDE.md #4): append-only audit, never edit-in-place.
-- ISO/IEC 17025 §7.8 requires that original observations be recorded when made, and that
-- amendments be tracked with date + person while the original is retained. So the source of
-- truth here is `report_events` — an append-only, hash-chained log. Everything else in this
-- file is a *projection* that can be dropped and rebuilt from that log.
--
-- The append-only property is enforced by triggers below, not by convention. An UPDATE or
-- DELETE against the event log raises. That is the point: a lab officer, an admin, or a bug
-- in our own code cannot silently rewrite a recorded observation.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Identity and roles  (PRD §3.2)
-- ---------------------------------------------------------------------------

-- The approval chain is MA -> AD/DD -> Director (LM). Roles are ordered by authority so a
-- permission check can ask "at least AD?" rather than enumerating role names.
CREATE TABLE IF NOT EXISTS roles (
  id          TEXT PRIMARY KEY,          -- 'MA' | 'AD' | 'DD' | 'DIRECTOR' | 'ADMIN'
  label       TEXT NOT NULL,
  authority   INTEGER NOT NULL           -- higher = more authority
);

-- A lab: an RRSL, or (post Oct-2025 GATC amendment) a GATC or manufacturer test lab.
-- Multi-tenancy is a regulatory reality, not a design flourish -- see docs/PRD.md §1.4.
CREATE TABLE IF NOT EXISTS labs (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('RRSL','GATC','MTL','OTHER')),
  -- Rule 12 approval-mark lab code, e.g. '09' (Faridabad). Two chars in every sampled cert.
  lab_code    TEXT,
  nabl_accredited INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  lab_id      TEXT NOT NULL REFERENCES labs(id),
  role_id     TEXT NOT NULL REFERENCES roles(id),
  full_name   TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  -- Officer signing key (public half). IT Act s.5 gives a secure digital signature the same
  -- standing as a handwritten one; we store the public key and chain it into the event log.
  public_key  TEXT,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_lab ON users(lab_id);

-- ---------------------------------------------------------------------------
-- The append-only event log  -- THE SOURCE OF TRUTH
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS report_events (
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,   -- global order, per database
  report_id   TEXT NOT NULL,
  -- Per-report ordering. (report_id, version) is unique, which is also our optimistic
  -- concurrency check: two officers writing the same report version -> one of them loses.
  version     INTEGER NOT NULL,
  event_type  TEXT NOT NULL,
  -- JSON payload. Interpreted by the reducer in src/domain/reduce.ts, never by SQL.
  payload     TEXT NOT NULL,
  actor_id    TEXT NOT NULL REFERENCES users(id),
  -- ISO 17025 §7.8: date + person, on every amendment.
  recorded_at TEXT NOT NULL,
  -- Hash chain. hash = sha256(prev_hash || report_id || version || event_type || payload
  --                           || actor_id || recorded_at). Computed in src/db/events.ts.
  prev_hash   TEXT,
  hash        TEXT NOT NULL,
  -- Optional detached signature over `hash` by the actor's key (FR16).
  signature   TEXT,
  UNIQUE (report_id, version)
);

CREATE INDEX IF NOT EXISTS idx_events_report ON report_events(report_id, version);
CREATE INDEX IF NOT EXISTS idx_events_actor ON report_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_events_time ON report_events(recorded_at);

-- Append-only enforcement. There is deliberately no "admin override" path here; correcting a
-- mistake means appending a correction event, which is exactly what ISO 17025 asks for.
CREATE TRIGGER IF NOT EXISTS report_events_no_update
BEFORE UPDATE ON report_events
BEGIN
  SELECT RAISE(ABORT, 'report_events is append-only (ISO/IEC 17025 7.8): append a correction event instead of updating');
END;

CREATE TRIGGER IF NOT EXISTS report_events_no_delete
BEFORE DELETE ON report_events
BEGIN
  SELECT RAISE(ABORT, 'report_events is append-only (ISO/IEC 17025 7.8): records cannot be deleted');
END;

-- ---------------------------------------------------------------------------
-- Projections (rebuildable -- safe to DROP and replay)
-- ---------------------------------------------------------------------------

-- Current state of each report. Every column here is derived from report_events.
CREATE TABLE IF NOT EXISTS reports (
  id              TEXT PRIMARY KEY,
  lab_id          TEXT NOT NULL REFERENCES labs(id),
  -- Lifecycle per docs/PRD.md §3.3, derived from the AoM Rules 2011.
  status          TEXT NOT NULL,
  -- Which rule pack computed this report. Pinned at creation so a pack update never silently
  -- changes an already-issued result (CLAUDE.md #2 + FR17).
  ruleset_id      TEXT NOT NULL,
  ruleset_version TEXT,
  -- Output profile: India's Seventh Schedule, or OIML R 76. Rule 7(1)(a) permits either.
  profile         TEXT NOT NULL CHECK (profile IN ('IN_Sch7A','OIML_R76','BOTH')),

  application_no  TEXT,
  manufacturer    TEXT,
  model           TEXT,
  accuracy_class  TEXT,
  max_capacity_g  REAL,
  instrument_json TEXT,                  -- the full InstrumentProfile, as submitted

  overall_verdict TEXT,                  -- 'PASSED' | 'FAILED' | NULL while in progress
  created_by      TEXT REFERENCES users(id),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  submitted_at    TEXT,
  completed_at    TEXT,
  -- Rule 4(9) requires labs to report time taken per test annually. Recording the fee and the
  -- clock on the report itself is what makes that report a query instead of a data-gathering
  -- exercise. Rule 19: Rs 10,000 mechanical / Rs 25,000 digital-electronic.
  fee_paid_inr    INTEGER,
  -- Hash of the final locked PDF. The DOCX is a DRAFT artifact; this is the record copy.
  locked_hash     TEXT,
  version         INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_reports_lab_status ON reports(lab_id, status);
CREATE INDEX IF NOT EXISTS idx_reports_class ON reports(accuracy_class);
CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at);
CREATE INDEX IF NOT EXISTS idx_reports_manufacturer ON reports(manufacturer);

-- One row per R 76-2 form instance. `range_index` is non-null only for multiple-range
-- instruments, which get a full form set per range (R 76-1 §3.2).
CREATE TABLE IF NOT EXISTS report_forms (
  report_id   TEXT NOT NULL REFERENCES reports(id),
  form_id     TEXT NOT NULL,
  test_id     TEXT NOT NULL,
  range_index INTEGER,
  applicable  INTEGER NOT NULL,
  -- 'PASSED' | 'FAILED' | 'NA'. NA renders as "- -" on the form.
  verdict     TEXT,
  na_reason   TEXT,
  result_json TEXT,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (report_id, form_id, range_index)
);

-- Attachments: model photo (Figure 1), sealing diagram (Figure 2), circuit diagrams, scans.
-- Rule 16(2): submitted models and drawings are not open to public inspection, so this table
-- carries a confidentiality tier and the repository must honour it.
CREATE TABLE IF NOT EXISTS attachments (
  id            TEXT PRIMARY KEY,
  report_id     TEXT NOT NULL REFERENCES reports(id),
  kind          TEXT NOT NULL,          -- 'model_photo' | 'sealing_diagram' | 'document' | ...
  filename      TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  byte_size     INTEGER NOT NULL,
  sha256        TEXT NOT NULL,
  storage_path  TEXT NOT NULL,
  confidentiality TEXT NOT NULL DEFAULT 'restricted'
                  CHECK (confidentiality IN ('public','restricted','confidential')),
  uploaded_by   TEXT NOT NULL REFERENCES users(id),
  uploaded_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attachments_report ON attachments(report_id);

-- Deficiencies raised by AD/DD on review, and their resolution. Modelled explicitly because
-- the deficiency loop is a real state in the AoM Rules workflow, not an afterthought.
CREATE TABLE IF NOT EXISTS deficiencies (
  id          TEXT PRIMARY KEY,
  report_id   TEXT NOT NULL REFERENCES reports(id),
  form_id     TEXT,
  severity    TEXT NOT NULL CHECK (severity IN ('major','minor','observation')),
  text        TEXT NOT NULL,
  raised_by   TEXT NOT NULL REFERENCES users(id),
  raised_at   TEXT NOT NULL,
  resolved_by TEXT REFERENCES users(id),
  resolved_at TEXT,
  resolution  TEXT
);

CREATE INDEX IF NOT EXISTS idx_deficiencies_report ON deficiencies(report_id);

-- Rule packs actually loaded by this installation, so a report's pinned ruleset can always be
-- resolved back to the exact bytes that produced it.
CREATE TABLE IF NOT EXISTS rulepacks (
  ruleset_id  TEXT NOT NULL,
  version     TEXT NOT NULL,
  sha256      TEXT NOT NULL,
  content     TEXT NOT NULL,
  loaded_at   TEXT NOT NULL,
  PRIMARY KEY (ruleset_id, version)
);
