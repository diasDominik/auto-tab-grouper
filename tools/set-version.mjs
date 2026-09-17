// tools/set-version.mjs
// Writes a version into manifest.json and package.json.
//
// Used two ways:
//  - locally, `npm run set-version 1.4.0`, before committing and tagging
//  - in the Package workflow, to stamp the version from the git tag so the
//    uploaded ZIP always carries the version you tagged
//
// Usage: node tools/set-version.mjs <version>   e.g. 1.4.0 or v1.4.0

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Chrome's own limit on each dotted part of a manifest version.
const MAX_PART = 65535;

/**
 * Validates a version and renders it for each file that needs it.
 *
 * Chrome's manifest version format is narrower than semver: one to four
 * dot-separated integers, each 0-65535, no leading zeros, and crucially no
 * pre-release or build metadata. `1.4.0-beta.1` is a perfectly good git tag and
 * an invalid extension version, so it is rejected here rather than at upload.
 *
 * @param {string} raw - with or without a leading "v".
 * @returns {{manifest: string, npm: string}}
 * @throws {Error} when the version cannot be used as a manifest version.
 */
export function normalizeVersion(raw) {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new Error("No version given.");
  }

  const trimmed = raw.trim().replace(/^v/i, "");

  if (trimmed.includes("-") || trimmed.includes("+")) {
    throw new Error(
      `"${raw}" has a pre-release or build suffix. Chrome extension versions ` +
        `must be plain dotted integers, so tag a release as e.g. v1.4.0.`
    );
  }

  const parts = trimmed.split(".");
  if (parts.length < 1 || parts.length > 4) {
    throw new Error(
      `"${raw}" has ${parts.length} parts; Chrome allows between one and four.`
    );
  }

  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      throw new Error(`"${raw}" contains a non-numeric part: "${part}".`);
    }
    if (part.length > 1 && part.startsWith("0")) {
      throw new Error(`"${raw}" has a leading zero in "${part}".`);
    }
    if (Number(part) > MAX_PART) {
      throw new Error(`"${raw}" has a part above ${MAX_PART}: "${part}".`);
    }
  }

  // npm demands exactly three components, Chrome does not, so pad for
  // package.json while leaving the manifest exactly as tagged.
  const padded = [...parts];
  while (padded.length < 3) padded.push("0");

  return { manifest: parts.join("."), npm: padded.slice(0, 3).join(".") };
}

/** Rewrites one JSON file's `version` field, preserving formatting style. */
function writeVersion(file, version) {
  const full = path.join(root, file);
  const json = JSON.parse(fs.readFileSync(full, "utf8"));
  const previous = json.version;
  json.version = version;
  fs.writeFileSync(full, `${JSON.stringify(json, null, 2)}\n`);
  return previous;
}

// Only act when run directly, so the validation above can be imported by tests.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  let versions;
  try {
    versions = normalizeVersion(process.argv[2]);
  } catch (error) {
    console.error(error.message);
    console.error("Usage: node tools/set-version.mjs <version>");
    process.exit(1);
  }

  const before = writeVersion("manifest.json", versions.manifest);
  writeVersion("package.json", versions.npm);

  console.log(`manifest.json: ${before} -> ${versions.manifest}`);
  console.log(`package.json:  ${before} -> ${versions.npm}`);
}
