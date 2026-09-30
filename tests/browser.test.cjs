const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const scripts = ['geometry.js', 'appearance.js', 'viewer.js'].map(f => fs.readFileSync(path.join(root, 'extension', f), 'utf8'));
const out = path.join(root, 'test-results');
fs.mkdirSync(out, { recursive: true });
const results = [];
const record = name => { results.push(name); console.log('PASS:', name); };

function gallery(kind = 'legacy') {
  const modern = kind === 'modern', keys = kind === 'keys';
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><title>VK viewer fixture</title>
  <style>body{margin:0;background:#242936;color:white;font:16px sans-serif}main{padding:30px}
  #gallery{margin:100px auto;width:850px;height:520px;background:#303541;padding:25px;position:relative}
  #photo-wrap{display:flex;align-items:center;justify-content:center;height:420px}
  #photo-wrap img{width:540px;height:360px;object-fit:contain}button{width:45px;height:55px}
  .original-arrow{position:absolute;top:240px}#pv_left,[data-dir=prev]{left:10px}#pv_right,[data-dir=next]{right:10px}
  #avatar{width:120px;height:120px;position:absolute;right:20px;top:20px}
  </style><main><h1>Тест альбома</h1><div id="gallery" ${modern ? 'role="dialog" aria-modal="true"' : 'class="pv_cont"'}>
    <div id="photo-wrap"><div ${modern ? 'class="MediaViewer__content"' : 'id="pv_photo"'}><img id="subject" src="https://images.test/1.svg" alt="Тестовая фотография"></div></div>
    ${keys ? '' : `<button ${modern ? 'data-dir="prev" aria-label="Предыдущая фотография"' : 'id="pv_left"'} class="original-arrow">‹</button>
    <button ${modern ? 'data-dir="next" aria-label="Следующая фотография"' : 'id="pv_right"'} class="original-arrow">›</button>`}
    <a id="original" href="https://images.test/1.svg" hidden>Оригинал</a>
    <img id="avatar" class="avatar" src="https://images.test/avatar.svg"></div></main>
  <script>
    window.index=1;window.moves=0;window.pageEscape=0;
    window.move=(d)=>{window.index=Math.max(1,Math.min(3,window.index+d));window.moves++;
      document.getElementById('subject').src='https://images.test/'+window.index+'.svg';
      history.replaceState({},'', '/photo-100_'+window.index); update();};
    function update(){document.querySelector('[data-dir=prev],#pv_left')?.toggleAttribute('disabled',window.index===1);
      document.querySelector('[data-dir=next],#pv_right')?.toggleAttribute('disabled',window.index===3);}
    document.querySelector('[data-dir=prev],#pv_left')?.addEventListener('click',()=>move(-1));
    document.querySelector('[data-dir=next],#pv_right')?.addEventListener('click',()=>move(1));
    document.addEventListener('keydown',e=>{if(e.key==='Escape')window.pageEscape++;
      if(e.key==='ArrowRight')move(1);if(e.key==='ArrowLeft')move(-1);}); update();
  </script></html>`;
}
function picture(url) {
  const n = url.includes('2.svg') ? 2 : url.includes('3.svg') ? 3 : 1;
  const large = url.includes('large');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${large ? 1600 : 600}" height="${large ? 1000 : 400}" viewBox="0 0 600 400">
    <defs><linearGradient id="g"><stop stop-color="${['','#395d84','#81415c','#2f7976'][n]}"/><stop offset="1" stop-color="#151b28"/></linearGradient></defs>
    <rect width="600" height="400" fill="url(#g)"/><circle cx="450" cy="130" r="70" fill="#ffffff45"/>
    <path d="M0 400 180 180 300 330 400 220 600 400Z" fill="#ddeeff45"/>
    <text x="40" y="80" fill="white" font-size="28" font-family="sans-serif">Photo ${n}</text></svg>`;
}
async function setup(browser, kind, fullscreenAllowed = true) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://vk.ru/**', route => route.fulfill({ contentType: 'text/html', body: gallery(kind) }));
  await page.route('https://images.test/**', route => route.fulfill({ contentType: 'image/svg+xml', body: picture(route.request().url()) }));
  await page.goto('https://vk.ru/photo-100_1');
  if (!fullscreenAllowed) await page.evaluate(() => {
    Element.prototype.requestFullscreen = () => Promise.reject(new Error('test denied'));
  });
  for (const script of scripts) await page.addScriptTag({ content: script });
  const launch = page.locator('#vk-photo-fullscreen-extension').locator('#launch');
  await launch.waitFor({ state: 'visible' });
  return { context, page, errors, launch, viewer: page.locator('#vk-photo-fullscreen-extension').locator('#viewer') };
}

module.exports = { gallery, picture };
if (require.main === module) (async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'extension/manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['offscreen']);
  assert.ok(manifest.host_permissions.every(m => m.startsWith('https://*.') && m !== 'https://*/*'));
  assert.ok(manifest.content_scripts[0].matches.every(m => /vk\.(?:com|ru)\//.test(m)));
  for (const name of manifest.content_scripts[0].js) assert.ok(fs.existsSync(path.join(root,'extension',name)));
  record('manifest: local files, VK/CDN allowlist, no cookie/history/debug permissions');

  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true, args: ['--mute-audio'] });
  try {
    const a = await setup(browser, 'legacy');
    await a.launch.click();
    await a.page.waitForFunction(() => document.fullscreenElement?.id === 'vk-photo-fullscreen-extension');
    await a.viewer.locator('#info').filter({ hasText: '600 × 400' }).waitFor();
    record('legacy VK photo: actual Fullscreen API entered and image loaded');
    assert.equal(await a.viewer.locator('#prev').isDisabled(), true);
    const canvasState = await a.viewer.locator('canvas').evaluate(c => ({
      w:c.width,h:c.height,quality:c.getContext('2d').imageSmoothingQuality,smooth:c.getContext('2d').imageSmoothingEnabled
    }));
    assert.ok(canvasState.w >= 1280 && canvasState.h >= 800 && canvasState.smooth);
    assert.equal(canvasState.quality, 'high');
    record('small image fills viewport; high quality interpolation and native edge state');
    await a.viewer.locator('#plus').click();
    await a.page.waitForFunction(() => parseFloat(document.getElementById('vk-photo-fullscreen-extension').shadowRoot.getElementById('zoom').textContent) > 200);
    const z = parseFloat(await a.viewer.locator('#zoom').innerText());
    assert.ok(z > 200);
    await a.page.mouse.move(600, 400); await a.page.mouse.wheel(0, -220);
    await a.page.waitForTimeout(80);
    assert.ok(parseFloat(await a.viewer.locator('#zoom').innerText()) > z);
    await a.page.mouse.down(); await a.page.mouse.move(720, 450); await a.page.mouse.up();
    await a.viewer.locator('#actual').click();
    await a.page.waitForTimeout(80);
    assert.equal(await a.viewer.locator('#zoom').innerText(), '100%');
    record('zoom buttons, mouse wheel, drag, original-size button');
    await a.viewer.locator('#fit').click();
    await a.viewer.locator('#next').click();
    await a.page.waitForFunction(() => window.index === 2);
    await a.page.waitForTimeout(300);
    assert.equal(await a.page.evaluate(() => window.moves), 1);
    assert.ok(await a.viewer.isVisible());
    await a.page.keyboard.press('ArrowRight');
    await a.page.waitForFunction(() => window.index === 3);
    await a.page.waitForTimeout(250);
    assert.equal(await a.page.evaluate(() => window.moves), 2);
    assert.ok(await a.viewer.locator('#next').isDisabled());
    record('VK buttons and keyboard move exactly once; full screen persists; album ends disabled');
    await a.viewer.locator('#smoothing').selectOption('soft');
    await a.page.screenshot({ path: path.join(out, 'fullscreen.png') });
    await a.viewer.locator('#close').click();
    await a.page.waitForFunction(() => !document.fullscreenElement);
    assert.equal(await a.page.evaluate(() => window.index), 3);
    await a.page.keyboard.press('Alt+Enter');
    await a.viewer.waitFor({ state: 'visible' });
    await a.page.keyboard.press('Escape');
    await a.viewer.waitFor({ state: 'hidden' });
    assert.equal(await a.page.evaluate(() => window.pageEscape), 0);
    record('close restores VK at same photo; Alt+Enter/Escape do not dismiss original viewer');
    assert.deepEqual(a.errors, []);
    await a.context.close();

    const b = await setup(browser, 'modern', false);
    await b.launch.click();
    await b.viewer.locator('#info').filter({ hasText: '600 × 400' }).waitFor();
    assert.ok(await b.viewer.locator('#message').isVisible());
    await b.viewer.locator('#next').click();
    await b.page.waitForFunction(() => window.index === 2);
    await b.page.waitForTimeout(250);
    assert.equal(await b.page.evaluate(() => window.moves), 1);
    record('modern dialog + Russian aria navigation; denied fullscreen stays usable');
    await b.page.evaluate(() => { document.getElementById('gallery').hidden = true; });
    await b.viewer.waitFor({ state: 'hidden' });
    await b.launch.waitFor({ state: 'hidden' });
    assert.deepEqual(b.errors, []);
    record('closing native SPA photo viewer cleans up extension overlay');
    await b.context.close();

    const c = await setup(browser, 'keys', false);
    await c.launch.click();
    await c.viewer.locator('#info').filter({ hasText: '600 × 400' }).waitFor();
    await c.viewer.locator('#next').click();
    await c.page.waitForFunction(() => window.index === 2);
    await c.page.waitForTimeout(250);
    assert.equal(await c.page.evaluate(() => window.moves), 1);
    record('native keyboard fallback with no recognized arrow elements');
    await c.page.evaluate(() => {
      const img = document.getElementById('subject');
      img.srcset = 'https://images.test/1.svg 600w, https://images.test/large.svg 1600w';
      img.sizes = '1600px';
    });
    await c.viewer.locator('#info').filter({ hasText: '1600 × 1000' }).waitFor();
    record('uses larger VK srcset source without modifying CDN URLs');
    assert.deepEqual(c.errors, []);
    await c.context.close();
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ browser: await browser.version(), passed: results,
      limitation: 'Synthetic VK DOM fixtures, not the user authenticated VK album. Browser was headless with a separate profile.' }, null, 2));
    console.log(`\n${results.length} browser checks passed.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
