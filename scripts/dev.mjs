#!/usr/bin/env node
// Cross-platform (Windows / macOS / Linux) local launcher, no Docker needed.
//   node scripts/dev.mjs [--python <path-to-python-with-deps>]
// Starts: built-in MongoDB (port 27018), ML service (8000), gateway (4000), web (5173), then prints the link.
// Needs: Node 20+, Python 3.10+. Optional settings are read from the environment or a root .env file:
//   ADZUNA_APP_ID, ADZUNA_APP_KEY, GEMINI_API_KEY   enable job search / insights / roadmap / wording help
//   MONGODB_URI                                      use your own MongoDB (e.g. a free Atlas cluster) instead of the built-in one
// Database choice, in order: MONGODB_URI -> a MongoDB installed on this computer -> a downloaded copy (needs fastdl.mongodb.org).
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL = path.join(ROOT, ".local");
const isWin = process.platform === "win32";
const PORTS = { mongo: 27018, ml: 8000, api: 4000, web: 5173 };
const say = (m) => console.log(`\n▶ ${m}`);
const die = (m) => { console.error(`\n✖ ${m}\n`); process.exit(1); };

// ---------- helpers
const q = (a) => (/[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
function run(cmd, args, opts = {}) {
  const viaShell = isWin && !opts.noShell;
  const r = viaShell
    ? spawnSync([cmd, ...args].map(q).join(" "), { stdio: "inherit", shell: true, ...opts })
    : spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) die(`Command failed: ${cmd} ${args.join(" ")}`);
}
function portFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer().once("error", () => resolve(false)).once("listening", () => s.close(() => resolve(true)));
    s.listen(port, "127.0.0.1");
  });
}
async function waitFor(url, label, ms = 600_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if ((await fetch(url)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1500));
  }
  die(`${label} did not become ready in time. Scroll up for its log.`);
}
function parseEnvFile(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith("#") && m[2]) out[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
  return out;
}
function findPython() {
  for (const [cmd, ...pre] of [["py", "-3"], ["python3"], ["python"]]) {
    const r = spawnSync(cmd, [...pre, "--version"], { encoding: "utf8", shell: false });
    const m = /Python (\d+)\.(\d+)/.exec(`${r.stdout}${r.stderr}`);
    if (r.status === 0 && m && (Number(m[1]) > 3 || (Number(m[1]) === 3 && Number(m[2]) >= 10))) return [cmd, ...pre];
  }
  return null;
}

// ---------- checks
if (Number(process.versions.node.split(".")[0]) < 20) die(`Node 20+ is required (you have ${process.version}). Install from https://nodejs.org`);
const rootEnv = parseEnvFile(path.join(ROOT, ".env"));
const externalMongo = process.env.MONGODB_URI || rootEnv.MONGODB_URI || "";
for (const [name, port] of Object.entries(PORTS)) {
  if (name === "mongo" && externalMongo) continue;
  if (!(await portFree(port))) die(`Port ${port} (${name}) is already in use. Close whatever uses it (maybe a previous CVPilot run) and retry.`);
}
mkdirSync(LOCAL, { recursive: true });

// ---------- secrets (generated once, reused)
const secretsFile = path.join(LOCAL, "secrets.json");
let secrets = existsSync(secretsFile) ? JSON.parse(readFileSync(secretsFile, "utf8")) : null;
if (!secrets) {
  secrets = { jwt: randomBytes(32).toString("hex"), ml: randomBytes(32).toString("hex") };
  writeFileSync(secretsFile, JSON.stringify(secrets));
}
const optional = { ...rootEnv };
for (const k of ["ADZUNA_APP_ID", "ADZUNA_APP_KEY", "ADZUNA_COUNTRY", "GEMINI_API_KEY", "GEMINI_MODEL"]) if (process.env[k]) optional[k] = process.env[k];

// ---------- dependencies
for (const dir of ["gateway", "web"]) {
  if (!existsSync(path.join(ROOT, dir, "node_modules"))) {
    say(`Installing JavaScript dependencies for ${dir} (first run only)`);
    run("npm", ["install"], { cwd: path.join(ROOT, dir) });
  }
}

let python;
const pyFlag = process.argv.indexOf("--python");
if (pyFlag > 0) {
  python = [process.argv[pyFlag + 1]];
  say(`Using the Python you gave: ${python[0]}`);
} else {
  const venv = path.join(ROOT, "ml-service", ".venv");
  const venvPy = path.join(venv, isWin ? "Scripts" : "bin", isWin ? "python.exe" : "python");
  const reqFile = path.join(ROOT, "ml-service", "requirements.txt");
  const reqHash = createHash("sha256").update(readFileSync(reqFile)).digest("hex");
  const marker = path.join(venv, ".deps-installed"); // holds the hash of requirements.txt it was installed from
  if (!existsSync(venvPy)) {
    const base = findPython();
    if (!base) die("Python 3.10+ was not found. Install it from https://www.python.org/downloads/ (tick 'Add python.exe to PATH') and retry.");
    say("Creating a Python virtual environment");
    run(base[0], [...base.slice(1), "-m", "venv", venv], { noShell: true });
  }
  if (!existsSync(marker) || readFileSync(marker, "utf8").trim() !== reqHash) {
    say("Installing Python dependencies (first run, or requirements changed: downloads PyTorch, ~1 GB; this takes several minutes)");
    run(venvPy, ["-m", "pip", "install", "--upgrade", "pip"], { noShell: true });
    run(venvPy, ["-m", "pip", "install", "-r", "requirements.txt"], { cwd: path.join(ROOT, "ml-service"), noShell: true });
    writeFileSync(marker, reqHash);
  }
  python = [venvPy];
}

// ---------- processes
const children = [];
function start(label, cmd, args, opts) {
  // Own process group on macOS/Linux so shutdown can kill the whole tree (npx starts grandchildren).
  const viaShell = isWin && opts.shell !== false;
  const { shell: _shell, ...rest } = opts;
  const child = viaShell
    ? spawn([cmd, ...args].map(q).join(" "), { stdio: ["ignore", "pipe", "pipe"], shell: true, ...rest })
    : spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], detached: !isWin, ...rest });
  const tag = `[${label}] `;
  const pipe = (stream, out) => stream.on("data", (d) => out.write(String(d).split(/\r?\n/).filter(Boolean).map((l) => tag + l).join("\n") + "\n"));
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("exit", (code) => {
    if (stopping) return;
    console.error(`\n✖ ${label} stopped unexpectedly (exit ${code}). Shutting down.`);
    if (label === "mongo") console.error(MONGO_HELP);
    shutdown(1);
  });
  children.push(child);
}
let stopping = false;
function killTree(c, signal) {
  try {
    if (isWin) spawnSync("taskkill", ["/pid", String(c.pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-c.pid, signal); // negative pid = the child's whole process group
  } catch { /* already gone */ }
}
function shutdown(code = 0) {
  if (stopping && code === 0) return;
  stopping = true;
  for (const c of children) killTree(c, "SIGTERM");
  setTimeout(() => { for (const c of children) killTree(c, "SIGKILL"); process.exit(code); }, 3000);
}
process.on("SIGINT", () => { console.log("\nStopping CVPilot…"); shutdown(0); });
process.on("SIGTERM", () => shutdown(0));

/** A MongoDB already installed on this computer (so nothing has to be downloaded), or null. */
function findSystemMongod() {
  if (process.env.MONGOMS_SYSTEM_BINARY && existsSync(process.env.MONGOMS_SYSTEM_BINARY)) return process.env.MONGOMS_SYSTEM_BINARY;
  const exe = isWin ? "mongod.exe" : "mongod";
  const onPath = spawnSync(isWin ? "where" : "which", ["mongod"], { encoding: "utf8" });
  if (onPath.status === 0) { const p = onPath.stdout.split(/\r?\n/)[0].trim(); if (p && existsSync(p)) return p; }
  if (isWin) {
    for (const base of [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]].filter(Boolean)) {
      const root = path.join(base, "MongoDB", "Server");
      if (existsSync(root)) for (const v of readdirSync(root).sort().reverse()) { const p = path.join(root, v, "bin", exe); if (existsSync(p)) return p; }
    }
  }
  return null;
}
const MONGO_HELP = `
  The built-in database could not start. Pick ONE of these, then run  node scripts/dev.mjs  again:

  A) Use a free MongoDB Atlas cloud database (works even if downloads from mongodb.org are blocked):
       1. https://www.mongodb.com/cloud/atlas/register  -> create a free (M0) cluster
       2. Database Access -> add a user + password;  Network Access -> allow your IP (or 0.0.0.0/0 for testing)
       3. Connect -> Drivers -> copy the connection string
       4. Put it in a file named .env in this folder:   MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/cvpilot

  B) Install MongoDB Community Server yourself (https://www.mongodb.com/try/download/community), then re-run this
     command: it finds the installed copy automatically.

  C) If the error above says ENOTFOUND / could not download: your network blocks fastdl.mongodb.org (firewall, VPN, DNS,
     proxy or a restricted Wi-Fi). Try another network or turn off the VPN, then re-run.
`;

let mongoUri;
if (externalMongo) {
  mongoUri = externalMongo;
  say("Using the MongoDB from MONGODB_URI (the built-in database is not started)");
} else {
  mongoUri = `mongodb://127.0.0.1:${PORTS.mongo}/cvpilot`;
  const sys = findSystemMongod();
  const mongoEnv = { ...process.env };
  if (sys) {
    say(`Starting the database using the MongoDB installed at ${sys}`);
    mongoEnv.MONGOMS_SYSTEM_BINARY = sys;
    mongoEnv.MONGOMS_SYSTEM_BINARY_VERSION_CHECK = "false";
  } else {
    say("Starting the database (the first run downloads a MongoDB binary, ~100 MB)");
  }
  start("mongo", process.execPath, ["scripts/dev-mongo.mjs", String(PORTS.mongo), path.join(LOCAL, "mongo")], { cwd: path.join(ROOT, "gateway"), shell: false, env: mongoEnv });
  await new Promise((resolve) => { const t = setInterval(async () => { if (!(await portFree(PORTS.mongo))) { clearInterval(t); resolve(); } }, 1000); });
}

say("Starting the analysis service (the first start loads the language model)");
start("ml", python[0], [...python.slice(1), "-m", "uvicorn", "app.main:app", "--port", String(PORTS.ml)], {
  cwd: path.join(ROOT, "ml-service"), shell: false,
  env: { ...process.env, ...optional, ML_SHARED_SECRET: secrets.ml },
});
say("Starting the API and the web app");
start("api", "npx", ["tsx", "src/server.ts"], {
  cwd: path.join(ROOT, "gateway"),
  env: {
    ...process.env, NODE_ENV: "development", PORT: String(PORTS.api), MONGODB_URI: mongoUri, JWT_SECRET: secrets.jwt,
    ML_SHARED_SECRET: secrets.ml, ML_SERVICE_URL: `http://127.0.0.1:${PORTS.ml}`,
    // Without Adzuna keys, Job Matches serves 1000 fictional demo listings (clearly labelled in the UI).
    DEMO_JOBS: optional.ADZUNA_APP_ID && optional.ADZUNA_APP_KEY ? "0" : "1",
    CORS_ORIGINS: `http://localhost:${PORTS.web},http://127.0.0.1:${PORTS.web}`,
  },
});
start("web", "npx", ["vite", "--host", "127.0.0.1", "--port", String(PORTS.web), "--strictPort"], { cwd: path.join(ROOT, "web") });

await waitFor(`http://127.0.0.1:${PORTS.api}/ready`, "The API");
await waitFor(`http://127.0.0.1:${PORTS.web}/`, "The web app");
const jobs = optional.ADZUNA_APP_ID && optional.ADZUNA_APP_KEY;
console.log(`
  ┌─────────────────────────────────────────────────────┐
  │  CVPilot is ready:   http://localhost:${PORTS.web}            │
  └─────────────────────────────────────────────────────┘
  Press Ctrl+C here to stop everything. Your data is kept in .local/mongo.
  ${jobs ? "Adzuna keys found: job search, insights and roadmap are enabled." : "No Adzuna keys: Job Matches shows fictional demo listings; the resume builder, ATS score and Scam Radar work; add ADZUNA_APP_ID / ADZUNA_APP_KEY to a root .env file (then restart) to enable job search, insights and roadmap."}
`);
