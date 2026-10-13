const CACHE_PREFIX = "moshkfam-shell-";
const CACHE = CACHE_PREFIX + "v4-20261012";
const SHELL = ["./", "./index.html", "./style.css", "./app.js", "./manifest.json", "./images/logo.png", "./Images/logo.png", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/favicon-64.png", "./icons/apple-touch-icon.png"];

// نصب: هر فایل جداگانه کش می‌شود. اگر یکی از فایل‌ها وجود نداشته باشد (مثلاً یکی از دو مسیر
// images/Images که روی GitHub Pages به حروف بزرگ و کوچک حساس است) فقط همان رد می‌شود.
// قبلاً addAll با یک خطای 404 کل نصب Service Worker را شکست می‌داد.
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.all(SHELL.map(url => cache.add(new Request(url, { cache: "reload" })).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

// فعال‌سازی: کش‌های قدیمی همین برنامه (با پیشوند moshkfam-shell-) پاک می‌شوند؛
// کش‌های بی‌ارتباط روی همین origin دست نمی‌خورند.
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  // فقط GET هم‌مبدأ. درخواست‌های API (مبدأ دیگر) و POST از Service Worker عبور نمی‌کنند.
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== location.origin) return;
  // ویدئو و فایل‌های حجیم با هدر Range مستقیم به شبکه می‌روند (پاسخ 206 قابل کش نیست).
  if (request.headers.has("range")) return;

  event.respondWith(
    fetch(request)
      .then(response => {
        // فقط پاسخ‌های سالم کش می‌شوند تا یک 404/500 موقت جای فایل درست را نگیرد.
        if (response && response.ok && response.type === "basic") {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => null));
        }
        return response;
      })
      .catch(() =>
        caches.match(request)
          .then(cached => cached || (request.mode === "navigate" ? caches.match("./index.html") : null))
          .then(cached => cached || Response.error())
      )
  );
});
