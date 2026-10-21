/* Prazos — date core. Pure functions, no DOM, no language: used by the pages (window.PrazosCore)
   and by the push sender in GitHub Actions (require("./core.js")). One engine, one truth. */
(function (root) {
  "use strict";
  /* ---------- dates ---------- */
  function D(y, m, d) { return new Date(y, m, d); }
  function addD(d, n) { return D(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function lastDay(y, m) { return D(y, m + 1, 0); }
  function key(d) { return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
  function easter(y) {
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
      h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
      mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
    return D(y, mo - 1, da);
  }
  var HOL = {};
  /* national holidays of Portugal (regional ones of Madeira/Azores are not applied) */
  function hol(y) {
    if (HOL[y]) return HOL[y];
    var s = {};
    [[0, 1], [3, 25], [4, 1], [5, 10], [7, 15], [9, 5], [10, 1], [11, 1], [11, 8], [11, 25]].forEach(function (p) { s[key(D(y, p[0], p[1]))] = 1; });
    var e = easter(y); s[key(addD(e, -2))] = 1; s[key(e)] = 1; s[key(addD(e, 60))] = 1;
    return (HOL[y] = s);
  }
  function working(d) { return d.getDay() % 6 !== 0 && !hol(d.getFullYear())[key(d)]; }
  function prevW(d) { while (!working(d)) d = addD(d, -1); return d; }
  function nextW(d) { while (!working(d)) d = addD(d, 1); return d; }
  function addWD(d, n) { while (n > 0) { d = addD(d, 1); if (working(d)) n--; } return d; }

  /* ---------- calendar engine ---------- */
  function build(a, today, CAL) {
    var p = a.start.split("-").map(Number), sy = p[0], sm = p[1];
    var end = D(today.getFullYear() + 1, today.getMonth(), today.getDate());
    var ssFrom = D(sy, sm - 1 + 12, 1); /* contributions from the 1st day of the 12th month after the start (CRC art. 145) */
    var ev = [];
    function push(o) {
      if (o.date < today || o.date > end) return;
      var c = CAL.events[o.id]; o.kind = c.kind; o.src = c.src;
      o.conf = c.confAfter && o.date.getFullYear() > c.confAfter ? "wait" : c.conf;
      ev.push(o);
    }
    for (var y = today.getFullYear() - 1; y <= today.getFullYear() + 1; y++) {
      [0, 3, 6, 9].forEach(function (m, qi) {
        var legal = lastDay(y, m); if (legal < ssFrom) return;
        var late = lastDay(y, m + 2);
        push({ id: m === 0 ? "ssDeclJan" : "ssDecl", open: D(y, m, 1), date: legal, shift: true, v: { q: qi, y: m === 0 ? y - 1 : y, late: late } });
        if (legal < today && late >= today) push({ id: "ssLate", open: D(y, m + 1, 1), date: late, shift: true, v: { mDate: legal } });
        if (m === 0) push({ id: "ssTop", date: D(y, 1, 20), shift: true, v: {} });
      });
      if (y - 1 >= sy) {
        push({ id: "efat", date: lastDay(y, 1), shift: true, v: { y: y - 1 } });
        push({ id: "irsDecl", open: D(y, 3, 1), date: D(y, 5, 30), v: { y: y - 1 } }); /* no shift: CIRS art. 60 */
        push({ id: "irsPay", date: D(y, 7, 31), v: { y: y - 1 } });
        if (a.irs !== "no") [[6, 20], [8, 20], [11, 20]].forEach(function (q) { push({ id: "ppc", date: nextW(D(y, q[0], q[1])), v: {} }); });
      }
    }
    /* monthly contribution for month k is paid on the 10th–20th of month k+1 */
    var k = new Date(Math.max(ssFrom, D(today.getFullYear(), today.getMonth() - 1, 1)));
    for (; k <= end; k = D(k.getFullYear(), k.getMonth() + 1, 1))
      push({ id: "ssPay", open: D(k.getFullYear(), k.getMonth() + 1, 10), date: D(k.getFullYear(), k.getMonth() + 1, 20), shift: true, light: true, v: { mDate: k } });
    if (ssFrom > today) push({ id: "ssStart", date: ssFrom, v: {} });
    if (a.income === "mid") push({ id: "ivaAlt", date: addWD(D(today.getFullYear(), 11, 31), 15), v: {} });
    if (a.income === "high") push({ id: "ivaNow", date: addWD(today, 15), v: {} });
    /* product rule: when the legal date falls on a non-working day, remind for the previous working day */
    /* a window is placed where it opens (or today, if it is already open); a single date — on its day */
    ev.forEach(function (e) {
      e.remind = e.shift && !working(e.date) ? prevW(e.date) : null;
      e.last = e.remind || e.date;
      e.isOpen = !!e.open && e.open <= today;
      e.at = e.open ? (e.isOpen ? today : e.open) : e.date;
    });
    ev.sort(function (x, z) { return x.at - z.at || (x.light ? 1 : 0) - (z.light ? 1 : 0) || x.date - z.date; });
    var r = [];
    if (a.clients.indexOf("comp") >= 0) r.push({ id: a.income === "low" ? "r101b" : "rOver" });
    if (ssFrom > today) r.push({ id: "rFirst", v: { d: ssFrom } });
    if (a.clients.indexOf("eu") >= 0) r.push({ id: "rRecap" });
    r.push({ id: "rInv" }, { id: "rIns" }, { id: "rChg" });
    r.forEach(function (x) { x.conf = CAL.rules[x.id].conf; x.src = CAL.rules[x.id].src; });
    return { ev: ev, rules: r };
  }

  function ymd(x) { return x.getFullYear() + String(x.getMonth() + 1).padStart(2, "0") + String(x.getDate()).padStart(2, "0"); }
  function uid(e) { return e.id + "-" + ymd(e.date); }
  /* what to remind about on `today`: window opens · last (working) day · 3 days before a single date */
  function due(a, today, CAL, done) {
    done = done || {};
    var out = [], t = key(today);
    build(a, today, CAL).ev.forEach(function (e) {
      if (done[uid(e)]) return;
      /* a late-filing window is pointless if the declaration itself was done */
      if (e.id === "ssLate" && (done["ssDecl-" + ymd(e.v.mDate)] || done["ssDeclJan-" + ymd(e.v.mDate)])) return;
      if (e.open && key(e.open) === t && key(e.last) !== t) out.push({ e: e, why: "open" });
      else if (key(e.last) === t) out.push({ e: e, why: "last" });
      else if (!e.open && key(addD(e.last, -3)) === t) out.push({ e: e, why: "soon" });
    });
    return out;
  }
  /* notification text — the same on the phone (welcome, example) and in the daily sender */
  var LOCALE = { pt: "pt-PT", en: "en-GB", ru: "ru-RU", es: "es-ES", de: "de-DE" };
  function notify(e, why, L, CAL, lang, page) {
    var f = function (d) { return new Intl.DateTimeFormat(LOCALE[lang], { weekday: "short", day: "numeric", month: "long" }).format(d); };
    var c = CAL.events[e.id] || {}, P = L.push, parts = [];
    parts.push(why === "open" ? P.open.replace("{d}", f(e.last)) : why === "last" ? P.last : why === "soon" ? P.soon.replace("{d}", f(e.last)) : f(e.last));
    if (c.where) parts.push(L.lite.where[c.where]);
    if (c.amount && c.amount !== "info") parts.push(L.lite.amount[c.amount]);
    return { title: "⏰ " + (L.lite.short[e.id] || e.id), body: parts.join(" · "), url: "/" + (lang === "pt" ? "" : lang + "/") + (page || "lite.html") + "#" + uid(e), tag: uid(e) + "-" + why };
  }
  var api = { D: D, addD: addD, key: key, working: working, prevW: prevW, nextW: nextW, addWD: addWD, build: build, ymd: ymd, uid: uid, due: due, notify: notify };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.PrazosCore = api;
})(typeof self !== "undefined" ? self : this);
