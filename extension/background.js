import { isVKPage, permittedImage } from './image-policy.js';
let creating;
const active = new Map();
async function processor() {
  const url = chrome.runtime.getURL('processor.html');
  if ((await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [url] })).length) return;
  if (!creating) {
    creating = chrome.offscreen.createDocument({ url: 'processor.html', reasons: ['BLOBS'],
      justification: 'Decode the selected VK photo and run the bundled image enhancement model locally.' });
    creating.finally(() => { creating = null; }).catch(() => {});
  }
  await creating;
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.target !== 'vk-photo-background' || sender.id !== chrome.runtime.id) return;
  if (message.type === 'progress' && sender.url === chrome.runtime.getURL('processor.html')) {
    const job = active.get(message.owner);
    if (job?.id === message.id) chrome.tabs.sendMessage(job.tab, {
      target: 'vk-photo-progress', id: job.id, text: String(message.text).slice(0, 140)
    }, { frameId: job.frame }).catch(() => {});
    return;
  }
  if (!sender.tab || !isVKPage(sender.url)) { reply({ ok: false, error: 'Недопустимый источник запроса.' }); return; }
  const owner = `${sender.tab.id}:${sender.frameId}`;
  if (message.type === 'cancel') {
    const job = active.get(owner);
    if (job && job.id === message.id) {
      active.delete(owner);
      chrome.runtime.sendMessage({ target: 'vk-photo-processor', type: 'cancel', owner, id: job.id }).catch(() => {});
    }
    reply({ ok: true }); return;
  }
  const scale = message.scale ?? 2;
  if (message.type !== 'enhance' || ![2, 3, 4].includes(scale) || !/^[a-zA-Z0-9-]{1,80}$/.test(message.id || '') || !permittedImage(message.url)) {
    reply({ ok: false, error: 'Для этого адреса изображения обработка недоступна.' }); return;
  }
  const previous = active.get(owner);
  if (previous) chrome.runtime.sendMessage({ target: 'vk-photo-processor', type: 'cancel', owner, id: previous.id }).catch(() => {});
  active.set(owner, { id: message.id, tab: sender.tab.id, frame: sender.frameId });
  (async () => {
    try {
      await processor();
      if (active.get(owner)?.id !== message.id) return { ok: false, cancelled: true };
      return await chrome.runtime.sendMessage({ target: 'vk-photo-processor', type: 'enhance',
        owner, id: message.id, url: message.url, scale });
    } catch (error) { return { ok: false, error: 'Обработка недоступна: ' + String(error.message).slice(0, 160) }; }
    finally { if (active.get(owner)?.id === message.id) active.delete(owner); }
  })().then(reply);
  return true;
});
