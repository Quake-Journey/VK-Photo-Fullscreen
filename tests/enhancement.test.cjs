const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { gallery } = require('./browser.test.cjs');
const root = path.resolve(__dirname, '..');

(async () => {
  const context = await chromium.launchPersistentContext('', {
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true, viewport: { width: 1280, height: 800 },
    args: ['--mute-audio', '--enable-unsafe-extension-debugging', '--enable-unsafe-swiftshader'],
    ignoreDefaultArgs: ['--disable-extensions']
  });
  const start = performance.now(), requests = [];
  try {
    context.on('request', r => { if (r.url().startsWith('http')) requests.push(r.url()); });
    const cdp = await context.browser().newBrowserCDPSession();
    await cdp.send('Extensions.loadUnpacked', { path: path.join(root, 'extension') });
    const page = await context.newPage();
    const data = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 192; c.height = 128;
      const g = c.getContext('2d');
      const gradient = g.createLinearGradient(0,0,192,128);
      gradient.addColorStop(0,'#fce9ca'); gradient.addColorStop(1,'#babac9');
      g.fillStyle = gradient; g.fillRect(0,0,192,128);
      g.fillStyle = '#978778'; g.beginPath(); g.arc(90,70,26,0,Math.PI*2);g.fill();
      g.fillStyle='#ddd5c9';g.font='14px sans-serif';g.fillText('VK test',15,30);
      return c.toDataURL('image/png');
    });
    const png = Buffer.from(data.split(',')[1], 'base64');
    // Offscreen documents are CDP "other" targets, outside Playwright's page routes.
    // Intercept the CDN there as well; never request real user photos in this test.
    let commandId = 1;
    const child = (sessionId, method, params = {}) => cdp.send('Target.sendMessageToTarget', {
      sessionId, message: JSON.stringify({ id: commandId++, method, params })
    }).catch(() => {});
    cdp.on('Target.targetCreated', async event => {
      if (event.targetInfo.type !== 'other') return;
      const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: event.targetInfo.targetId, flatten: false });
      await child(sessionId, 'Fetch.enable', { patterns: [{ urlPattern: 'https://sun1.userapi.com/*' }] });
    });
    cdp.on('Target.receivedMessageFromTarget', event => {
      const message = JSON.parse(event.message);
      if (message.method !== 'Fetch.requestPaused') return;
      requests.push(message.params.request.url);
      child(event.sessionId, 'Fetch.fulfillRequest', { requestId: message.params.requestId,
        responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'image/png' }], body: png.toString('base64') });
    });
    await cdp.send('Target.setDiscoverTargets', { discover: true });
    await context.route('https://sun1.userapi.com/**', route => route.fulfill({ contentType: 'image/png', body: png }));
    const html = gallery('legacy').replaceAll('images.test','sun1.userapi.com');
    await context.route('https://vk.ru/**', route => route.fulfill({ contentType: 'text/html', body: html,
      headers: { 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src https://sun1.userapi.com; require-trusted-types-for 'script'" }
    }));
    await page.goto('https://vk.ru/photo-100_1');
    const host = page.locator('#vk-photo-fullscreen-extension');
    await host.locator('#launch').click();
    assert.ok(await host.locator('#enhance').isChecked());
    assert.equal(await host.locator('#enhance-scale').inputValue(), '2');
    const status = host.locator('#enhance-status');
    const waitResult = () => page.waitForFunction(() => /автокоррекция|Автокоррекция|Оригинал ·/.test(document.getElementById('vk-photo-fullscreen-extension').shadowRoot.getElementById('enhance-status').textContent), null, { timeout: 90000 });
    await waitResult();
    const label = await status.innerText(), detail = await status.getAttribute('title');
    assert.ok(label.includes('ИИ ×2 + автокоррекция') && label.includes('384 × 256'), `${label} / ${detail}`);
    const scale = await host.locator('#zoom').innerText();
    await page.screenshot({ path: path.join(root,'test-results/enhanced.png') });
    await host.locator('#enhance').uncheck();
    assert.equal(await status.innerText(), 'Оригинал');
    assert.equal(await host.locator('#zoom').innerText(), scale);
    await page.screenshot({ path: path.join(root,'test-results/original.png') });
    const before = requests.length;
    await host.locator('#enhance').check();
    assert.ok((await status.innerText()).includes('ИИ ×2'));
    assert.equal(requests.length, before, 'Cached comparison must not redownload/reprocess');
    const results = [label];
    for (const multiplier of [3, 4]) {
      await host.locator('#enhance-scale').selectOption(String(multiplier));
      await waitResult();
      const text = await status.innerText();
      assert.ok(text.includes(`ИИ ×${multiplier} + автокоррекция`) && text.includes(`${192 * multiplier} × ${128 * multiplier}`), text);
      assert.equal(await host.locator('#zoom').innerText(), scale, 'AI multiplier must preserve view geometry');
      results.push(text);
    }
    await page.screenshot({ path: path.join(root,'test-results/enhanced-4x.png') });
    await host.locator('#enhance').uncheck();
    await host.locator('#enhance-scale').selectOption('3');
    await page.waitForTimeout(100);
    assert.equal(await status.innerText(), 'Оригинал', 'Changing multiplier while off must not enhance');
    await host.locator('#enhance').check();
    await waitResult();
    assert.ok((await status.innerText()).includes('576 × 384'), 'Do not reuse cached 4x for 3x');
    // Supersede in-flight requests; only the last selected model may update the photo.
    await host.locator('#enhance-scale').selectOption('2');
    await host.locator('#enhance-scale').selectOption('4');
    await host.locator('#enhance-scale').selectOption('3');
    await waitResult();
    assert.ok((await status.innerText()).includes('ИИ ×3 + автокоррекция'));
    await page.waitForTimeout(150);
    assert.ok((await status.innerText()).includes('576 × 384'), 'Stale scale result must not replace the latest');
    await host.locator('#next').click();
    await page.waitForFunction(() => window.index === 2);
    await host.locator('#enhance').uncheck();
    await page.waitForTimeout(350);
    assert.equal(await status.innerText(), 'Оригинал');
    await host.locator('#close').click();
    const onlineHosts = [...new Set(requests.map(u => new URL(u).hostname))];
    assert.ok(onlineHosts.every(h => ['vk.ru','sun1.userapi.com'].includes(h)),onlineHosts);
    const result = { result:'PASS', defaultOn:true, realLocalModel:true, label,
      modelResults: results, changeScalePreservesZoom: true, rapidScaleChanges: true, scaleWhileOff: true,
      milliseconds: Math.round(performance.now()-start), CSPWithoutDataImages:true,
      originalTogglePreservesZoom:true, cachedToggleDoesNotReload:true, cancelOnToggleAndNavigate:true,
      onlineHosts, modelCDNDownloads:0, photosUploaded:0 };
    fs.writeFileSync(path.join(root,'test-results/enhancement.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify(result,null,2));
  } finally { await context.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
