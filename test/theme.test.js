import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// These guard the three-state theme contract:
//   "light"  -> body.light-theme pins the light palette
//   "dark"   -> body.dark-theme pins the dark palette
//   "system" -> no class at all, so prefers-color-scheme decides
// The system case is the one that regresses silently: if the media block goes
// missing, theme.js still "works" but every popup renders light for a frame
// and then flips, and a system-dark user gets a light popup.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const css = fs.readFileSync(path.join(root, "style.css"), "utf8");
const themeJs = fs.readFileSync(path.join(root, "theme.js"), "utf8");

/** Pulls the body of the first rule whose selector matches. */
function ruleBody(source, selector) {
  const index = source.indexOf(selector);
  if (index === -1) return null;
  const open = source.indexOf("{", index);
  if (open === -1) return null;
  let depth = 1;
  let i = open + 1;
  while (i < source.length && depth > 0) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") depth--;
    i++;
  }
  return source.slice(open + 1, i - 1);
}

/** Extracts `--name: value` pairs from a rule body. */
function customProps(body) {
  const props = {};
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    props[match[1]] = match[2].trim();
  }
  return props;
}

const lightBlock = ruleBody(css, ":root");
const darkClassBlock = ruleBody(css, "body.dark-theme");
const mediaBlock = ruleBody(css, "@media (prefers-color-scheme: dark)");

test("the light palette is defined on :root", () => {
  assert.ok(lightBlock, ":root rule is missing");
  const props = customProps(lightBlock);
  assert.ok(props["--bg-color"], "--bg-color missing from :root");
  assert.ok(props["--text-color"], "--text-color missing from :root");
});

test("an explicit dark choice has its own palette", () => {
  assert.ok(darkClassBlock, "body.dark-theme rule is missing");
  const props = customProps(darkClassBlock);
  assert.ok(props["--bg-color"], "--bg-color missing from body.dark-theme");
});

test("system dark is driven by CSS, not by JavaScript", () => {
  assert.ok(mediaBlock, "prefers-color-scheme: dark block is missing");
  // It must apply to bodies with no theme class, but back off when the user
  // has explicitly chosen light.
  assert.match(mediaBlock, /body:not\(\.light-theme\)/);
});

test("system dark and explicit dark resolve to the same palette", () => {
  const explicit = customProps(darkClassBlock);
  const system = customProps(ruleBody(mediaBlock, "body:not(.light-theme)"));
  assert.deepEqual(
    system,
    explicit,
    "the two dark palettes have drifted apart"
  );
});

test("color-scheme is declared for both palettes", () => {
  // Otherwise native controls (checkboxes, selects, scrollbars) stay light.
  assert.match(lightBlock, /color-scheme:\s*light/);
  assert.match(darkClassBlock, /color-scheme:\s*dark/);
  assert.match(mediaBlock, /color-scheme:\s*dark/);
});

test('theme.js defaults to "system"', () => {
  assert.match(themeJs, /theme:\s*"system"/);
});

test("theme.js applies a class only for an explicit choice", () => {
  // toggle(..., theme === "dark") / toggle(..., theme === "light") leaves both
  // classes off for "system", which is what hands control to the media query.
  assert.match(
    themeJs,
    /classList\.toggle\(\s*"dark-theme",\s*theme === "dark"/
  );
  assert.match(
    themeJs,
    /classList\.toggle\(\s*"light-theme",\s*theme === "light"/
  );
});

test("the toggle cycles through all three states", () => {
  for (const state of ["system", "light", "dark"]) {
    assert.ok(
      themeJs.includes(`"${state}"`),
      `theme.js never mentions "${state}"`
    );
  }
});
