// tools/build-package.mjs
// Builds the ZIP that gets uploaded to the Chrome Web Store.
//
// The file list is DERIVED, not hardcoded: it starts at the manifest's entry
// points, follows <script>/<link> references in the HTML, and walks the ES
// module import graph from there. A new module is therefore picked up
// automatically, and nothing that the extension does not actually load at
// runtime (tests, tooling, screenshot harness, store artwork) can drift in.
//
// Usage: node tools/build-package.mjs [--out dist]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createZip } from "./zip.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const outIndex = process.argv.indexOf("--out");
// resolve, not join: --out may be given as an absolute path.
const outDir = path.resolve(
  root,
  outIndex === -1 ? "dist" : process.argv[outIndex + 1]
);

/** Anything matching these must never reach the uploaded archive. */
const FORBIDDEN = [
  /^node_modules\//,
  /^test\//,
  /^tools\//,
  /^assets\//,
  /^store-assets\//,
  /^dist\//,
  /^\.github\//,
  /^\.git\//,
  /^package(-lock)?\.json$/,
  /^eslint\.config\.js$/,
  /^\.prettierrc\.json$/,
];

const manifestPath = path.join(root, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const included = new Set(["manifest.json"]);
const problems = [];

function resolveRef(fromFile, ref) {
  // Ignore absolute URLs and data: refs; only local files are packaged.
  if (/^[a-z]+:/i.test(ref) || ref.startsWith("//")) return null;
  const cleaned = ref.split("?")[0].split("#")[0];
  if (!cleaned) return null;
  const dir = path.dirname(path.join(root, fromFile));
  const abs = path.resolve(dir, cleaned);
  return path.relative(root, abs).split(path.sep).join("/");
}

function addFile(rel, origin) {
  if (!rel) return;
  if (rel.startsWith("..")) {
    problems.push(`${origin} references ${rel}, which is outside the project`);
    return;
  }
  if (!fs.existsSync(path.join(root, rel))) {
    problems.push(`${origin} references ${rel}, which does not exist`);
    return;
  }
  if (included.has(rel)) return;
  included.add(rel);
  walk(rel);
}

/** Follows whatever references a packaged file makes. */
function walk(rel) {
  const ext = path.extname(rel);
  if (ext !== ".html" && ext !== ".js") return;
  const source = fs.readFileSync(path.join(root, rel), "utf8");

  if (ext === ".html") {
    for (const m of source.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)) {
      addFile(resolveRef(rel, m[1]), rel);
    }
    for (const m of source.matchAll(
      /<link[^>]*\srel="stylesheet"[^>]*\shref="([^"]+)"/g
    )) {
      addFile(resolveRef(rel, m[1]), rel);
    }
    return;
  }

  // Static ES module imports and re-exports.
  for (const m of source.matchAll(
    /\b(?:import|export)\b[^'"]*?\bfrom\s*["']([^"']+)["']/g
  )) {
    addFile(resolveRef(rel, m[1]), rel);
  }
  for (const m of source.matchAll(/\bimport\s*["']([^"']+)["']/g)) {
    addFile(resolveRef(rel, m[1]), rel);
  }
}

// Entry points declared by the manifest.
addFile(manifest.background?.service_worker, "manifest.background");
addFile(manifest.options_page, "manifest.options_page");
addFile(manifest.action?.default_popup, "manifest.action.default_popup");
for (const [size, file] of Object.entries(manifest.icons ?? {})) {
  addFile(file, `manifest.icons["${size}"]`);
}
for (const [size, file] of Object.entries(
  manifest.action?.default_icon ?? {}
)) {
  addFile(file, `manifest.action.default_icon["${size}"]`);
}
for (const resource of manifest.web_accessible_resources ?? []) {
  for (const file of resource.resources ?? []) {
    addFile(file, "manifest.web_accessible_resources");
  }
}

// The manifest version is what the store actually publishes, so a mismatch
// with package.json means one of them was forgotten.
const pkg = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8")
);
if (pkg.version !== manifest.version) {
  problems.push(
    `package.json version ${pkg.version} does not match manifest version ${manifest.version}`
  );
}

const files = [...included].sort();
for (const rel of files) {
  if (FORBIDDEN.some((pattern) => pattern.test(rel))) {
    problems.push(`${rel} must not be shipped to the store`);
  }
}

if (problems.length > 0) {
  console.error("Cannot build package:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

const entries = files.map((name) => ({
  name,
  data: fs.readFileSync(path.join(root, name)),
}));
const zip = createZip(entries);

fs.mkdirSync(outDir, { recursive: true });
const zipName = `auto-tab-grouper-v${manifest.version}.zip`;
const zipPath = path.join(outDir, zipName);
fs.writeFileSync(zipPath, zip);

console.log(
  `Packaged ${files.length} files into ${path.relative(root, zipPath)}`
);
for (const name of files) {
  const size = fs.statSync(path.join(root, name)).size;
  console.log(`  ${String(size).padStart(7)}  ${name}`);
}
console.log(`\nArchive size: ${zip.length} bytes`);
