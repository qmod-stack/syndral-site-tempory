import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";

const root = new URL("../dist/public/bitefind/", import.meta.url);
const release = JSON.parse(readFileSync(new URL("release.json", root), "utf8"));

test("public entry and runtime asset URLs are isolated under /bitefind/", () => {
  const html = readFileSync(new URL("index.html", root), "utf8");
  const refs = [...html.matchAll(/(?:src|href)="(\/bitefind\/[^"?]+)"/g)].map((match) => match[1]);
  assert.ok(refs.some((value) => value.endsWith(".js")));
  assert.ok(refs.some((value) => value.endsWith(".css")));
  for (const ref of refs) assert.ok(existsSync(new URL(ref.slice("/bitefind/".length), root)), ref);
  const code = release.files.filter((file) => file.path.endsWith(".js")).map((file) => readFileSync(new URL(file.path, root), "utf8")).join("\n");
  assert.ok(!/["'`]\/assets\/(?:iphone|android|status)\//.test(code), "no root-relative phone assets");
  const runtime = [...code.matchAll(/["'`](\/bitefind\/assets\/(?:iphone|android|status)\/[^"'`]+)["'`]/g)].map((match) => match[1]);
  assert.ok(runtime.length >= 7, "all seven phone assets are namespaced");
  for (const ref of runtime) assert.ok(existsSync(new URL(ref.slice("/bitefind/".length), root)), ref);
});

test("release contains no database, private service, source maps or fictional food artwork", () => {
  assert.equal(release.hostedAccounts, false);
  assert.equal(release.base, "/bitefind/");
  for (const file of release.files) {
    assert.doesNotMatch(file.path, /(?:\.sqlite|\.db$|\.env|\.map$|^server\/|^assets\/bitefind\/)/);
    const body = readFileSync(new URL(file.path, root));
    assert.equal(createHash("sha256").update(body).digest("hex"), file.sha256);
    if (file.path.endsWith(".js")) assert.ok(!/127\.0\.0\.1:8789|localhost:8789/.test(body.toString("utf8")), "no development API endpoint");
  }
});
