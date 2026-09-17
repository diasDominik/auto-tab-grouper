import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

import { createZip } from "../tools/zip.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Reads entry names out of a ZIP's central directory. */
function listZipEntries(buf) {
  const names = [];
  for (let i = 0; i < buf.length - 3; i++) {
    if (buf.readUInt32LE(i) === 0x02014b50) {
      const nameLen = buf.readUInt16LE(i + 28);
      names.push(buf.toString("utf8", i + 46, i + 46 + nameLen));
    }
  }
  return names;
}

test("createZip round-trips through inflate", () => {
  const payload = Buffer.from("hello tab grouper".repeat(20), "utf8");
  const zip = createZip([{ name: "a.txt", data: payload }]);

  assert.equal(zip.readUInt32LE(0), 0x04034b50, "missing local file header");
  assert.deepEqual(listZipEntries(zip), ["a.txt"]);

  // Pull the stored bytes back out and confirm they inflate to the original.
  const nameLen = zip.readUInt16LE(26);
  const extraLen = zip.readUInt16LE(28);
  const compressedLen = zip.readUInt32LE(18);
  const start = 30 + nameLen + extraLen;
  const stored = zip.subarray(start, start + compressedLen);
  assert.deepEqual(zlib.inflateRawSync(stored), payload);
});

test("createZip handles an empty file and an empty archive", () => {
  const withEmpty = createZip([{ name: "empty.txt", data: Buffer.alloc(0) }]);
  assert.deepEqual(listZipEntries(withEmpty), ["empty.txt"]);

  const empty = createZip([]);
  assert.equal(empty.readUInt32LE(0), 0x06054b50, "missing end-of-directory");
  assert.deepEqual(listZipEntries(empty), []);
});

test("the built package contains exactly the extension's runtime files", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "atg-pkg-"));
  execFileSync("node", ["tools/build-package.mjs", "--out", out], {
    cwd: root,
    stdio: "pipe",
  });

  const zips = fs.readdirSync(out).filter((f) => f.endsWith(".zip"));
  assert.equal(zips.length, 1, "expected exactly one archive");

  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "manifest.json"), "utf8")
  );
  assert.equal(zips[0], `auto-tab-grouper-v${manifest.version}.zip`);

  const names = listZipEntries(fs.readFileSync(path.join(out, zips[0])));

  // The manifest has to be at the archive root or Chrome rejects the upload.
  assert.ok(names.includes("manifest.json"));

  // Every module the extension actually loads.
  for (const required of [
    "background.js",
    "rules.js",
    "groups.js",
    "storage.js",
    "ui.js",
    "popup.js",
    "popup.html",
    "options.js",
    "options.html",
    "theme.js",
    "style.css",
    "icon16.png",
    "icon32.png",
    "icon48.png",
    "icon128.png",
  ]) {
    assert.ok(names.includes(required), `${required} missing from package`);
  }

  // Nothing that belongs only in the repo.
  for (const name of names) {
    assert.doesNotMatch(
      name,
      /^(test|tools|assets|store-assets|dist|node_modules|\.github)\//,
      `${name} must not be shipped`
    );
    assert.doesNotMatch(
      name,
      /^(package(-lock)?\.json|eslint\.config\.js|README\.md)$/,
      `${name} must not be shipped`
    );
  }

  fs.rmSync(out, { recursive: true, force: true });
});

test("the manifest and package.json versions agree", () => {
  // build-package.mjs refuses to run when these drift; assert it directly too,
  // so the failure names the real problem.
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "manifest.json"), "utf8")
  );
  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8")
  );
  assert.equal(pkg.version, manifest.version);
});
