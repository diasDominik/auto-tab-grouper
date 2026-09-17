// tools/verify-store-assets.mjs
// Checks every image against the Chrome Web Store spec. Run before packaging.
//
// Usage: node tools/verify-store-assets.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodePNG, opaqueBounds } from "./png.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const store = path.join(root, "store-assets");

let failures = 0;
const check = (ok, label, detail) => {
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`
  );
};

function load(file) {
  if (!fs.existsSync(file)) return null;
  const buf = fs.readFileSync(file);
  // Every asset must be a real PNG, not a renamed JPEG.
  if (buf.readUInt32BE(0) !== 0x89504e47) return null;
  return decodePNG(buf);
}

function checkSize(file, w, h, label) {
  const img = load(file);
  if (!img) return check(false, label, "missing or not a valid PNG");
  check(
    img.width === w && img.height === h,
    label,
    `${img.width}x${img.height} (want ${w}x${h})`
  );
  return img;
}

console.log("Extension icons");
// The 128px icon is also the store icon: 96x96 of art, 16px transparent padding.
for (const [size, art] of [
  [128, 96],
  [48, 42],
  [32, 28],
  [16, 14],
]) {
  const img = checkSize(
    path.join(root, `icon${size}.png`),
    size,
    size,
    `icon${size}.png size`
  );
  if (!img) continue;

  const bounds = opaqueBounds(img);
  const pad = size === 128 ? 16 : (size - art) / 2;
  check(
    bounds.w === art && bounds.h === art,
    `icon${size}.png art box`,
    `${bounds.w}x${bounds.h} (want ${art}x${art})`
  );
  check(
    bounds.x0 === pad &&
      bounds.y0 === pad &&
      size - 1 - bounds.x1 === pad &&
      size - 1 - bounds.y1 === pad,
    `icon${size}.png padding`,
    `L${bounds.x0} T${bounds.y0} R${size - 1 - bounds.x1} B${size - 1 - bounds.y1} (want ${pad} each side)`
  );

  // A fully opaque icon means the store draws a rounded-corner frame behind it,
  // and the mark reads as a solid tile on dark backgrounds.
  let transparent = 0;
  for (let i = 3; i < img.data.length; i += 4)
    if (img.data[i] === 0) transparent++;
  check(
    transparent > 0,
    `icon${size}.png has transparency`,
    `${transparent} fully transparent px`
  );
}

console.log("\nStore listing images");
const shots = fs
  .readdirSync(store)
  .filter((f) => f.startsWith("screenshot-") && f.endsWith(".png"))
  .sort();
check(
  shots.length >= 1 && shots.length <= 5,
  "screenshot count",
  `${shots.length} (want 1-5)`
);
for (const f of shots) {
  const img = load(path.join(store, f));
  if (!img) {
    check(false, `${f}`, "missing or not a valid PNG");
    continue;
  }
  const ok =
    (img.width === 1280 && img.height === 800) ||
    (img.width === 640 && img.height === 400);
  check(
    ok,
    `${f} size`,
    `${img.width}x${img.height} (want 1280x800 or 640x400)`
  );

  // Full bleed: the corners must be painted, not transparent or letterboxed.
  const corners = [
    [0, 0],
    [img.width - 1, 0],
    [0, img.height - 1],
    [img.width - 1, img.height - 1],
  ].map(([x, y]) => img.data[(y * img.width + x) * 4 + 3]);
  check(
    corners.every((a) => a === 255),
    `${f} full bleed`,
    `corner alpha ${corners.join(",")}`
  );
}

checkSize(
  path.join(store, "promo-small-440x280.png"),
  440,
  280,
  "small promo tile"
);
checkSize(
  path.join(store, "promo-marquee-1400x560.png"),
  1400,
  560,
  "marquee promo tile"
);

console.log("\nManifest");
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "manifest.json"), "utf8")
);
check(Boolean(manifest.icons), "manifest has top-level icons");
for (const size of ["16", "32", "48", "128"]) {
  check(
    manifest.icons?.[size] === `icon${size}.png`,
    `manifest.icons["${size}"]`
  );
}
check(
  manifest.name.length <= 75,
  "name length",
  `${manifest.name.length} chars (max 75)`
);
check(
  manifest.description.length <= 132,
  "description length",
  `${manifest.description.length} chars (max 132)`
);

console.log(
  failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`
);
process.exit(failures === 0 ? 0 : 1);
