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
    var file = PAGE === "flyer" ? "flyer.html" : PAGE === "lite" ? "lite.html" : PAGE === "clara" ? "clara.html" : "";
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

  /* ---------- dates: from core.js ---------- */
  var C = window.PrazosCore, D = C.D, addD = C.addD, working = C.working;
  function build(a, t, cal) { return C.build(a, t, cal); }

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
  function span(a, b) { return Math.round((b - a) / 864e5); }
  /* windows up to a month become one calendar block from the opening day; longer ones (IRS) — opening reminder + last day */
  function blockStart(e) { return e.open && span(e.open, e.last) <= 31 ? e.open : null; }
  function dshort(d) { return fmt(d, { day: "numeric", month: "short" }).replace(".", ""); }
  function gcal(e) {
    var t = texts(e), d = e.last, s0 = blockStart(e) || d;
    return "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent("⏰ " + t.title) + "&dates=" + ymd(s0) + "/" + ymd(addD(d, 1)) +
      "&details=" + encodeURIComponent(t.doo + "\n\n" + U.miss + " " + t.miss + "\n\n" + REG.site);
  }

  function renderTimeline() {
    var tl = $("timeline");
    if (!R.ev.length) { tl.innerHTML = '<p class="note">' + esc(U.none) + "</p>"; return; }
    var firstMain = R.ev.filter(function (e) { return !e.light; })[0], groups = [];
    R.ev.forEach(function (e) {
      var k = e.at.getFullYear() * 12 + e.at.getMonth(), g = groups[groups.length - 1];
      if (!g || g.k !== k) { g = { k: k, d: e.at, items: [] }; groups.push(g); }
      g.items.push(e);
    });
    tl.innerHTML = groups.map(function (g) {
      return '<div class="month"><div class="mlabel">' + esc(cap(fmt(g.d, { month: "long", year: "numeric" }))) + '</div><div class="cards">' + g.items.map(function (e) {
        var t = texts(e);
        var sameM = e.open && e.open.getMonth() === e.date.getMonth();
        var col = e.open
          ? '<div class="dd">' + e.open.getDate() + '</div><div class="to">→ ' + (e.remind && e === firstMain && sameM
              /* the window ends on a weekend: the real last day flies in over it and nudges a few times */
              ? '<span class="swap"><s>' + e.date.getDate() + "</s><b>" + e.remind.getDate() + "</b></span>"
              : esc(sameM ? String(e.date.getDate()) : dshort(e.date))) + "</div>"
          : '<div class="dd">' + e.date.getDate() + '</div><div class="wd">' + esc(fmt(e.date, { weekday: "short" })) + "</div>";
        var when = e.open
          ? '<div class="win">' + esc(U.window.replace("{a}", fmt(e.open, { day: "numeric", month: "long" })).replace("{b}", fmt(e.date, { day: "numeric", month: "long" }))) + "</div>"
          : "";
        return '<article class="card' + (e.light ? " pay" : "") + (e === firstMain ? " soon" : "") + '"><div class="date">' + col + "</div><div>" +
          '<div class="title">' + esc(t.title) + ' <span class="chip k-' + e.kind + '">' + esc(U.kind[e.kind]) + "</span>" +
          (e.isOpen ? ' <span class="chip live">' + esc(U.openNow) + "</span>" : "") + "</div>" + when +
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
    var t = texts(n), lg = { weekday: "short", day: "numeric", month: "long" }, line, d;
    if (n.open && !n.isOpen) { d = n.open; line = U.opens.replace("{d}", fmt(n.open, lg)) + " · " + U.until.replace("{d}", fmt(n.last, { day: "numeric", month: "long" })); }
    else { d = n.last; line = (n.isOpen ? U.openNow + " · " : "") + U.until.replace("{d}", fmt(n.last, lg)); }
    var days = span(today, d);
    $("next").innerHTML = '<div class="k">' + esc(U.next) + '</div><div class="t">' + esc(t.title) + '</div><div class="d">' + esc(line) + "</div>";
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
      var a2 = ang(e.date), q = pt(a2, 104), nx = info && e === info.n, col = nx ? "var(--accent)" : "var(--ink)";
      if (e.open) {
        var a1 = ang(e.open), p0 = pt(a1, 104); if (a2 < a1) a2 += 360;
        h += '<path class="dot" data-a="' + ang(e.date) + '" d="M' + p0[0] + " " + p0[1] + " A104 104 0 " + (a2 - a1 > 180 ? 1 : 0) + " 1 " + q[0] + " " + q[1] +
          '" fill="none" stroke="' + col + '" stroke-width="' + (nx ? 6 : 4) + '" stroke-linecap="round"/>';
      }
      h += '<circle class="dot" data-a="' + ang(e.date) + '" cx="' + q[0] + '" cy="' + q[1] + '" r="' + (nx ? 7 : 5) + '" fill="' + col + '"/>';
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
      var nv = a.getAttribute("data-nav");
      a.setAttribute("href", (lang === "pt" ? "./" : lang + "/") + (nv === "flyer" ? "flyer.html" : nv === "lite" ? "lite.html" : nv === "clara" ? "clara.html" : ""));
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
    /* alarms at 09:00 local: on the opening day and on the last (working) day of the window;
       a single date gets 3 days before and the day itself */
    function alarm(title, trig) { return ["BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + cl(title), "TRIGGER;RELATED=START:" + trig, "END:VALARM"]; }
    function vevent(uid, start, endIncl, title, desc, alarms) {
      Ls.push("BEGIN:VEVENT", "UID:" + uid + "@seedwave.pt", "DTSTAMP:" + ymd(today) + "T000000Z",
        "DTSTART;VALUE=DATE:" + ymd(start), "DTEND;VALUE=DATE:" + ymd(addD(endIncl, 1)), "SUMMARY:" + cl(title), "DESCRIPTION:" + cl(desc), "TRANSP:TRANSPARENT");
      alarms.forEach(function (a) { Ls.push.apply(Ls, a); });
      Ls.push("END:VEVENT");
    }
    R.ev.forEach(function (e, i) {
      var t = texts(e), last = e.last, desc = t.doo + "\n" + U.miss + " " + t.miss + "\n" + REG.site, uid = "prazos-" + e.id + "-" + ymd(e.date) + "-" + i;
      var b = blockStart(e);
      if (b) {
        var al = [alarm(t.title, "PT9H")];
        if (span(b, last) > 0) al.push(alarm(U.lastDay + ": " + t.title, "P" + span(b, last) + "DT9H"));
        vevent(uid, b, last, "⏰ " + t.title, desc, al);
      } else if (e.open) {
        if (e.open >= today) vevent(uid + "-open", e.open, e.open, U.openT.replace("{t}", t.title), desc, [alarm(t.title, "PT9H")]);
        vevent(uid, last, last, "⏰ " + U.lastDay + ": " + t.title, desc, [alarm(t.title, "-P6DT15H"), alarm(U.lastDay + ": " + t.title, "PT9H")]);
      } else {
        vevent(uid, last, last, "⏰ " + t.title, desc, [alarm(t.title, "-P2DT15H"), alarm(t.title, "PT9H")]);
      }
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
      isSample = false; $("sample").hidden = true; store.set("prazos.answers", JSON.stringify(A)); render(); if (window.PrazosPush) window.PrazosPush.sync(lang);
    });
    $("form").addEventListener("submit", function (e) { e.preventDefault(); });
    var PP = window.PrazosPush, PL = L.push;
    function bell() { if (!PP) return; var st = PP.status(); $("bellTxt").textContent = st === "on" ? PL.onDone : PL.on; $("bellBtn").hidden = st === "unsupported"; }
    if (PP && !window.PRAZOS_PRERENDER) {
      bell(); PP.sync(lang);
      $("bellBtn").onclick = function () {
        var st = PP.status();
        if (st === "install" || st === "denied") { $("icsNote").textContent = st === "install" ? PL.installT + ". " + PL.installB : PL.denied; $("icsNote").hidden = false; return; }
        var e = R.ev.filter(function (x) { return !x.light; })[0];
        var go = function () {
          if (!e) return;
          var n = window.PrazosCore.notify(e, e.isOpen ? "open" : "date", L, CAL, lang);
          PP.show(PL.welcomeT, PL.welcomeB.replace("{t}", L.lite.short[e.id] || "").replace("{d}", n.body.split(" · ")[0]) + " " + PL.how, n.url, "prazos-welcome");
        };
        if (st === "on") return go();
        PP.enable(lang).then(function () { bell(); go(); }, function () { $("icsNote").textContent = PL.denied; $("icsNote").hidden = false; });
      };
    }
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
    else if (PAGE === "lite" || PAGE === "clara") {
      store.set("prazos.mode", PAGE);
      (PAGE === "clara" ? window.PRAZOS_CLARA : window.PRAZOS_LITE)({ L: L, U: U, CAL: CAL, today: today, lang: lang, site: REG.site, store: store, toast: toast, esc: esc, fmt: fmt, fd: fd, span: span,
        working: working, texts: texts, gcal: gcal, blockStart: blockStart, prerender: !!window.PRAZOS_PRERENDER,
        build: function (a) { return build(a, today, CAL); }, ics: function (r) { R = r; return ics(); } });
    }
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
