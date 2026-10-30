import path from "node:path";
export const LIMITS = {
  rows: 200,
  csvBytes: 512_000,
  sessionTtlMs: 60 * 60_000,
  activeSessions: 256,
};
export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const hosted = env.HOSTED_DEMO === "true";
  const host = env.HOST ?? (hosted ? "0.0.0.0" : "127.0.0.1");
  if (!hosted && !["127.0.0.1", "localhost", "::1"].includes(host))
    throw new Error(
      "Non-loopback binding requires explicitly configured HOSTED_DEMO=true.",
    );
  if (env.DEMO_MODE === "false")
    throw new Error(
      "DEMO_MODE=false is fail-closed: an institutional authentication adapter is not implemented.",
    );
  const port = Number(env.PORT ?? (hosted ? "10000" : "4871"));
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("PORT must be an integer from 1024 to 65535.");
  const accessCode = env.DEMO_ACCESS_CODE;
  const origins = (env.APP_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const hosts = (env.ALLOWED_HOSTS ?? env.RENDER_EXTERNAL_HOSTNAME ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (hosted) {
    if (!accessCode || accessCode.length < 16)
      throw new Error(
        "Hosted demos require DEMO_ACCESS_CODE of at least 16 characters.",
      );
    if (!env.DATA_DIR || !path.isAbsolute(env.DATA_DIR))
      throw new Error(
        "Hosted demos require an absolute DATA_DIR on the persistent disk.",
      );
    if (
      !hosts.length ||
      hosts.some((h) => !/^([a-z0-9-]+\.)*[a-z0-9-]+$/i.test(h))
    )
      throw new Error(
        "Set exact ALLOWED_HOSTS or use RENDER_EXTERNAL_HOSTNAME.",
      );
    if (
      !origins.length ||
      origins.some((s) => {
        try {
          const u = new URL(s);
          return u.protocol !== "https:" || u.origin !== s;
        } catch {
          return true;
        }
      })
    )
      throw new Error(
        "APP_ORIGINS must list exact HTTPS origins, without paths or trailing slashes.",
      );
  }
  return {
    host,
    port,
    hosted,
    accessCode: hosted ? accessCode : undefined,
    allowedHosts: hosted ? hosts : undefined,
    allowedOrigins: hosted
      ? origins
      : [
          `http://127.0.0.1:${port}`,
          `http://localhost:${port}`,
          `http://[::1]:${port}`,
          "http://127.0.0.1:5178",
          "http://localhost:5178",
        ],
    dataDir: path.resolve(env.DATA_DIR ?? "data"),
    demoMode: true,
  };
}
