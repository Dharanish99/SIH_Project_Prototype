import express, { type Response } from "express";
import { randomUUID, createHash, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import type { StudentRecord, ImportPreview } from "../shared/contracts.ts";
export type { StudentRecord } from "../shared/contracts.ts";
import { previewCsv, snapshotCsv } from "./imports.ts";
import { inspectAudit } from "./audit.ts";
import { openDatabase, SCHEMA_VERSION } from "./database.ts";
import { LIMITS } from "./config.ts";
import {
  loadSigningKeys,
  signAssertion,
  signatureValid,
  ISSUER,
} from "./signing.ts";
import { installHttp, handleErrors, HttpError as Fault } from "./http.ts";
export { signatureValid } from "./signing.ts";

type Role = "operator" | "approver" | "student" | "regulator" | "verifier";
type Session = {
  role: Role;
  tenant: string;
  studentId: string;
  recipient: string;
  csrf: string;
  expires: number;
};
type Issue = {
  id: string;
  recordId?: string;
  title: string;
  detail: string;
  severity: "review" | "pending";
  rule: string;
  action: string;
};
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const json = (value: unknown) => JSON.stringify(value);
const decode = <T>(value: unknown): T => JSON.parse(String(value));
export const institutions = [
  {
    id: "aster",
    name: "Aster Institute of Technology",
    short: "AIT",
    city: "Fictional campus · Tamil Nadu",
  },
  {
    id: "river",
    name: "Riverbend Technical College",
    short: "RTC",
    city: "Fictional campus · Karnataka",
  },
];
const programmes = [
  { id: "CSE", name: "Computer Science & Engineering", capacity: 6 },
  { id: "ECE", name: "Electronics & Communication", capacity: 4 },
];
const nameMap = [
  "Aarav Menon",
  "Diya Nair",
  "Ishaan Bose",
  "Kavya Shah",
  "Nila Thomas",
  "Rehan Ali",
  "Meera Iyer",
  "Sara Khan",
  "Varun Das",
];
const personaSchema = z.object({
  role: z.enum(["operator", "approver", "student", "regulator", "verifier"]),
  tenant: z.enum(["aster", "river"]).default("aster"),
  accessCode: z.string().max(200).optional(),
  recipient: z
    .enum(["Northstar Skills", "Meridian Careers"])
    .default("Northstar Skills"),
});
const correctionSchema = z.object({
  programme: z.enum(["CSE", "ECE"]),
  reason: z.string().trim().min(12).max(1000),
  expectedVersion: z.number().int().positive(),
});

export function createApplication(
  options: {
    dbPath?: string;
    now?: () => number;
    keyPath?: string;
    demoMode?: boolean;
    allowedOrigins?: string[];
    allowedHosts?: string[];
    hosted?: boolean;
    accessCode?: string;
    requestLimit?: number;
    sessionLimit?: number;
  } = {},
) {
  if (
    options.hosted &&
    (!options.accessCode ||
      options.accessCode.length < 16 ||
      !options.allowedHosts?.length ||
      !options.allowedOrigins?.length)
  )
    throw new Error(
      "Hosted demos require access code, allowed hosts and allowed origins.",
    );
  const now = options.now ?? Date.now;
  const dbPath = options.dbPath ?? path.resolve("data/setutrace.sqlite");
  const db = openDatabase(dbPath);
  const { privateKey, publicKey, keyId } = loadSigningKeys(options.keyPath);
  const stamp = () => new Date(now()).toISOString();
  const transaction = <T>(f: () => T) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const value = f();
      db.exec("COMMIT");
      return value;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  };
  const audit = (
    tenant: string,
    actor: string,
    action: string,
    detail: string,
  ) => {
    const prev =
      db
        .prepare(
          "SELECT digest FROM events WHERE tenant=? ORDER BY seq DESC LIMIT 1",
        )
        .get(tenant)?.digest ?? "GENESIS";
    const created = stamp();
    const digest = hash(json([tenant, actor, action, detail, created, prev]));
    db.prepare(
      "INSERT INTO events(tenant,actor,action,detail,created,previous,digest) VALUES(?,?,?,?,?,?,?)",
    ).run(tenant, actor, action, detail, created, String(prev), digest);
  };
  const records = (tenant: string) =>
    db
      .prepare("SELECT data FROM records WHERE tenant=? ORDER BY id")
      .all(tenant)
      .map((x) => decode<StudentRecord>(x.data));
  const getRecord = (id: string, tenant: string) => {
    const row = db
      .prepare("SELECT data FROM records WHERE id=? AND tenant=?")
      .get(id, tenant);
    if (!row) throw new Fault(404, "Record not available in this workspace.");
    return decode<StudentRecord>(row.data);
  };
  const invalidate = (tenant: string) => {
    db.prepare(
      "UPDATE snapshots SET status='superseded' WHERE tenant=? AND status='approved'",
    ).run(tenant);
  };
  const putRecord = (r: StudentRecord, reason: string) => {
    db.prepare(
      "INSERT INTO records VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version,data=excluded.data",
    ).run(r.id, r.tenant, r.version, json(r));
    db.prepare(
      "INSERT INTO revisions(record_id,version,data,reason,created) VALUES(?,?,?,?,?)",
    ).run(r.id, r.version, json(r), reason, stamp());
  };
  const seed = () =>
    transaction(() => {
      db.exec("UPDATE control SET reset_allowed=1 WHERE id=1");
      for (const t of [
        "grants",
        "snapshots",
        "imports",
        "cases",
        "revisions",
        "records",
        "events",
      ])
        db.exec(`DELETE FROM ${t}`);
      for (const [index, name] of nameMap.entries()) {
        const n = index + 1;
        const studentId = `AIT-26-${String(n).padStart(3, "0")}`;
        putRecord(
          {
            id: `aster:${studentId}`,
            studentId,
            tenant: "aster",
            name,
            programme: n <= 7 ? "CSE" : "ECE",
            apaar: n === 3 ? "" : n === 6 ? "11100000" : `11100000000${n}`,
            status: "Active",
            provider:
              n === 3 || n === 6
                ? "not_linked"
                : n === 5
                  ? "unavailable"
                  : "linked",
            version: 1,
            programmeReview: n === 7,
            source: "Synthetic ERP export · 28 Oct 2026",
          },
          "Synthetic initial export",
        );
      }
      for (let i = 1; i <= 3; i++)
        putRecord(
          {
            id: `river:RTC-26-00${i}`,
            studentId: `RTC-26-00${i}`,
            tenant: "river",
            name: ["Anaya Dev", "Dev Patel", "Leela Roy"][i - 1],
            programme: i < 3 ? "CSE" : "ECE",
            apaar: "",
            status: "Active",
            provider: "not_linked",
            version: 1,
            programmeReview: false,
            source: "Synthetic Riverbend export",
          },
          "Synthetic initial export",
        );
      audit(
        "aster",
        "System",
        "Workspace prepared",
        "9 fictional records imported. Demo capacities: CSE 6, ECE 4.",
      );
      audit(
        "aster",
        "System",
        "Source inconsistency noted",
        "Meera’s fictional admission letter says ECE; the ERP export says CSE.",
      );
      audit(
        "river",
        "System",
        "Workspace prepared",
        "3 fictional records available only to this institution.",
      );
      db.exec("UPDATE control SET reset_allowed=0 WHERE id=1");
    });
  if (!db.prepare("SELECT 1 FROM records LIMIT 1").get()) seed();
  const issues = (tenant: string): Issue[] => {
    const rows = records(tenant),
      result: Issue[] = [];
    for (const p of programmes) {
      const count = rows.filter(
        (r) => r.programme === p.id && r.status === "Active",
      ).length;
      if (count > p.capacity)
        result.push({
          id: `capacity-${p.id}`,
          title: `${p.id}: ${count} reported against ${p.capacity} seats`,
          detail:
            "Reconcile the counted records and scoped approval. This is a reporting finding; no student is rejected.",
          severity: "review",
          rule: "DEMO-CAPACITY-01",
          action: "Review the count",
        });
    }
    for (const r of rows) {
      if (r.programmeReview)
        result.push({
          id: `programme-${r.id}`,
          recordId: r.id,
          title: `${r.name}: programme needs confirmation`,
          detail:
            "The fictional admission letter and source export disagree. Let the student challenge the claim, then record an authorised correction.",
          severity: "review",
          rule: "DEMO-SOURCE-02",
          action: "Open evidence",
        });
      if (r.apaar && !/^\d{12}$/.test(r.apaar))
        result.push({
          id: `format-${r.id}`,
          recordId: r.id,
          title: `${r.name}: APAAR format needs review`,
          detail:
            "The source contains fewer than 12 digits. Format is only a shape check; no checksum or identity verdict is inferred.",
          severity: "review",
          rule: "FORMAT-12",
          action: "Review source",
        });
      if (!r.apaar)
        result.push({
          id: `missing-${r.id}`,
          recordId: r.id,
          title: `${r.name}: awaiting academic linkage`,
          detail:
            "The local admission record is retained. Missing APAAR does not automatically mean ineligible.",
          severity: "pending",
          rule: "LINKAGE-PENDING",
          action: "Keep pending",
        });
      if (r.provider === "unavailable")
        result.push({
          id: `provider-${r.id}`,
          recordId: r.id,
          title: `${r.name}: provider fixture unavailable`,
          detail:
            "A simulated unavailable response is not evidence of an invalid ID. Local reporting can continue.",
          severity: "pending",
          rule: "PROVIDER-UNKNOWN",
          action: "Await evidence",
        });
    }
    return result;
  };
  const reviewDigest = (tenant: string) =>
    hash(
      json({
        rows: records(tenant),
        findings: issues(tenant),
        cases: cases(tenant),
        rulePack: "DEMO-2026.1",
      }),
    );
  const snapshots = (tenant: string): Record<string, unknown>[] =>
    db
      .prepare("SELECT * FROM snapshots WHERE tenant=? ORDER BY rowid DESC")
      .all(tenant)
      .map((r) => ({
        ...decode<Record<string, unknown>>(r.data),
        id: r.id,
        status: r.status,
      }));
  const cases = (tenant: string): Record<string, unknown>[] =>
    db
      .prepare("SELECT * FROM cases WHERE tenant=? ORDER BY rowid DESC")
      .all(tenant)
      .map((r) => ({
        ...decode<Record<string, unknown>>(r.data),
        id: r.id,
        status: r.status,
      }));
  const grants = (s: Session) =>
    db
      .prepare(
        "SELECT * FROM grants WHERE tenant=?" +
          (s.role === "student" ? " AND record_id=?" : " AND recipient=?") +
          " ORDER BY rowid DESC",
      )
      .all(s.tenant, s.role === "student" ? s.studentId : s.recipient)
      .map((g) => {
        const d = decode<Record<string, unknown>>(g.data);
        return s.role === "verifier"
          ? {
              id: g.id,
              status: g.status,
              recipient: g.recipient,
              created: d.created,
              expires: d.expires,
            }
          : { id: g.id, status: g.status, recipient: g.recipient, ...d };
      });
  const app = express();
  const { sessionLimiter, verificationLimiter } = installHttp(app, options);
  app.get("/api/health", (_req, res) =>
    res.json({
      status: "ok",
      mode: options.hosted ? "synthetic-hosted" : "synthetic-local",
      database: "SQLite",
      schemaVersion: SCHEMA_VERSION,
      version: "0.3.0",
    }),
  );
  app.get("/api/capabilities", (_req, res) =>
    res.json({
      mode: options.demoMode === false ? "locked" : "demo",
      apiVersion: "0.3.0",
      accessCodeRequired: !!options.accessCode,
      csv: { maxRows: LIMITS.rows, maxBytes: LIMITS.csvBytes },
      sessionMinutes: LIMITS.sessionTtlMs / 60000,
      provider: "synthetic fixtures",
      policy: "fictional pack",
      signing: "Ed25519 synthetic issuer",
    }),
  );
  app.post("/api/demo/session", sessionLimiter, (req, res) => {
    if (options.demoMode === false)
      throw new Fault(
        503,
        "Demo authentication is disabled. No production identity adapter is configured.",
        "AUTH_NOT_CONFIGURED",
      );
    const p = personaSchema.parse(req.body),
      token = randomUUID();
    const priorToken = req.headers.cookie
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith("setutrace_demo="))
      ?.split("=")[1];
    const prior = priorToken
      ? db
          .prepare("SELECT expires FROM sessions WHERE token_hash=?")
          .get(hash(priorToken))
      : undefined;
    if (
      options.accessCode &&
      !(prior && Number(prior.expires) > now()) &&
      !timingSafeEqual(
        Buffer.from(hash(p.accessCode ?? "")),
        Buffer.from(hash(options.accessCode)),
      )
    )
      throw new Fault(
        403,
        "Enter the judge access code supplied by the demo owner.",
        "DEMO_ACCESS_REQUIRED",
      );
    if (priorToken)
      db.prepare("DELETE FROM sessions WHERE token_hash=?").run(
        hash(priorToken),
      );
    db.prepare("DELETE FROM sessions WHERE expires<=?").run(now());
    if (
      Number(db.prepare("SELECT COUNT(*) n FROM sessions").get()?.n ?? 0) >=
      LIMITS.activeSessions
    )
      throw new Fault(
        429,
        "Too many active demo sessions. Close expired sessions before continuing.",
        "SESSION_LIMIT",
      );
    const s: Session = {
      role: p.role,
      tenant: p.tenant,
      studentId: `${p.tenant}:${p.tenant === "aster" ? "AIT-26-007" : "RTC-26-001"}`,
      recipient: p.recipient,
      csrf: randomUUID(),
      expires: now() + LIMITS.sessionTtlMs,
    };
    db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
      hash(token),
      s.expires,
      json(s),
    );
    res.cookie("setutrace_demo", token, {
      httpOnly: true,
      secure: !!options.hosted,
      sameSite: "strict",
      maxAge: LIMITS.sessionTtlMs,
      path: "/",
    });
    res.json({ session: s });
  });
  app.use("/api", (req, res, next) => {
    const token = req.headers.cookie
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("setutrace_demo="))
      ?.split("=")[1];
    const row = token
      ? db
          .prepare("SELECT data,expires FROM sessions WHERE token_hash=?")
          .get(hash(token))
      : undefined;
    if (!row || Number(row.expires) <= now())
      return next(
        new Fault(
          401,
          "Choose a demo persona to enter this local workspace.",
          "SESSION_REQUIRED",
        ),
      );
    const s = decode<Session>(row.data);
    res.locals.session = s;
    res.locals.tokenHash = hash(token!);
    if (
      !["GET", "HEAD"].includes(req.method) &&
      req.headers["x-csrf-token"] !== s.csrf
    )
      return next(
        new Fault(
          403,
          "Session action token is missing or stale. Refresh the workspace.",
          "CSRF_DENIED",
        ),
      );
    next();
  });
  const session = (res: Response) => res.locals.session as Session;
  const allow = (res: Response, ...roles: Role[]) => {
    const s = session(res);
    if (!roles.includes(s.role))
      throw new Fault(
        403,
        "This action belongs to a different demo role.",
        "ROLE_DENIED",
      );
    return s;
  };
  app.post("/api/session/logout", (_req, res) => {
    db.prepare("DELETE FROM sessions WHERE token_hash=?").run(
      res.locals.tokenHash,
    );
    res.clearCookie("setutrace_demo", { path: "/" });
    res.json({ ok: true });
  });
  app.get("/api/session", (_req, res) => res.json({ session: session(res) }));
  app.get("/api/state", (_req, res) => {
    const s = session(res);
    const base = {
      session: s,
      institutions,
      programmes,
      policy: {
        id: "DEMO-2026.1",
        title: "Fictional capacity pack",
        source: "Synthetic fixture, not an AICTE approval",
        cohort: "2026–27",
      },
    };
    if (s.role === "verifier")
      return res.json({
        ...base,
        grants: grants(s),
        records: [],
        issues: [],
        cases: [],
        snapshots: [],
        events: [],
      });
    if (s.role === "regulator")
      return res.json({
        ...base,
        aggregates: institutions.map((t) => ({
          institution: t.name,
          records: records(t.id).length,
          review: issues(t.id).filter((i) => i.severity === "review").length,
          snapshots: snapshots(t.id).filter((x) => x.status === "approved")
            .length,
        })),
        records: [],
        issues: [],
        cases: [],
        snapshots: [],
        events: [],
      });
    if (s.role === "student")
      return res.json({
        ...base,
        records: [getRecord(s.studentId, s.tenant)],
        issues: issues(s.tenant).filter((i) => i.recordId === s.studentId),
        cases: cases(s.tenant).filter((c) => c.recordId === s.studentId),
        snapshots: snapshots(s.tenant).map((x) => ({
          id: x.id,
          status: x.status,
          created: x.created,
        })),
        grants: grants(s),
        events: [],
      });
    return res.json({
      ...base,
      reviewDigest: reviewDigest(s.tenant),
      records: records(s.tenant),
      issues: issues(s.tenant),
      cases: cases(s.tenant),
      snapshots: snapshots(s.tenant),
      events: db
        .prepare(
          "SELECT seq,actor,action,detail,created,digest FROM events WHERE tenant=? ORDER BY seq DESC LIMIT 30",
        )
        .all(s.tenant),
    });
  });
  app.get("/api/records/:id/revisions", (req, res) => {
    const s = allow(res, "operator", "approver", "student");
    const r = getRecord(String(req.params.id), s.tenant);
    if (s.role === "student" && r.id !== s.studentId)
      throw new Fault(404, "Record not available.");
    res.json({
      revisions: db
        .prepare(
          "SELECT version,reason,created,data FROM revisions WHERE record_id=? ORDER BY version DESC",
        )
        .all(r.id)
        .map((v) => ({ ...v, data: decode(v.data) })),
    });
  });
  app.post("/api/imports/preview", (req, res) => {
    const s = allow(res, "operator");
    const { csv } = z.object({ csv: z.string().min(1) }).parse(req.body);
    const rows = previewCsv(csv, records(s.tenant));
    const id = randomUUID(),
      fingerprint = hash(csv + "|mapping-v1");
    const preview = {
      id,
      fingerprint,
      rows,
      created: stamp(),
      mapping: "student-csv-v1",
    };
    db.prepare("INSERT INTO imports VALUES(?,?,?,?,?)").run(
      id,
      s.tenant,
      fingerprint,
      "preview",
      json(preview),
    );
    res.json(preview);
  });
  app.post("/api/imports/:id/commit", (req, res) => {
    const s = allow(res, "operator");
    const receipt = transaction(() => {
      const job = db
        .prepare("SELECT * FROM imports WHERE id=? AND tenant=?")
        .get(String(req.params.id), s.tenant);
      if (!job) throw new Fault(404, "Import not available.");
      const preview = decode<ImportPreview>(job.data);
      if (preview.rows.some((r) => r.status === "error"))
        throw new Fault(400, "Fix the highlighted CSV rows before committing.");
      const previous = db
        .prepare(
          "SELECT id FROM imports WHERE tenant=? AND fingerprint=? AND status='committed'",
        )
        .get(s.tenant, job.fingerprint);
      if (previous) {
        if (job.status === "preview")
          db.prepare("UPDATE imports SET status='replayed' WHERE id=?").run(
            String(job.id),
          );
        return {
          id: previous.id,
          changed: 0,
          replayed: true,
          message: "Original receipt returned. No records were duplicated.",
        };
      }
      let changed = 0;
      for (const row of preview.rows) {
        const v = row.input,
          id = `${s.tenant}:${v.studentId}`;
        const prior = db
          .prepare("SELECT data FROM records WHERE id=? AND tenant=?")
          .get(id, s.tenant);
        const current = prior ? decode<StudentRecord>(prior.data) : undefined;
        if ((current?.version ?? 0) !== row.currentVersion)
          throw new Fault(
            409,
            "A record changed after preview. Re-preview this batch; no rows were committed.",
            "STALE_PREVIEW",
          );
        if (row.status === "unchanged") continue;
        putRecord(
          {
            ...current,
            id,
            studentId: v.studentId,
            tenant: s.tenant,
            name: v.name,
            programme: v.programme,
            apaar: v.apaar,
            status: v.status,
            version: (current?.version ?? 0) + 1,
            provider:
              current?.apaar === v.apaar ? current.provider : "not_linked",
            programmeReview: current?.programmeReview ?? false,
            source: "Local CSV import · student-csv-v1",
          },
          "Institution CSV correction/import",
        );
        changed++;
      }
      if (changed) invalidate(s.tenant);
      db.prepare("UPDATE imports SET status='committed' WHERE id=?").run(
        String(job.id),
      );
      audit(
        s.tenant,
        "Institution operator",
        "Batch committed",
        `${changed} changed rows; ${preview.rows.length - changed} unchanged. Uniform local batch receipt; no external match information.`,
      );
      return {
        id: job.id,
        changed,
        replayed: false,
        message:
          "Local batch receipt created. This is not a government acknowledgement.",
      };
    });
    res.json(receipt);
  });
  app.post("/api/cases", (req, res) => {
    const s = allow(res, "student");
    const data = correctionSchema.parse(req.body);
    const r = getRecord(s.studentId, s.tenant);
    if (data.expectedVersion !== r.version)
      throw new Fault(
        409,
        "Your record changed. Refresh before raising this correction.",
      );
    if (cases(s.tenant).some((c) => c.recordId === r.id && c.status === "open"))
      throw new Fault(409, "A correction is already open for this record.");
    const id = randomUUID();
    transaction(() => {
      db.prepare("INSERT INTO cases VALUES(?,?,?,?,?)").run(
        id,
        s.tenant,
        r.id,
        "open",
        json({
          recordId: r.id,
          studentName: r.name,
          field: "programme",
          from: r.programme,
          to: data.programme,
          reason: data.reason,
          expectedVersion: r.version,
          created: stamp(),
        }),
      );
      audit(
        s.tenant,
        "Student",
        "Correction requested",
        "Programme correction submitted with a reason; source facts remain unchanged pending review.",
      );
    });
    res.status(201).json({ id });
  });
  app.post("/api/cases/:id/reopen", (req, res) => {
    const sessionValue = allow(res, "student");
    const input = correctionSchema.parse(req.body);
    const id = transaction(() => {
      const item = db
        .prepare("SELECT * FROM cases WHERE id=? AND tenant=? AND record_id=?")
        .get(
          String(req.params.id),
          sessionValue.tenant,
          sessionValue.studentId,
        );
      if (!item || item.status !== "open")
        throw new Fault(
          409,
          "This request is no longer open. Refresh its history.",
        );
      const previous = decode<Record<string, unknown>>(item.data);
      const record = getRecord(sessionValue.studentId, sessionValue.tenant);
      if (record.version !== input.expectedVersion)
        throw new Fault(
          409,
          "The source changed again. Refresh before renewing the request.",
        );
      if (previous.expectedVersion === record.version)
        throw new Fault(
          409,
          "This request already covers the current source revision.",
        );
      const nextId = randomUUID();
      db.prepare("UPDATE cases SET status='declined',data=? WHERE id=?").run(
        json({
          ...previous,
          outcome: "superseded",
          supersededBy: nextId,
          resolution:
            "Source changed; replaced by a new request against the current revision.",
          resolvedAt: stamp(),
        }),
        item.id,
      );
      db.prepare("INSERT INTO cases VALUES(?,?,?,?,?)").run(
        nextId,
        sessionValue.tenant,
        record.id,
        "open",
        json({
          recordId: record.id,
          studentName: record.name,
          field: "programme",
          from: record.programme,
          to: input.programme,
          reason: input.reason,
          expectedVersion: record.version,
          previousCaseId: item.id,
          created: stamp(),
        }),
      );
      audit(
        sessionValue.tenant,
        "Student",
        "Correction renewed",
        "Outdated request retained and linked to a new request against the current source revision.",
      );
      return nextId;
    });
    res.status(201).json({ id });
  });
  app.post("/api/cases/:id/resolve", (req, res) => {
    const s = allow(res, "operator");
    const { reason, decision } = z
      .object({
        reason: z.string().trim().min(12).max(1000),
        decision: z.enum(["accept", "decline"]),
      })
      .parse(req.body);
    const item = db
      .prepare("SELECT * FROM cases WHERE id=? AND tenant=?")
      .get(String(req.params.id), s.tenant);
    if (!item || item.status !== "open")
      throw new Fault(409, "This case is unavailable or already resolved.");
    const c = decode<{
      recordId: string;
      to: "CSE" | "ECE";
      expectedVersion: number;
    }>(item.data);
    transaction(() => {
      const r = getRecord(c.recordId, s.tenant);
      if (decision === "accept" && r.version !== c.expectedVersion)
        throw new Fault(
          409,
          "The source record changed after this request. Reconcile the newer revision before resolving.",
        );
      if (decision === "accept") {
        putRecord(
          {
            ...r,
            programme: c.to,
            programmeReview: false,
            version: r.version + 1,
            source: "Institution-authorised correction",
          },
          reason,
        );
        invalidate(s.tenant);
      }
      db.prepare("UPDATE cases SET status=?,data=? WHERE id=?").run(
        decision === "accept" ? "resolved" : "declined",
        json({
          ...decode<Record<string, unknown>>(item.data),
          resolution: reason,
          resolvedAt: stamp(),
        }),
        String(item.id),
      );
      audit(
        s.tenant,
        "Institution operator",
        decision === "accept"
          ? "Source correction recorded"
          : "Correction declined with reason",
        decision === "accept"
          ? "New source revision created. Prior snapshots and version-bound verification can no longer appear current."
          : "The student receives the reason and may raise a new evidenced request.",
      );
    });
    res.json({ ok: true });
  });
  app.post("/api/records/:id/provider-fixture", (req, res) => {
    const s = allow(res, "operator");
    const { response, expectedVersion } = z
      .object({
        response: z.enum(["linked", "unavailable", "denied", "not_linked"]),
        expectedVersion: z.number().int(),
      })
      .parse(req.body);
    transaction(() => {
      const r = getRecord(String(req.params.id), s.tenant);
      if (r.version !== expectedVersion)
        throw new Fault(409, "Stale source version. Refresh first.");
      if (response === "linked" && !/^\d{12}$/.test(r.apaar))
        throw new Fault(
          400,
          "Use a 12-digit fictional value for this linked response fixture.",
        );
      putRecord(
        { ...r, provider: response, version: r.version + 1 },
        `SIMULATED provider response: ${response}`,
      );
      invalidate(s.tenant);
      audit(
        s.tenant,
        "Institution operator",
        "Provider fixture applied",
        "A synthetic account-linked response was recorded. No government endpoint was called.",
      );
    });
    res.json({ ok: true });
  });
  app.post("/api/snapshots", (req, res) => {
    const s = allow(res, "approver");
    const { note, reviewDigest: expectedDigest } = z
      .object({
        note: z.string().trim().min(12).max(1000),
        reviewDigest: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .parse(req.body);
    const id = randomUUID();
    transaction(() => {
      if (expectedDigest !== reviewDigest(s.tenant))
        throw new Fault(
          409,
          "The reviewed records or findings changed. Refresh, review the current set and acknowledge it again.",
          "STALE_REVIEW",
        );
      const rows = records(s.tenant);
      const findings = issues(s.tenant);
      const data = {
        id,
        created: stamp(),
        issuer: "SYNTHETIC INSTITUTION",
        note,
        rulePack: "DEMO-2026.1",
        reviewDigest: expectedDigest,
        cases: cases(s.tenant),
        rows,
        digest: hash(json(rows)),
        count: rows.length,
        active: rows.filter((r) => r.status === "Active").length,
        findings,
        summary: programmes.map((p) => ({
          ...p,
          count: rows.filter(
            (r) => r.programme === p.id && r.status === "Active",
          ).length,
        })),
        acknowledgement:
          "Local approval only. No government submission or acknowledgement.",
      };
      invalidate(s.tenant);
      db.prepare("INSERT INTO snapshots VALUES(?,?,?,?)").run(
        id,
        s.tenant,
        "approved",
        json(data),
      );
      audit(
        s.tenant,
        "Institution approver",
        "Snapshot approved",
        `${rows.length} exact record revisions frozen with ${findings.length} disclosed findings. Local approval only.`,
      );
    });
    res.status(201).json({ id });
  });
  app.get("/api/snapshots/:id/export", (req, res) => {
    const s = allow(res, "operator", "approver");
    const snapshot = db
      .prepare("SELECT * FROM snapshots WHERE id=? AND tenant=?")
      .get(String(req.params.id), s.tenant);
    if (!snapshot) throw new Fault(404, "Snapshot not available.");
    res
      .set(
        "Content-Disposition",
        'attachment; filename="setutrace-synthetic-snapshot.json"',
      )
      .json({
        ...decode<Record<string, unknown>>(snapshot.data),
        status: snapshot.status,
        synthetic: true,
      });
  });
  app.post("/api/grants", (req, res) => {
    const s = allow(res, "student");
    const { fields, purpose } = z
      .object({
        fields: z
          .array(z.enum(["name", "programme", "status"]))
          .min(1)
          .max(3),
        purpose: z.string().trim().min(8).max(200),
      })
      .parse(req.body);
    const grant = transaction(() => {
      const r = getRecord(s.studentId, s.tenant);
      const snapshot = snapshots(s.tenant).find((x) => x.status === "approved");
      if (!snapshot)
        throw new Fault(
          409,
          "An institution approver must approve a current snapshot first.",
        );
      const frozen = (snapshot.rows as StudentRecord[]).find(
        (row) => row.id === r.id,
      );
      if (!frozen || frozen.version !== r.version)
        throw new Fault(
          409,
          "The source revision is not covered by the current snapshot.",
          "SNAPSHOT_MISMATCH",
        );
      const id = randomUUID(),
        expires = new Date(now() + 15 * 60 * 1000).toISOString(),
        created = stamp();
      const claims = Object.fromEntries(
        [...new Set(fields)].map((f) => [f, r[f]]),
      );
      const payload = {
        iss: ISSUER,
        sub: id,
        aud: s.recipient,
        purpose,
        revision: r.version,
        snapshotId: snapshot.id,
        claims,
        iat: Math.floor(now() / 1000),
        exp: Math.floor(now() / 1000) + 900,
      };
      const assertion = signAssertion(payload, privateKey, keyId);
      const data = {
        fields: [...new Set(fields)],
        purpose,
        revision: r.version,
        snapshotId: snapshot.id,
        expires,
        created,
        assertion,
      };
      db.prepare("INSERT INTO grants VALUES(?,?,?,?,?,?)").run(
        id,
        s.tenant,
        r.id,
        s.recipient,
        "active",
        json(data),
      );
      audit(
        s.tenant,
        "Student",
        "Limited sharing authorised",
        `Recipient: ${s.recipient}. Fields: ${fields.join(", ")}. Fifteen-minute synthetic grant.`,
      );
      return { id, ...data };
    });
    res.status(201).json(grant);
  });
  app.post("/api/grants/:id/revoke", (req, res) => {
    const s = allow(res, "student");
    const result = transaction(() => {
      const g = db
        .prepare(
          "SELECT id,status FROM grants WHERE id=? AND tenant=? AND record_id=?",
        )
        .get(String(req.params.id), s.tenant, s.studentId);
      if (!g) throw new Fault(404, "Sharing permission not available.");
      if (g.status === "revoked") return { ok: true, replayed: true };
      db.prepare("UPDATE grants SET status='revoked' WHERE id=?").run(
        String(g.id),
      );
      audit(
        s.tenant,
        "Student",
        "Sharing permission withdrawn",
        "Future receipt retrieval is blocked. Copies previously downloaded cannot be recalled.",
      );
      return { ok: true, replayed: false };
    });
    res.json(result);
  });
  app.post("/api/verify", verificationLimiter, (req, res) => {
    const s = allow(res, "verifier");
    const { id, assertion } = z
      .object({ id: z.string().uuid(), assertion: z.string().optional() })
      .parse(req.body);
    const result = transaction(() => {
      const g = db
        .prepare("SELECT * FROM grants WHERE id=? AND recipient=?")
        .get(id, s.recipient);
      if (!g)
        throw new Fault(404, "No permission is available for this recipient.");
      const data = decode<{
        expires: string;
        revision: number;
        snapshotId: string;
        assertion: string;
      }>(g.data);
      if (g.status !== "active")
        throw new Fault(
          410,
          "Sharing permission was withdrawn. No student fields disclosed.",
        );
      if (new Date(data.expires).getTime() <= now())
        throw new Fault(
          410,
          "This permission expired. Request a new student grant.",
        );
      const r = getRecord(String(g.record_id), String(g.tenant));
      const snap = db
        .prepare("SELECT status FROM snapshots WHERE id=? AND tenant=?")
        .get(data.snapshotId, g.tenant);
      if (r.version !== data.revision || snap?.status !== "approved")
        throw new Fault(
          409,
          "This assertion is superseded. A current approval and new permission are required.",
        );
      if (
        (assertion && assertion !== data.assertion) ||
        !signatureValid(data.assertion, publicKey)
      )
        throw new Fault(400, "Assertion integrity check failed.");
      const payload = decode<Record<string, unknown>>(
        Buffer.from(data.assertion.split(".")[1], "base64url").toString(),
      );
      const details = decode<{ purpose: string; fields: string[] }>(g.data);
      const header = decode<{ kid: string }>(
        Buffer.from(data.assertion.split(".")[0], "base64url").toString(),
      );
      const expectedClaims = Object.fromEntries(
        details.fields.map((f) => [f, r[f as keyof StudentRecord]]),
      );
      if (
        header.kid !== keyId ||
        payload.iss !== ISSUER ||
        payload.sub !== id ||
        payload.aud !== s.recipient ||
        payload.revision !== r.version ||
        payload.snapshotId !== data.snapshotId ||
        payload.purpose !== details.purpose ||
        payload.exp !== Math.floor(new Date(data.expires).getTime() / 1000) ||
        typeof payload.iat !== "number" ||
        payload.iat > Math.floor(now() / 1000) ||
        json(payload.claims) !== json(expectedClaims)
      )
        throw new Fault(
          400,
          "Signed assertion bindings do not match the current permission.",
          "ASSERTION_BINDING_MISMATCH",
        );
      return {
        status: "current",
        synthetic: true,
        signature: "Ed25519 signature checked",
        issuer: "SetuTrace synthetic institution",
        ...payload,
        assertion: data.assertion,
        disclaimer:
          "Current institution assertion in a local demo. Not proof of admission legality or an official degree.",
      };
    });
    res.json(result);
  });
  app.get("/api/audit/verify", (_req, res) => {
    const s = allow(res, "operator", "approver");
    const result = inspectAudit(db, s.tenant);
    res.status(result.valid ? 200 : 409).json({
      ...result,
      tenant: s.tenant,
      algorithm: "SHA-256 chained application events",
      scope:
        "Detects inconsistent retained events; not protection against an administrator rewriting the complete database.",
    });
  });
  app.get("/api/reports/summary", (_req, res) => {
    const s = allow(res, "operator", "approver");
    res.json({
      tenant: s.tenant,
      generated: stamp(),
      rulePack: "DEMO-2026.1",
      synthetic: true,
      records: records(s.tenant).length,
      review: issues(s.tenant).filter((i) => i.severity === "review").length,
      pending: issues(s.tenant).filter((i) => i.severity === "pending").length,
      openCases: cases(s.tenant).filter((c) => c.status === "open").length,
      approvedSnapshots: snapshots(s.tenant).filter(
        (x) => x.status === "approved",
      ).length,
      audit: inspectAudit(db, s.tenant),
      programmes: programmes.map((p) => ({
        ...p,
        count: records(s.tenant).filter(
          (r) => r.programme === p.id && r.status === "Active",
        ).length,
      })),
    });
  });
  app.get("/api/snapshots/:id/report.csv", (req, res) => {
    const s = allow(res, "operator", "approver");
    const snapshot = db
      .prepare("SELECT * FROM snapshots WHERE id=? AND tenant=?")
      .get(String(req.params.id), s.tenant);
    if (!snapshot) throw new Fault(404, "Snapshot not available.");
    const data = decode<{ rows: StudentRecord[] }>(snapshot.data);
    res
      .set({
        "Content-Disposition":
          'attachment; filename="setutrace-synthetic-report.csv"',
        "X-Snapshot-Status": String(snapshot.status),
      })
      .type("text/csv")
      .send(snapshotCsv(data.rows, String(snapshot.status)));
  });
  app.post("/api/demo/reset", (_req, res) => {
    allow(res, "operator");
    seed();
    res.json({ ok: true });
  });
  app.use("/api", (_req, _res, next) =>
    next(new Fault(404, "API route not found.", "NOT_FOUND")),
  );
  app.use(handleErrors);
  return { app, db, close: () => db.close(), publicKey };
}
