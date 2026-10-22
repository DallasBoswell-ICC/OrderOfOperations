/* ---------------- colour (OKLab) ---------------- */
function toLin(c) { c /= 255; return c <= .04045 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); }
function toSrgb(c) { c = c <= .0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - .055; return Math.round(Math.min(1, Math.max(0, c)) * 255); }
function oklab(h) {
  let n; if (h[0] === '#') n = parseInt(h.slice(1), 16); else { const m = h.match(/\d+/g).map(Number); n = (m[0] << 16) | (m[1] << 8) | m[2]; }
  const r = toLin(n >> 16 & 255), g = toLin(n >> 8 & 255), b = toLin(n & 255);
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b), m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b), s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  return [.2104542553 * l + .793617785 * m - .0040720468 * s, 1.9779984951 * l - 2.428592205 * m + .4505937099 * s, .0259040371 * l + .7827717662 * m - .808675766 * s];
}
function labRgb(L, a, b) {
  const l = (L + .3963377774 * a + .2158037573 * b) ** 3, m = (L - .1055613458 * a - .0638541728 * b) ** 3, s = (L - .0894841775 * a - 1.291485548 * b) ** 3;
  return `rgb(${toSrgb(4.0767416621 * l - 3.3077115913 * m + .2309699292 * s)},${toSrgb(-1.2684380046 * l + 2.6097574011 * m - .3413193965 * s)},${toSrgb(-.0041960863 * l - .7034186147 * m + 1.707614701 * s)})`;
}
const lerp = (a, b, f) => a + (b - a) * f, clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
function mixOk(h1, h2, f) { const A = oklab(h1), B = oklab(h2); return labRgb(lerp(A[0], B[0], f), lerp(A[1], B[1], f), lerp(A[2], B[2], f)); }
// currents that meet mix like coloured light: red + blue meet as violet, blue + green as teal, red + green as yellow.
// The hue is the average of their hue directions and the colour keeps its strength, so it never turns muddy grey.
// Two adjustments keep every mix clean: a mix that lands among the yellows and golds is kept light (a dark yellow
// reads as olive or brown), and three or more colours spread round the wheel shift a little toward white, as light does (keeping most of their colour).
// White (no hue of its own) just pales whatever it meets.
function blend(cols) {
  const Q = cols.map(oklab), Cr = q => Math.hypot(q[1], q[2]), n = Q.length, avg = f => Q.reduce((t, q) => t + f(q), 0) / n;
  let L = avg(q => q[0]), C = avg(Cr);
  const hued = Q.filter(q => Cr(q) > 0.03);
  if (!hued.length) return labRgb(L, 0, 0);
  const ux = hued.reduce((t, q) => t + q[1] / Cr(q), 0) / hued.length, uy = hued.reduce((t, q) => t + q[2] / Cr(q), 0) / hued.length;
  const R = Math.hypot(ux, uy), h = Math.atan2(uy, ux), deg = (h * 180 / Math.PI + 360) % 360;
  if (hued.length >= 3) { const k = Math.min(1, 0.6 + R * 0.8); C *= k; L += (0.92 - L) * (1 - k) * 0.6; }
  const dh = Math.min(Math.abs(deg - 95), 360 - Math.abs(deg - 95)), yellowness = dh < 70 ? 0.5 + 0.5 * Math.cos(Math.PI * dh / 70) : 0;
  L = Math.max(L, 0.66 + 0.26 * yellowness);
  return labRgb(L, C * Math.cos(h), C * Math.sin(h));
}
function mixRgb(h1, h2, f) { const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16), ch = s => Math.round(lerp((a >> s) & 255, (b >> s) & 255, f)); return `rgb(${ch(16)},${ch(8)},${ch(0)})`; }
const flowCache = {};
const flowOf = hex => flowCache[hex] || (flowCache[hex] = mixOk(hex, '#ffffff', .2));   // current is a little lighter than its button
