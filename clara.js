/* Prazos Clara — the voice version. Same engine and answers as Full and Lite (prazos.js hands over a context).
   Clara says the current deadline out loud; the person answers «yes» / «later» with a button, the voice
   (SpeechRecognition, where the browser has it) or a head gesture (front camera + MediaPipe FaceLandmarker,
   computed on the phone — the video never leaves it). Loaded before prazos.js. */
window.PRAZOS_CLARA = function (ctx) {
  "use strict";
  var L = ctx.L, U = ctx.U, CL = L.clara, SAY = CL.say, CAL = ctx.CAL, today = ctx.today, esc = ctx.esc, fmt = ctx.fmt, store = ctx.store;
  var $ = function (id) { return document.getElementById(id); };
  var LOCALE = { pt: "pt-PT", en: "en-GB", ru: "ru-RU", es: "es-ES", de: "de-DE" }[ctx.lang];
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches || ctx.prerender;
  var A = null, R, queue = [], top = null, started = false, awaiting = false;
  var skipped = {}, undo = [], pref = (location.hash || "").slice(1), touched = false;

  function ymd(x) { return x.getFullYear() + String(x.getMonth() + 1).padStart(2, "0") + String(x.getDate()).padStart(2, "0"); }
  function uid(e) { return e.id + "-" + ymd(e.date); }
  function readJSON(k) { try { return JSON.parse(store.get(k) || "null") || {}; } catch (e) { return {}; } }
  function writeJSON(k, o) { store.set(k, JSON.stringify(o)); }

  /* ---------- queue (same rules as Lite: done and snoozed are shared; «skip» lives only in this conversation) ---------- */
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
    var i = queue.map(uid).indexOf(pref);
    if (i > 0) queue.unshift(queue.splice(i, 1)[0]);
    queue = queue.filter(function (e) { return !skipped[uid(e)]; });
    top = queue[0] || null;
  }

  /* ---------- the one line: when · how much · where ---------- */
  function when(e) {
    if (e.open && !e.isOpen) return fmt(e.open, { day: "numeric", month: "short" }) + " → " + fmt(e.last, { day: "numeric", month: "short" });
    return U.until.replace("{d}", fmt(e.last, { day: "numeric", month: "short" }));
  }
  function renderLine() {
    if (!top) { $("cwhat").textContent = ""; $("cfacts").textContent = touched ? SAY.end : CL.none; $("cYes").disabled = $("cLater").disabled = true; return; }
    var c = CAL.events[top.id] || {};
    var amt = c.amount && c.amount !== "info" ? L.lite.amount[c.amount] : "";
    var parts = [when(top), amt, c.where ? L.lite.where[c.where] : ""].filter(Boolean);
    $("cwhat").textContent = L.lite.short[top.id] || "";
    $("cfacts").innerHTML = parts.map(esc).join("<i>·</i>");
    $("cYes").disabled = $("cLater").disabled = false;
  }

  /* ---------- speech out ---------- */
  var voice = null;
  function pickVoice() {
    if (!("speechSynthesis" in window)) return;
    var vs = speechSynthesis.getVoices(), lc = LOCALE.toLowerCase(), base = lc.split("-")[0];
    var exact = vs.filter(function (v) { return v.lang && v.lang.toLowerCase().replace("_", "-") === lc; });
    var near = vs.filter(function (v) { return v.lang && v.lang.toLowerCase().indexOf(base) === 0; });
    var pool = exact.length ? exact : near;
    var nice = pool.filter(function (v) { return /premium|enhanced|natural|neural/i.test(v.name); });
    voice = (nice[0] || pool[0]) || null;
  }
  if ("speechSynthesis" in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  function longDate(x) { return fmt(x, { day: "numeric", month: "long" }); }
  function clean(s) { return s.replace(/\s*\.\s*\./g, ".").replace(/\s{2,}/g, " ").trim(); }
  function phrase(e) {
    var c = CAL.events[e.id] || {}, why = ymd(e.last) === ymd(today) ? "last" : e.isOpen ? "open" : "soon";
    var d = longDate(e.isOpen || !e.open ? e.last : e.open);
    return clean(SAY[why].replace("{what}", L.lite.short[e.id] || "").replace("{date}", d)
      .replace("{where}", c.where ? SAY.where[c.where] : "").replace("{amount}", SAY.amount[c.amount || "none"] || ""));
  }
  var talkId = 0;
  function speak(text, after) {
    var my = ++talkId; stopListen();
    if (!("speechSynthesis" in window) || !text) { if (after) after(); return; }
    speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text), fired = false;
    function fin() { if (fired || my !== talkId) return; fired = true; level.speaking = false; if (after) after(); }
    u.lang = LOCALE; if (voice) u.voice = voice; u.rate = 1; u.pitch = 1.05;
    u.onstart = function () { level.speaking = true; };
    u.onboundary = function () { level.kick = 1; };
    u.onend = u.onerror = fin;
    speechSynthesis.speak(u);
  }
  /* after Clara has spoken: wait for an answer (buttons and nod always; the voice in conversation mode) */
  function wait() { awaiting = true; if (micOn) { if (ptt) tapHint(); else setTimeout(listen, 350); } }
  function present(lead) {
    renderLine();
    var text = top ? phrase(top) : touched ? SAY.end : SAY.none;
    awaiting = false;
    speak(clean((lead ? lead + " " : "") + text), wait);
  }

  /* ---------- answers and moves ---------- */
  function sync() { if (window.PrazosPush) window.PrazosPush.sync(ctx.lang); }
  function remember(kind, u) { var d = readJSON("prazos.done"), s = readJSON("prazos.snooze"); undo.push({ kind: kind, u: u, d: d[u], s: s[u] }); }
  function answer(yes) {
    if (!top) return;
    awaiting = false; stopListen(); touched = true;
    var u = uid(top); remember(yes ? "done" : "snooze", u);
    if (yes) { var d = readJSON("prazos.done"); d[u] = ymd(today); writeJSON("prazos.done", d); }
    else { var s = readJSON("prazos.snooze"), tm = new Date(today); tm.setDate(tm.getDate() + 1); s[u] = ymd(tm); writeJSON("prazos.snooze", s); }
    sync();
    if (location.hash) history.replaceState(null, "", location.pathname);
    pref = ""; level.kick = 1.6;
    rebuild();
    if (micOn) { present(yes ? SAY.ok : SAY.later); return; }   /* conversation: acknowledge and go straight on */
    renderLine();
    var nx = top, msg = !yes ? SAY.later : nx ? SAY.okNext.replace("{what}", L.lite.short[nx.id] || "").replace("{date}", when(nx)) : SAY.ok;
    speak(msg, wait);
  }
  function skip() {
    if (!top) { present(); return; }
    touched = true; remember("skip", uid(top)); skipped[uid(top)] = 1; pref = ""; rebuild(); present(SAY.skip);
  }
  function back() {
    var x = undo.pop();
    if (!x) { speak(SAY.first, function () { present(); }); return; }
    var d = readJSON("prazos.done"), s = readJSON("prazos.snooze");
    if (x.kind === "skip") delete skipped[x.u];
    else { if (x.d) d[x.u] = x.d; else delete d[x.u]; if (x.s) s[x.u] = x.s; else delete s[x.u]; writeJSON("prazos.done", d); writeJSON("prazos.snooze", s); sync(); }
    pref = x.u; rebuild(); present(SAY.back);
  }
  function restart() {
    /* from the top: everything passed over in this conversation comes back; what was marked done stays done */
    var s = readJSON("prazos.snooze");
    undo.filter(function (x) { return x.kind === "snooze"; }).forEach(function (x) { if (x.s) s[x.u] = x.s; else delete s[x.u]; });
    writeJSON("prazos.snooze", s); sync();
    skipped = {}; undo = undo.filter(function (x) { return x.kind === "done"; }); pref = ""; touched = false;
    rebuild(); present(SAY.restart);
  }
  function listAll() {
    if (!queue.length) { speak(SAY.zero, wait); return; }
    var names = queue.slice(0, 5).map(function (e) { return L.lite.short[e.id] || ""; }).filter(Boolean).join(", ");
    speak(SAY.count.replace("{n}", queue.length).replace("{list}", names), wait);
  }
  function tell(kind) {
    if (!top) { speak(SAY.zero, wait); return; }
    var c = CAL.events[top.id] || {}, t = "";
    if (kind === "amount") t = SAY.amount[c.amount || "none"] || "";
    else if (kind === "where") t = c.where ? SAY.where[c.where] : "";
    else t = top.open && !top.isOpen ? SAY.whenOpen.replace("{from}", longDate(top.open)).replace("{date}", longDate(top.last)) : SAY.whenDue.replace("{date}", longDate(top.last));
    speak(t ? (/[.!?]$/.test(t) ? t : t + ".") : SAY.noInfo, wait);
  }
  function hush() { awaiting = false; stopListen(); speak(SAY.bye); setMic(false); }

  $("cYes").onclick = function () { begin(); answer(true); };
  $("cLater").onclick = function () { begin(); answer(false); };
  function begin() { if (!started) { started = true; $("tapStart").hidden = true; } }

  /* ---------- «⋯»: back, start over, reminders, answers — off the stage, same sheet as Lite ---------- */
  var LT = L.lite, PL = L.push, PP = window.PrazosPush, liteHref = (ctx.lang === "pt" ? "" : "../" + ctx.lang + "/").replace("../", "") + "lite.html";
  function closeSheet() { $("sheet").hidden = true; $("dim").hidden = true; }
  function row(ic, txt, st, id, cls, dis) {
    return '<button type="button" id="' + id + '"' + (cls ? ' class="' + cls + '"' : "") + (dis ? " disabled" : "") + '><span class="ic" aria-hidden="true">' + ic + '</span><span class="txt">' + txt + "</span>" + (st || "") + "</button>";
  }
  function openMore() {
    if (!store.get("prazos.moreSeen")) { store.set("prazos.moreSeen", "1"); $("moreBtn").classList.remove("pulse"); }
    var st = PP && !ctx.prerender ? PP.status() : "unsupported", on = st === "on";
    var h = "<h2>" + esc(LT.moreT) + '</h2><div class="menuL"><div class="cap">' + esc(LT.ahead.replace("{n}", queue.length)) + " · " + esc(CL.hint) + "</div>";
    h += row("↶", esc(CL.back), "", "mBack", "", !undo.length) + row("↺", esc(CL.again), "", "mAgain");
    if (st !== "unsupported") h += row("🔔", esc(LT.remind) + '<span class="sub">' + esc(on ? PL.how : PL.on) + "</span>", '<span class="st' + (on ? " on" : "") + '">' + esc(on ? LT.remindOn : LT.enable) + "</span>", "mBell");
    if (on) h += row("🔕", esc(PL.off), "", "mOff");
    h += '<a href="' + liteHref + '#answers"><span class="ic" aria-hidden="true">✎</span><span class="txt">' + esc(LT.answers) + "</span></a>";
    h += '</div><p class="note">' + esc(CL.future) + '</p><div class="sb"><button class="btn" type="button" id="sheetClose">✕</button></div>';
    $("sheetBody").innerHTML = h; $("sheet").hidden = false; $("dim").hidden = false;
    $("sheetClose").onclick = closeSheet; $("dim").onclick = closeSheet;
    $("mBack").onclick = function () { closeSheet(); begin(); back(); };
    $("mAgain").onclick = function () { closeSheet(); begin(); restart(); };
    if ($("mBell")) $("mBell").onclick = function () {
      closeSheet();
      if (st === "install") return info(PL.installT, PL.installB);
      if (st === "denied") return info(PL.on, PL.denied);
      if (on) return;
      PP.enable(ctx.lang).then(function () { ctx.toast(PL.onDone); }, function () { info(PL.on, PL.denied); });
    };
    if ($("mOff")) $("mOff").onclick = function () { PP.disable(ctx.lang).then(openMore, openMore); };
  }
  function info(title, text) {
    $("sheetBody").innerHTML = "<h2>" + esc(title) + "</h2><p>" + esc(text) + '</p><div class="sb"><button class="btn primary" type="button" id="sheetClose">OK</button></div>';
    $("sheet").hidden = false; $("dim").hidden = false; $("sheetClose").onclick = closeSheet; $("dim").onclick = closeSheet;
  }
  $("moreBtn").onclick = openMore;
  if (!store.get("prazos.moreSeen") && !ctx.prerender) $("moreBtn").classList.add("pulse");
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") closeSheet(); });
  $("tapStart").onclick = $("orb").onclick = function () {
    /* push-to-talk: where the phone only lets the microphone start from a touch, a tap on the orb = «I'm speaking» */
    if (started && micOn && ptt && awaiting && !level.speaking) { listen(true); return; }
    var first = !started; begin();
    if (first && !store.get("prazos.claraHello")) { store.set("prazos.claraHello", "1"); present(SAY.hello); } else present();
  };

  /* ---------- voice in: a conversation — after every phrase Clara listens for an answer or a command ---------- */
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition, rec = null, micOn = false, since = 0, ptt = false;
  function tapHint() { $("cheard").textContent = "🎙 " + CL.tapTalk; }
  function micOff(code) { setMic(false); $("cnote").textContent = CL.micOff; ctx.toast(CL.micOff + (code ? " (" + code + ")" : "")); }
  var CMD = SAY.cmd || {};
  function norm(s) { return " " + s.toLowerCase().replace(/[.,!?¿¡«»"“”„:;]/g, " ").replace(/\s+/g, " ").trim() + " "; }
  function hit(t, words) { return (words || []).some(function (w) { return t.indexOf(" " + w.toLowerCase() + " ") >= 0; }); }
  function act(raw) {
    var t = norm(raw);
    if (!t.trim()) return false;
    $("cheard").textContent = CL.heard.replace("{w}", raw.trim());
    if (hit(t, CMD.stop)) hush();
    else if (hit(t, CMD.restart)) restart();
    else if (hit(t, CMD.back)) back();
    else if (hit(t, CMD.list)) listAll();
    else if (hit(t, CMD.help)) speak(SAY.help, wait);
    else if (hit(t, CMD.repeat)) present();
    else if (hit(t, CMD.next)) skip();
    else if (hit(t, CMD.amount)) tell("amount");
    else if (hit(t, CMD.where)) tell("where");
    else if (hit(t, CMD.when)) tell("when");
    else if (top && hit(t, SAY.yes)) answer(true);
    else if (top && hit(t, SAY.no)) answer(false);
    else speak(SAY.unknown, wait);
    return true;
  }
  function listen(byTap) {
    if (!micOn || !SR || !awaiting || rec || level.speaking) return;
    if (!since) since = Date.now();
    var heard = "", acted = false;
    try {
      rec = new SR(); rec.lang = LOCALE; rec.interimResults = true; rec.maxAlternatives = 1; rec.continuous = false;
      $("cheard").textContent = CL.listening;
      rec.onresult = function (ev) {
        var txt = "", fin = false;
        for (var i = 0; i < ev.results.length; i++) { txt += " " + ev.results[i][0].transcript; if (ev.results[i].isFinal) fin = true; }
        heard = txt; $("cheard").textContent = CL.heard.replace("{w}", txt.trim());
        if (fin && !acted) { acted = true; since = 0; try { rec.stop(); } catch (e) {} act(txt); }
      };
      rec.onend = function () {
        rec = null;
        if (!acted && heard.trim()) { acted = true; since = 0; act(heard); return; }   /* iOS sometimes ends without a final result */
        if (!micOn || !awaiting || acted) return;
        if (ptt) { tapHint(); return; }
        if (Date.now() - since > 25000) { since = 0; $("cheard").textContent = CL.paused; return; }   /* long silence: pause, a tap resumes */
        setTimeout(listen, 250);
      };
      rec.onerror = function (e) {
        var c = e && e.error;
        if (c !== "not-allowed" && c !== "service-not-allowed" && c !== "audio-capture") return;   /* no-speech / aborted: just listen again */
        if (!byTap && !ptt) { ptt = true; acted = true; tapHint(); return; }   /* started without a touch was refused → switch to tap-to-talk */
        acted = true; micOff(c);
      };
      rec.start();
    } catch (e) { rec = null; }
  }
  function stopListen() { try { if (rec) rec.abort(); } catch (e) {} rec = null; }
  function setMic(on) { micOn = on; since = 0; $("cMic").classList.toggle("on", on); $("cMic").classList.toggle("live", on); if (!on) { stopListen(); $("cheard").textContent = ""; } }
  $("cMic").onclick = function () {
    begin();
    if (!SR) { ctx.toast(CL.micErr); return; }
    setMic(!micOn);
    if (micOn) present();
  };

  /* ---------- head gesture in: nod = yes, shake = later ---------- */
  var camOn = false, lm = null, vid = $("cam"), hist = [], lastHit = 0, rafCam = 0;
  function median(a) { var b = a.slice().sort(function (x, y) { return x - y; }); return b[Math.floor(b.length / 2)] || 0; }
  function gesture(t) {
    var cut = t - 1400; while (hist.length && hist[0].t < cut) hist.shift();
    if (hist.length < 8 || t - lastHit < 1600 || !awaiting) return;
    var p = hist.map(function (h) { return h.p; }), y = hist.map(function (h) { return h.y; });
    var p0 = median(p), y0 = median(y);
    var pRange = Math.max.apply(null, p) - Math.min.apply(null, p), yRange = Math.max.apply(null, y) - Math.min.apply(null, y);
    /* count direction changes around the median — a nod/shake is down-up-down or left-right-left */
    function swings(arr, base, thr) { var s = 0, side = 0; arr.forEach(function (v) { var d = v - base; var n = d > thr ? 1 : d < -thr ? -1 : 0; if (n && n !== side) { if (side) s++; side = n; } }); return s; }
    if (pRange > 0.07 && pRange > yRange * 1.4 && swings(p, p0, 0.025) >= 1) { lastHit = t; hist = []; answer(true); }
    else if (yRange > 0.09 && yRange > pRange * 1.4 && swings(y, y0, 0.03) >= 2) { lastHit = t; hist = []; answer(false); }
  }
  function camLoop() {
    if (!camOn || !lm) return;
    var t = performance.now();
    if (vid.readyState >= 2) {
      var r = lm.detectForVideo(vid, t), f = r && r.faceLandmarks && r.faceLandmarks[0];
      if (f) {
        var nose = f[1], top_ = f[10], chin = f[152], le = f[234], ri = f[454];
        var h = chin.y - top_.y, w = ri.x - le.x;
        if (h > 0 && Math.abs(w) > 0) hist.push({ t: t, p: (nose.y - (top_.y + chin.y) / 2) / h, y: (nose.x - (le.x + ri.x) / 2) / w });
        gesture(t);
      }
    }
    rafCam = requestAnimationFrame(camLoop);
  }
  function startCam() {
    var VER = "0.10.14", base = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@" + VER;
    $("cnote").textContent = "…";
    return navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 320, height: 240 }, audio: false }).then(function (stream) {
      vid.srcObject = stream; vid.hidden = false; return vid.play();
    }).then(function () {
      if (lm) return lm;
      return import(base + "/vision_bundle.mjs").then(function (V) {
        return V.FilesetResolver.forVisionTasks(base + "/wasm").then(function (fs) {
          var opts = function (d) { return { baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task", delegate: d }, runningMode: "VIDEO", numFaces: 1 }; };
          return V.FaceLandmarker.createFromOptions(fs, opts("GPU")).catch(function () { return V.FaceLandmarker.createFromOptions(fs, opts("CPU")); });
        });
      }).then(function (m) { lm = m; return m; });
    }).then(function () { $("cnote").textContent = CL.camOn + " · " + CL.hint; camLoop(); });
  }
  function stopCam() {
    cancelAnimationFrame(rafCam);
    var s = vid.srcObject; if (s) s.getTracks().forEach(function (t) { t.stop(); });
    vid.srcObject = null; vid.hidden = true; $("cnote").textContent = "";
  }
  $("cCam").onclick = function () {
    begin();
    camOn = !camOn; $("cCam").classList.toggle("on", camOn);
    if (camOn) startCam().then(function () { if (!awaiting && top) present(); }, function () { camOn = false; $("cCam").classList.remove("on"); stopCam(); ctx.toast(CL.camErr); });
    else stopCam();
  };

  /* ---------- the presence: layered luminous blobs that breathe, and swell with each spoken word ---------- */
  var cv = $("orb"), g = cv.getContext("2d"), level = { v: 0.15, target: 0.15, kick: 0, speaking: false }, raf = 0;
  function size() { var r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = r.width * dpr; cv.height = r.height * dpr; }
  function draw(t) {
    var W = cv.width, H = cv.height, cx = W / 2, cy = H / 2, R0 = Math.min(W, H) * 0.24;
    level.target = level.speaking ? 0.55 : awaiting ? 0.28 : 0.15;
    level.kick *= 0.88; level.v += (level.target + level.kick * 0.35 - level.v) * 0.08;
    g.clearRect(0, 0, W, H);
    g.globalCompositeOperation = "lighter";
    var layers = [[1.55, "rgba(242,179,61,0.10)", 0.9], [1.25, "rgba(255,196,92,0.18)", 1.3], [1.0, "rgba(255,214,140,0.30)", 1.7], [0.72, "rgba(255,236,196,0.55)", 2.2]];
    layers.forEach(function (L2, li) {
      var rr = R0 * L2[0] * (1 + level.v * 0.18), amp = R0 * (0.05 + level.v * 0.16) * (1 - li * 0.15), sp = L2[2];
      g.beginPath();
      for (var k = 0; k <= 96; k++) {
        var a = k / 96 * Math.PI * 2;
        var n = Math.sin(a * 3 + t * 0.0007 * sp + li) * 0.5 + Math.sin(a * 5 - t * 0.0011 * sp + li * 2) * 0.3 + Math.sin(a * 2 + t * 0.0005 * sp) * 0.2;
        var r = rr + n * amp, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        if (k) g.lineTo(x, y); else g.moveTo(x, y);
      }
      var gr = g.createRadialGradient(cx, cy - rr * 0.2, rr * 0.05, cx, cy, rr * 1.1);
      gr.addColorStop(0, L2[1].replace(/[\d.]+\)$/, "0.9)")); gr.addColorStop(0.55, L2[1]); gr.addColorStop(1, "rgba(242,179,61,0)");
      g.fillStyle = gr; g.fill();
    });
    g.globalCompositeOperation = "source-over";
    if (!reduce) raf = requestAnimationFrame(draw);
  }
  window.addEventListener("resize", size); size();
  if (reduce) { level.v = 0.2; draw(0); } else raf = requestAnimationFrame(draw);

  /* ---------- boot ---------- */
  try { var s0 = JSON.parse(store.get("prazos.answers") || "null"); if (s0 && s0.start) A = s0; } catch (e) {}
  if (!A) {
    A = JSON.parse(JSON.stringify(CAL.sample));
    if (!ctx.prerender) {
      $("cnote").innerHTML = esc(CL.noAnswers) + ' · <a href="' + liteHref + '">' + esc(CL.start) + "</a>";
    }
  }
  if (!SR) $("cMic").hidden = true;
  if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) $("cCam").hidden = true;
  rebuild(); renderLine();
  if (location.hash && top) { /* came from a notification: one tap starts the voice (iOS needs a tap) */ $("tapStart").hidden = false; }
};
