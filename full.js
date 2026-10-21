/* Prazos Full — the demo of the paid tier on the author's own 2026 case (decision of Igor, 21.10.2026).
   Bank, Finanças and Segurança Social are "connected": three sources reconciled, exact amounts, one question per card
   — file? pay? — and two buttons. Same engine (prazos.js hands over a context), Lite's deck and card.
   Honest frame: nothing is sent anywhere; «Yes» shows what the real Full would have done (a demo receipt).
   Loaded before prazos.js; the engine calls window.PRAZOS_FULL(ctx) when <body data-page="full">. */
window.PRAZOS_FULL = function (ctx) {
  "use strict";
  var L = ctx.L, F = L.full, today = ctx.today, esc = ctx.esc, fmt = ctx.fmt, store = ctx.store, C = window.PrazosCore, $ = function (id) { return document.getElementById(id); };
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches || ctx.prerender;
  var LOC = { pt: "pt-PT", en: "en-GB", ru: "ru-RU", es: "es-ES", de: "de-DE" }[ctx.lang];
  var DM, queue = [], done = {}, top = null;

  function eur(n) { return new Intl.NumberFormat(LOC, { style: "currency", currency: "EUR", minimumFractionDigits: n % 1 ? 2 : 0 }).format(n); }
  function dt(s) { var p = s.split("-").map(Number); return C.D(p[0], p[1] - 1, p[2]); }
  function dlong(d) { return fmt(d, { day: "numeric", month: "long" }); }
  function cap(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
  function fill(s, s0) {
    var v = s0.v || {};
    return String(s).replace("{sum}", eur(s0.sum)).replace("{client}", v.client || "").replace("{q}", v.q != null ? F.q[v.q] : "")
      .replace("{base}", v.base != null ? eur(v.base) : "").replace("{declared}", v.declared != null ? eur(v.declared) : "").replace("{real}", v.real != null ? eur(v.real) : "")
      .replace("{paid}", v.paid != null ? eur(v.paid) : "").replace("{due}", v.due != null ? eur(v.due) : "").replace("{pay}", s0.pay ? dlong(C.prevW(dt(s0.pay))) : "")
      .replace("{n}", s0.n || "");
  }
  function readDone() { try { return JSON.parse(store.get("prazos.fullDone") || "null") || {}; } catch (e) { return {}; } }

  /* ---------- the row «connected: bank · Finanças · SS» and the reconciliation line ---------- */
  function renderHead() {
    $("conn").innerHTML = ["bank", "at", "ss"].map(function (k) {
      return '<span class="cn"><i></i><b>' + esc(F.src[k]) + "</b><small>" + esc(DM.sources[k]) + "</small></span>";
    }).join("") + '<span class="cok">' + esc(F.ok) + "</span>";
    var r = F.recon.replace("{y}", DM.year).replace("{total}", eur(DM.recibos.total));
    var b = F.reconBad.replace("{declared}", eur(DM.declared)).replace("{total}", eur(DM.recibos.total));
    $("recon").innerHTML = '<span class="g">' + esc(r) + '</span> <span class="w">' + esc(b) + "</span>";
  }

  /* ---------- the deck: one card at a time, Lite's face with numbers instead of rules ---------- */
  function rebuild() {
    done = readDone();
    queue = DM.steps.filter(function (s) { return !done[s.id]; });
    top = queue[0] || null;
  }
  function light(s) {
    if (!s.last) return s.kind === "file" && /^flag/.test(s.id) ? "r" : "g";
    var n = Math.round((C.prevW(dt(s.last)) - today) / 864e5);
    return n <= 2 ? "r" : n <= 7 ? "a" : "g";
  }
  function face(s) {
    var T = F.steps[s.id], when = "";
    if (s.open && s.last) {
      var o = dt(s.open), l = C.prevW(dt(s.last)), same = o.getMonth() === l.getMonth();
      var dd = function (x) { return same ? String(x.getDate()) : esc(fmt(x, { day: "2-digit", month: "2-digit" })); };
      when = '<div class="big rv"><span class="r0">' + dd(o) + '</span><span class="ra">→</span><span class="r1">' + dd(l) + "</span></div>" +
        '<div class="mon">' + esc(cap(fmt(o, { month: "long", year: "numeric" }))) + "</div>";
    } else {
      when = '<div class="big sum">' + esc(eur(s.sum)) + "</div>" + '<div class="mon">' + esc(fill(T.sub, s)) + "</div>";
    }
    var facts = s.open ? [[F.sumL, eur(s.sum)], [F.whereL, F.where[s.where]]] : [[F.whereL, F.where[s.where]]];
    return '<div class="row1"><span class="chip k-' + s.kind + '">' + esc(F.kind[s.kind]) + "</span>" +
      '<span class="tl tl-' + light(s) + '"><i></i>' + esc(s.open ? F.whenL + " · " + F.q[s.v.q != null ? s.v.q : 0] : F.src[s.where === "at" ? "at" : "ss"]) + "</span></div>" +
      when + '<div class="what">' + esc(fill(T.what, s)) + "</div>" +
      (s.open ? '<div class="shiftL">' + esc(fill(T.sub, s)) + "</div>" : "") +
      '<div class="facts' + (facts.length === 1 ? " one" : "") + '">' + facts.map(function (f) { return '<div class="f"><b>' + esc(f[0]) + "</b><span>" + esc(f[1]) + "</span></div>"; }).join("") + "</div>" +
      '<div class="ask">' + esc(T.ask) + "</div>";
  }
  function renderDeck() {
    var d = $("deck");
    $("ahead").textContent = F.aheadN.replace("{n}", queue.length);
    if (!queue.length) {
      var nx = C.prevW(dt(DM.ahead[0].date));
      d.innerHTML = '<div class="empty fin"><b>' + esc(F.allT) + "</b><span>" + esc(F.all.replace("{d}", dlong(nx))) + '</span><button type="button" class="btn" id="againBtn">' + esc(F.again) + "</button></div>";
      $("againBtn").onclick = function () { store.set("prazos.fullDone", "{}"); rebuild(); renderDeck(); };
      $("yesBtn").disabled = $("noBtn").disabled = true;
      return;
    }
    var show = ctx.prerender ? queue : queue.slice(0, 4);
    d.innerHTML = show.map(function (s, i) {
      return '<div class="cardL tl-' + light(s) + (i === 0 ? " top" : "") + '" style="--k:' + i + '" data-id="' + s.id + '"' + (i ? ' aria-hidden="true"' : "") + ">" + face(s) + "</div>";
    }).join("") + ("speechSynthesis" in window || ctx.prerender ? '<button type="button" class="sayL" id="sayL" aria-label="' + esc(F.say) + '" title="' + esc(F.say) + '">🔊</button>' : "");
    if ($("sayL")) $("sayL").onclick = function (ev) { ev.stopPropagation(); sayIt(top); };
    $("yesBtn").disabled = $("noBtn").disabled = false;
    if (!reduce) tilt(d.querySelector(".cardL.top"));
  }
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
    t.classList.add(cls);
    setTimeout(function () { rebuild(); renderDeck(); }, 420);
  }

  /* ---------- «Yes»: the demo receipt — what the real Full would have sent ---------- */
  function refNo(s) { var h = 0, k = s.id + DM.asOf; for (var i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0; return String(100000 + h % 900000); }
  $("yesBtn").onclick = function () {
    if (!top) return;
    var s = top, T = F.steps[s.id]; s.n = refNo(s);
    advance("out", function () { var d = readDone(); d[s.id] = DM.asOf; store.set("prazos.fullDone", JSON.stringify(d)); });
    setTimeout(function () { receipt(s, T); }, reduce ? 0 : 380);
  };
  $("noBtn").onclick = function () {
    if (!top) return;
    advance("snooze", function () { DM.steps.push(DM.steps.splice(DM.steps.indexOf(top), 1)[0]); });
  };
  function receipt(s, T) {
    $("sheetBody").innerHTML = '<div class="rc"><div class="rcT">' + esc(F.receipt) + '</div><div class="rcL">' + esc(fill(T.done, s)) + '</div>' +
      '<div class="rcRow"><span>' + esc(F.sumL) + "</span><b>" + esc(eur(s.sum)) + '</b></div><div class="rcRow"><span>' + esc(F.whereL) + "</span><b>" + esc(F.where[s.where]) + "</b></div>" +
      '<div class="rcRow"><span>' + esc(F.whenL) + "</span><b>" + esc(fmt(today, { day: "numeric", month: "long", year: "numeric" })) + "</b></div>" +
      '<p class="note">' + esc(F.receiptNote) + "</p></div>" +
      '<div class="sb"><button class="btn primary" type="button" id="sheetClose">OK</button></div>';
    $("sheet").hidden = false; $("dim").hidden = false;
    $("sheetClose").onclick = closeSheet; $("dim").onclick = closeSheet;
    if (store.get("prazos.fullVoice") === "1") say(fill(T.done, s));
  }
  function closeSheet() { $("sheet").hidden = true; $("dim").hidden = true; }
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") closeSheet(); });

  /* ---------- 🔊 Clara reads the card: what · amount · where · the question ---------- */
  var voice = null;
  function pickVoice() {
    if (!("speechSynthesis" in window)) return;
    var vs = speechSynthesis.getVoices(), lc = LOC.toLowerCase(), base = lc.split("-")[0];
    var pool = vs.filter(function (v) { return v.lang && v.lang.toLowerCase().replace("_", "-") === lc; });
    if (!pool.length) pool = vs.filter(function (v) { return v.lang && v.lang.toLowerCase().indexOf(base) === 0; });
    voice = pool.filter(function (v) { return /premium|enhanced|natural|neural/i.test(v.name); })[0] || pool[0] || null;
  }
  if ("speechSynthesis" in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  function say(txt) {
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(txt); u.lang = LOC; if (voice) u.voice = voice; u.pitch = 1.05;
    var b = $("sayL"); if (b) b.classList.add("on");
    u.onend = u.onerror = function () { var b2 = $("sayL"); if (b2) b2.classList.remove("on"); };
    speechSynthesis.speak(u);
  }
  function sayIt(s) {
    if (!s) return; var T = F.steps[s.id];
    store.set("prazos.fullVoice", "1");
    say([fill(T.what, s), fill(T.sub, s), F.where[s.where], T.ask].join(". ").replace(/\.\s*\./g, "."));
  }

  /* ---------- direction: what Full adds after the demo (slides, not features) ---------- */
  function renderDir() {
    var sum = DM.ahead.reduce(function (a, x) { return a + x.sum; }, 0), lastD = C.prevW(dt(DM.ahead[DM.ahead.length - 1].date));
    var days = Math.max(1, Math.round((lastD - today) / 864e5)), perDay = Math.ceil(sum / days * 100) / 100;
    $("dir").innerHTML = F.dir.map(function (d) {
      return '<div class="dcard"><span class="dic" aria-hidden="true">' + d[0] + "</span><b>" + esc(d[1]) + "</b><p>" + esc(d[2].replace("{d}", eur(perDay)).replace("{n}", DM.ahead.length).replace("{sum}", eur(Math.round(sum * 100) / 100))) + "</p></div>";
    }).join("");
  }

  /* ---------- boot ---------- */
  $("yesBtn").textContent = F.yes + " ✓"; $("noBtn").textContent = F.no;
  fetch("data/demo.json", { cache: "no-cache" }).then(function (r) { return r.json(); }).then(function (d) {
    DM = d;
    if (ctx.prerender) store.set("prazos.fullDone", "{}");
    renderHead(); rebuild(); renderDeck(); renderDir();
    document.documentElement.setAttribute("data-demo", "1");
  });
};
