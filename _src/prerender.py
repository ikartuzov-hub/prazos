# -*- coding: utf-8 -*-
"""Пререндер Prazos (seo-visibility-standard §1.1, по образцу painel/_src/prerender.py).
Оболочки _src/pages/{index,flyer}.html открываются в Chromium на каждом из пяти языков,
DOM сохраняется как обычный HTML:  /  /flyer.html → PT;  /en/ /ru/ /es/ /de/ (+ flyer.html).
Язык задаётся ДО отрисовки (window.PRAZOS_LANG), в снимке — пример ответов из data/calendar.json,
анимация циферблата выключена. В браузере движок перерисует всё по ответам человека и сегодняшней дате.
Запуск из корня репо: python3 _src/prerender.py (обычно через _src/build.py)."""
import asyncio, json, os, re, http.server, socketserver, threading, functools, datetime, shutil

ROOT = os.getcwd()
REG = json.load(open(os.path.join(ROOT, "manifest.json"), encoding="utf-8"))
SITE, LANGS = REG["site"], REG["langs"]
HTML_LANG = {"pt": "pt-PT", "en": "en", "ru": "ru", "es": "es", "de": "de"}
OG_LOCALE = {"pt": "pt_PT", "en": "en_GB", "ru": "ru_RU", "es": "es_ES", "de": "de_DE"}
PAGES = {"": ("meta.title", "meta.desc"), "flyer.html": ("meta.flyerTitle", "meta.flyerDesc")}
TODAY = datetime.date.today().isoformat()
CAL = json.load(open(os.path.join(ROOT, "data/calendar.json"), encoding="utf-8"))


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve(directory):
    h = functools.partial(Quiet, directory=directory)
    socketserver.TCPServer.allow_reuse_address = True
    s = socketserver.TCPServer(("127.0.0.1", 0), h)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s, s.server_address[1]


def dig(d, key):
    for k in key.split("."):
        d = d[k]
    return d


def url_of(page, lang):
    return SITE + ("" if lang == "pt" else lang + "/") + page


def head_fix(html, page, lang, ui):
    tkey, dkey = PAGES[page]
    title, desc = dig(ui, tkey), dig(ui, dkey)
    u = url_of(page, lang)
    esc = lambda s: s.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;")
    html = re.sub(r'<html lang="[^"]*"', '<html lang="%s"' % HTML_LANG[lang], html, count=1)
    html = re.sub(r"<title>.*?</title>", "<title>%s</title>" % esc(title), html, count=1, flags=re.S)
    html = re.sub(r'<meta name="description" content="[^"]*">', '<meta name="description" content="%s">' % esc(desc), html, count=1)
    html = re.sub(r'<meta property="og:title" content="[^"]*">', '<meta property="og:title" content="%s">' % esc(title), html, count=1)
    html = re.sub(r'<meta property="og:description" content="[^"]*">', '<meta property="og:description" content="%s">' % esc(desc), html, count=1)
    html = re.sub(r'<link rel="canonical" href="[^"]*">', '<link rel="canonical" href="%s">' % u, html, count=1)
    html = re.sub(r'<meta property="og:url" content="[^"]*">', '<meta property="og:url" content="%s">' % u, html, count=1)
    html = re.sub(r'<meta property="og:locale" content="[^"]*">', '<meta property="og:locale" content="%s">' % OG_LOCALE[lang], html, count=1)
    html = re.sub(r'\s*<link rel="alternate" hreflang="[^"]*" href="[^"]*">', "", html)
    alt = "".join('\n<link rel="alternate" hreflang="%s" href="%s">' % (HTML_LANG[l], url_of(page, l)) for l in LANGS)
    alt += '\n<link rel="alternate" hreflang="x-default" href="%s">' % url_of(page, "pt")
    html = html.replace('<link rel="canonical"', alt.lstrip("\n") + '\n<link rel="canonical"', 1)
    boot = '<script>window.PRAZOS_LANG="%s";</script>' % lang
    if lang != "pt":
        boot = '<base href="../">' + boot
    html = re.sub(r'<base href="[^"]*">', "", html)
    html = re.sub(r'<script>window\.PRAZOS_LANG="[a-z]{2}";</script>', "", html)
    html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n' + boot, 1)
    html = re.sub(r'<script type="application/ld\+json">.*?</script>\s*', "", html, flags=re.S)
    ld = {
        "@context": "https://schema.org", "@type": "WebApplication" if page == "" else "WebPage",
        "name": title, "description": desc, "url": u, "inLanguage": HTML_LANG[lang], "dateModified": CAL["verified"],
        "isPartOf": {"@type": "WebSite", "name": "Prazos", "url": SITE},
        "author": {"@type": "Person", "name": "Igor Kartuzov", "url": REG["linkedin"]},
        "publisher": {"@type": "Organization", "name": "SeedWave", "url": REG["hub"]},
    }
    if page == "":
        ld.update({"applicationCategory": "BusinessApplication", "operatingSystem": "Web",
                   "offers": {"@type": "Offer", "price": "0", "priceCurrency": "EUR"}})
    html = html.replace("</head>", '<script type="application/ld+json">%s</script>\n</head>' % json.dumps(ld, ensure_ascii=False), 1)
    return html


FLATTEN = """() => {
  document.querySelectorAll('.menu').forEach(e => e.hidden = true);
  document.querySelectorAll('#dial .dot').forEach(e => e.removeAttribute('opacity'));
  document.documentElement.removeAttribute('data-ready');
  document.documentElement.removeAttribute('data-theme');
}"""


async def main():
    from playwright.async_api import async_playwright
    src = os.path.join(ROOT, "_src", "pages")
    stage = "/tmp/prazos-stage"
    shutil.rmtree(stage, ignore_errors=True)
    shutil.copytree(ROOT, stage, ignore=shutil.ignore_patterns(".git", "_src", *LANGS[1:]))
    for page in PAGES:
        f = page or "index.html"
        shutil.copy(os.path.join(src, f), os.path.join(stage, f))
    srv, port = serve(stage)
    out = {}
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        for lang in LANGS:
            ui = json.load(open(os.path.join(ROOT, "ui.%s.json" % lang), encoding="utf-8"))
            ctx = await b.new_context(viewport={"width": 1280, "height": 900}, reduced_motion="reduce",
                                      locale=HTML_LANG[lang], timezone_id="Atlantic/Madeira")
            await ctx.add_init_script('window.PRAZOS_LANG="%s";window.PRAZOS_PRERENDER=true;' % lang)
            for page in PAGES:
                pg = await ctx.new_page()
                errs = []
                pg.on("pageerror", lambda e: errs.append(str(e)))
                await pg.goto("http://127.0.0.1:%d/%s" % (port, page or "index.html"))
                await pg.wait_for_selector("html[data-ready]", timeout=20000)
                await pg.wait_for_timeout(300)
                if errs:
                    raise SystemExit("JS error on %s/%s: %s" % (lang, page, errs))
                await pg.evaluate(FLATTEN)
                html = "<!doctype html>\n" + await pg.evaluate("document.documentElement.outerHTML")
                out[(page, lang)] = head_fix(html, page, lang, ui)
                await pg.close()
            await ctx.close()
        await b.close()
    srv.shutdown()
    for (page, lang), html in out.items():
        d = ROOT if lang == "pt" else os.path.join(ROOT, lang)
        os.makedirs(d, exist_ok=True)
        open(os.path.join(d, page or "index.html"), "w", encoding="utf-8").write(html)
    sm = ['<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">']
    for page in PAGES:
        for lang in LANGS:
            sm.append("  <url><loc>%s</loc><lastmod>%s</lastmod>" % (url_of(page, lang), TODAY))
            for l in LANGS:
                sm.append('    <xhtml:link rel="alternate" hreflang="%s" href="%s"/>' % (HTML_LANG[l], url_of(page, l)))
            sm.append('    <xhtml:link rel="alternate" hreflang="x-default" href="%s"/>' % url_of(page, "pt"))
            sm.append("  </url>")
    sm.append("</urlset>")
    open(os.path.join(ROOT, "sitemap.xml"), "w").write("\n".join(sm) + "\n")
    open(os.path.join(ROOT, "robots.txt"), "w").write("User-agent: *\nAllow: /\n\nSitemap: %ssitemap.xml\n" % SITE)
    print("prerender: %d адресов" % len(out))


if __name__ == "__main__":
    asyncio.run(main())
