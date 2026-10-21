# -*- coding: utf-8 -*-
"""Иконки телефона и OG-превью (launch §3): тёмный знак на янтаре; OG 1200×630 — циферблат + слоган.
Шрифты берутся из fonts/ репо. Запуск из корня репо: python3 _src/mkicons.py"""
import asyncio, os, base64
from playwright.async_api import async_playwright
ROOT = os.getcwd()
def font(f): return "data:font/woff2;base64," + base64.b64encode(open(os.path.join(ROOT, "fonts", f), "rb").read()).decode()
MARK = '<path d="M24 46V16h11a9.5 9.5 0 0 1 0 19H24" fill="none" stroke="{c}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 53c6.5-4 13-4 19.5 0s13 4 19.5 0" fill="none" stroke="{c}" stroke-width="3.5" stroke-linecap="round"/>'
def tile(size, lite=False):
    bg, fg = ("#13203A", "#F2B33D") if lite else ("#D9890B", "#1B1200")
    return f'<html><body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 64 64"><rect width="64" height="64" fill="{bg}"/><g transform="translate(6.4 5.6) scale(.8)">{MARK.format(c=fg)}</g></svg></body></html>'
def orb(size):
    return f'''<html><body style="margin:0;background:#05080F"><svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 100 100">
<defs><radialGradient id="a" cx="50%" cy="44%" r="50%"><stop offset="0" stop-color="#FFF1D2"/><stop offset=".35" stop-color="#FFD07A"/><stop offset=".7" stop-color="#F2B33D" stop-opacity=".55"/><stop offset="1" stop-color="#F2B33D" stop-opacity="0"/></radialGradient>
<radialGradient id="b" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#1A2440"/><stop offset="1" stop-color="#05080F"/></radialGradient></defs>
<rect width="100" height="100" fill="url(#b)"/><circle cx="50" cy="50" r="40" fill="url(#a)"/><circle cx="50" cy="48" r="17" fill="#FFF4DC" opacity=".55"/></svg></body></html>'''
def dial():
    import math
    s = '<svg width="360" height="360" viewBox="0 0 260 260"><circle cx="130" cy="130" r="118" fill="#162034" stroke="#28354E" stroke-width="2"/>'
    for m in range(12):
        a = math.radians(m * 30)
        s += f'<line x1="{130+118*math.sin(a)}" y1="{130-118*math.cos(a)}" x2="{130+108*math.sin(a)}" y2="{130-108*math.cos(a)}" stroke="#3A4A68" stroke-width="2"/>'
    for d, big in [(304, 1), (355, 0), (30, 0), (59, 0), (120, 0), (181, 0), (212, 0), (243, 0), (263, 0)]:
        a = math.radians(d)
        s += f'<circle cx="{130+104*math.sin(a)}" cy="{130-104*math.cos(a)}" r="{8 if big else 5.5}" fill="{"#F2B33D" if big else "#E8EDF6"}"/>'
    s += '<g transform="rotate(290 130 130)"><line x1="130" y1="130" x2="130" y2="34" stroke="#F2B33D" stroke-width="4" stroke-linecap="round"/></g><circle cx="130" cy="130" r="6" fill="#F2B33D"/></svg>'
    return s
OG = f'''<html><head><meta charset="utf-8"><style>
@font-face{{font-family:U;font-weight:700;src:url({font("unbounded-latin-700-normal.woff2")})}}
@font-face{{font-family:P;font-weight:400;src:url({font("ibm-plex-sans-latin-400-normal.woff2")})}}
@font-face{{font-family:M;font-weight:500;src:url({font("ibm-plex-mono-latin-500-normal.woff2")})}}
body{{margin:0;width:1200px;height:630px;background:#0E1524;color:#E8EDF6;display:flex;align-items:center;gap:56px;padding:0 80px;box-sizing:border-box;font-family:P,sans-serif}}
.l{{flex:1}} .b{{display:flex;align-items:center;gap:20px}} h1{{font:700 84px U,sans-serif;margin:0}}
p{{font-size:40px;margin:26px 0 0;color:#E8EDF6}} .s{{font:500 26px M,monospace;color:#F2B33D;margin-top:34px;letter-spacing:.04em}}
</style></head><body><div class="l"><div class="b"><svg width="96" height="96" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#F2B33D"/>{MARK.format(c="#1B1200")}</svg><h1>Prazos</h1></div>
<p>Nenhum prazo passa.</p><div class="s">SEGURANÇA SOCIAL · IRS · IVA</div></div>{dial()}</body></html>'''
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        for name, size, lite in [("apple-touch-icon.png", 180, False), ("icon-192.png", 192, False), ("icon-512.png", 512, False),
                                 ("apple-touch-icon-lite.png", 180, True), ("icon-lite-192.png", 192, True), ("icon-lite-512.png", 512, True),
                                 ("apple-touch-icon-clara.png", 180, "clara"), ("icon-clara-192.png", 192, "clara"), ("icon-clara-512.png", 512, "clara")]:
            pg = await b.new_page(viewport={"width": size, "height": size})
            await pg.set_content(orb(size) if lite == "clara" else tile(size, lite)); await pg.screenshot(path=name)
        pg = await b.new_page(viewport={"width": 1200, "height": 630})
        await pg.set_content(OG); await pg.wait_for_timeout(300); await pg.screenshot(path="og-image.png")
        await b.close()
asyncio.run(main())
print("icons ok")
