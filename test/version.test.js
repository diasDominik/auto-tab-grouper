import test from "node:test";
import assert from "node:assert/strict";

import { normalizeVersion } from "../tools/set-version.mjs";

test("a plain three-part version passes through", () => {
  assert.deepEqual(normalizeVersion("1.4.0"), {
    manifest: "1.4.0",
    npm: "1.4.0",
  });
});

test("a leading v is stripped, so a git tag can be passed directly", () => {
  assert.deepEqual(normalizeVersion("v1.4.0"), {
    manifest: "1.4.0",
    npm: "1.4.0",
  });
  assert.equal(normalizeVersion("V2.0.1").manifest, "2.0.1");
});

test("surrounding whitespace is ignored", () => {
  assert.equal(normalizeVersion("  v1.4.0\n").manifest, "1.4.0");
});

test("short versions are padded for npm but left alone for Chrome", () => {
  // Chrome accepts "1.4"; npm insists on three components.
  assert.deepEqual(normalizeVersion("1.4"), { manifest: "1.4", npm: "1.4.0" });
  assert.deepEqual(normalizeVersion("2"), { manifest: "2", npm: "2.0.0" });
});

test("Chrome's fourth component is preserved", () => {
  assert.deepEqual(normalizeVersion("1.4.0.7"), {
    manifest: "1.4.0.7",
    npm: "1.4.0",
  });
});

test("a pre-release tag is rejected with a Chrome-specific reason", () => {
  // Valid semver and a perfectly normal git tag, but Chrome refuses it.
  assert.throws(() => normalizeVersion("v1.4.0-beta.1"), /pre-release/i);
  assert.throws(() => normalizeVersion("1.4.0+build5"), /pre-release|build/i);
});

test("non-numeric and malformed versions are rejected", () => {
  assert.throws(() => normalizeVersion("1.x.0"), /non-numeric/i);
  assert.throws(() => normalizeVersion("latest"), /non-numeric/i);
  assert.throws(() => normalizeVersion("1..0"), /non-numeric/i);
});

test("too many components are rejected", () => {
  assert.throws(() => normalizeVersion("1.2.3.4.5"), /between one and four/i);
});

test("leading zeros are rejected", () => {
  // Chrome treats "01" as invalid rather than as 1.
  assert.throws(() => normalizeVersion("1.04.0"), /leading zero/i);
  // A bare zero is fine.
  assert.equal(normalizeVersion("0.1.0").manifest, "0.1.0");
});

test("a component above Chrome's limit is rejected", () => {
  assert.throws(() => normalizeVersion("1.65536.0"), /65535/);
  assert.equal(normalizeVersion("1.65535.0").manifest, "1.65535.0");
});

test("empty and non-string input is rejected", () => {
  assert.throws(() => normalizeVersion(""), /No version/i);
  assert.throws(() => normalizeVersion("   "), /No version/i);
  assert.throws(() => normalizeVersion(undefined), /No version/i);
});
