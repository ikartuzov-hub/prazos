/* Prazos Lite — the lazy screen. Same engine (prazos.js hands over a context), different rendering:
   one card at a time — when, what, where, how much — and two buttons. Why? — only on tap.
   Loaded before prazos.js; the engine calls window.PRAZOS_LITE(ctx) when <body data-page="lite">. */
window.PRAZOS_LITE = function (ctx) {
  "use strict";
  var L = ctx.L, U = ctx.U, LT = L.lite, CAL = ctx.CAL, today = ctx.today, esc = ctx.esc, fmt = ctx.fmt, store = ctx.store, $ = function (id) { return document.getElementById(id); };
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches || ctx.prerender;
  var A, R, queue = [], top = null;

  function ymd(x) { return x.getFullYear() + String(x.getMonth() + 1).padStart(2, "0") + String(x.getDate()).padStart(2, "0"); }
  function uid(e) { return e.id + "-" + ymd(e.date); }
  function readJSON(k) { try { return JSON.parse(store.get(k) || "null") || {}; } catch (e) { return {}; } }
  function cap(t) { return t.charAt(0).toUpperCase() + t.slice(1); }

  /* ---------- queue: not done, not snoozed (a snooze never hides a card on its last day) ---------- */
  function rebuild() {
    R = ctx.build(A);
    var done = readJSON("prazos.done"), snooze = readJSON("prazos.snooze"), t = ymd(today);
    queue = R.ev.filter(function (e) {
      var u = uid(e);
      if (done[u]) return false;
      if (e.id === "ssLate" && (done["ssDecl-" + ymd(e.v.mDate)] || done["ssDeclJan-" + ymd(e.v.mDate)])) return false;
      if (snooze[u] && snooze[u] > t && ymd(e.last) > t) return false;
      return true;
    });
    top = queue[0] || null;
  }

  /* ---------- card face ---------- */
  /* traffic light: calm green → amber (≤ 7 days to the last day) → red (≤ 2 days) */
  function light(e) {
    var end = e.last || e.date, n = Math.round((new Date(end.getFullYear(), end.getMonth(), end.getDate()) - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 864e5);
    var lvl = n <= 2 ? "r" : n <= 7 ? "a" : "g", tl = LT.tl || {};
    var txt = n <= 0 ? tl.d0 : n === 1 ? tl.d1 : (tl.d || "").replace("{n}", n);
    return { lvl: lvl, txt: (e.isOpen ? U.openNow + " · " : "") + txt };
  }
  function face(e) {
    var c = CAL.events[e.id], short = LT.short[e.id] || ctx.texts(e).title, tl = light(e);
    var big, mon;
    if (e.open) {
      var sameM = e.open.getMonth() === e.date.getMonth();
      big = e.open.getDate() + '<small>→ ' + (sameM ? e.date.getDate() : esc(fmt(e.date, { day: "numeric", month: "short" }))) + "</small>";
      mon = fmt(e.open, { month: "long", year: "numeric" });
    } else {
      big = e.date.getDate() + '<small>' + esc(fmt(e.date, { weekday: "short" })) + "</small>";
      mon = fmt(e.date, { month: "long", year: "numeric" });
    }
    var where = c.where ? LT.where[c.where] : "—", amount = LT.amount[c.amount || "none"];
    return '<div class="row1"><span class="chip k-' + e.kind + '">' + esc(U.kind[e.kind]) + "</span>" +
      '<span class="tl tl-' + tl.lvl + '"><i></i>' + esc(tl.txt) + "</span></div>" +
      '<div class="big">' + big + '</div><div class="mon">' + esc(cap(mon)) + "</div>" +
      '<div class="what">' + esc(short) + "</div>" +
      (e.remind ? '<div class="shiftL">' + esc(U.lastDay) + ": " + esc(fmt(e.remind, { weekday: "long", day: "numeric", month: "long" })) + "</div>" : "") +
      '<div class="facts"><div class="f"><b>' + esc(LT.whereL) + "</b><span>" + esc(where) + '</span></div><div class="f amt"><b>' + esc(LT.howMuch) + "</b><span>" + esc(amount) + "</span></div></div>";
  }

  function renderDeck() {
    var d = $("deck");
    if (!queue.length) {
      var nx = R.ev[0];
      d.innerHTML = '<div class="empty"><b>' + esc(LT.allDone) + "</b>" + (nx ? "<span>" + esc(LT.next) + " " + esc(LT.short[nx.id] || "") + " · " + esc(fmt(nx.at, { day: "numeric", month: "long" })) + "</span>" : "") + "</div>";
      $("left").textContent = "";
      $("doneBtn").disabled = $("laterBtn").disabled = true; $("tapHint").hidden = true;
      return;
    }
    var show = ctx.prerender ? queue : queue.slice(0, 4);
    d.innerHTML = show.map(function (e, i) {
      return '<button type="button" class="cardL tl-' + light(e).lvl + (i === 0 ? " top" : "") + '" style="--k:' + i + '" data-u="' + uid(e) + '"' + (i ? ' tabindex="-1" aria-hidden="true"' : "") + ">" + face(e) + "</button>";
    }).join("");
    $("left").textContent = LT.left.replace("{n}", queue.length);
    $("doneBtn").disabled = $("laterBtn").disabled = false; $("tapHint").hidden = false;
    var t = d.querySelector(".cardL.top");
    t.onclick = function () { openSheet(top); };
    if (!reduce) tilt(t);
  }

  /* 3D: the top card leans toward the finger */
  function tilt(el) {
    var r;
    el.onpointermove = function (ev) {
      r = r || el.getBoundingClientRect();
      var x = (ev.clientX - r.left) / r.width - .5, y = (ev.clientY - r.top) / r.height - .5;
      el.style.setProperty("--ry", (x * 10).toFixed(2) + "deg"); el.style.setProperty("--rx", (-y * 8).toFixed(2) + "deg");
    };
    el.onpointerleave = function () { el.style.setProperty("--ry", "0deg"); el.style.setProperty("--rx", "0deg"); r = null; };
  }

  function advance(cls, after) {
    var t = $("deck").querySelector(".cardL.top");
    after();
    if (reduce || !t) { rebuild(); renderDeck(); return; }
    t.classList.add(cls); t.onclick = null;
    setTimeout(function () { rebuild(); renderDeck(); }, 420);
  }
  $("doneBtn").onclick = function () {
    if (!top) return; var u = uid(top);
    advance("out", function () { var d = readJSON("prazos.done"); d[u] = ymd(today); store.set("prazos.done", JSON.stringify(d)); if (window.PrazosPush) window.PrazosPush.sync(ctx.lang); });
  };
  $("laterBtn").onclick = function () {
    if (!top) return; var u = uid(top), tm = new Date(today); tm.setDate(tm.getDate() + 1);
    advance("snooze", function () { var s = readJSON("prazos.snooze"); s[u] = ymd(tm); store.set("prazos.snooze", JSON.stringify(s)); });
  };
  $("resetBtn").onclick = function () { store.set("prazos.done", "{}"); store.set("prazos.snooze", "{}"); rebuild(); renderDeck(); ctx.toast("✓"); };
  $("icsBtn").onclick = function () {
    try {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([ctx.ics(R)], { type: "text/calendar" })); a.download = "prazos.ics";
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { ctx.toast(U.icsNote); }
  };

  /* ---------- sheet: why ---------- */
  function openSheet(e) {
    var t = ctx.texts(e), win = e.open ? U.window.replace("{a}", fmt(e.open, { day: "numeric", month: "long" })).replace("{b}", fmt(e.date, { day: "numeric", month: "long" })) : fmt(e.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    $("sheetBody").innerHTML = "<h2>" + esc(t.title) + '</h2><div class="win note">' + esc(win) + "</div><p>" + esc(t.doo) + "</p>" +
      (t.miss !== "—" ? '<p class="miss"><b>' + esc(U.miss) + "</b> " + esc(t.miss) + "</p>" : "") +
      '<div class="meta"><span>' + esc(U.src) + ": " + esc(e.src) + '</span><span class="chip ' + e.conf + '">' + esc(e.conf === "ok" ? U.ok : U.wait) + "</span></div>" +
      '<div class="sb"><a class="btn primary" target="_blank" rel="noopener" href="' + esc(ctx.gcal(e)) + '">+ ' + esc(U.gcal) + '</a><button class="btn" type="button" id="sheetClose">✕</button></div>';
    $("sheet").hidden = false; $("dim").hidden = false;
    $("sheetClose").onclick = closeSheet; $("dim").onclick = closeSheet;
  }
  function closeSheet() { $("sheet").hidden = true; $("dim").hidden = true; }
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") closeSheet(); });

  /* ---------- onboarding: four taps ---------- */
  var ob = { step: 0, a: { start: "", clients: [], income: "low", irs: "unk" } };
  function obRender() {
    var s = ob.step, h = '<div class="step">' + (s + 1) + " / 4</div>";
    var tapOpts = function (name, map, type, val) {
      return '<div class="opts">' + Object.keys(map).map(function (k) {
        var on = type === "checkbox" ? val.indexOf(k) >= 0 : val === k;
        return '<label class="opt"><input type="' + type + '" name="' + name + '" value="' + k + '"' + (on ? " checked" : "") + "><span>" + esc(map[k]) + "</span></label>";
      }).join("") + "</div>";
    };
    if (s === 0) h += "<h2>" + esc(U.q1) + '</h2><p class="sub">' + esc(U.q1h) + '</p><input type="month" id="obStart" min="2015-01" max="' + today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + '" value="' + esc(ob.a.start) + '"><button class="btn primary" type="button" id="obNext">' + esc(LT.cont) + "</button>";
    if (s === 1) h += "<h2>" + esc(U.q2) + '</h2><p class="sub">' + esc(U.q2h) + "</p>" + tapOpts("clients", U.o2, "checkbox", ob.a.clients) + '<button class="btn primary" type="button" id="obNext">' + esc(LT.cont) + "</button>";
    if (s === 2) h += "<h2>" + esc(U.q3) + "</h2>" + tapOpts("income", U.o3, "radio", ob.a.income) + '<button class="btn primary" type="button" id="obNext">' + esc(LT.cont) + "</button>";
    if (s === 3) h += "<h2>" + esc(U.q4) + '</h2><p class="sub">' + esc(U.q4h) + "</p>" + tapOpts("irs", U.o4, "radio", ob.a.irs) + '<button class="btn primary" type="button" id="obNext">' + esc(LT.start) + "</button>";
    var c = $("obCard"); c.innerHTML = h; c.style.animation = "none"; void c.offsetWidth; c.style.animation = "";
    var next = $("obNext");
    if (next) next.onclick = function () {
      if (s === 0) { var v = $("obStart").value; if (!v) { $("obStart").focus(); return; } ob.a.start = v; }
      if (s === 1) ob.a.clients = [].map.call(c.querySelectorAll("input[name=clients]:checked"), function (i) { return i.value; });
      if (s === 2 || s === 3) { var r = c.querySelector("input[type=radio]:checked"); if (r) ob.a[r.name] = r.value; }
      if (s === 3) { finish(); return; }
      ob.step++; obRender();
    };
    /* a tap on any option — even the one already selected — answers and moves on */
    c.onclick = function (ev) {
      var i = ev.target; if (!i.matches || !i.matches("input[type=radio]")) return;
      ob.a[i.name] = i.value;
      setTimeout(function () { if (s === 3) finish(); else { ob.step++; obRender(); } }, 160);
    };
    c.onchange = null;
  }
  function finish() { A = ob.a; store.set("prazos.answers", JSON.stringify(A)); $("ob").hidden = true; rebuild(); renderDeck(); if (window.PrazosPush) window.PrazosPush.sync(ctx.lang); }
  $("answersBtn").onclick = function () { ob.step = 0; ob.a = JSON.parse(JSON.stringify(A)); $("ob").hidden = false; obRender(); };
  $("laterBtn").textContent = LT.later; $("doneBtn").textContent = LT.done + " ✓";


  /* ---------- bell: reminders on this phone ---------- */
  var PP = window.PrazosPush, PL = L.push;
  function nextMain() { return R.ev.filter(function (e) { return !e.light; })[0] || R.ev[0]; }
  function welcome() {
    var e = top || nextMain(); if (!e) return;
    var n = window.PrazosCore.notify(e, e.isOpen ? "open" : "date", L, CAL, ctx.lang);
    PP.show(PL.welcomeT, PL.welcomeB.replace("{t}", LT.short[e.id] || "").replace("{d}", n.body.split(" · ")[0]) + " " + PL.how, n.url, "prazos-welcome");
  }
  function example() {
    var e = top || nextMain(); if (!e) return;
    var why = e.last && ymd(e.last) === ymd(today) ? "last" : e.isOpen ? "open" : "soon";
    var n = window.PrazosCore.notify(e, why, L, CAL, ctx.lang);
    PP.show(n.title, n.body, n.url, n.tag);
  }
  function renderBell() {
    if (!PP || ctx.prerender) return;
    var st = PP.status(), b = $("bellBtn");
    $("bell").hidden = st === "unsupported";
    b.classList.toggle("on", st === "on");
    $("bellTxt").textContent = st === "on" ? PL.onDone : PL.on;
    $("bellTest").hidden = st !== "on"; $("bellTest").textContent = PL.test;
    $("bellOff").hidden = st !== "on";
  }
  function info(title, text) {
    $("sheetBody").innerHTML = "<h2>" + esc(title) + "</h2><p>" + esc(text) + '</p><div class="sb"><button class="btn primary" type="button" id="sheetClose">OK</button></div>';
    $("sheet").hidden = false; $("dim").hidden = false; $("sheetClose").onclick = closeSheet; $("dim").onclick = closeSheet;
  }
  if (PP && !ctx.prerender) {
    $("bellBtn").onclick = function () {
      var st = PP.status();
      if (st === "install") return info(PL.installT, PL.installB);
      if (st === "denied") return info(PL.on, PL.denied);
      if (st === "on") return example();
      PP.enable(ctx.lang).then(function () { renderBell(); welcome(); }, function () { info(PL.on, PL.denied); renderBell(); });
    };
    $("bellTest").onclick = example;
    $("bellOff").onclick = function () { PP.disable(ctx.lang).then(renderBell, renderBell); };
    PP.sync(ctx.lang);
  }

  /* ---------- boot ---------- */
  try { var s0 = JSON.parse(store.get("prazos.answers") || "null"); if (s0 && s0.start) A = s0; } catch (e) {}
  if (ctx.prerender || A) {
    if (!A) A = JSON.parse(JSON.stringify(CAL.sample));
    rebuild(); renderDeck();
  } else {
    A = JSON.parse(JSON.stringify(CAL.sample)); rebuild(); renderDeck();
    $("ob").hidden = false; obRender();
  }
  renderBell();
  /* opened from a notification: bring that card to the top and explain it */
  function fromHash() {
    var h = (location.hash || "").slice(1); if (!h) return;
    var i = queue.map(uid).indexOf(h);
    if (i > 0) { queue.unshift(queue.splice(i, 1)[0]); top = queue[0]; renderDeck(); }
    if (i >= 0) openSheet(queue[0]);
  }
  fromHash(); window.addEventListener("hashchange", fromHash);
};
