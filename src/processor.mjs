import * as tf from '@tensorflow/tfjs';
import Upscaler from 'upscaler';
import slim2 from '@upscalerjs/esrgan-slim/2x';
import slim3 from '@upscalerjs/esrgan-slim/3x';
import slim4 from '@upscalerjs/esrgan-slim/4x';
import { permittedImage } from '../extension/image-policy.js';
import { correctTone } from './tone.mjs';

const definitions = { 2: slim2, 3: slim3, 4: slim4 };
let modelPromise, modelScale, queue = Promise.resolve();
const jobs = new Map();
let idleTimer;
const pause = () => new Promise(resolve => setTimeout(resolve, 0));
function progress(job, text) {
  chrome.runtime.sendMessage({ target: 'vk-photo-background', type: 'progress', owner: job.owner, id: job.id, text }).catch(() => {});
}
function ensureActive(job) { if (job.abort.signal.aborted) throw new DOMException('Cancelled', 'AbortError'); }
async function model(scale) {
  // Jobs are serial: release the previous model before loading another multiplier.
  if (modelPromise && modelScale !== scale) {
    const previous = modelPromise; modelPromise = null;
    try { await (await previous).dispose(); } catch {}
  }
  modelScale = scale;
  if (!modelPromise) modelPromise = (async () => {
    if (!await tf.setBackend('webgl')) throw new Error('WebGL недоступен');
    await tf.ready();
    const upscaler = new Upscaler({ model: { ...definitions[scale], path: chrome.runtime.getURL(`models/esrgan-slim-${scale}x/model.json`) } });
    await upscaler.getModel();
    return upscaler;
  })().catch(error => { modelPromise = null; throw error; });
  return modelPromise;
}
function canvas(width, height) {
  const result = document.createElement('canvas'); result.width = width; result.height = height; return result;
}
async function imageBytes(url, signal) {
  if (!permittedImage(url)) throw new Error('Источник изображения не разрешён');
  const response = await fetch(url, { credentials: 'include', signal, redirect: 'error', cache: 'force-cache' });
  if (!response.ok) throw new Error('Не удалось получить фото: HTTP ' + response.status);
  if (!/^image\/(jpeg|png|webp|avif|gif|bmp)(?:;|$)/i.test(response.headers.get('content-type') || '')) throw new Error('Этот формат не поддерживает улучшение');
  if (Number(response.headers.get('content-length')) > 20000000) throw new Error('Фото слишком большое для обработки');
  const reader = response.body.getReader(), parts = []; let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      total += value.length;
      if (total > 20000000) { await reader.cancel(); throw new Error('Фото слишком большое для обработки'); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  return new Blob(parts, { type: response.headers.get('content-type') });
}
async function process(job) {
  let decoded, input, output, aiTensor;
  const deadline = setTimeout(() => job.abort.abort(), 90000);
  try {
    ensureActive(job); progress(job, 'Подготовка фотографии…');
    decoded = await createImageBitmap(await imageBytes(job.url, job.abort.signal));
    ensureActive(job);
    const width = decoded.width, height = decoded.height, scale = job.scale;
    if (width * height > 12000000) throw new Error('Для фото больше 12 Мп оставлен оригинал');
    input = canvas(width, height);
    input.getContext('2d').drawImage(decoded, 0, 0);
    output = input;
    let usedAI = false, aiError = '';
    const outputTooLarge = width * height * scale * scale > 12000000;
    // No downsampling of a good large original to feed the small-photo model.
    if (width * height <= 900000 && Math.max(width, height) <= 1400 && !outputTooLarge) {
      progress(job, `Загрузка локальной модели ИИ ×${scale}…`);
      try {
        const upscaler = await model(scale); ensureActive(job);
        let lastPercent = -1;
        aiTensor = await upscaler.upscale(input, { output: 'tensor', patchSize: 64, padding: 6,
          signal: job.abort.signal, awaitNextFrame: true,
          progress: amount => {
            const percent = Math.round(amount * 100);
            if (percent !== lastPercent) { lastPercent = percent; progress(job, `ИИ: увеличение ×${scale} — ${percent}%`); }
          }
        });
        ensureActive(job);
        output = canvas(width * scale, height * scale);
        // ESRGAN Slim emits float RGB in 0..255; toPixels interprets floats as 0..1.
        const pixels = tf.tidy(() => aiTensor.clipByValue(0, 255).round().toInt());
        try { await tf.browser.toPixels(pixels, output); }
        finally { pixels.dispose(); }
        // Restrain neural ringing on faces/text without discarding the detail gain.
        const ctx = output.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.globalAlpha = .15;
        ctx.drawImage(input, 0, 0, output.width, output.height); ctx.globalAlpha = 1;
        usedAI = true;
      } catch (error) {
        ensureActive(job); aiError = String(error.message).slice(0, 180); output = input;
      } finally { aiTensor?.dispose(); aiTensor = null; }
    }
    ensureActive(job); progress(job, 'Коррекция яркости и контраста…'); await pause();
    const ctx = output.getContext('2d', { willReadFrequently: true });
    const raster = ctx.getImageData(0, 0, output.width, output.height);
    const tone = correctTone(raster.data); ctx.putImageData(raster, 0, 0);
    ensureActive(job);
    const data = output.toDataURL('image/png');
    if (data.length > 40000000) throw new Error('Результат слишком большой — уменьши множитель');
    return { ok: true, data, width: output.width, height: output.height,
      usedAI, aiError, tone, label: usedAI ? `ИИ ×${scale} + автокоррекция` : aiError ? 'Автокоррекция · ИИ недоступен'
        : `Автокоррекция · фото слишком большое для ИИ ×${scale}` };
  } catch (error) {
    return { ok: false, cancelled: job.abort.signal.aborted, error: String(error.message).slice(0, 200) };
  } finally {
    clearTimeout(deadline); decoded?.close(); aiTensor?.dispose();
    if (input) input.width = input.height = 1;
    if (output && output !== input) output.width = output.height = 1;
  }
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || sender.tab || message?.target !== 'vk-photo-processor') return;
  if (message.type === 'cancel') {
    const job = jobs.get(message.owner);
    if (job?.id === message.id) job.abort.abort();
    reply({ ok: true }); return;
  }
  if (message.type !== 'enhance' || !permittedImage(message.url)) return;
  if (![2, 3, 4].includes(message.scale)) { reply({ ok: false, error: 'Недопустимый множитель ИИ.' }); return; }
  clearTimeout(idleTimer);
  const old = jobs.get(message.owner); old?.abort.abort();
  if (jobs.size >= 4 && !old) { reply({ ok: false, error: 'Обработка занята в других вкладках.' }); return; }
  const job = { ...message, abort: new AbortController() }; jobs.set(job.owner, job);
  const task = queue.then(() => process(job));
  queue = task.catch(() => {});
  task.then(reply).finally(() => {
    if (jobs.get(job.owner) === job) jobs.delete(job.owner);
    if (!jobs.size) idleTimer = setTimeout(async () => {
      if (jobs.size) return;
      const pending = modelPromise; modelPromise = null;
      try { await (await pending)?.dispose(); } catch {}
    }, 60000);
  });
  return true;
});
