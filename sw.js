/* Prazos — offline: network-first for everything, last good copy kept for offline use. */
var V = "prazos-v7";
var SHELL = ["./", "flyer.html", "lite.html", "lite.css", "lite.js", "clara.html", "clara.css", "clara.js", "prazos.css", "prazos.js", "core.js", "push.js", "registry.js", "icon.svg", "data/calendar.json",
  "ui.pt.json", "ui.en.json", "ui.ru.json", "ui.es.json", "ui.de.json"];
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(V).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== V; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(function (r) {
    if (r.ok) { var copy = r.clone(); caches.open(V).then(function (c) { c.put(e.request, copy); }); }
    return r;
  }).catch(function () { return caches.match(e.request, { ignoreSearch: true }); }));
});

/* push: the daily sender (GitHub Actions) sends {title, body, url, tag} */
self.addEventListener("push", function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { title: "Prazos", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Prazos", {
    body: d.body || "", icon: "/icon-lite-192.png", badge: "/icon-lite-192.png", tag: d.tag || "prazos", data: { url: d.url || "/lite.html" }
  }));
});
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var url = new URL((e.notification.data && e.notification.data.url) || "/lite.html", self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) { if ("focus" in list[i]) { list[i].navigate(url); return list[i].focus(); } }
    return self.clients.openWindow(url);
  }));
});
