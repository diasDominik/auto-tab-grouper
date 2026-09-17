// tools/build-icons.mjs
// Rebuilds the extension icons from assets/icon.svg.
//
// The 128px icon follows the Chrome Web Store rule: 96x96 of artwork centred
// on a 128x128 transparent canvas (16px padding each side). The smaller
// toolbar sizes use a tighter margin, because at 16px the store's padding
// ratio would leave the mark illegible.
//
// Usage: node tools/build-icons.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  decodePNG,
  encodePNG,
  opaqueBounds,
  crop,
  fitInto,
  padTo,
} from "./png.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// canvas -> artwork size
const SIZES = [
  [128, 96], // Chrome Web Store: 96x96 art + 16px transparent padding
  [48, 42],
  [32, 28],
  [16, 14],
];

const RENDER_AT = 512;

function renderSvg() {
  const out = path.join(fs.mkdtempSync("/tmp/atg-icons-"), "raw.png");
  execFileSync(
    CHROME,
    [
      "--headless",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--default-background-color=00000000",
      `--window-size=${RENDER_AT},${RENDER_AT}`,
      `--screenshot=${out}`,
      `file://${path.join(root, "assets", "icon-render.html")}`,
    ],
    { stdio: "ignore" }
  );
  return decodePNG(fs.readFileSync(out));
}

const raw = renderSvg();
const bounds = opaqueBounds(raw);
if (!bounds) throw new Error("Rendered icon is empty");
const trimmed = crop(raw, bounds);

for (const [canvas, art] of SIZES) {
  const image = padTo(fitInto(trimmed, art), canvas, canvas);
  const file = path.join(root, `icon${canvas}.png`);
  fs.writeFileSync(file, encodePNG(image));
  const b = opaqueBounds(image);
  console.log(
    `icon${canvas}.png  ${canvas}x${canvas}  art ${b.w}x${b.h}  ` +
      `padding L${b.x0} T${b.y0} R${canvas - 1 - b.x1} B${canvas - 1 - b.y1}`
  );
}
