// tools/png.mjs
// Minimal dependency-free PNG decode/encode, used by the asset build and
// verification scripts. Supports 8-bit truecolour, truecolour+alpha, greyscale
// and palette images -- enough for every asset in this repo.

import zlib from "node:zlib";

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++)
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * Decodes a PNG into flat RGBA.
 * @param {Buffer} buf
 * @returns {{width: number, height: number, data: Uint8Array}}
 */
export function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("Not a PNG");

  let pos = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette = null;
  let transparency = null;
  const idat = [];

  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8];
      colorType = body[9];
      interlace = body[12];
    } else if (type === "PLTE") palette = Buffer.from(body);
    else if (type === "tRNS") transparency = Buffer.from(body);
    else if (type === "IDAT") idat.push(Buffer.from(body));
    else if (type === "IEND") break;
    pos += 12 + len;
  }

  if (depth !== 8) throw new Error(`Unsupported bit depth ${depth}`);
  if (interlace !== 0) throw new Error("Interlaced PNG not supported");

  const channels = CHANNELS[colorType];
  const bpp = channels;
  const stride = width * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const lines = Buffer.alloc(height * stride);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = lines.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? lines.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v = src[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) v += paeth(a, b, c);
      cur[x] = v & 0xff;
    }
  }

  const data = new Uint8Array(width * height * 4);
  for (let i = 0, n = width * height; i < n; i++) {
    const s = i * channels;
    const d = i * 4;
    if (colorType === 6) {
      data[d] = lines[s];
      data[d + 1] = lines[s + 1];
      data[d + 2] = lines[s + 2];
      data[d + 3] = lines[s + 3];
    } else if (colorType === 2) {
      data[d] = lines[s];
      data[d + 1] = lines[s + 1];
      data[d + 2] = lines[s + 2];
      data[d + 3] = 255;
    } else if (colorType === 0) {
      data[d] = data[d + 1] = data[d + 2] = lines[s];
      data[d + 3] = 255;
    } else if (colorType === 4) {
      data[d] = data[d + 1] = data[d + 2] = lines[s];
      data[d + 3] = lines[s + 1];
    } else if (colorType === 3) {
      const idx = lines[s];
      data[d] = palette[idx * 3];
      data[d + 1] = palette[idx * 3 + 1];
      data[d + 2] = palette[idx * 3 + 2];
      data[d + 3] =
        transparency && idx < transparency.length ? transparency[idx] : 255;
    }
  }

  return { width, height, data };
}

function chunk(type, body) {
  const out = Buffer.alloc(body.length + 12);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, "ascii");
  body.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
  return out;
}

/**
 * Encodes flat RGBA as an 8-bit RGBA PNG.
 * @param {{width: number, height: number, data: Uint8Array}} image
 * @returns {Buffer}
 */
export function encodePNG({ width, height, data }) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1
    );
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Bounding box of pixels with alpha above a threshold.
 * @returns {{x0:number,y0:number,x1:number,y1:number,w:number,h:number}|null}
 */
export function opaqueBounds({ width, height, data }, threshold = 8) {
  let x0 = width,
    y0 = height,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * Crops to a rectangle.
 * @returns {{width:number,height:number,data:Uint8Array}}
 */
export function crop({ width, data }, { x0, y0, w, h }) {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const src = ((y0 + y) * width + x0) * 4;
    out.set(data.subarray(src, src + w * 4), y * w * 4);
  }
  return { width: w, height: h, data: out };
}

/**
 * Area-averaging resample. Colour is averaged premultiplied by alpha so that
 * fully transparent pixels cannot bleed their (undefined) colour into the
 * edges of the artwork.
 */
export function resize(img, targetW, targetH) {
  const { width: sw, height: sh, data: src } = img;
  const out = new Uint8Array(targetW * targetH * 4);
  const sx = sw / targetW;
  const sy = sh / targetH;

  for (let y = 0; y < targetH; y++) {
    const y1 = Math.floor(y * sy);
    const y2 = Math.min(sh, Math.max(y1 + 1, Math.ceil((y + 1) * sy)));
    for (let x = 0; x < targetW; x++) {
      const x1 = Math.floor(x * sx);
      const x2 = Math.min(sw, Math.max(x1 + 1, Math.ceil((x + 1) * sx)));
      let r = 0,
        g = 0,
        b = 0,
        a = 0,
        n = 0;
      for (let yy = y1; yy < y2; yy++) {
        for (let xx = x1; xx < x2; xx++) {
          const i = (yy * sw + xx) * 4;
          const al = src[i + 3] / 255;
          r += src[i] * al;
          g += src[i + 1] * al;
          b += src[i + 2] * al;
          a += src[i + 3];
          n++;
        }
      }
      const o = (y * targetW + x) * 4;
      const am = a / n;
      const un = am > 0 ? n * (am / 255) : 1;
      out[o] = Math.round(r / un);
      out[o + 1] = Math.round(g / un);
      out[o + 2] = Math.round(b / un);
      out[o + 3] = Math.round(am);
    }
  }
  return { width: targetW, height: targetH, data: out };
}

/** Centres an image on a fully transparent canvas of the given size. */
export function padTo(img, width, height) {
  const out = new Uint8Array(width * height * 4);
  const ox = Math.round((width - img.width) / 2);
  const oy = Math.round((height - img.height) / 2);
  for (let y = 0; y < img.height; y++) {
    const dst = ((oy + y) * width + ox) * 4;
    out.set(img.data.subarray(y * img.width * 4, (y + 1) * img.width * 4), dst);
  }
  return { width, height, data: out };
}

/** Scales an image to fit inside a box, preserving aspect ratio. */
export function fitInto(img, box) {
  const scale = Math.min(box / img.width, box / img.height);
  return resize(
    img,
    Math.max(1, Math.round(img.width * scale)),
    Math.max(1, Math.round(img.height * scale))
  );
}
