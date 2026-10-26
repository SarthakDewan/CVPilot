import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import mongoose from "mongoose";
import type { Config } from "./config.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { enforceOrigin } from "./middleware/origin.js";
import { requestId } from "./middleware/requestId.js";
import { mlPing } from "./services/mlClient.js";
import { accountRouter } from "./routes/account.js";
import { authRouter } from "./routes/auth.js";
import { insightsRouter } from "./routes/insights.js";
import { jobsRouter } from "./routes/jobs.js";
import { profileRouter } from "./routes/profile.js";
import { publicResumesRouter } from "./routes/publicResumes.js";
import { resumesRouter } from "./routes/resumes.js";
import { roadmapRouter } from "./routes/roadmap.js";
import { statusRouter } from "./routes/status.js";

export function createApp(cfg: Config): Express {
  const app = express();
  app.disable("x-powered-by");
  if (cfg.isProd) app.set("trust proxy", 1);

  app.use(requestId);
  app.use(helmet());
  app.use(
    cors({
      // Strict allow-list; requests from other origins get no CORS headers.
      origin: (origin, cb) => cb(null, !origin || cfg.corsOrigins.includes(origin)),
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    }),
  );
  app.use(express.json({ limit: "256kb" }));
  app.use(cookieParser());

  // Liveness: the process is up. Readiness: its dependencies (MongoDB, ML service) are reachable.
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "gateway" });
  });
  app.get("/ready", async (_req, res) => {
    const db = mongoose.connection.readyState === 1;
    const ml = await mlPing(cfg);
    res.status(db && ml ? 200 : 503).json({ status: db && ml ? "ready" : "degraded", db, ml });
  });

  const api = express.Router();
  api.use(enforceOrigin(cfg));
  api.use("/auth", authRouter(cfg));
  api.use("/profile", profileRouter(cfg));
  api.use("/resumes", resumesRouter(cfg));
  api.use("/jobs", jobsRouter(cfg));
  api.use("/insights", insightsRouter(cfg));
  api.use("/roadmap", roadmapRouter(cfg));
  api.use("/account", accountRouter(cfg));
  api.use("/status", statusRouter(cfg));
  api.use("/public/resumes", publicResumesRouter(cfg));
  app.use("/api/v1", api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
