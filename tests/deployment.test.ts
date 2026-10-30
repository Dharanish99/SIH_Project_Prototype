import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { createApplication } from "../server/app.ts";
import { createProxy } from "../deployment/proxy.ts";
async function listen(server: Server) {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(server.address() as any).port}`;
}
test("same-origin hosting proxy carries cookies, CSRF and scoped binary export", async () => {
  const app = createApplication({
    dbPath: ":memory:",
    accessCode: "synthetic-test-code-123",
  });
  const backend = createServer(app.app);
  const backendUrl = await listen(backend);
  const proxy = createServer(
    createProxy({ backendOrigin: backendUrl, allowLocal: true }),
  );
  const base = await listen(proxy);
  try {
    const login = await fetch(base + "/api/demo/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        role: "approver",
        accessCode: "synthetic-test-code-123",
      }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0],
      session: any = await login.json();
    const headers = {
      cookie,
      "content-type": "application/json",
      "x-csrf-token": session.session.csrf,
    };
    const state: any = await (
      await fetch(base + "/api/state", { headers })
    ).json();
    const approval = await fetch(base + "/api/snapshots", {
      method: "POST",
      headers,
      body: JSON.stringify({
        note: "Reviewed the full synthetic source set.",
        reviewDigest: state.reviewDigest,
      }),
    });
    assert.equal(approval.status, 201);
    const snap: any = await approval.json();
    const report = await fetch(base + `/api/snapshots/${snap.id}/report.csv`, {
      headers,
    });
    assert.equal(report.status, 200);
    assert.match(report.headers.get("content-disposition")!, /attachment/);
    assert.match(await report.text(), /source_revision/);
    const blocked = await fetch(base + "/api/demo/session", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://untrusted.example",
      },
      body: "{}",
    });
    assert.equal(blocked.status, 403);
  } finally {
    await new Promise<void>((r) => proxy.close(() => r()));
    await new Promise<void>((r) => backend.close(() => r()));
    app.close();
  }
});

