// Downsamples a Radiance .hdr (RGBE) by 2× → smaller environment map for mid-range devices.
//   node scripts/downsample-hdr.mjs public/hdr/studio.hdr public/hdr/studio-512.hdr
import { readFileSync, writeFileSync } from 'node:fs';

const [src, dst] = process.argv.slice(2);
const buf = readFileSync(src);

// Header: text lines until an empty line, then "-Y h +X w".
let pos = 0;
const line = () => {
  const end = buf.indexOf(0x0a, pos);
  const s = buf.toString('latin1', pos, end);
  pos = end + 1;
  return s;
};
while (line() !== '');
const [, h, , w] = line().split(' ').map((v, i) => (i % 2 ? Number(v) : v));

function readScanline() {
  const out = new Uint8Array(w * 4);
  if (buf[pos] !== 2 || buf[pos + 1] !== 2 || ((buf[pos + 2] << 8) | buf[pos + 3]) !== w) {
    out.set(buf.subarray(pos, pos + w * 4));
    pos += w * 4;
    return out;
  }
  pos += 4;
  for (let c = 0; c < 4; c++) {
    let x = 0;
    while (x < w) {
      let n = buf[pos++];
      if (n > 128) {
        n -= 128;
        const v = buf[pos++];
        for (let i = 0; i < n; i++) out[(x++) * 4 + c] = v;
      } else for (let i = 0; i < n; i++) out[(x++) * 4 + c] = buf[pos++];
    }
  }
  return out;
}

const rgb = new Float32Array(w * h * 3);
for (let y = 0; y < h; y++) {
  const s = readScanline();
  for (let x = 0; x < w; x++) {
    const e = s[x * 4 + 3];
    const f = e ? Math.pow(2, e - 136) : 0;
    for (let c = 0; c < 3; c++) rgb[(y * w + x) * 3 + c] = s[x * 4 + c] * f;
  }
}

const W = w >> 1, H = h >> 1;
const toRGBE = (r, g, b, out, o) => {
  const m = Math.max(r, g, b);
  if (m < 1e-32) return out.fill(0, o, o + 4);
  const e = Math.ceil(Math.log2(m) + 1e-9);
  const f = Math.pow(2, 8 - e);
  out[o] = Math.min(255, r * f);
  out[o + 1] = Math.min(255, g * f);
  out[o + 2] = Math.min(255, b * f);
  out[o + 3] = e + 128;
};

const chunks = [Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${H} +X ${W}\n`, 'latin1')];
const line4 = new Uint8Array(W * 4);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const acc = [0, 0, 0];
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const i = ((y * 2 + dy) * w + x * 2 + dx) * 3;
      for (let c = 0; c < 3; c++) acc[c] += rgb[i + c] / 4;
    }
    toRGBE(acc[0], acc[1], acc[2], line4, x * 4);
  }
  // New-style RLE: each channel separately, runs of equal bytes or literal dumps.
  const out = [2, 2, W >> 8, W & 255];
  for (let c = 0; c < 4; c++) {
    const ch = Array.from({ length: W }, (_, x) => line4[x * 4 + c]);
    let x = 0;
    while (x < W) {
      let run = 1;
      while (x + run < W && run < 127 && ch[x + run] === ch[x]) run++;
      if (run >= 3) {
        out.push(128 + run, ch[x]);
        x += run;
        continue;
      }
      let n = 0;
      while (x + n < W && n < 128 && !(x + n + 2 < W && ch[x + n] === ch[x + n + 1] && ch[x + n] === ch[x + n + 2])) n++;
      out.push(n, ...ch.slice(x, x + n));
      x += n;
    }
  }
  chunks.push(Buffer.from(out));
}
writeFileSync(dst, Buffer.concat(chunks));
console.log(`${w}x${h} → ${W}x${H}`);
