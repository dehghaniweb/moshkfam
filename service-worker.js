const CACHE = "moshkfam-shell-v2";
const SHELL = ["./", "./index.html", "./style.css", "./app.js", "./manifest.json", "./images/logo.png", "./Images/logo.png", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/favicon-64.png", "./icons/apple-touch-icon.png"];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", event => {
  if (new URL(event.request.url).origin !== location.origin) return;
  event.respondWith(fetch(event.request).then(r => { const copy=r.clone(); caches.open(CACHE).then(c=>c.put(event.request,copy)); return r; }).catch(() => caches.match(event.request).then(r => r || caches.match("./index.html"))));
});
