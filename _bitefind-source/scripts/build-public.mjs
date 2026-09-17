import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "dist/public/bitefind");
const base = "/bitefind/";
// This public preview has no hosted account API. Never bake a developer's endpoint into it.
const result = spawnSync(process.execPath, [join(root, "node_modules/vite/bin/vite.js"), "build", "--base", base, "--outDir", output], {
  cwd: root, stdio: "inherit", env: { ...process.env, VITE_BITEFIND_API_BASE: "" },
});
if (result.status !== 0) process.exit(result.status ?? 1);

// Runtime sources stay locked. Namespace their literal asset URLs in the release copy only.
for (const name of readdirSync(join(output, "assets"))) {
  if (!name.endsWith(".js")) continue;
  const originalPath = join(output, "assets", name);
  const original = readFileSync(originalPath, "utf8");
  const patched = original.replaceAll(/(["'`])\/assets\/(iphone|android|status)\//g, `$1${base}assets/$2/`);
  if (patched === original) continue;
  const filename = `app-${createHash("sha256").update(patched).digest("hex").slice(0, 12)}.js`;
  writeFileSync(join(output, "assets", filename), patched);
  const htmlPath = join(output, "index.html");
  writeFileSync(htmlPath, readFileSync(htmlPath, "utf8").replaceAll(name, filename));
  unlinkSync(originalPath);
}

// Only ship assets used by this release; the old generated meal artwork is not menu data.
const manifest = [];
function inspect(dir, relative = "") {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = `${relative}${entry.name}`, path = join(dir, entry.name);
    if (entry.isDirectory()) { inspect(path, `${rel}/`); continue; }
    if (rel.startsWith("assets/bitefind/")) { unlinkSync(path); continue; }
    const data = readFileSync(path);
    manifest.push({ path: rel, bytes: data.length, sha256: createHash("sha256").update(data).digest("hex") });
  }
}
inspect(output);
writeFileSync(join(output, "release.json"), JSON.stringify({ product: "BiteFind", release: "2026-09-17-ui-polish", base, mode: "public-preview", hostedAccounts: false, files: manifest }, null, 2) + "\n");
console.log(`Public preview: ${manifest.length} files packaged at ${base}. No API or database included.`);
