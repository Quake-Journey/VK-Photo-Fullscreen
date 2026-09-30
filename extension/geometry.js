(() => {
  "use strict";
  const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
  const fit = (width, height, vw, vh) => Math.min(vw / width, vh / height);
  const constrain = (x, y, width, height, vw, vh, scale) => ({
    x: clamp(x, -Math.max(0, (width * scale - vw) / 2), Math.max(0, (width * scale - vw) / 2)),
    y: clamp(y, -Math.max(0, (height * scale - vh) / 2), Math.max(0, (height * scale - vh) / 2))
  });
  const zoomAt = (old, next, pan, anchor) => anchor - (anchor - pan) * next / old;
  globalThis.VKPhotoGeometry = Object.freeze({ clamp, fit, constrain, zoomAt });
})();
