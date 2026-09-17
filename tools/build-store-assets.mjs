// tools/build-store-assets.mjs
// Renders the Chrome Web Store listing images into store-assets/.
//
// Screenshots embed the real popup.html / options.html markup running the real
// popup.js / options.js against a stubbed chrome.* backend (assets/shot-shim.js),
// so what is captured is the actual UI rather than a mockup. ES modules will not
// load over file://, so the pages are served over a short-lived local HTTP
// server for the duration of the render.
//
// Usage: node tools/build-store-assets.mjs

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { decodePNG } from "./png.mjs";

// Must be async: execFileSync would block the event loop, and the local HTTP
// server below runs in this same process -- Chrome would wait forever for a
// page that Node could never serve.
const execFileAsync = promisify(execFile);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "store-assets");
const CHROME =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// Dimensions are fixed by the store spec; see README in store-assets/.
const TARGETS = [
  {
    page: "assets/shot-1-popup.html",
    out: "screenshot-1-popup.png",
    w: 1280,
    h: 800,
  },
  {
    page: "assets/shot-2-options.html",
    out: "screenshot-2-rules.png",
    w: 1280,
    h: 800,
  },
  {
    page: "assets/shot-3-dark.html",
    out: "screenshot-3-dark.png",
    w: 1280,
    h: 800,
  },
  {
    page: "assets/promo-small.html",
    out: "promo-small-440x280.png",
    w: 440,
    h: 280,
  },
  {
    page: "assets/promo-marquee.html",
    out: "promo-marquee-1400x560.png",
    w: 1400,
    h: 560,
  },
];

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
};

function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "");
    const file = path.join(root, rel);
    if (
      !file.startsWith(root) ||
      !fs.existsSync(file) ||
      fs.statSync(file).isDirectory()
    ) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
    });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () =>
      resolve({ server, port: server.address().port })
    );
  });
}

const profile = fs.mkdtempSync("/tmp/atg-shots-");
const { server, port } = await serve();
fs.mkdirSync(outDir, { recursive: true });

try {
  for (const { page, out, w, h } of TARGETS) {
    const dest = path.join(outDir, out);
    await execFileAsync(
      CHROME,
      [
        "--headless",
        "--disable-gpu",
        "--hide-scrollbars",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-networking",
        "--disable-sync",
        "--disable-component-update",
        "--disable-default-apps",
        `--user-data-dir=${profile}`,
        "--force-device-scale-factor=1",
        `--window-size=${w},${h}`,
        `--screenshot=${dest}`,
        `http://127.0.0.1:${port}/${page}`,
      ],
      { maxBuffer: 1 << 24 }
    );
    const img = decodePNG(fs.readFileSync(dest));
    const ok = img.width === w && img.height === h;
    console.log(
      `${ok ? "OK  " : "FAIL"} ${out}  ${img.width}x${img.height} (want ${w}x${h})`
    );
    if (!ok) process.exitCode = 1;
  }
} finally {
  server.close();
}
