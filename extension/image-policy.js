export function isVKPage(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && /(^|\.)vk\.(com|ru)$/.test(u.hostname); }
  catch { return false; }
}
export function permittedImage(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return false;
    return ['userapi.com', 'vkuserphoto.ru', 'vkuserphoto.com', 'vk-cdn.net', 'vkuser.net', 'vk.ru', 'vk.com']
      .some(domain => u.hostname === domain || u.hostname.endsWith('.' + domain));
  } catch { return false; }
}
