import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { createApplication, signatureValid } from "../server/app.ts";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let clock = Date.parse("2026-10-28T06:00:00Z");
const store = createApplication({ dbPath: ":memory:", now: () => clock });
let server: Server,
  base = "";
type Client = {
  cookie: string;
  csrf: string;
  request: (
    route: string,
    body?: unknown,
  ) => Promise<{ status: number; body: any }>;
};
async function persona(role: string, tenant = "aster"): Promise<Client> {
  const response = await fetch(base + "/api/demo/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, tenant }),
  });
  const data = (await response.json()) as any;
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  const csrf = data.session.csrf;
  return {
    cookie,
    csrf,
    request: async (route, body) => {
      if (route === "/snapshots" && body && !(body as any).reviewDigest) {
        const state: any = await (
          await fetch(base + "/api/state", { headers: { cookie } })
        ).json();
        body = { ...(body as object), reviewDigest: state.reviewDigest };
      }
      const r = await fetch(base + "/api" + route, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          cookie,
          "x-csrf-token": csrf,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: r.status, body: await r.json() };
    },
  };
}
before(async () => {
  server = await new Promise<Server>((resolve) => {
    const s = store.app.listen(0, "127.0.0.1", () => resolve(s));
  });
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  store.close();
});

test("API requires a session, rejects cross-origin mutation and unknown persona", async () => {
  assert.equal((await fetch(base + "/api/state")).status, 401);
  assert.equal(
    (
      await fetch(base + "/api/demo/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://untrusted.example",
        },
        body: '{"role":"operator"}',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(base + "/api/demo/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"role":"admin"}',
      })
    ).status,
    400,
  );
});
test("roles and tenants are checked by the API; student sees only their own record", async () => {
  const operator = await persona("operator"),
    student = await persona("student"),
    river = await persona("operator", "river"),
    verifier = await persona("verifier"),
    regulator = await persona("regulator");
  assert.equal((await student.request("/state")).body.records.length, 1);
  assert.equal((await river.request("/state")).body.records.length, 3);
  assert.equal(
    (await river.request("/records/aster:AIT-26-007/revisions")).status,
    404,
  );
  assert.equal(
    (await student.request("/records/aster:AIT-26-001/revisions")).status,
    404,
  );
  assert.equal(
    (await student.request("/imports/preview", { csv: "x" })).status,
    403,
  );
  assert.equal(
    (
      await operator.request("/snapshots", {
        note: "An operator cannot approve.",
      })
    ).status,
    403,
  );
  assert.deepEqual((await regulator.request("/state")).body.records, []);
  assert.deepEqual((await verifier.request("/state")).body.records, []);
  assert.equal(
    (
      await fetch(base + "/api/demo/reset", {
        method: "POST",
        headers: {
          cookie: operator.cookie,
          "Content-Type": "application/json",
        },
        body: "{}",
      })
    ).status,
    403,
  );
});
test("CSV preview/commit is durable and idempotent, with duplicate-row and schema checks", async () => {
  const operator = await persona("operator");
  const csv = readFileSync("public/samples/student-import.csv", "utf8");
  const preview = await operator.request("/imports/preview", { csv });
  assert.equal(preview.status, 200);
  assert.deepEqual(
    preview.body.rows.map((r: any) => r.status),
    ["unchanged", "update", "new"],
  );
  const commit = await operator.request(
    `/imports/${preview.body.id}/commit`,
    {},
  );
  assert.equal(commit.body.changed, 2);
  const replay = await operator.request(
    `/imports/${preview.body.id}/commit`,
    {},
  );
  assert.equal(replay.body.replayed, true);
  assert.equal(replay.body.changed, 0);
  const sameFile = await operator.request("/imports/preview", { csv });
  assert.equal(
    (await operator.request(`/imports/${sameFile.body.id}/commit`, {})).body
      .replayed,
    true,
  );
  assert.equal((await operator.request("/state")).body.records.length, 10);
  assert.equal(
    (await operator.request("/records/aster:AIT-26-006/revisions")).body
      .revisions.length,
    2,
  );
  assert.equal(
    (await operator.request("/imports/preview", { csv: "name,bad\nA,B" }))
      .status,
    400,
  );
  const duplicate = await operator.request("/imports/preview", {
    csv: csv + "\nAIT-26-010,Other Name,ECE,,Active,0",
  });
  assert.equal(duplicate.body.rows.at(-1).status, "error");
  assert.equal(
    (await operator.request(`/imports/${duplicate.body.id}/commit`, {})).status,
    400,
  );
});
test("stale preview rolls back the complete batch and preserves an accepted correction", async () => {
  const operator = await persona("operator"),
    student = await persona("student");
  await operator.request("/demo/reset", {});
  const csv =
    "student_id,name,programme,apaar,status,expected_version\nAIT-26-020,New Person,ECE,,Active,0\nAIT-26-007,Meera Iyer,CSE,111000000007,Withdrawn,1";
  const preview = await operator.request("/imports/preview", { csv });
  const c = await student.request("/cases", {
    programme: "ECE",
    reason: "The fictional admission letter says ECE.",
    expectedVersion: 1,
  });
  assert.equal(c.status, 201);
  assert.equal(
    (
      await student.request(`/cases/${c.body.id}/resolve`, {
        decision: "accept",
        reason: "Student cannot self approve.",
      })
    ).status,
    403,
  );
  const resolve = await operator.request(`/cases/${c.body.id}/resolve`, {
    decision: "accept",
    reason:
      "Verified the fictional source letter against the recorded programme.",
  });
  assert.equal(resolve.status, 200);
  assert.equal(
    (await operator.request(`/imports/${preview.body.id}/commit`, {})).status,
    409,
  );
  const state = (await operator.request("/state")).body;
  assert.equal(state.records.length, 9);
  assert.equal(
    state.records.find((r: any) => r.studentId === "AIT-26-007").programme,
    "ECE",
  );
  assert.equal(
    state.issues.filter((i: any) => i.id === "capacity-CSE").length,
    0,
  );
  const history = (await student.request("/records/aster:AIT-26-007/revisions"))
    .body.revisions;
  assert.deepEqual(
    history.map((r: any) => r.data.programme),
    ["ECE", "CSE"],
  );
  assert.equal(
    (
      await student.request("/cases", {
        programme: "CSE",
        reason: "This is now an out-of-date source request.",
        expectedVersion: 1,
      })
    ).status,
    409,
  );
});
test("approved snapshots freeze row versions; grants are minimal, signed and revocable", async () => {
  const student = await persona("student"),
    operator = await persona("operator"),
    approver = await persona("approver"),
    verifier = await persona("verifier");
  assert.equal(
    (
      await student.request("/grants", {
        fields: ["name"],
        purpose: "Internship check",
      })
    ).status,
    409,
  );
  const snapshot = await approver.request("/snapshots", {
    note: "Reviewed fictional records; pending linkage is explicitly retained.",
  });
  assert.equal(snapshot.status, 201);
  const frozen = (
    await operator.request(`/snapshots/${snapshot.body.id}/export`)
  ).body;
  assert.equal(
    frozen.rows.find((r: any) => r.studentId === "AIT-26-007").version,
    2,
  );
  assert.equal(frozen.count, 9);
  assert.equal(frozen.status, "approved");
  assert.equal(
    (await student.request(`/snapshots/${snapshot.body.id}/export`)).status,
    403,
  );
  assert.equal(
    (
      await student.request("/grants", {
        fields: ["apaar"],
        purpose: "Collect unnecessary identifier",
      })
    ).status,
    400,
  );
  const grant = await student.request("/grants", {
    fields: ["name", "programme"],
    purpose: "Internship eligibility check",
  });
  assert.equal(grant.status, 201);
  const receipt = await verifier.request("/verify", { id: grant.body.id });
  assert.equal(receipt.status, 200);
  assert.deepEqual(Object.keys(receipt.body.claims), ["name", "programme"]);
  assert.equal(receipt.body.claims.programme, "ECE");
  assert.equal(signatureValid(receipt.body.assertion, store.publicKey), true);
  const pieces = receipt.body.assertion.split(".");
  pieces[1] = Buffer.from('{"claims":{"name":"Tampered"}}').toString(
    "base64url",
  );
  assert.equal(signatureValid(pieces.join("."), store.publicKey), false);
  assert.equal(
    (
      await verifier.request("/verify", {
        id: grant.body.id,
        assertion: pieces.join("."),
      })
    ).status,
    400,
  );
  assert.equal(
    (await student.request("/verify", { id: grant.body.id })).status,
    403,
  );
  assert.equal(
    (await verifier.request("/grants/" + grant.body.id + "/revoke", {})).status,
    403,
  );
  assert.equal(
    (await student.request(`/grants/${grant.body.id}/revoke`, {})).status,
    200,
  );
  const denied = await verifier.request("/verify", { id: grant.body.id });
  assert.equal(denied.status, 410);
  assert.equal(denied.body.claims, undefined);
  const metadata = (await verifier.request("/state")).body.grants[0];
  assert.equal(metadata.assertion, undefined);
  assert.equal(metadata.claims, undefined);
});
test("expiry and source/snapshot supersession deny later retrieval", async () => {
  const student = await persona("student"),
    operator = await persona("operator"),
    approver = await persona("approver"),
    verifier = await persona("verifier");
  const first = await student.request("/grants", {
    fields: ["name"],
    purpose: "Internship check",
  });
  clock += 901000;
  assert.equal(
    (await verifier.request("/verify", { id: first.body.id })).status,
    410,
  );
  const fresh = await student.request("/grants", {
    fields: ["name"],
    purpose: "Internship check",
  });
  assert.equal(
    (await verifier.request("/verify", { id: fresh.body.id })).status,
    200,
  );
  assert.equal(
    (
      await operator.request("/records/aster:AIT-26-007/provider-fixture", {
        response: "unavailable",
        expectedVersion: 2,
      })
    ).status,
    200,
  );
  const invalid = await verifier.request("/verify", { id: fresh.body.id });
  assert.equal(invalid.status, 409);
  assert.equal(invalid.body.claims, undefined);
  assert.equal(
    (
      await student.request("/grants", {
        fields: ["name"],
        purpose: "Internship check",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await operator.request("/records/aster:AIT-26-007/provider-fixture", {
        response: "linked",
        expectedVersion: 2,
      })
    ).status,
    409,
  );
  const state = (await operator.request("/state")).body;
  assert.equal(state.snapshots[0].status, "superseded");
  assert.equal(
    state.records.find((r: any) => r.studentId === "AIT-26-007").status,
    "Active",
  );
  assert.equal(
    (
      await approver.request("/snapshots", {
        note: "New review after the changed provider fixture.",
      })
    ).status,
    201,
  );
});
test("audit events form a consistent local hash chain; data persists across database reopening", async () => {
  const events = store.db.prepare("SELECT * FROM events ORDER BY seq").all();
  const { createHash } = await import("node:crypto");
  const previous = new Map<string, string>();
  for (const e of events) {
    assert.equal(e.previous, previous.get(String(e.tenant)) ?? "GENESIS");
    assert.equal(
      e.digest,
      createHash("sha256")
        .update(
          JSON.stringify([
            e.tenant,
            e.actor,
            e.action,
            e.detail,
            e.created,
            e.previous,
          ]),
        )
        .digest("hex"),
    );
    previous.set(String(e.tenant), String(e.digest));
  }
  const folder = mkdtempSync(path.join(tmpdir(), "setutrace-test-"));
  const dbPath = path.join(folder, "test.sqlite");
  const a = createApplication({ dbPath });
  assert.equal(a.db.prepare("SELECT COUNT(*) n FROM records").get()!.n, 12);
  const old = JSON.parse(
    String(
      a.db
        .prepare("SELECT data FROM records WHERE id='aster:AIT-26-001'")
        .get()!.data,
    ),
  );
  a.db
    .prepare("UPDATE records SET version=2,data=? WHERE id='aster:AIT-26-001'")
    .run(JSON.stringify({ ...old, version: 2 }));
  a.close();
  const b = createApplication({ dbPath });
  assert.equal(
    b.db
      .prepare("SELECT version FROM records WHERE id='aster:AIT-26-001'")
      .get()!.version,
    2,
  );
  b.close();
});
