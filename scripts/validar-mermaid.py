#!/usr/bin/env python3
"""Renderiza cada bloque ```mermaid de los .md del repositorio y falla si alguno no compila.

Uso: python3 scripts/validar-mermaid.py [raíz]
Variables: MMDC (ruta a mmdc, por defecto "mmdc"), PUPPETEER_CONFIG (json opcional).
"""
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

BLOQUE = re.compile(r"```mermaid\n(.*?)```", re.S)
IGNORAR = {".git", "node_modules", ".claude", ".specify"}


def bloques(raiz: Path):
    for md in sorted(raiz.rglob("*.md")):
        if IGNORAR & set(md.relative_to(raiz).parts):
            continue
        for i, codigo in enumerate(BLOQUE.findall(md.read_text(encoding="utf-8"))):
            yield md.relative_to(raiz), i, codigo


def main() -> int:
    raiz = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    mmdc = os.environ.get("MMDC", "mmdc")
    config = os.environ.get("PUPPETEER_CONFIG")
    fallos, total = [], 0
    with tempfile.TemporaryDirectory() as tmp:
        for archivo, i, codigo in bloques(raiz):
            total += 1
            entrada = Path(tmp, f"{total}.mmd")
            salida = entrada.with_suffix(".svg")
            entrada.write_text(codigo, encoding="utf-8")
            cmd = [mmdc, "-q", "-i", str(entrada), "-o", str(salida)]
            if config:
                cmd += ["-p", config]
            r = subprocess.run(cmd, capture_output=True, text=True)
            # mmdc a veces termina en 0 pero dibuja el error dentro del SVG
            svg = salida.read_text(errors="ignore") if salida.exists() else ""
            if r.returncode != 0 or not svg or "Syntax error" in svg:
                fallos.append(f"{archivo} (bloque {i + 1}): {(r.stderr or 'Syntax error').strip()[:300]}")
    for f in fallos:
        print(f"ERROR {f}")
    print(f"{total} diagramas, {len(fallos)} con errores")
    return 1 if fallos else 0


if __name__ == "__main__":
    sys.exit(main())
