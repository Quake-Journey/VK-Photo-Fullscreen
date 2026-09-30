const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { gallery, picture } = require('./browser.test.cjs');
const root = path.resolve(__dirname, '..');
const extensionPath = path.resolve(process.env.EXTENSION_PATH || path.join(root, 'extension'));

(async () => {
  // Chrome's test-only extension API, in an ephemeral profile, not the user's Chrome.
  const context = await chromium.launchPersistentContext('', {
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true, viewport: { width: 1280, height: 800 },
    args: ['--mute-audio', '--enable-unsafe-extension-debugging'], ignoreDefaultArgs: ['--disable-extensions']
  });
  try {
    const cdp = await context.browser().newBrowserCDPSession();
    const loaded = await cdp.send('Extensions.loadUnpacked', { path: extensionPath });
    assert.ok(loaded.id);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://images.test/**', route => route.fulfill({ contentType: 'image/svg+xml', body: picture(route.request().url()) }));
    await page.route('https://vk.ru/**', route => route.fulfill({ contentType: 'text/html', body: gallery('legacy'),
      headers: { 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src https://images.test; require-trusted-types-for 'script'" }
    }));
    await page.goto('https://vk.ru/photo-100_1');
    const host = page.locator('#vk-photo-fullscreen-extension');
    await host.locator('#launch').waitFor({ state: 'visible', timeout: 7000 });
    await host.locator('#launch').click();
    await host.locator('#info').filter({ hasText: '600 × 400' }).waitFor();
    await page.waitForFunction(() => document.fullscreenElement?.id === 'vk-photo-fullscreen-extension');
    await host.locator('#next').click();
    await page.waitForFunction(() => window.index === 2);
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => window.moves), 1);
    await host.locator('#close').click();
    await host.locator('#viewer').waitFor({ state: 'hidden' });
    assert.deepEqual(errors, []);
    await page.route('https://example.org/**', route => route.fulfill({ contentType: 'text/html', body: gallery('legacy') }));
    await page.goto('https://example.org/');
    assert.equal(await page.locator('#vk-photo-fullscreen-extension').count(), 0);
    const result = { extensionId: loaded.id, extensionPath, result: 'PASS', actualManifestInstalled: true,
      strictCSPAndTrustedTypes: true, automaticVKInjection: true, fullscreenAndAlbumNavigation: true,
      unrelatedSitesUntouched: true, userProfileAccessed: false };
    fs.writeFileSync(path.join(root, 'test-results/extension.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally { await context.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
