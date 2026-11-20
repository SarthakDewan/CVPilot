// Zero-install MongoDB for local development: downloads a mongod binary on first use (cached) and keeps the data
// in a folder so it survives restarts. Not for production. Usage: node scripts/dev-mongo.mjs <port> <dataDir>
import { mkdirSync } from "node:fs";
import { MongoMemoryServer } from "mongodb-memory-server";

const port = Number(process.argv[2] ?? 27018);
const dbPath = process.argv[3] ?? "../.local/mongo";
mkdirSync(dbPath, { recursive: true });
const server = await MongoMemoryServer.create({
  instance: { port, dbPath, storageEngine: "wiredTiger", launchTimeout: 180_000 },
});
console.log(`mongod ready on ${server.getUri()}`);
const stop = async () => { await server.stop({ doCleanup: false }); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
