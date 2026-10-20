# -*- coding: utf-8 -*-
"""Сборка одной командой: registry.js из manifest.json → пререндер 10 адресов → чек-лист.
Запуск из корня репо: python3 _src/build.py"""
import json, subprocess, sys
m = json.load(open("manifest.json", encoding="utf-8"))
reg = {k: m[k] for k in ["site", "hub", "langs", "linkedin"]}
open("registry.js", "w", encoding="utf-8").write(
    "/* Generated from manifest.json by _src/build.py — do not edit by hand. */\nwindow.PRAZOS_REG = %s;\n" % json.dumps(reg, ensure_ascii=False, separators=(",", ":")))
subprocess.run([sys.executable, "_src/prerender.py"], check=True)
sys.exit(subprocess.run([sys.executable, "_src/check.py"]).returncode)
