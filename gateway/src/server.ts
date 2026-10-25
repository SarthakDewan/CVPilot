import mongoose from "mongoose";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

async function main() {
  const cfg = loadConfig();
  await mongoose.connect(cfg.mongoUri);
  const app = createApp(cfg);
  const server = app.listen(cfg.port, () => {
    console.log(`gateway listening on :${cfg.port} (${cfg.env})`);
  });

  const shutdown = () => {
    server.close(() => {
      void mongoose.disconnect().finally(() => process.exit(0));
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
