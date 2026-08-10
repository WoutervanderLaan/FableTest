#!/usr/bin/env node
/**
 * Load a course checkpoint into this app.
 *
 *   pnpm checkpoint            # list available checkpoints
 *   pnpm checkpoint 05         # back up ./src, then copy checkpoints/05-<slug>/src over it
 *   pnpm checkpoint 08D        # deep-dive checkpoints work too
 *
 * Your current ./src is never lost — it's moved to ./src.bak-<timestamp>.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const checkpointsDir = resolve(appRoot, "..", "checkpoints");
const arg = process.argv[2];

if (!existsSync(checkpointsDir)) {
  console.error(`No checkpoints directory found at ${checkpointsDir}`);
  process.exit(1);
}

const all = readdirSync(checkpointsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

if (!arg) {
  console.log("Available checkpoints:\n");
  for (const name of all) console.log("  " + name);
  console.log("\nUsage: pnpm checkpoint <id>   e.g. pnpm checkpoint 05");
  process.exit(0);
}

// Match "05", "5", "08D", case-insensitively against the NN prefix.
const norm = (s) => s.toLowerCase().replace(/^0+/, "");
const match = all.find((name) => {
  const prefix = name.split("-")[0];
  return norm(prefix) === norm(arg);
});

if (!match) {
  console.error(`No checkpoint matches "${arg}". Run \`pnpm checkpoint\` to list them.`);
  process.exit(1);
}

const from = join(checkpointsDir, match, "src");
if (!existsSync(from)) {
  console.error(`Checkpoint "${match}" has no src/ folder.`);
  process.exit(1);
}

const srcDir = join(appRoot, "src");
if (existsSync(srcDir)) {
  const backup = join(appRoot, `src.bak-${Date.now()}`);
  renameSync(srcDir, backup);
  console.log(`Backed up your current src/ -> ${backup.replace(appRoot + "/", "")}`);
}
mkdirSync(srcDir, { recursive: true });
cpSync(from, srcDir, { recursive: true });
console.log(`Loaded checkpoint "${match}" into src/. Run \`pnpm dev\` to see it.`);
