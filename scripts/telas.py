"""Refaz as imagens do README e da prévia de link, em docs/telas, a partir da demonstração.

Tudo sai de index.html?demo=1, que só existe na memória: nenhuma imagem usa dados salvos.
- painel-claro.png e painel-escuro.png: o painel num computador (1440 × 900, escala 1,4);
- celular.png: o painel num celular (390 × 844, escala 1,4);
- artes.png, og.png, capa.png e modelos.png: montagens com os PNGs que o próprio painel exporta.
Requisitos: Playwright para Python com o Microsoft Edge, e Pillow.
Uso, na raiz do repositório: python scripts/telas.py
"""
import base64, functools, io, pathlib, threading, time
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from PIL import Image
from playwright.sync_api import sync_playwright

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SAIDA = RAIZ / "docs" / "telas"
OK = "document.querySelector('#quadro').classList.contains('ok')"
MODELOS = ["Cartela", "Pôster", "Bento", "Vitrine", "Capa", "Jornal", "Embarque", "Solidária", "Blocos", "Cinema"]
VITRINE = (1, 2, 3)  # os modelos dos três celulares do topo do README e da prévia de link: esquerda, meio, direita
COMPUTADOR = {"viewport": {"width": 1440, "height": 900}, "device_scale_factor": 1.4}
CELULAR = {"viewport": {"width": 390, "height": 844}, "device_scale_factor": 1.4, "is_mobile": True, "has_touch": True}
VISIVEIS_PRONTAS = """[...document.images].filter(i => { const r = i.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight; })
  .every(i => i.complete && i.naturalWidth > 0)"""

# montagens: a mesma identidade do painel (Geist, azul, celular com a moldura do Status) sobre fundo escuro
PAGINA = """<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400..800&family=JetBrains+Mono:wght@700&display=block">
<style>
  *{ box-sizing:border-box; margin:0; padding:0 }
  /*TAMANHO*/
  html, body{ overflow:hidden; background:#0e0f12 }
  body{ position:relative; font-family:Geist, sans-serif; color:#eceef1; -webkit-font-smoothing:antialiased }
  .cel{ position:absolute; width:304px; padding:9px; border-radius:46px; background:#0b0b0d; box-shadow:0 0 0 1px #34363d, 0 60px 90px -40px rgba(0,0,0,.9) }
  .tela{ position:relative; border-radius:37px; overflow:hidden; background:#000; color:#fff }
  .tela::before{ content:''; position:absolute; z-index:2; top:9px; left:50%; width:86px; height:24px; margin-left:-43px; border-radius:14px; background:#0b0b0d }
  .story{ position:relative; display:flex; align-items:center; gap:8px; padding:50px 14px 10px; font-size:12.5px }
  .story::before{ content:''; position:absolute; left:12px; right:12px; top:40px; height:2.5px; border-radius:2px; background:linear-gradient(90deg, #fff 0 38%, rgba(255,255,255,.32) 38%) }
  .story .avatar{ width:26px; height:26px; display:grid; place-items:center; border-radius:50%; background:#2448f0; font-weight:700; font-size:12px }
  .story small{ color:rgba(255,255,255,.6); font-size:12px }
  .tela img{ display:block; width:100%; aspect-ratio:9/16 }
  .responder{ padding:9px 0 15px; text-align:center; font-size:12px; color:rgba(255,255,255,.7) }
  .texto{ position:absolute }
  .marca{ font-family:'JetBrains Mono', monospace; font-weight:700; letter-spacing:.32em }
  .marca .afn{ color:#c44a5a }
  .marca .sys{ color:rgba(255,255,255,.42) }
  h1{ font-weight:700; letter-spacing:-.035em; line-height:1; color:#fff }
  .traco{ display:block; background:#3d5cf5; border-radius:2px }
  .sub{ color:#c5c8cf; line-height:1.45; text-wrap:pretty }
  .lista{ list-style:none; display:grid; gap:9px; margin-top:30px; font-size:14px; color:#c5c8cf }
  .lista li::before{ content:''; display:inline-block; width:6px; height:6px; margin:0 12px 2px 0; background:#3d5cf5 }
  .janela{ position:absolute; border:1px solid #2a2c32; border-radius:10px; overflow:hidden; background:#18191d; box-shadow:0 40px 80px -40px rgba(0,0,0,.9) }
  .janela .barra{ display:flex; align-items:center; gap:6px; height:28px; padding:0 12px; border-bottom:1px solid #2a2c32 }
  .janela .barra i{ width:9px; height:9px; border-radius:50%; background:#3b3e45 }
  .janela .barra span{ margin-left:12px; font-size:11px; color:#9b9fa8 }
  .janela img{ display:block; width:100% }
  .fone{ position:absolute; padding:7px; border-radius:30px; background:#0b0b0d; box-shadow:0 0 0 1px #34363d, 0 40px 70px -30px rgba(0,0,0,.95) }
  .fone .vidro{ position:relative; border-radius:24px; overflow:hidden; padding-top:22px; background:#f5f6f8 }
  .fone .vidro::before{ content:''; position:absolute; top:6px; left:50%; width:52px; height:15px; margin-left:-26px; border-radius:8px; background:#0b0b0d }
  .fone img{ display:block; width:100% }
  .grade{ position:absolute; inset:36px; display:grid; grid-template-columns:repeat(5, 1fr); gap:22px 20px; align-content:center }
  .grade img{ display:block; width:100%; aspect-ratio:9/16; border-radius:8px; box-shadow:0 0 0 1px rgba(255,255,255,.07), 0 18px 30px -18px rgba(0,0,0,.9) }
  .grade figcaption{ display:flex; align-items:center; gap:8px; margin-top:10px; font-size:13px; font-weight:550; color:#c5c8cf }
  .grade b{ min-width:20px; height:20px; padding:0 5px; border-radius:10px; background:#2a2c32; color:#fff; font-size:11px; font-weight:700; line-height:20px; text-align:center }
</style></head><body><!--CORPO--></body></html>"""


class Quieto(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


class Servidor(ThreadingHTTPServer):
    request_queue_size = 64  # o navegador abre muitas conexões de uma vez; no Windows, a fila padrão (5) recusa as que sobram


def esperar(pg, expressao, timeout=30000):
    # o wait_for_function avalia texto com eval, que a CSP do painel bloqueia; o evaluate não passa pela CSP
    fim = time.monotonic() + timeout / 1000
    while not pg.evaluate(f"() => !!({expressao})"):
        if time.monotonic() > fim:
            raise TimeoutError(f"esperei {timeout} ms por: {expressao}")
        pg.wait_for_timeout(100)


def pronto(pg):
    """Espera as fontes e as imagens que aparecem na tela."""
    pg.evaluate("document.fonts.ready.then(() => true)")
    esperar(pg, VISIVEIS_PRONTAS)
    pg.wait_for_timeout(300)


def abrir_demo(nav, base, **opcoes):
    pg = nav.new_page(**opcoes)
    pg.goto(base + "index.html?demo=1")
    esperar(pg, OK)
    return pg


def trocar_modelo(pg, m):
    pg.click(f'.modelo[data-m="{m}"]')
    esperar(pg, f"window.__rifa.estado.modelo === {m} && document.querySelector('#quadro').src.endsWith('m{m:02d}.html') && " + OK)


def png_do_painel(pg):
    url = pg.evaluate("""async () => { const g = await window.__rifa.gerarImagem();
        return await new Promise(ok => { const f = new FileReader(); f.onload = () => ok(f.result); f.readAsDataURL(g.blob); }); }""")
    return Image.open(io.BytesIO(base64.b64decode(url.split(",", 1)[1]))).convert("RGB")


def salvar(png, nome):
    img = Image.open(io.BytesIO(png)).convert("RGB")
    img.save(SAIDA / nome, optimize=True)
    print("ok", nome, f"{img.width}x{img.height}")
    return img


def dado(img, largura):
    """A imagem reduzida para `largura` px, como data: URL (a redução do Pillow é melhor que a do navegador)."""
    if img.width > largura:
        img = img.resize((largura, round(img.height * largura / img.width)), Image.Resampling.LANCZOS)
    b = io.BytesIO()
    img.save(b, "PNG")
    return "data:image/png;base64," + base64.b64encode(b.getvalue()).decode()


def celular(src, x, y, escala, giro=0, z=1):
    return (f'<div class="cel" style="left:{x}px; top:{y}px; z-index:{z}; transform:translate(-50%, -50%) rotate({giro}deg) scale({escala})">'
            '<div class="tela"><div class="story"><span class="avatar">R</span><b>Sua rifa</b><small>agora</small></div>'
            f'<img src="{src}" alt=""><p class="responder">Responder</p></div></div>')


MARCA = '<p class="marca" style="font-size:{}px"><span class="afn">AFN</span> <span class="sys">SYSTEMS</span></p>'


def montar(nav, nome, largura, altura, corpo, escala=1):
    pg = nav.new_page(viewport={"width": largura, "height": altura}, device_scale_factor=escala)
    html = PAGINA.replace("/*TAMANHO*/", f"html, body{{ width:{largura}px; height:{altura}px }}").replace("<!--CORPO-->", corpo)
    pg.set_content(html, wait_until="networkidle")
    pronto(pg)
    salvar(pg.screenshot(), nome)
    pg.close()


def capturas(nav, base):
    # computador, tema claro: a venda de um comprador aberta ao lado da grade
    pg = abrir_demo(nav, base, color_scheme="light", **COMPUTADOR)
    pg.evaluate("() => { [...document.querySelectorAll('#tabela tr')].find(tr => tr.textContent.includes('Bruno Costa')).click(); scrollTo(0, 0); }")
    pronto(pg)
    salvar(pg.screenshot(), "painel-claro.png")
    # os 10 PNGs que o painel exporta, com os dados da demonstração
    artes = {}
    for m in range(1, 11):
        if m != 1:
            trocar_modelo(pg, m)
        artes[m] = png_do_painel(pg)
    pg.close()

    # computador, tema escuro: os compradores e a arte no celular, com outro modelo
    pg = abrir_demo(nav, base, color_scheme="dark", **COMPUTADOR)
    trocar_modelo(pg, 2)
    pg.evaluate("() => { document.activeElement.blur(); scrollBy(0, document.querySelector('#b-baixar').getBoundingClientRect().bottom - innerHeight + 28); }")
    pg.mouse.move(1435, 5)
    pronto(pg)
    escuro = salvar(pg.screenshot(), "painel-escuro.png")
    pg.close()

    # celular: o resumo e a grade, com dois números selecionados e a barra de baixo
    pg = abrir_demo(nav, base, color_scheme="light", **CELULAR)
    for n in (5, 6):
        pg.click(f'.num[data-n="{n}"]')
    pg.evaluate("() => { document.activeElement.blur(); scrollTo(0, 0); }")
    pronto(pg)
    cel = salvar(pg.screenshot(), "celular.png")
    pg.close()
    return artes, escuro, cel


def montagens(nav, artes, escuro, cel):
    e, m, d = (dado(artes[n], 720) for n in VITRINE)
    # topo do README: três artes no Status
    montar(nav, "artes.png", 1400, 1008, celular(e, 345, 545, 1.18, -8) + celular(d, 1055, 545, 1.18, 8) + celular(m, 700, 504, 1.38, 0, 2))
    # prévia de link (og:image), 1200 × 630
    texto = ('<div class="texto" style="left:76px; top:50%; width:400px; transform:translateY(-50%)">' + MARCA.format(13)
             + '<h1 style="font-size:70px; margin-top:22px">RaffleMaker</h1><i class="traco" style="width:48px; height:4px; margin:30px 0 26px"></i>'
             '<p class="sub" style="font-size:25px; width:360px">Painel de rifa: marca os números vendidos e gera a arte do story.</p></div>')
    montar(nav, "og.png", 1200, 630, texto + celular(e, 690, 330, .74, -8) + celular(d, 1030, 330, .74, 8) + celular(m, 860, 315, .86, 0, 2))
    # capa das telas: o painel no computador e no celular
    texto = ('<div class="texto" style="left:58px; top:118px; width:252px">' + MARCA.format(9.5)
             + '<h1 style="font-size:46px; margin-top:14px">RaffleMaker</h1><i class="traco" style="width:34px; height:3px; margin:24px 0 20px"></i>'
             '<p class="sub" style="font-size:16.5px">Painel para quem vende rifa pelo WhatsApp: marca os números vendidos e gera a arte do story.</p>'
             '<ul class="lista"><li>10 modelos de arte para o story</li><li>Quem pagou e quem falta pagar</li><li>Os dados ficam no aparelho</li></ul></div>')
    janela = ('<div class="janela" style="left:372px; top:96px; width:592px"><div class="barra"><i></i><i></i><i></i><span>RaffleMaker/?demo=1</span></div>'
              f'<img src="{dado(escuro, 1184)}" alt=""></div>')
    fone = f'<div class="fone" style="left:316px; top:262px; width:170px"><div class="vidro"><img src="{dado(cel, 312)}" alt=""></div></div>'
    montar(nav, "capa.png", 1008, 630, texto + janela + fone, escala=2)
    # os 10 modelos lado a lado
    figuras = "".join(f'<figure><img src="{dado(artes[n], 254)}" alt=""><figcaption><b>{n}</b>{nome}</figcaption></figure>'
                      for n, nome in enumerate(MODELOS, 1))
    montar(nav, "modelos.png", 1000, 750, f'<div class="grade">{figuras}</div>', escala=1.5)


SAIDA.mkdir(parents=True, exist_ok=True)
srv = Servidor(("127.0.0.1", 0), functools.partial(Quieto, directory=str(RAIZ)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{srv.server_address[1]}/"
try:
    with sync_playwright() as p:
        nav = p.chromium.launch(channel="msedge")
        montagens(nav, *capturas(nav, base))
        nav.close()
finally:
    srv.shutdown()
