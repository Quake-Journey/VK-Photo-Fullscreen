// This document is permanently offscreen. A rendering-vsync rAF may never run.
// TensorFlow's nextFrame uses this timer yield to permit navigation/cancellation
// between patches. Does not modify the web page or any visible window.
window.requestAnimationFrame = callback => setTimeout(() => callback(performance.now()), 0);
window.cancelAnimationFrame = id => clearTimeout(id);
