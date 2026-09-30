const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

export function analyze(data) {
  const bins = new Uint32Array(256);
  let count = 0;
  // Bound analysis work; retain the full raster for applying the curve.
  const stride = Math.max(1, Math.floor(data.length / 4 / 100000)) * 4;
  for (let i = 0; i < data.length; i += stride) {
    if (data[i + 3] < 128) continue;
    bins[Math.round(.2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2])]++;
    count++;
  }
  function percentile(part) {
    let sum = 0;
    for (let i = 0; i < 256; i++) { sum += bins[i]; if (sum >= count * part) return i / 255; }
    return 1;
  }
  const median = percentile(.5), low = percentile(.02), high = percentile(.98);
  // Dead band leaves normally exposed photos close to the original.
  const target = clamp(median, .38, .60);
  const gamma = median > .025 && median < .98 ? clamp(Math.log(target) / Math.log(median), .78, 1.45) : 1;
  // Never convert fully clipped white into invented detail or aggressively pull blacks.
  const stretch = high - low > .2 && median <= .60;
  const black = stretch ? Math.min(low * .35, .025) : 0;
  const white = stretch && high < .92 ? Math.max(.88, 1 - (1 - high) * .25) : 1;
  return { median, low, high, gamma, black, white, pixels: count };
}

export function correctTone(data, stats = analyze(data)) {
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const input = i / 255;
    const normalized = clamp((input - stats.black) / (stats.white - stats.black), 0, 1);
    let value = Math.pow(normalized, stats.gamma);
    value += .025 * (value - .5) * 4 * value * (1 - value);
    // Keep 20% of the original luminance for a restrained default correction.
    lut[i] = .8 * value + .2 * input;
  }
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const y = .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2];
    const target = lut[Math.round(y)] * 255;
    const ratio = y > 1 ? target / y : 1;
    // A shared RGB multiplier retains hue; alpha and transparent pixels stay intact.
    for (let c = 0; c < 3; c++) data[i + c] = clamp(Math.round(data[i + c] * ratio), 0, 255);
  }
  return stats;
}
