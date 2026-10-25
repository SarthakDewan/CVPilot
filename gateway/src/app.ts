import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import type { Config } from "./config.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { authRouter } from "./routes/auth.js";
import { profileRouter } from "./routes/profile.js";

export function createApp(cfg: Config): Express {
  const app = express();
  app.disable("x-powered-by");
  if (cfg.isProd) app.set("trust proxy", 1);

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

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "gateway" });
  });

  const api = express.Router();
  api.use("/auth", authRouter(cfg));
  api.use("/profile", profileRouter(cfg));
  app.use("/api/v1", api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
