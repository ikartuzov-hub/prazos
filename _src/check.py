# -*- coding: utf-8 -*-
"""Чек-лист после сборки: семь проверок seo-visibility §1.1 + комплект запуска + локали + каталог дат.
Запуск из корня репо: python3 _src/check.py → код выхода 1 при любой ошибке."""
import json, os, re, sys, glob, html as H

REG = json.load(open("manifest.json", encoding="utf-8"))
SITE, LANGS = REG["site"], REG["langs"]
HL = {"pt": "pt-PT", "en": "en", "ru": "ru", "es": "es", "de": "de"}
PAGES = {"": ("ui.h1", "meta.title"), "flyer.html": ("flyer.h1", "meta.flyerTitle"), "lite.html": ("lite.h1", "meta.liteTitle")}
UI = {l: json.load(open("ui.%s.json" % l, encoding="utf-8")) for l in LANGS}
CAL = json.load(open("data/calendar.json", encoding="utf-8"))
bad = []


def dig(d, k):
    for x in k.split("."):
        d = d[x]
    return d


def text_of(h):
    h = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", h, flags=re.S)
    return re.sub(r"\s+", " ", H.unescape(re.sub(r"<[^>]+>", " ", h))).strip()


for page, (h1key, tkey) in PAGES.items():
    for l in LANGS:
        f = os.path.join("" if l == "pt" else l, page or "index.html")
        h = open(f, encoding="utf-8").read()
        url = SITE + ("" if l == "pt" else l + "/") + page
        tag = "%s [%s]" % (f, l)
        menu = re.search(r'<div class="menu" id="langMenu"[^>]*>(.*?)</div>', h, re.S)
        n = len(re.findall(r"<button", menu.group(1))) if menu else 0
        if n != len(LANGS): bad.append("%s: в меню языков %d кнопок" % (tag, n))
        h1 = re.search(r"<h1[^>]*>(.*?)</h1>", h, re.S)
        if not h1 or H.unescape(h1.group(1)).strip() != dig(UI[l], h1key): bad.append("%s: h1 не на языке адреса" % tag)
        title = H.unescape(re.search(r"<title>(.*?)</title>", h, re.S).group(1))
        desc = H.unescape(re.search(r'<meta name="description" content="([^"]*)"', h).group(1))
        if title != dig(UI[l], tkey): bad.append("%s: title не из словаря языка" % tag)
        if not desc or (l != "pt" and title == dig(UI["pt"], tkey)): bad.append("%s: title/description" % tag)
        can = re.search(r'<link rel="canonical" href="([^"]*)"', h).group(1)
        if can != url: bad.append("%s: canonical %s ≠ %s" % (tag, can, url))
        if not re.search(r'<html lang="%s"' % HL[l], h): bad.append("%s: html lang" % tag)
        hre = re.findall(r'hreflang="([^"]*)"', h)
        if sorted(hre) != sorted([HL[x] for x in LANGS] + ["x-default"]): bad.append("%s: hreflang %s" % (tag, hre))
        for img in re.findall(r"<img[^>]*>", h):
            if not re.search(r'alt="[^"]+"', img): bad.append("%s: img без alt" % tag)
        if len(text_of(h)) < (600 if page == "lite.html" else 1000): bad.append("%s: текста без JS мало (%d)" % (tag, len(text_of(h))))
        if re.search(r'<meta property="og:url" content="([^"]*)"', h).group(1) != url: bad.append("%s: og:url" % tag)
        if "PRAZOS_PRERENDER" in h: bad.append("%s: флаг пререндера попал в страницу" % tag)
        if l != "pt" and '<base href="../">' not in h: bad.append("%s: нет base" % tag)

sm = open("sitemap.xml").read()
if sm.count("<loc>") != len(PAGES) * len(LANGS): bad.append("sitemap: %d <loc>" % sm.count("<loc>"))

for f in ["CNAME", "robots.txt", "manifest.webmanifest", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "og-image.png", "icon.svg", "sw.js", "registry.js"]:
    if not os.path.exists(f): bad.append("нет файла %s" % f)
if not glob.glob("[0-9a-f]" * 32 + ".txt"): bad.append("нет ключа IndexNow")

for f in glob.glob("*.html") + glob.glob("*/*.html"):
    if f.startswith("_src"): continue
    h = open(f, encoding="utf-8").read()
    for need in ['rel="icon" href="icon.svg"', 'rel="apple-touch-icon"', 'rel="manifest"', 'property="og:image"', 'name="twitter:card"']:
        if need not in h: bad.append("%s: нет %s" % (f, need))
    for src in re.findall(r'<script[^>]+src="([^"]+)"', h) + re.findall(r'<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"', h):
        if src.startswith("http"): bad.append("%s: внешний ресурс %s" % (f, src))
    if "fonts.googleapis" in h: bad.append("%s: внешний шрифт" % f)


def keys(d, pre=""):
    out = set()
    for k, v in d.items():
        out |= keys(v, pre + k + ".") if isinstance(v, dict) else {pre + k}
    return out
base = keys(UI["pt"])
for l in LANGS[1:]:
    miss, extra = base - keys(UI[l]), keys(UI[l]) - base
    if miss or extra: bad.append("ui.%s.json: нет %s / лишние %s" % (l, sorted(miss), sorted(extra)))
for l in LANGS:
    if set(UI[l]["ev"]) != set(CAL["events"]): bad.append("ui.%s.json: события не совпадают с каталогом" % l)
    if set(UI[l]["rl"]) != set(CAL["rules"]): bad.append("ui.%s.json: правила не совпадают с каталогом" % l)
for k, v in list(CAL["events"].items()) + list(CAL["rules"].items()):
    if not v.get("src") or v.get("conf") not in ("ok", "wait"): bad.append("каталог %s: нет источника или уверенности" % k)

print("\n".join(bad) if bad else "✅ чек-лист: 0 расхождений (%d адресов)" % (len(PAGES) * len(LANGS)))
sys.exit(1 if bad else 0)
