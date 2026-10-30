import path from "node:path";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import express from "express";
import { createApplication } from "./app.ts";
import { readConfig } from "./config.ts";
const envFile = path.resolve("../.env");
if (existsSync(envFile)) loadEnvFile(envFile);
const config = readConfig();
const runtime = createApplication({
  dbPath: path.join(config.dataDir, "setutrace.sqlite"),
  keyPath: path.join(config.dataDir, "synthetic-signing-key.pem"),
  demoMode: config.demoMode,
  allowedOrigins: config.allowedOrigins,
  allowedHosts: config.allowedHosts,
  hosted: config.hosted,
  accessCode: config.accessCode,
});
const dist = path.resolve("dist");
if (existsSync(dist)) {
  runtime.app.use(express.static(dist, { index: false }));
  runtime.app.get("/{*path}", (_req, res) =>
    res.sendFile(path.join(dist, "index.html")),
  );
}
const server = runtime.app.listen(config.port, config.host, () =>
  console.log(
    `SetuTrace submission demo: http://${config.host === "::1" ? "[::1]" : config.host}:${config.port} · synthetic data only`,
  ),
);
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.keepAliveTimeout = 5000;
server.on("error", (error: NodeJS.ErrnoException) => {
  console.error(
    error.code === "EADDRINUSE"
      ? `Port ${config.port} is already in use. Stop the existing demo or choose PORT in .env.`
      : "The local demo server could not start.",
  );
  runtime.close();
  process.exitCode = 1;
});
const stop = () =>
  server.close(() => {
    runtime.close();
    process.exit(0);
  });
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
