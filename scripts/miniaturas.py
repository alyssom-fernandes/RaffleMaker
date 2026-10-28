"""Refaz as miniaturas dos 10 modelos em arte/miniaturas.

A causa padrão é vazia, então as miniaturas usam a causa da demonstração, lida de index.html?demo=1.
Requisitos: Playwright para Python com o Microsoft Edge, e Pillow.
Uso, na raiz do repositório: python scripts/miniaturas.py
"""
import functools, io, pathlib, threading, urllib.parse
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from PIL import Image
from playwright.sync_api import sync_playwright

RAIZ = pathlib.Path(__file__).resolve().parent.parent
VENDIDOS = "3,7,12,13,21,40,77,100,150,207,256"


class Quieto(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


# o painel e os modelos só funcionam por http(s)
srv = ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quieto, directory=str(RAIZ)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{srv.server_address[1]}/"
try:
    with sync_playwright() as p:
        nav = p.chromium.launch(channel="msedge")
        pg = nav.new_page(viewport={"width": 1080, "height": 1920})
        pg.goto(base + "index.html?demo=1")
        pg.wait_for_function("window.__rifa && window.__rifa.estado")
        q = urllib.parse.urlencode({"causa": pg.evaluate("window.__rifa.estado.causa"), "vendidos": VENDIDOS})
        for m in range(1, 11):
            pg.goto(base + f"arte/m{m:02d}.html?{q}", wait_until="networkidle")
            pg.wait_for_function("document.documentElement.dataset.pronto", timeout=20000)
            png = pg.screenshot(clip={"x": 0, "y": 0, "width": 1080, "height": 1920})
            img = Image.open(io.BytesIO(png)).convert("RGB").resize((216, 384), Image.Resampling.LANCZOS)
            img.save(RAIZ / "arte" / "miniaturas" / f"m{m:02d}.jpg", quality=84, optimize=True, progressive=True)
            print("ok", f"m{m:02d}.jpg")
        nav.close()
finally:
    srv.shutdown()
