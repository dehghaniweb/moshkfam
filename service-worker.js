// Service Worker مشکفام — V1.0.64
//
// کار این فایل:
//  ۱) صفحهٔ اصلی: اول از شبکه (تازه) گرفته می‌شود؛ اگر تا ۴ ثانیه جواب نیامد (اینترنت کند یا قطع) نسخهٔ ذخیره‌شده نشان داده می‌شود.
//  ۲) تصویرها و آیکون‌ها: از حافظه می‌آیند و پشت‌صحنه تازه می‌شوند (دوباره دانلود نشدن لوگوی ۱۱۱ کیلوبایتی).
//
// فایل‌های ظاهر و برنامه (style.css، theme.css، app-1..4.js، admin-ui.js) عمداً اینجا ذخیره نمی‌شوند؛ آن‌ها را خود صفحه
// (MoshkfamAssets در index.html) به‌صورت یک نسخهٔ کامل و هماهنگ در Cache Storage با نام moshkfam-assets-* نگه می‌دارد.
// قبلاً هر درخواست با آدرس یکتای ?_nocache=... اینجا ذخیره می‌شد و حافظه بی‌حساب بزرگ می‌شد، بدون اینکه هیچ‌وقت دوباره استفاده شود.

const CACHE_PREFIX = "moshkfam-shell-";
const CACHE = CACHE_PREFIX + "v6-20261101";
const INDEX_KEY = "./index.html";
const SHELL = [INDEX_KEY, "./manifest.json", "./images/logo.png", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/favicon-64.png", "./icons/apple-touch-icon.png"];
const NAV_TIMEOUT_MS = 4000;

// نصب: هر فایل جداگانه ذخیره می‌شود؛ نبودن یکی از آن‌ها کل نصب را خراب نمی‌کند.
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.all(SHELL.map(url => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

// فعال‌سازی: فقط پوسته‌های قدیمی همین برنامه (پیشوند moshkfam-shell-) پاک می‌شوند.
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function navigationResponse(event, request) {
  let cacheWrite = Promise.resolve();
  // no-cache: بعد از هر انتشار، صفحهٔ تازه بلافاصله دیده شود (درخواست شرطی؛ اگر تغییری نباشد تقریباً بدون حجم است).
  // بدنهٔ صفحه کامل خوانده می‌شود (نه فقط هدر)؛ وگرنه روی اینترنت کند، هدر زود می‌رسید و مهلت ۴ ثانیه بی‌اثر می‌شد.
  const network = fetch(request.url, { cache: "no-cache", credentials: "same-origin" }).then(response => {
    if (!(response && response.ok && response.type === "basic")) return response;
    return response.arrayBuffer().then(buffer => {
      const full = () => new Response(buffer, { status: response.status, statusText: response.statusText, headers: response.headers });
      cacheWrite = caches.open(CACHE).then(cache => cache.put(INDEX_KEY, full())).catch(() => null);
      return full();
    });
  });
  // حتی اگر نسخهٔ ذخیره‌شده زودتر نمایش داده شد، تا پایان دانلود صفحهٔ تازه Service Worker زنده می‌ماند و ذخیره‌اش می‌کند.
  event.waitUntil(network.then(() => cacheWrite, () => null));

  const timeout = new Promise(resolve => setTimeout(() => resolve(null), NAV_TIMEOUT_MS));
  return Promise.race([network.catch(() => null), timeout]).then(response => {
    if (response && response.ok) return response;
    return caches.match(INDEX_KEY).then(cached => cached || response || network);
  });
}

function staleWhileRevalidate(event, request) {
  return caches.open(CACHE).then(cache =>
    cache.match(request, { ignoreSearch: true }).then(cached => {
      const refresh = fetch(request).then(response => {
        if (response && response.ok && response.type === "basic") cache.put(request, response.clone()).catch(() => null);
        return response;
      }).catch(() => null);
      if (cached) {
        event.waitUntil(refresh);
        return cached;
      }
      return refresh.then(response => response || Response.error());
    })
  );
}

self.addEventListener("fetch", event => {
  const request = event.request;
  // فقط GET هم‌مبدأ. درخواست‌های API (مبدأ دیگر) و POST از Service Worker عبور نمی‌کنند.
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // ویدئو و فایل‌های حجیم با هدر Range مستقیم به شبکه می‌روند (پاسخ 206 قابل ذخیره نیست).
  if (request.headers.has("range")) return;

  if (request.mode === "navigate") {
    event.respondWith(navigationResponse(event, request));
    return;
  }
  if (/\.(?:png|ico|jpe?g|webp|gif|svg)$/i.test(url.pathname) || url.pathname.endsWith("/manifest.json")) {
    event.respondWith(staleWhileRevalidate(event, request));
  }
  // بقیه (js/css و ...) بدون دخالت Service Worker مستقیم از شبکه می‌آیند.
});
