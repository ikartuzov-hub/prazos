/* Prazos — push on this phone. Anonymous: the server only knows a random id, the push address, the 4 answers,
   the language and what was marked done. Server side = Make (store) + GitHub Actions (daily sender, push/send.mjs).
   iPhone: works only from the app added to the Home Screen (iOS 16.4+); permission is asked on a button tap. */
(function (root) {
  "use strict";
  var INTAKE = "https://hook.eu1.make.com/h9f3r1x7ltqgzv7eenkym5c90bi2aeff";
  var VAPID = "BAbRt4UjsPAPDAUp-9AMhp1awelvhFl551PY_j0CW4PeeOyJLUUhcvojNakkZ3nnYBglp6gLNjbYO3mn2SdYGfo";
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  function b64u(s) { var p = "=".repeat((4 - s.length % 4) % 4), b = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
  function pid() { var p = store.get("prazos.pid"); if (!p) { p = "pz_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); store.set("prazos.pid", p); } return p; }

  var P = {
    isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
    standalone: (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true,
    supported: function () { return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window; },
    /* "on" · "off" · "install" (iPhone, not on Home Screen yet) · "denied" · "unsupported" */
    status: function () {
      if (P.isIOS && !P.standalone) return "install";
      if (!P.supported()) return "unsupported";
      if (Notification.permission === "denied") return "denied";
      return store.get("prazos.push") === "1" && Notification.permission === "granted" ? "on" : "off";
    },
    reg: function () { return navigator.serviceWorker.register("/sw.js").then(function () { return navigator.serviceWorker.ready; }); },
    /* full state → Make; base64 so the webhook stores it as plain text */
    sync: function (lang) {
      if (store.get("prazos.push") !== "1" || !P.supported()) return Promise.resolve();
      return P.reg().then(function (r) { return r.pushManager.getSubscription(); }).then(function (sub) {
        if (!sub) return;
        var a = null, done = {};
        try { a = JSON.parse(store.get("prazos.answers") || "null"); done = JSON.parse(store.get("prazos.done") || "{}"); } catch (e) {}
        var st = { v: 1, sub: sub.toJSON(), a: a, lang: lang, mode: store.get("prazos.mode") || "lite", done: done, at: new Date().toISOString() };
        var body = new URLSearchParams({ id: pid(), state: btoa(unescape(encodeURIComponent(JSON.stringify(st)))) });
        return fetch(INTAKE, { method: "POST", body: body, keepalive: true }).catch(function () {});
      });
    },
    enable: function (lang) {
      return Notification.requestPermission().then(function (perm) {
        if (perm !== "granted") throw new Error("denied");
        return P.reg();
      }).then(function (r) {
        return r.pushManager.getSubscription().then(function (s) { return s || r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(VAPID) }); }).then(function () { return r; });
      }).then(function (r) {
        store.set("prazos.push", "1");
        return P.sync(lang).then(function () { return r; });
      });
    },
    disable: function (lang) {
      store.set("prazos.push", "0");
      var body = new URLSearchParams({ id: pid(), state: "" });
      fetch(INTAKE, { method: "POST", body: body, keepalive: true }).catch(function () {});
      return P.reg().then(function (r) { return r.pushManager.getSubscription(); }).then(function (s) { if (s) return s.unsubscribe(); });
    },
    /* the same notification the server will send, shown right now from the phone itself */
    show: function (title, body, url, tag) {
      return P.reg().then(function (r) {
        return r.showNotification(title, { body: body, icon: "/icon-lite-192.png", badge: "/icon-lite-192.png", tag: tag || "prazos", data: { url: url } });
      });
    }
  };
  root.PrazosPush = P;
})(window);
