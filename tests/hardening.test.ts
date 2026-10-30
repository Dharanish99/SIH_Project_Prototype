import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { request, type Server } from "node:http";
import { createApplication } from "../server/app.ts";
import { readConfig } from "../server/config.ts";
import { loadSigningKeys, signAssertion } from "../server/signing.ts";
import { csvCell } from "../server/imports.ts";

type Runtime = ReturnType<typeof createApplication>;
type Client = {
  call: (
    url: string,
    body?: unknown,
  ) => Promise<{ status: number; body: any; headers: Headers }>;
  cookie: string;
  csrf: string;
};
async function listen(runtime: Runtime) {
  const server = await new Promise<Server>((resolve) => {
    const s = runtime.app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const connect = (cookie: string, csrf: string): Client => ({
    cookie,
    csrf,
    call: async (url, body) => {
      if (url === "/snapshots" && body && !(body as any).reviewDigest) {
        const state: any = await (
          await fetch(base + "/api/state", { headers: { cookie } })
        ).json();
        body = { ...(body as object), reviewDigest: state.reviewDigest };
      }
      const response = await fetch(base + "/api" + url, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          cookie,
          "x-csrf-token": csrf,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      return {
        status: response.status,
        headers: response.headers,
        body: response.headers.get("content-type")?.includes("application/json")
          ? JSON.parse(text)
          : text,
      };
    },
  });
  const persona = async (
    role: string,
    tenant = "aster",
    recipient = "Northstar Skills",
  ) => {
    const response = await fetch(base + "/api/demo/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, tenant, recipient }),
    });
    assert.equal(response.status, 200);
    const data = (await response.json()) as any;
    return connect(
      response.headers.get("set-cookie")!.split(";")[0],
      data.session.csrf,
    );
  };
  return {
    base,
    persona,
    connect,
    close: () =>
      new Promise<void>((resolve) =>
        server.close(() => {
          runtime.close();
          resolve();
        }),
      ),
  };
}
async function fixture(
  action: (h: Awaited<ReturnType<typeof listen>>, r: Runtime) => Promise<void>,
  options: Parameters<typeof createApplication>[0] = {},
) {
  const runtime = createApplication({ dbPath: ":memory:", ...options }),
    h = await listen(runtime);
  try {
    await action(h, runtime);
  } finally {
    await h.close();
  }
}
const header = "student_id,name,programme,apaar,status,expected_version\n";
async function approvedGrant(h: Awaited<ReturnType<typeof listen>>) {
  const student = await h.persona("student"),
    approver = await h.persona("approver");
  assert.equal(
    (
      await approver.call("/snapshots", {
        note: "Reviewed synthetic data and explicitly retained all unresolved findings.",
      })
    ).status,
    201,
  );
  const grant = await student.call("/grants", {
    fields: ["name", "programme"],
    purpose: "Internship eligibility check",
  });
  assert.equal(grant.status, 201);
  return { student, grant: grant.body };
}

test("HTTP errors are bounded JSON responses with correlation IDs and security headers", () =>
  fixture(async (h) => {
    const op = await h.persona("operator");
    const unknown = await op.call("/does-not-exist");
    assert.equal(unknown.status, 404);
    assert.equal(unknown.body.code, "NOT_FOUND");
    assert.equal(unknown.body.requestId, unknown.headers.get("x-request-id"));
    assert.match(
      unknown.headers.get("content-security-policy") ?? "",
      /frame-ancestors 'none'/,
    );
    assert.equal(unknown.headers.get("referrer-policy"), "no-referrer");
    assert.equal(unknown.headers.get("cache-control"), "no-store");
    const invalid = await fetch(h.base + "/api/demo/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"role":',
    });
    assert.equal(invalid.status, 400);
    assert.equal(((await invalid.json()) as any).code, "INVALID_JSON");
    const oversized = await fetch(h.base + "/api/demo/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ huge: "x".repeat(700000) }),
    });
    assert.equal(oversized.status, 413);
    assert.equal(((await oversized.json()) as any).code, "PAYLOAD_TOO_LARGE");
    const hostStatus = await new Promise<number | undefined>(
      (resolve, reject) => {
        const req = request(
          h.base + "/api/health",
          { headers: { Host: "untrusted.example" } },
          (response) => {
            response.resume();
            resolve(response.statusCode);
          },
        );
        req.on("error", reject);
        req.end();
      },
    );
    assert.equal(hostStatus, 403);
  }));

test("database guards enforce tenant references, source consistency and immutable evidence", () =>
  fixture(async (h, r) => {
    assert.throws(
      () => r.db.prepare("UPDATE revisions SET reason='changed'").run(),
      /cannot be changed/,
    );
    assert.throws(
      () => r.db.prepare("DELETE FROM revisions").run(),
      /cannot be deleted/,
    );
    assert.throws(
      () => r.db.prepare("UPDATE events SET detail='changed'").run(),
      /cannot be changed/,
    );
    assert.throws(
      () => r.db.prepare("DELETE FROM events").run(),
      /cannot be deleted/,
    );
    assert.throws(
      () =>
        r.db
          .prepare("UPDATE records SET version=3 WHERE id='aster:AIT-26-001'")
          .run(),
      /CHECK constraint/,
    );
    assert.throws(
      () =>
        r.db
          .prepare("INSERT INTO cases VALUES(?,?,?,?,?)")
          .run(randomUUID(), "river", "aster:AIT-26-001", "open", "{}"),
      /FOREIGN KEY/,
    );
    const { student, grant } = await approvedGrant(h);
    assert.throws(
      () =>
        r.db.prepare("UPDATE grants SET data='{}' WHERE id=?").run(grant.id),
      /cannot be changed/,
    );
    assert.throws(
      () => r.db.prepare("UPDATE snapshots SET data='{}'").run(),
      /cannot be changed/,
    );
    assert.equal((await student.call("/state")).body.records.length, 1);
    const op = await h.persona("operator");
    assert.equal((await op.call("/demo/reset", {})).status, 200);
    assert.equal((await op.call("/state")).body.records.length, 9);
  }));

test("CSV rejects duplicate headers, limits rows and UTF-8 bytes, and handles quoted names", () =>
  fixture(async (h) => {
    const op = await h.persona("operator");
    const newVersion = await op.call("/imports/preview", {
      csv: header + "NEW-001,New Person,CSE,,Active,2\n",
    });
    assert.equal(newVersion.status, 200);
    assert.equal(newVersion.body.rows[0].status, "error");
    const quoted = await op.call("/imports/preview", {
      csv: header + 'AIT-26-020,"Rao, Asha",ECE,,Active,0',
    });
    assert.equal(quoted.status, 200);
    assert.equal(quoted.body.rows[0].input.name, "Rao, Asha");
    assert.equal(
      (
        await op.call("/imports/preview", {
          csv: "student_id,name,name,apaar,status,expected_version\nAIT-20,A,B,,Active,0",
        })
      ).body.code,
      "INVALID_CSV",
    );
    const rows = Array.from(
      { length: 201 },
      (_, i) => `NEW-${i},Fictional Student ${i},ECE,,Active,0`,
    ).join("\n");
    assert.equal(
      (await op.call("/imports/preview", { csv: header + rows })).body.code,
      "CSV_ROW_LIMIT",
    );
    const bytes = await op.call("/imports/preview", {
      csv: "₹".repeat(180000),
    });
    assert.equal(bytes.status, 413);
    assert.equal(bytes.body.code, "CSV_TOO_LARGE");
  }));

test("an unchanged preview row changing later also rolls back the whole batch", () =>
  fixture(async (h) => {
    const op = await h.persona("operator");
    const p = await op.call("/imports/preview", {
      csv:
        header +
        "AIT-26-020,New Student,ECE,,Active,0\nAIT-26-001,Aarav Menon,CSE,111000000001,Active,1",
    });
    assert.equal(p.body.rows[1].status, "unchanged");
    await op.call("/records/aster:AIT-26-001/provider-fixture", {
      response: "unavailable",
      expectedVersion: 1,
    });
    const result = await op.call(`/imports/${p.body.id}/commit`, {});
    assert.equal(result.status, 409);
    assert.equal(result.body.code, "STALE_PREVIEW");
    assert.equal((await op.call("/state")).body.records.length, 9);
  }));

test("simultaneous repeated commits have one canonical effect and one receipt", () =>
  fixture(async (h) => {
    const op = await h.persona("operator");
    const csv = header + "AIT-26-020,New Student,ECE,,Active,0";
    const a = await op.call("/imports/preview", { csv }),
      b = await op.call("/imports/preview", { csv });
    const results = await Promise.all([
      op.call(`/imports/${a.body.id}/commit`, {}),
      op.call(`/imports/${b.body.id}/commit`, {}),
    ]);
    assert.ok(results.every((r) => r.status === 200));
    assert.deepEqual(results.map((r) => r.body.changed).sort(), [0, 1]);
    assert.equal(results[0].body.id, results[1].body.id);
    assert.equal((await op.call("/state")).body.records.length, 10);
    assert.equal(
      (await op.call("/records/aster:AIT-26-020/revisions")).body.revisions
        .length,
      1,
    );
  }));

test("duplicate concurrent corrections and resolutions cannot create repeated revisions", () =>
  fixture(async (h) => {
    const student = await h.persona("student"),
      op = await h.persona("operator");
    const body = {
      programme: "ECE",
      reason: "The fictional source letter shows Electronics.",
      expectedVersion: 1,
    };
    const cases = await Promise.all([
      student.call("/cases", body),
      student.call("/cases", body),
    ]);
    assert.deepEqual(cases.map((r) => r.status).sort(), [201, 409]);
    const id = cases.find((r) => r.status === 201)!.body.id;
    const resolves = await Promise.all([
      op.call(`/cases/${id}/resolve`, {
        decision: "accept",
        reason:
          "Reviewed the fictional source letter and corrected the programme.",
      }),
      op.call(`/cases/${id}/resolve`, {
        decision: "accept",
        reason:
          "Reviewed the fictional source letter and corrected the programme.",
      }),
    ]);
    assert.deepEqual(resolves.map((r) => r.status).sort(), [200, 409]);
    assert.equal(
      (await op.call("/records/aster:AIT-26-007/revisions")).body.revisions
        .length,
      2,
    );
  }));

test("a different recipient cannot retrieve or list another recipient permission", () =>
  fixture(async (h) => {
    const { grant } = await approvedGrant(h);
    const other = await h.persona("verifier", "aster", "Meridian Careers");
    const result = await other.call("/verify", { id: grant.id });
    assert.equal(result.status, 404);
    assert.equal(result.body.claims, undefined);
    assert.deepEqual((await other.call("/state")).body.grants, []);
  }));

test("valid signatures with contradictory audience or source claims are rejected", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "setutrace-binding-")),
    keyPath = path.join(dir, "synthetic.pem");
  await fixture(
    async (h, r) => {
      const { grant } = await approvedGrant(h),
        verifier = await h.persona("verifier");
      const row = r.db
        .prepare("SELECT * FROM grants WHERE id=?")
        .get(grant.id)!;
      const original = JSON.parse(String(row.data)),
        payload = JSON.parse(
          Buffer.from(original.assertion.split(".")[1], "base64url").toString(),
        );
      const keys = loadSigningKeys(keyPath);
      for (const change of [
        { aud: "Meridian Careers" },
        { iss: "UNTRUSTED_ISSUER" },
        { claims: { name: "Wrong Person" } },
        { iat: payload.iat + 10000 },
      ]) {
        const id = randomUUID(),
          assertion = signAssertion(
            { ...payload, ...change, sub: id },
            keys.privateKey,
            keys.keyId,
          );
        r.db
          .prepare("INSERT INTO grants VALUES(?,?,?,?,?,?)")
          .run(
            id,
            row.tenant,
            row.record_id,
            row.recipient,
            "active",
            JSON.stringify({ ...original, assertion }),
          );
        const result = await verifier.call("/verify", { id });
        assert.equal(result.status, 400);
        assert.equal(result.body.code, "ASSERTION_BINDING_MISMATCH");
        assert.equal(result.body.claims, undefined);
      }
    },
    { keyPath },
  );
});

test("revocation retries are idempotent and do not duplicate audit events", () =>
  fixture(async (h, r) => {
    const { student, grant } = await approvedGrant(h);
    const before = Number(
      r.db.prepare("SELECT COUNT(*) n FROM events").get()!.n,
    );
    assert.equal(
      (await student.call(`/grants/${grant.id}/revoke`, {})).body.replayed,
      false,
    );
    assert.equal(
      (await student.call(`/grants/${grant.id}/revoke`, {})).body.replayed,
      true,
    );
    assert.equal(
      Number(r.db.prepare("SELECT COUNT(*) n FROM events").get()!.n),
      before + 1,
    );
  }));

test("report and audit APIs are scoped; CSV neutralises formulas and omits APAAR", () =>
  fixture(async (h, r) => {
    const op = await h.persona("operator"),
      student = await h.persona("student"),
      river = await h.persona("operator", "river"),
      approver = await h.persona("approver");
    const p = await op.call("/imports/preview", {
      csv: header + "AIT-26-020,=1+1,ECE,,Active,0",
    });
    await op.call(`/imports/${p.body.id}/commit`, {});
    const snap = await approver.call("/snapshots", {
      note: "Reviewed the fictional source set with explicit findings.",
    });
    const report = await op.call(`/snapshots/${snap.body.id}/report.csv`);
    assert.equal(report.status, 200);
    assert.match(report.body, /"'=1\+1"/);
    assert.ok(!report.body.split("\n")[0].includes("apaar"));
    assert.equal(
      (await river.call(`/snapshots/${snap.body.id}/report.csv`)).status,
      404,
    );
    assert.equal(
      (await student.call(`/snapshots/${snap.body.id}/report.csv`)).status,
      403,
    );
    assert.equal((await op.call("/audit/verify")).body.valid, true);
    assert.equal((await student.call("/audit/verify")).status, 403);
    const summary = await op.call("/reports/summary");
    assert.equal(summary.body.records, 10);
    assert.equal(summary.body.audit.valid, true);
    r.db.exec("DROP TRIGGER audit_no_update");
    r.db
      .prepare(
        "UPDATE events SET detail='inconsistent' WHERE seq=(SELECT MIN(seq) FROM events WHERE tenant='aster')",
      )
      .run();
    assert.equal((await op.call("/audit/verify")).status, 409);
    assert.equal(csvCell("@SUM(1,2)"), `"'@SUM(1,2)"`);
  }));

test("sessions persist as hashed tokens across restart, then logout and expiry deny access", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "setutrace-session-")),
    dbPath = path.join(dir, "session.sqlite");
  let clock = Date.parse("2026-10-28T06:00:00Z");
  const first = await listen(createApplication({ dbPath, now: () => clock }));
  const original = await first.persona("operator");
  await first.close();
  const runtime = createApplication({ dbPath, now: () => clock }),
    second = await listen(runtime);
  try {
    const resumed = second.connect(original.cookie, original.csrf);
    assert.equal((await resumed.call("/state")).status, 200);
    const saved = runtime.db.prepare("SELECT * FROM sessions").get()!;
    assert.notEqual(saved.token_hash, original.cookie.split("=")[1]);
    assert.ok(!String(saved.data).includes(original.cookie.split("=")[1]));
    assert.equal((await resumed.call("/session/logout", {})).status, 200);
    assert.equal((await resumed.call("/state")).status, 401);
    const expiring = await second.persona("student");
    clock += 3600001;
    assert.equal((await expiring.call("/state")).status, 401);
  } finally {
    await second.close();
  }
});

test("demo authentication can be disabled; host configuration and session creation are bounded", async () => {
  assert.throws(() => readConfig({ HOST: "0.0.0.0" }), /loopback/);
  assert.throws(() => readConfig({ DEMO_MODE: "false" }), /fail-closed/);
  assert.throws(() => readConfig({ PORT: "bad" }), /PORT/);
  await fixture(
    async (h) => {
      const r = await fetch(h.base + "/api/demo/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"role":"operator"}',
      });
      assert.equal(r.status, 503);
    },
    { demoMode: false },
  );
  await fixture(
    async (h) => {
      await h.persona("operator");
      await h.persona("student");
      const r = await fetch(h.base + "/api/demo/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"role":"operator"}',
      });
      assert.equal(r.status, 429);
      assert.ok(r.headers.get("retry-after"));
    },
    { sessionLimit: 2 },
  );
});

test("approval rejects changes after review and accepts a fresh reviewed digest", () =>
  fixture(async (h) => {
    const op = await h.persona("operator"),
      approver = await h.persona("approver");
    const initial = await approver.call("/state");
    await op.call("/records/aster:AIT-26-007/provider-fixture", {
      response: "unavailable",
      expectedVersion: 1,
    });
    const stale = await approver.call("/snapshots", {
      note: "Reviewed the original fictional source set.",
      reviewDigest: initial.body.reviewDigest,
    });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.code, "STALE_REVIEW");
    const fresh = await approver.call("/state");
    const approved = await approver.call("/snapshots", {
      note: "Reviewed the updated fictional source set.",
      reviewDigest: fresh.body.reviewDigest,
    });
    assert.equal(approved.status, 201);
    const frozen = await approver.call(`/snapshots/${approved.body.id}/export`);
    assert.equal(
      frozen.body.rows.find((r: any) => r.studentId === "AIT-26-007").version,
      2,
    );
  }));

test("stale correction can be renewed without deleting case history", () =>
  fixture(async (h) => {
    const student = await h.persona("student"),
      op = await h.persona("operator");
    const old = await student.call("/cases", {
      programme: "ECE",
      reason: "The fictional admission letter says ECE.",
      expectedVersion: 1,
    });
    await op.call("/records/aster:AIT-26-007/provider-fixture", {
      response: "unavailable",
      expectedVersion: 1,
    });
    assert.equal(
      (
        await op.call(`/cases/${old.body.id}/resolve`, {
          decision: "accept",
          reason: "Checked the fictional admission record.",
        })
      ).status,
      409,
    );
    const renewed = await student.call(`/cases/${old.body.id}/reopen`, {
      programme: "ECE",
      reason: "The fictional admission letter still says ECE.",
      expectedVersion: 2,
    });
    assert.equal(renewed.status, 201);
    assert.equal(
      (
        await op.call(`/cases/${renewed.body.id}/resolve`, {
          decision: "accept",
          reason: "Checked the fictional admission record.",
        })
      ).status,
      200,
    );
    const state = await student.call("/state");
    assert.equal(state.body.records[0].version, 3);
    assert.equal(state.body.cases.length, 2);
    assert.equal(state.body.cases[1].outcome, "superseded");
    assert.equal(
      (
        await student.call("/cases", {
          programme: "CSE",
          reason: "Another source discrepancy needs review.",
          expectedVersion: 3,
        })
      ).status,
      201,
    );
  }));

test("hosted access code guards persona creation and allows secure role switching", () =>
  fixture(
    async (h) => {
      const request = async (body: unknown, cookie?: string) =>
        fetch(h.base + "/api/demo/session", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(cookie ? { cookie } : {}),
          },
          body: JSON.stringify(body),
        });
      assert.equal(
        (await request({ role: "operator", accessCode: "wrong" })).status,
        403,
      );
      const login = await request({
        role: "operator",
        accessCode: "synthetic-test-code-123",
      });
      assert.equal(login.status, 200);
      const cookie = login.headers.get("set-cookie")!;
      assert.match(cookie, /HttpOnly/i);
      assert.match(cookie, /Secure/i);
      assert.match(cookie, /SameSite=Strict/i);
      assert.equal(
        (await request({ role: "student" }, cookie.split(";")[0])).status,
        200,
      );
    },
    {
      hosted: true,
      accessCode: "synthetic-test-code-123",
      allowedHosts: ["127.0.0.1"],
      allowedOrigins: ["https://demo.example"],
    },
  ));
