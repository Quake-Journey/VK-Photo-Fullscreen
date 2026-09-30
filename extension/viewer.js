(() => {
  "use strict";
  if (document.getElementById("vk-photo-fullscreen-extension")) return;
  const G = globalThis.VKPhotoGeometry;
  const host = document.createElement("div");
  host.id = "vk-photo-fullscreen-extension";
  host.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
  const shadow = host.attachShadow({ mode: "open" });
  const icon = path => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
  const fullscreenIcon = icon("M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5");
  shadow.innerHTML = `<style>${globalThis.VKPhotoAppearance}</style>
    <button id="launch" hidden title="На весь экран · Alt+Enter">${fullscreenIcon}На весь экран</button>
    <section id="viewer" hidden tabindex="-1" role="dialog" aria-modal="true" aria-label="Полноэкранный просмотр фотографий">
      <canvas id="canvas" role="img" aria-label="Фотография VK"></canvas>
      <header class="top"><div class="identity"><strong>VK · Фотографии</strong><span id="info"></span><span id="enhance-status" role="status"></span></div>
        <div class="top-actions"><button id="fullscreen" title="Полный экран">${fullscreenIcon}</button>
          <button id="close" title="Закрыть · Esc" aria-label="Закрыть">${icon("M6 6l12 12M18 6 6 18")}</button></div></header>
      <button id="prev" class="nav" title="Предыдущая фотография · ←" aria-label="Предыдущая фотография">${icon("m15 5-7 7 7 7")}</button>
      <button id="next" class="nav" title="Следующая фотография · →" aria-label="Следующая фотография">${icon("m9 5 7 7-7 7")}</button>
      <div id="loading" role="status" hidden>Загрузка фотографии…</div>
      <div id="message" role="status" hidden></div>
      <footer class="bottom" aria-label="Масштаб и сглаживание">
        <button id="minus" title="Уменьшить · −" aria-label="Уменьшить">${icon("M5 12h14")}</button>
        <output id="zoom">100%</output>
        <button id="plus" title="Увеличить · +" aria-label="Увеличить">${icon("M12 5v14M5 12h14")}</button>
        <span class="separator"></span><button id="fit" title="Вписать целиком · 0">Вписать</button>
        <button id="actual" title="Исходный размер · 1">1:1</button><span class="separator"></span>
        <select id="smoothing" aria-label="Сглаживание" title="Плавное масштабирование">
          <option value="smooth">Плавно</option><option value="soft">Мягче</option></select>
        <span class="separator"></span>
        <div class="enhance-controls">
          <label class="enhance-toggle" title="Локальное ИИ-увеличение маленьких фото и автокоррекция яркости. Сними галочку для сравнения с оригиналом.">
            <input id="enhance" type="checkbox" checked>Улучшать фото</label>
          <select id="enhance-scale" aria-label="Множитель ИИ-увеличения" title="Увеличение разрешения фотографии нейросетью. ×3 и ×4 требуют больше времени; масштаб просмотра не меняется.">
            <option value="2">×2</option><option value="3">×3</option><option value="4">×4</option>
          </select>
        </div>
      </footer>
    </section>`;
  document.documentElement.append(host);
  const $ = id => shadow.getElementById(id);
  const panel = $("viewer"), canvas = $("canvas");
  const context = canvas.getContext("2d", { alpha: false });
  let opened = false, current = null, bitmap = null, key = "", imageToken = 0;
  let vw = 1, vh = 1, fitScale = 1, zoom = 1, panX = 0, panY = 0;
  let scheduled = null, paintFrame = 0, drag = null, returnFocus = null;
  let navigationTimer = null, messageTimer = null, forwarding = false;
  let fullscreenWasOurs = false, openingFullscreen = false, navigationBusy = false;
  let enhanced = null, enhanceJob = null, enhanceURL = "", enhanceLabel = "";

  function sendEnhancement(message) {
    return Promise.resolve().then(() => {
      if (!globalThis.chrome?.runtime?.id) throw new Error("Обнови расширение и вкладку VK");
      return chrome.runtime.sendMessage({ target: 'vk-photo-background', ...message });
    });
  }
  function cancelEnhancement(clear = false) {
    if (enhanceJob) sendEnhancement({ type: 'cancel', id: enhanceJob }).catch(() => {});
    enhanceJob = null;
    if (clear) { enhanced?.close(); enhanced = null; enhanceURL = ""; enhanceLabel = ""; }
  }
  async function decodeResult(data) {
    if (typeof data !== 'string' || !data.startsWith('data:image/png;base64,') || data.length > 40000000) throw new Error('Некорректный результат обработки');
    const raw = atob(data.slice(data.indexOf(',') + 1));
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    // Avoid an img[data:] dependency on the VK page's CSP.
    return createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  }
  async function enhancePhoto() {
    if (!opened || !bitmap || !$("enhance").checked || enhanceJob) return;
    if (enhanced) { $("enhance-status").textContent = enhanceLabel; queuePaint(); return; }
    const token = imageToken, id = crypto.randomUUID();
    enhanceJob = id;
    $("enhance-status").title = '';
    $("enhance-status").textContent = 'Подготовка улучшения…';
    try {
      const result = await sendEnhancement({ type: 'enhance', id, url: enhanceURL, scale: Number($("enhance-scale").value) });
      if (!opened || token !== imageToken || enhanceJob !== id || !$("enhance").checked) return;
      if (!result?.ok) {
        if (!result?.cancelled) $("enhance-status").textContent = 'Оригинал · ' + (result?.error || 'Улучшение недоступно');
        return;
      }
      const rendered = await decodeResult(result.data);
      if (!opened || token !== imageToken || enhanceJob !== id || !$("enhance").checked) { rendered.close(); return; }
      enhanced = rendered;
      enhanceLabel = `${result.label} · ${result.width} × ${result.height}`;
      $("enhance-status").title = result.aiError || 'Обработка выполнена локально';
      $("enhance-status").textContent = enhanceLabel; queuePaint();
    } catch (error) {
      if (opened && token === imageToken && enhanceJob === id) $("enhance-status").textContent = 'Оригинал · ' + error.message;
    } finally { if (enhanceJob === id) enhanceJob = null; }
  }
  if (globalThis.chrome?.runtime?.id) chrome.runtime.onMessage.addListener(message => {
    if (message?.target === 'vk-photo-progress' && message.id === enhanceJob && opened && $("enhance").checked)
      $("enhance-status").textContent = message.text;
  });

  const photoSelectors = [
    "#pv_photo img", "#pv_photo_wrap img", ".pv_photo img", ".pv_photo_wrap img",
    '[data-testid="photo-viewer-image"]', '[data-testid="photo_viewer_image"]',
    '[class*="PhotoViewer"] img', '[class*="PhotoView__"] img', '[class*="PhotoView_"] img',
    '[class*="MediaViewer"] img', '[role="dialog"] img', '[aria-modal="true"] img'
  ];
  const rootSelectors = '#pv_box, .pv_cont, [class*="PhotoViewer"], [class*="MediaViewer"], [role="dialog"], [aria-modal="true"]';
  const navSelectors = {
    prev: '#pv_left, #pv_nav_btn_left, .pv_left, .pv_left_wrap, [data-testid="photo_viewer_prev"], [data-testid="photo-viewer-prev"], [class*="PhotoViewer__prev"]',
    next: '#pv_right, #pv_nav_btn_right, .pv_right, .pv_right_wrap, [data-testid="photo_viewer_next"], [data-testid="photo-viewer-next"], [class*="PhotoViewer__next"]'
  };
  function visible(el) {
    if (!el?.isConnected || el.closest('[hidden], [aria-hidden="true"]')) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.display === "none" || s.visibility === "hidden" || s.opacity === "0") return false;
    }
    return rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
  }
  function safeURL(value) {
    if (!value) return "";
    try {
      const url = new URL(value, location.href);
      return ["https:", "http:", "blob:", "data:"].includes(url.protocol) ? url.href : "";
    } catch { return ""; }
  }
  function isPhotoLocation() {
    try { return /(?:^|[/?=&])photo-?\d+_\d+/.test(decodeURIComponent(location.href)); }
    catch { return false; }
  }
  function findPhoto() {
    let candidates = Array.from(document.querySelectorAll(photoSelectors.join(",")));
    if (!candidates.length && isPhotoLocation()) candidates = Array.from(document.querySelectorAll("main img, #content img, #page_body img"));
    const ranked = [];
    for (const img of new Set(candidates)) {
      if (!(img instanceof HTMLImageElement) || !visible(img)) continue;
      if (/(?:avatar|emoji|sticker|icon)/i.test(img.className + " " + (img.getAttribute("data-testid") || ""))) continue;
      const rect = img.getBoundingClientRect();
      if (rect.width < 100 || rect.height < 80) continue;
      const url = safeURL(img.currentSrc || img.src);
      if (!url) continue;
      const known = !!img.closest('#pv_photo, .pv_photo, #pv_photo_wrap, .pv_photo_wrap, [class*="PhotoViewer"], [class*="PhotoView_"]');
      ranked.push({ el: img, url, score: rect.width * rect.height * (known ? 20 : 1) });
    }
    ranked.sort((a, b) => b.score - a.score);
    if (!ranked.length) return null;
    const best = ranked[0];
    best.root = best.el.closest(rootSelectors) || best.el.closest('#pv_photo_wrap, .pv_photo_wrap')?.parentElement || best.el.parentElement;
    return best;
  }
  function sources(photo) {
    const result = [];
    const add = value => { const url = safeURL(value); if (url && !result.includes(url)) result.push(url); };
    // Use only URLs actually supplied by VK; never rewrite signed CDN URLs.
    const originals = photo.root?.querySelectorAll('a[href]') || [];
    for (const a of originals) {
      if (/^(?:оригинал|открыть оригинал|показать оригинал|original|open original)$/i.test(a.textContent.trim())) {
        const url = safeURL(a.href);
        if (/\.(?:jpe?g|png|webp|avif)(?:[?#]|$)/i.test(url)) add(url);
      }
    }
    const srcset = photo.el.getAttribute("srcset") || "";
    if (!srcset.startsWith("data:")) {
      srcset.split(",").map(part => part.trim().split(/\s+/))
        .sort((a,b) => (parseFloat(b[1]) || 0) - (parseFloat(a[1]) || 0))
        .forEach(pair => add(pair[0]));
    }
    add(photo.url);
    add(photo.el.src);
    return result;
  }
  function nativeNav(direction, photo = current) {
    if (!photo) return null;
    const selector = navSelectors[direction];
    let nodes = Array.from(document.querySelectorAll(selector));
    const scope = photo.root || document;
    const labelPattern = direction === "next"
      ? /(?:следующ(?:ая|ее)\s*(?:фото|изображение)|next\s*(?:photo|image)|впер[её]д)/i
      : /(?:предыдущ(?:ая|ее)\s*(?:фото|изображение)|previous\s*(?:photo|image)|назад)/i;
    nodes.push(...Array.from(scope.querySelectorAll('button, [role="button"], a[aria-label], a[title]'))
      .filter(el => labelPattern.test((el.getAttribute("aria-label") || "") + " " + (el.title || ""))));
    // Some VK versions put only a chevron or plain Next/Previous label in the button.
    nodes.push(...Array.from(scope.querySelectorAll('button, [role="button"]')).filter(el =>
      (direction === "next" ? /^(?:>|›|❯|следующая|далее|next)$/i : /^(?:<|‹|❮|предыдущая|previous)$/i)
        .test((el.getAttribute("aria-label") || el.textContent || "").trim())));
    return nodes.find(visible) || null;
  }
  function disabled(el) { return !!el && (el.disabled || el.getAttribute("aria-disabled") === "true" || el.classList.contains("disabled")); }
  function buttons() {
    $("prev").disabled = navigationBusy || disabled(nativeNav("prev"));
    $("next").disabled = navigationBusy || disabled(nativeNav("next"));
  }
  function notice(text, time = 4000) {
    clearTimeout(messageTimer);
    $("message").textContent = text;
    $("message").hidden = !text;
    if (text && time) messageTimer = setTimeout(() => { $("message").hidden = true; }, time);
  }
  function finishNavigation() {
    clearTimeout(navigationTimer); navigationTimer = null; navigationBusy = false; buttons();
  }
  function queuePaint() {
    if (paintFrame || !opened) return;
    paintFrame = requestAnimationFrame(() => { paintFrame = 0; draw(); });
  }
  function draw() {
    if (!opened) return;
    const rect = panel.getBoundingClientRect();
    vw = Math.max(1, rect.width); vh = Math.max(1, rect.height);
    const density = Math.min(devicePixelRatio || 1, 2, Math.sqrt(20000000 / (vw * vh)));
    const cw = Math.max(1, Math.round(vw * density)), ch = Math.max(1, Math.round(vh * density));
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    context.setTransform(cw / vw, 0, 0, ch / vh, 0, 0);
    context.filter = "none";
    context.fillStyle = "#0c0e12"; context.fillRect(0, 0, vw, vh);
    if (!bitmap) return;
    fitScale = G.fit(bitmap.naturalWidth, bitmap.naturalHeight, vw, vh);
    const scale = fitScale * zoom;
    const pan = G.constrain(panX, panY, bitmap.naturalWidth, bitmap.naturalHeight, vw, vh, scale);
    panX = pan.x; panY = pan.y;
    const width = bitmap.naturalWidth * scale, height = bitmap.naturalHeight * scale;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.filter = $("smoothing").value === "soft" && scale > 1 ? "blur(0.45px)" : "none";
    context.drawImage($("enhance").checked && enhanced ? enhanced : bitmap,
      (vw - width) / 2 + panX, (vh - height) / 2 + panY, width, height);
    context.filter = "none";
    $("zoom").textContent = `${Math.round(scale * 100)}%`;
    $("minus").disabled = zoom <= .1;
    $("plus").disabled = zoom >= 12;
  }
  function setZoom(value, x = vw / 2, y = vh / 2) {
    const next = G.clamp(value, .1, 12);
    panX = G.zoomAt(zoom, next, panX, x - vw / 2);
    panY = G.zoomAt(zoom, next, panY, y - vh / 2);
    zoom = next; queuePaint();
  }
  function fitImage() { zoom = 1; panX = panY = 0; queuePaint(); }
  function readImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const timer = setTimeout(() => { img.onload = img.onerror = null; img.src = ""; reject(new Error("timeout")); }, 10000);
      img.decoding = "async";
      img.onload = () => { clearTimeout(timer); resolve(img); };
      img.onerror = () => { clearTimeout(timer); reject(new Error("image")); };
      // No anonymous crossOrigin: existing browser session and normal image policy apply.
      img.src = url;
    });
  }
  async function loadPhoto(photo) {
    cancelEnhancement(true);
    $("enhance-status").textContent = $("enhance").checked ? 'Улучшение включено' : 'Оригинал';
    const token = ++imageToken;
    current = photo; key = photo.url; bitmap = null;
    $("loading").hidden = false; $("info").textContent = "Загрузка…";
    fitImage();
    // Paint the already-loaded VK image immediately, then upgrade if an original/srcset exists.
    if (photo.el.complete && photo.el.naturalWidth) {
      bitmap = photo.el; $("loading").hidden = true; queuePaint();
    }
    for (const url of sources(photo)) {
      try {
        const img = await readImage(url);
        if (!opened || token !== imageToken) return;
        bitmap = img;
        enhanceURL = url;
        $("loading").hidden = true;
        $("info").textContent = `${img.naturalWidth} × ${img.naturalHeight} · Колесо — масштаб · Перетаскивание — сдвиг`;
        canvas.setAttribute("aria-label", photo.el.alt || "Фотография VK");
        finishNavigation(); queuePaint(); enhancePhoto(); return;
      } catch { if (!opened || token !== imageToken) return; }
    }
    if (token !== imageToken) return;
    $("loading").hidden = true; finishNavigation();
    if (bitmap) {
      $("info").textContent = `${bitmap.naturalWidth} × ${bitmap.naturalHeight}`;
      queuePaint();
    } else notice("Не удалось загрузить фото. Закрой просмотр и открой фотографию в VK ещё раз.", 0);
  }
  function scan() {
    scheduled = null;
    const photo = findPhoto();
    $("launch").hidden = opened || !photo;
    if (!opened) { current = photo; return; }
    if (!photo) { close(); return; }
    if (key !== photo.url) loadPhoto(photo);
    else { current = photo; buttons(); }
  }
  function schedule() {
    if (scheduled === null) scheduled = setTimeout(scan, 120);
  }
  function fullscreenIsOurs() { return document.fullscreenElement === host || shadow.fullscreenElement === panel; }
  async function enterFullscreen() {
    if (!opened || fullscreenIsOurs() || openingFullscreen) return;
    openingFullscreen = true;
    try {
      await panel.requestFullscreen({ navigationUI: "hide" });
      if (!opened && fullscreenIsOurs()) await document.exitFullscreen();
      fullscreenWasOurs = opened && fullscreenIsOurs();
    } catch {
      if (opened) notice("Фото открыто на всё окно. Нажми кнопку ⛶ справа вверху для полного экрана.");
    } finally { openingFullscreen = false; queuePaint(); }
  }
  function open() {
    if (opened) return;
    const photo = findPhoto();
    if (!photo) return;
    returnFocus = document.activeElement;
    opened = true; panel.hidden = false; $("launch").hidden = true;
    panel.focus({ preventScroll: true });
    enterFullscreen(); // Direct trusted click/keyboard handler, before awaiting image loading.
    loadPhoto(photo); buttons();
  }
  function close() {
    if (!opened) return;
    opened = false; ++imageToken; key = ""; bitmap = null; drag = null;
    cancelEnhancement(true);
    panel.hidden = true; $("loading").hidden = true; notice(""); finishNavigation();
    canvas.classList.remove("dragging");
    fullscreenWasOurs = false;
    if (fullscreenIsOurs()) document.exitFullscreen().catch(() => {});
    if (returnFocus?.isConnected && returnFocus !== host) returnFocus.focus({ preventScroll: true });
    returnFocus = null; schedule();
  }
  function navigate(direction) {
    if (!opened || navigationBusy) return;
    const photo = findPhoto();
    if (!photo) { close(); return; }
    current = photo;
    const button = nativeNav(direction, photo);
    if (disabled(button)) return;
    navigationBusy = true; buttons();
    navigationTimer = setTimeout(() => {
      finishNavigation();
      if (opened) notice("VK не переключил фото. Возможно, это край альбома или снимок ещё загружается.");
    }, 3500);
    forwarding = true;
    try {
      if (button) button.click();
      else {
        const next = direction === "next";
        document.dispatchEvent(new KeyboardEvent("keydown", { key: next ? "ArrowRight" : "ArrowLeft",
          code: next ? "ArrowRight" : "ArrowLeft", keyCode: next ? 39 : 37, which: next ? 39 : 37,
          bubbles: true, cancelable: true }));
        document.dispatchEvent(new KeyboardEvent("keyup", { key: next ? "ArrowRight" : "ArrowLeft",
          code: next ? "ArrowRight" : "ArrowLeft", keyCode: next ? 39 : 37, which: next ? 39 : 37,
          bubbles: true, cancelable: true }));
      }
    } finally { forwarding = false; }
    schedule();
  }
  $("launch").addEventListener("click", open);
  $("close").addEventListener("click", close);
  $("fullscreen").addEventListener("click", enterFullscreen);
  $("prev").addEventListener("click", () => navigate("prev"));
  $("next").addEventListener("click", () => navigate("next"));
  $("plus").addEventListener("click", () => setZoom(zoom * 1.25));
  $("minus").addEventListener("click", () => setZoom(zoom / 1.25));
  $("fit").addEventListener("click", fitImage);
  $("actual").addEventListener("click", () => { zoom = G.clamp(1 / fitScale, .1, 12); panX = panY = 0; queuePaint(); });
  $("smoothing").addEventListener("change", queuePaint);
  $("enhance").addEventListener("change", () => {
    if ($("enhance").checked) enhancePhoto();
    else { cancelEnhancement(); $("enhance-status").textContent = 'Оригинал'; }
    queuePaint();
  });
  $("enhance-scale").addEventListener("change", () => {
    cancelEnhancement();
    enhanced?.close(); enhanced = null; enhanceLabel = '';
    if ($("enhance").checked) enhancePhoto();
    queuePaint();
  });
  panel.addEventListener("wheel", event => {
    event.preventDefault(); event.stopPropagation();
    const amount = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? vh : 1);
    setZoom(zoom * Math.exp(-G.clamp(amount, -500, 500) * .0015), event.clientX, event.clientY);
  }, { passive: false });
  canvas.addEventListener("dblclick", event => zoom > 1.05 ? fitImage() : setZoom(2, event.clientX, event.clientY));
  canvas.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, px: panX, py: panY };
    canvas.setPointerCapture(event.pointerId); canvas.classList.add("dragging"); event.preventDefault();
  });
  canvas.addEventListener("pointermove", event => {
    if (!drag || drag.id !== event.pointerId) return;
    panX = drag.px + event.clientX - drag.x; panY = drag.py + event.clientY - drag.y; queuePaint();
  });
  const endDrag = () => { drag = null; canvas.classList.remove("dragging"); };
  canvas.addEventListener("pointerup", endDrag); canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("lostpointercapture", endDrag);
  window.addEventListener("keydown", event => {
    if (forwarding) return;
    const typing = event.composedPath().some(el => el instanceof HTMLElement &&
      (el.isContentEditable || /^(?:INPUT|TEXTAREA|SELECT)$/.test(el.tagName)));
    if (!opened) {
      if (!typing && event.altKey && event.key === "Enter" && findPhoto()) {
        event.preventDefault(); event.stopImmediatePropagation(); open();
      }
      return;
    }
    if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close(); return; }
    if (typing) { event.stopPropagation(); return; }
    const actions = { ArrowLeft: () => navigate("prev"), ArrowRight: () => navigate("next"),
      "+": () => setZoom(zoom * 1.25), "=": () => setZoom(zoom * 1.25),
      "-": () => setZoom(zoom / 1.25), "0": fitImage,
      "1": () => $("actual").click(), f: enterFullscreen, F: enterFullscreen };
    if (actions[event.key]) { event.preventDefault(); event.stopImmediatePropagation(); actions[event.key](); }
    else if (event.key === "Tab") {
      event.preventDefault(); event.stopImmediatePropagation();
      const buttons = Array.from(panel.querySelectorAll("button,select,input")).filter(b => !b.disabled && !b.hidden);
      const index = buttons.indexOf(shadow.activeElement);
      buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
    }
  }, true);
  document.addEventListener("fullscreenchange", () => {
    if (fullscreenIsOurs()) fullscreenWasOurs = true;
    else if (fullscreenWasOurs && opened) close();
    queuePaint();
  });
  window.addEventListener("resize", queuePaint);
  window.addEventListener("popstate", schedule);
  document.addEventListener("load", event => { if (event.target instanceof HTMLImageElement) schedule(); }, true);
  const observer = new MutationObserver(records => {
    if (records.some(r => r.target !== host && !host.contains(r.target))) schedule();
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true,
    attributeFilter: ["src", "srcset", "class", "style", "hidden", "aria-hidden", "aria-disabled"] });
  // Covers SPA navigation which changes history without changing the image DOM immediately.
  setInterval(() => { if (!document.hidden) schedule(); }, 1600);
  scan();
})();
