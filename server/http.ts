import express, {
  type Express,
  type ErrorRequestHandler,
  type RequestHandler,
} from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { randomUUID } from "node:crypto";
import { z } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "ACTION_REJECTED",
  ) {
    super(message);
  }
}
export function installHttp(
  app: Express,
  options: {
    allowedOrigins?: string[];
    allowedHosts?: string[];
    hosted?: boolean;
    requestLimit?: number;
    sessionLimit?: number;
  } = {},
) {
  app.disable("x-powered-by");
  app.set("trust proxy", false);
  app.use((_req, res, next) => {
    res.locals.requestId = randomUUID();
    res.set("X-Request-ID", res.locals.requestId);
    next();
  });
  app.use(
    helmet({
      strictTransportSecurity: options.hosted ? { maxAge: 31536000 } : false,
      referrerPolicy: { policy: "no-referrer" },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          imgSrc: ["'self'", "data:"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          upgradeInsecureRequests: null,
        },
      },
    }),
  );
  const origins = new Set(
    options.allowedOrigins ?? [
      "http://127.0.0.1:4871",
      "http://localhost:4871",
      "http://127.0.0.1:5178",
      "http://localhost:5178",
    ],
  );
  const localOnly: RequestHandler = (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (
      !(
        options.allowedHosts ?? ["127.0.0.1", "localhost", "[::1]", "::1"]
      ).includes(req.hostname)
    )
      return next(
        new HttpError(
          403,
          "This host is not configured for the demo.",
          "HOST_DENIED",
        ),
      );
    if (req.headers.origin && !origins.has(req.headers.origin))
      return next(
        new HttpError(
          403,
          "This browser origin is not configured for the demo.",
          "ORIGIN_DENIED",
        ),
      );
    next();
  };
  app.use("/api", localOnly);
  const limiter = (limit: number) =>
    rateLimit({
      windowMs: 60_000,
      limit,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: (_req, res) => {
        res.status(429).json({
          error: "Too many requests. Wait a minute and try again.",
          code: "RATE_LIMITED",
          requestId: res.locals.requestId,
        });
      },
    });
  app.use("/api", limiter(options.requestLimit ?? 1000));
  app.use(express.json({ limit: "600kb", strict: true }));
  return {
    sessionLimiter: limiter(options.sessionLimit ?? 100),
    verificationLimiter: limiter(60),
  };
}
export const handleErrors: ErrorRequestHandler = (error, _req, res, _next) => {
  let status = 500,
    code = "INTERNAL_ERROR",
    message = "The local action failed. No partial change was accepted.";
  if (error instanceof z.ZodError) {
    status = 400;
    code = "VALIDATION_ERROR";
    message = error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join(" ");
  } else if (error instanceof HttpError) {
    status = error.status;
    code = error.code;
    message = error.message;
  } else if (error?.type === "entity.parse.failed") {
    status = 400;
    code = "INVALID_JSON";
    message = "The request body must contain valid JSON.";
  } else if (error?.type === "entity.too.large") {
    status = 413;
    code = "PAYLOAD_TOO_LARGE";
    message = "The request exceeds the prototype upload limit.";
  } else if (
    (typeof error?.errcode === "number" && (error.errcode & 255) === 19) ||
    error?.code?.startsWith?.("SQLITE_CONSTRAINT")
  ) {
    status = 409;
    code = "STATE_CONFLICT";
    message =
      "The action conflicts with an existing revision or workflow state. Refresh and retry.";
  }
  if (status === 500)
    console.error(
      JSON.stringify({ level: "error", code, requestId: res.locals.requestId }),
    );
  res
    .status(status)
    .json({ error: message, code, requestId: res.locals.requestId });
};
