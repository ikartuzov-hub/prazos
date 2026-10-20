/* Prazos — engine (layer 1). Knows no language and no legal text: words come from ui.{lang}.json (layer 2),
   obligation catalogue (kinds, sources, confidence) from data/calendar.json (layer 3). Dates are computed here.
   Pages: index (app) and flyer, chosen by <body data-page>. */
(function () {
  "use strict";
  var REG = window.PRAZOS_REG || { site: "https://prazos.seedwave.pt/", hub: "https://seedwave.pt/hub/", langs: ["pt", "en", "ru", "es", "de"], linkedin: "https://www.linkedin.com/in/igor-kartuzov/" };
  var LANGS = [["pt", "Português"], ["en", "English"], ["ru", "Русский"], ["es", "Español"], ["de", "Deutsch"]];
  var LOCALE = { pt: "pt-PT", en: "en-GB", ru: "ru-RU", es: "es-ES", de: "de-DE" };
  var PAGE = document.body.getAttribute("data-page") || "index";
  var qs = new URLSearchParams(location.search);
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };

  /* ---------- language: page language wins; ?lang= or a stored choice moves you to that language's address ---------- */
  var lang = window.PRAZOS_LANG || document.documentElement.getAttribute("data-lang") || "pt";
  var want = qs.get("lang") || (window.PRAZOS_LANG ? null : store.get("prazos.lang"));
  function langHref(l) {
    var file = PAGE === "flyer" ? "flyer.html" : "";
    var t = document.documentElement.getAttribute("data-theme");
    return (l === "pt" ? "./" : l + "/") + file + (t ? "?theme=" + t : "");
  }
  if (want && want !== lang && REG.langs.indexOf(want) >= 0 && !window.PRAZOS_PRERENDER) { location.replace(langHref(want)); return; }

  /* ---------- theme ---------- */
  var th = qs.get("theme") || store.get("prazos.theme");
  if (th === "dark" || th === "light") document.documentElement.setAttribute("data-theme", th);
  function isDark() {
    var t = document.documentElement.getAttribute("data-theme");
    return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  }

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
        push({ id: m === 0 ? "ssDeclJan" : "ssDecl", date: legal, shift: true, v: { q: qi, y: m === 0 ? y - 1 : y, late: late } });
        if (legal < today && late >= today) push({ id: "ssLate", date: late, shift: true, v: { mDate: legal } });
        if (m === 0) push({ id: "ssTop", date: D(y, 1, 20), shift: true, v: {} });
      });
      if (y - 1 >= sy) {
        push({ id: "efat", date: lastDay(y, 1), shift: true, v: { y: y - 1 } });
        push({ id: "irsOpen", date: D(y, 3, 1), v: { y: y - 1 } });
        push({ id: "irsDecl", date: D(y, 5, 30), v: { y: y - 1 } }); /* no shift: CIRS art. 60 */
        push({ id: "irsPay", date: D(y, 7, 31), v: { y: y - 1 } });
        if (a.irs !== "no") [[6, 20], [8, 20], [11, 20]].forEach(function (q) { push({ id: "ppc", date: nextW(D(y, q[0], q[1])), v: {} }); });
      }
    }
    /* monthly contribution for month k is paid on the 10th–20th of month k+1 */
    var k = new Date(Math.max(ssFrom, D(today.getFullYear(), today.getMonth() - 1, 1)));
    for (; k <= end; k = D(k.getFullYear(), k.getMonth() + 1, 1))
      push({ id: "ssPay", date: D(k.getFullYear(), k.getMonth() + 1, 20), shift: true, light: true, v: { mDate: k } });
    if (ssFrom > today) push({ id: "ssStart", date: ssFrom, v: {} });
    if (a.income === "mid") push({ id: "ivaAlt", date: addWD(D(today.getFullYear(), 11, 31), 15), v: {} });
    if (a.income === "high") push({ id: "ivaNow", date: addWD(today, 15), v: {} });
    /* product rule: when the legal date falls on a non-working day, remind for the previous working day */
    ev.forEach(function (e) { e.remind = e.shift && !working(e.date) ? prevW(e.date) : null; });
    ev.sort(function (x, z) { return x.date - z.date || (x.light ? 1 : 0) - (z.light ? 1 : 0); });
    var r = [];
    if (a.clients.indexOf("comp") >= 0) r.push({ id: a.income === "low" ? "r101b" : "rOver" });
    if (ssFrom > today) r.push({ id: "rFirst", v: { d: ssFrom } });
    if (a.clients.indexOf("eu") >= 0) r.push({ id: "rRecap" });
    r.push({ id: "rInv" }, { id: "rIns" }, { id: "rChg" });
    r.forEach(function (x) { x.conf = CAL.rules[x.id].conf; x.src = CAL.rules[x.id].src; });
    return { ev: ev, rules: r };
  }

  /* ---------- rendering ---------- */
  var U, L, CAL, A, R, isSample = true, today;
  function fmt(d, o) { return new Intl.DateTimeFormat(LOCALE[lang], o).format(d); }
  function cap(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
  function fd(d) { return fmt(d, { day: "numeric", month: "long", year: "numeric" }); }
  function plural(n) {
    var w = U.days; if (lang !== "ru") return n === 1 ? w[0] : w[1];
    var a = n % 10, b = n % 100; return a === 1 && b !== 11 ? w[0] : a >= 2 && a <= 4 && (b < 10 || b >= 20) ? w[1] : w[2];
  }
  function fill(s, v) {
    return s.replace("{q}", v.q != null ? U.q[v.q] : "").replace(/\{y\}/g, v.y != null ? v.y : "").replace("{late}", v.late ? fd(v.late) : "")
      .replace("{m}", v.mDate ? fmt(v.mDate, { month: "long", year: "numeric" }) : "").replace("{d}", v.d ? fd(v.d) : "");
  }
  function texts(e) { var t = L.ev[e.id]; return { title: fill(t[0], e.v), doo: fill(t[1], e.v), miss: fill(t[2], e.v) }; }
  function ymd(x) { return x.getFullYear() + String(x.getMonth() + 1).padStart(2, "0") + String(x.getDate()).padStart(2, "0"); }
  function gcal(e) {
    var t = texts(e), d = e.remind || e.date;
    return "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent("⏰ " + t.title) + "&dates=" + ymd(d) + "/" + ymd(addD(d, 1)) +
      "&details=" + encodeURIComponent(t.doo + "\n\n" + U.miss + " " + t.miss + "\n\n" + REG.site);
  }

  function renderTimeline() {
    var tl = $("timeline");
    if (!R.ev.length) { tl.innerHTML = '<p class="note">' + esc(U.none) + "</p>"; return; }
    var firstMain = R.ev.filter(function (e) { return !e.light; })[0], groups = [];
    R.ev.forEach(function (e) {
      var k = e.date.getFullYear() * 12 + e.date.getMonth(), g = groups[groups.length - 1];
      if (!g || g.k !== k) { g = { k: k, d: e.date, items: [] }; groups.push(g); }
      g.items.push(e);
    });
    tl.innerHTML = groups.map(function (g) {
      return '<div class="month"><div class="mlabel">' + esc(cap(fmt(g.d, { month: "long", year: "numeric" }))) + '</div><div class="cards">' + g.items.map(function (e) {
        var t = texts(e);
        return '<article class="card' + (e.light ? " pay" : "") + (e === firstMain ? " soon" : "") + '"><div class="date"><div class="dd">' + e.date.getDate() +
          '</div><div class="wd">' + esc(fmt(e.date, { weekday: "short" })) + "</div></div><div>" +
          '<div class="title">' + esc(t.title) + ' <span class="chip k-' + e.kind + '">' + esc(U.kind[e.kind]) + "</span></div>" +
          (e.remind ? '<div class="shift">' + esc(U.shift.replace("{d}", fmt(e.remind, { weekday: "long", day: "numeric", month: "long" }))) + "</div>" : "") +
          '<p class="do">' + esc(t.doo) + "</p>" + (t.miss !== "—" ? '<p class="miss"><b>' + esc(U.miss) + "</b> " + esc(t.miss) + "</p>" : "") +
          '<div class="meta"><span>' + esc(U.src) + ": " + esc(e.src) + '</span><span class="chip ' + e.conf + '">' + esc(e.conf === "ok" ? U.ok : U.wait) +
          '</span><a class="gcal" target="_blank" rel="noopener" href="' + esc(gcal(e)) + '">+ ' + esc(U.gcal) + "</a></div></div></article>";
      }).join("") + "</div></div>";
    }).join("");
  }
  function renderRules() {
    $("rules").innerHTML = R.rules.map(function (r) {
      var t = L.rl[r.id];
      var body = esc(t[1]).replace("{m}", "<q>" + esc(CAL.mention101B) + "</q>").replace("{d}", r.v && r.v.d ? esc(fd(r.v.d)) : "");
      return '<div class="rule"><h3>' + esc(t[0]) + ' <span class="chip ' + r.conf + '">' + esc(r.conf === "ok" ? U.ok : U.wait) + "</span></h3><p>" + body +
        '</p><div class="meta"><span>' + esc(U.src) + ": " + esc(r.src) + "</span></div></div>";
    }).join("");
  }
  function renderNext() {
    var n = R.ev.filter(function (e) { return !e.light; })[0] || R.ev[0];
    if (!n) { $("next").innerHTML = '<div class="k">' + esc(U.next) + '</div><div class="t">' + esc(U.none) + "</div>"; return null; }
    var d = n.remind || n.date, days = Math.round((d - today) / 864e5), t = texts(n);
    $("next").innerHTML = '<div class="k">' + esc(U.next) + '</div><div class="t">' + esc(t.title) + '</div><div class="d">' + esc(fmt(d, { weekday: "long", day: "numeric", month: "long" })) + "</div>";
    return { n: n, days: days };
  }

  /* wow: the watchman's dial — calendar year around the face, hand = today; the hand sweeps a full year and lights your deadlines as it passes */
  var anim;
  function renderDial(info) {
    var svg = $("dial"), C = 130;
    function ang(d) { var y0 = D(d.getFullYear(), 0, 1), y1 = D(d.getFullYear() + 1, 0, 1); return (d - y0) / (y1 - y0) * 360; }
    function pt(a, r) { return [C + r * Math.sin(a * Math.PI / 180), C - r * Math.cos(a * Math.PI / 180)]; }
    var h = '<circle cx="130" cy="130" r="118" fill="var(--surface)" stroke="var(--line)"/>';
    for (var m = 0; m < 12; m++) {
      var a = m * 30, p1 = pt(a, 118), p2 = pt(a, 110), tp = pt(a + 15, 92);
      h += '<line x1="' + p1[0] + '" y1="' + p1[1] + '" x2="' + p2[0] + '" y2="' + p2[1] + '" stroke="var(--line)" stroke-width="2"/>' +
        '<text x="' + tp[0] + '" y="' + (tp[1] + 4) + '" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="10" fill="var(--muted)">' + esc(fmt(D(2026, m, 1), { month: "narrow" })) + "</text>";
    }
    R.ev.filter(function (e) { return !e.light; }).forEach(function (e) {
      var a2 = ang(e.date), q = pt(a2, 104), nx = info && e === info.n;
      h += '<circle class="dot" data-a="' + a2 + '" cx="' + q[0] + '" cy="' + q[1] + '" r="' + (nx ? 7 : 5) + '" fill="' + (nx ? "var(--accent)" : "var(--ink)") + '"/>';
    });
    var days = info ? info.days : 0;
    h += '<g id="hand"><line x1="130" y1="130" x2="130" y2="34" stroke="var(--accent)" stroke-width="3" stroke-linecap="round"/><circle cx="130" cy="130" r="5" fill="var(--accent)"/></g>' +
      '<text x="130" y="152" text-anchor="middle" font-family="Unbounded, sans-serif" font-weight="700" font-size="40" fill="var(--ink)">' + days + "</text>" +
      '<text x="130" y="174" text-anchor="middle" font-family="IBM Plex Sans, sans-serif" font-size="12" fill="var(--muted)">' + esc(days === 0 ? U.today : plural(days)) + "</text>";
    svg.innerHTML = h;
    svg.setAttribute("aria-label", U.next + ": " + days + " " + plural(days));
    var target = ang(today), hand = $("hand"), dots = [].slice.call(svg.querySelectorAll(".dot"));
    hand.setAttribute("transform", "rotate(" + target + " 130 130)");
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || window.PRAZOS_PRERENDER) return;
    cancelAnimationFrame(anim);
    dots.forEach(function (el) { el.setAttribute("opacity", ".18"); });
    var t0 = performance.now(), dur = 1600;
    function step(t) {
      var pr = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - pr, 3), a3 = target + 360 * e;
      hand.setAttribute("transform", "rotate(" + a3 + " 130 130)");
      dots.forEach(function (el) { var da = +el.getAttribute("data-a"); if (da < target) da += 360; if (da <= a3) el.setAttribute("opacity", "1"); });
      if (pr < 1) anim = requestAnimationFrame(step);
    }
    anim = requestAnimationFrame(step);
  }

  function renderForm() {
    $("sample").hidden = !isSample;
    $("start").value = A.start;
    $("start").max = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0");
    function opts(id, name, map, type, val) {
      $(id).innerHTML = Object.keys(map).map(function (k) {
        var on = type === "checkbox" ? val.indexOf(k) >= 0 : val === k;
        return '<label class="opt"><input type="' + type + '" name="' + name + '" value="' + k + '" id="' + name + "_" + k + '"' + (on ? " checked" : "") + "><span>" + esc(map[k]) + "</span></label>";
      }).join("");
    }
    opts("o2", "clients", U.o2, "checkbox", A.clients);
    opts("o3", "income", U.o3, "radio", A.income);
    opts("o4", "irs", U.o4, "radio", A.irs);
  }
  function render() { R = build(A, today, CAL); renderTimeline(); renderRules(); renderDial(renderNext()); }

  function renderChrome() {
    document.documentElement.lang = LOCALE[lang] === "pt-PT" ? "pt-PT" : lang;
    $("langBtn").textContent = lang.toUpperCase();
    $("langMenu").innerHTML = LANGS.map(function (l) {
      return '<button type="button" data-l="' + l[0] + '"' + (l[0] === lang ? ' class="on"' : "") + ">" + l[1] + "<small>" + l[0].toUpperCase() + "</small></button>";
    }).join("");
    $("themeBtn").textContent = isDark() ? "☀" : "☾";
    var t = document.documentElement.getAttribute("data-theme");
    $("hubLink").href = REG.hub + "?lang=" + lang + (t ? "&theme=" + t : "");
    $("yr").textContent = new Date().getFullYear();
    [].forEach.call(document.querySelectorAll("a[data-nav]"), function (a) {
      a.setAttribute("href", (lang === "pt" ? "./" : lang + "/") + (a.getAttribute("data-nav") === "flyer" ? "flyer.html" : ""));
    });
    [].forEach.call(document.querySelectorAll("[data-t]"), function (el) {
      var v = el.getAttribute("data-t").split(".").reduce(function (o, k) { return o && o[k]; }, L);
      if (typeof v === "string") el.textContent = v.replace("{v}", fd(new Date(CAL.verified + "T12:00:00")));
    });
  }

  function toast(s) { var t = $("toast"); t.textContent = s; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(function () { t.hidden = true; }, 2200); }
  function share() {
    var url = REG.site + (lang === "pt" ? "" : lang + "/");
    var done = function () { toast(U.copied); };
    if (navigator.share) { navigator.share({ title: "Prazos", text: U.shareText, url: url }).catch(function () {}); return; }
    if (navigator.clipboard) navigator.clipboard.writeText(U.shareText + " " + url).then(done, function () { toast(url); });
    else toast(url);
  }
  function ics() {
    var cl = function (s) { return s.replace(/[\\;,]/g, function (m) { return "\\" + m; }).replace(/\n/g, "\\n"); };
    var Ls = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SeedWave//Prazos//" + lang.toUpperCase(), "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Prazos"];
    R.ev.forEach(function (e, i) {
      var t = texts(e), d = e.remind || e.date;
      Ls.push("BEGIN:VEVENT", "UID:prazos-" + e.id + "-" + ymd(e.date) + "-" + i + "@seedwave.pt", "DTSTAMP:" + ymd(today) + "T000000Z",
        "DTSTART;VALUE=DATE:" + ymd(d), "DTEND;VALUE=DATE:" + ymd(addD(d, 1)), "SUMMARY:" + cl("⏰ " + t.title),
        "DESCRIPTION:" + cl(t.doo + "\n" + U.miss + " " + t.miss + "\n" + REG.site), "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + cl(t.title), "TRIGGER:-P3D", "END:VALARM", "END:VEVENT");
    });
    Ls.push("END:VCALENDAR");
    return Ls.join("\r\n");
  }

  function bindChrome() {
    $("langBtn").onclick = function () { var m = $("langMenu"); m.hidden = !m.hidden; $("langBtn").setAttribute("aria-expanded", String(!m.hidden)); };
    $("langMenu").onclick = function (e) {
      var b = e.target.closest("button[data-l]"); if (!b) return;
      store.set("prazos.lang", b.getAttribute("data-l"));
      location.href = langHref(b.getAttribute("data-l"));
    };
    document.addEventListener("click", function (e) { if (!e.target.closest(".tools")) $("langMenu").hidden = true; });
    $("themeBtn").onclick = function () {
      var n = isDark() ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", n); store.set("prazos.theme", n); renderChrome();
    };
    [].forEach.call(document.querySelectorAll(".js-share"), function (b) { b.onclick = share; });
  }

  function bindApp() {
    $("form").addEventListener("change", function () {
      var f = $("form"), v = $("start").value; if (!v) return;
      A = {
        start: v,
        clients: [].map.call(f.querySelectorAll("input[name=clients]:checked"), function (i) { return i.value; }),
        income: f.querySelector("input[name=income]:checked").value,
        irs: f.querySelector("input[name=irs]:checked").value
      };
      isSample = false; $("sample").hidden = true; store.set("prazos.answers", JSON.stringify(A)); render();
    });
    $("form").addEventListener("submit", function (e) { e.preventDefault(); });
    $("icsBtn").onclick = function () {
      try {
        var a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([ics()], { type: "text/calendar" }));
        a.download = "prazos.ics"; document.body.appendChild(a); a.click(); a.remove();
      } catch (e) { $("icsNote").hidden = false; }
      if (!/seedwave\.pt$|github\.io$|^localhost$|^127\./.test(location.hostname)) $("icsNote").hidden = false;
    };
  }

  function renderFlyer() {
    var F = L.flyer;
    $("fSample").innerHTML = F.sample.map(function (s, i) {
      return '<div class="fs' + (i === 0 ? " soon" : "") + '"><span class="fd">' + esc(s[0]) + "</span><span>" + esc(s[1]) + "</span></div>";
    }).join("");
    $("fHow").innerHTML = F.how.map(function (s, i) { return '<div class="fc"><span class="num">' + (i + 1) + "</span><b>" + esc(s[0]) + "</b><p>" + esc(s[1]) + "</p></div>"; }).join("");
    $("fWhat").innerHTML = F.what.map(function (s) { return '<div class="fc"><b>' + esc(s[0]) + "</b><p>" + esc(s[1]) + "</p></div>"; }).join("");
  }

  function fetchJSON(u) { return fetch(u, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(u + " " + r.status); return r.json(); }); }

  Promise.all([fetchJSON("ui." + lang + ".json"), fetchJSON("data/calendar.json")]).then(function (res) {
    L = res[0]; U = L.ui; CAL = res[1];
    var now = window.PRAZOS_TODAY ? new Date(window.PRAZOS_TODAY + "T12:00:00") : new Date();
    today = D(now.getFullYear(), now.getMonth(), now.getDate());
    renderChrome(); bindChrome();
    if (PAGE === "flyer") { renderFlyer(); }
    else {
      A = null;
      try { var s = JSON.parse(store.get("prazos.answers") || "null"); if (s && s.start) { A = s; isSample = false; } } catch (e) {}
      if (!A || window.PRAZOS_PRERENDER) { A = JSON.parse(JSON.stringify(CAL.sample)); isSample = true; }
      $("tiers").innerHTML = U.tiers.map(function (t, i) {
        return '<div class="tier' + (i === 0 ? " now" : "") + '"><h3>' + esc(t[0]) + ' <span class="chip' + (i === 0 ? " ok" : "") + '">' + esc(t[1]) + "</span></h3><p>" + esc(t[2]) + "</p></div>";
      }).join("");
      renderForm(); bindApp(); render();
    }
    document.documentElement.setAttribute("data-ready", "1");
  }).catch(function (e) { console.error(e); });

  if ("serviceWorker" in navigator && !window.PRAZOS_PRERENDER && /^https:/.test(location.protocol)) {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }
})();
