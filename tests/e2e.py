"""Teste do painel num navegador de verdade (Playwright).

Confere o que não pode quebrar no uso real:
- a demonstração (?demo=1) nunca lê nem grava os dados salvos (rifa.painel.v1);
- o PNG gerado pelo painel bate com a captura de cada um dos 10 modelos;
- o estado salvo entra e sai igual, com campos desconhecidos, e os backups antigos restauram;
- um aparelho novo começa com a causa vazia, e a migração de 27/10 continua;
- nenhum erro no console nem na rede (fora o /favicon.ico na raiz do site).

Requisitos: pip install playwright pillow && playwright install chromium
Uso: python tests/e2e.py [URL publicada]   (sem URL, serve a pasta do repositório)
No Windows, dá para usar o Edge instalado: PLAYWRIGHT_CANAL=msedge python tests/e2e.py
"""
import base64, functools, io, json, os, pathlib, sys, tempfile, threading, time, urllib.parse
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from PIL import Image, ImageChops, ImageStat
from playwright.sync_api import sync_playwright

RAIZ = pathlib.Path(__file__).resolve().parent.parent
CHAVE = "rifa.painel.v1"
CAUSA_DEMO = "Em prol da reforma da creche do bairro"
LIMITE_DIFERENCA = 4  # média por canal, de 0 a 255; só a suavização das letras muda entre o PNG e a captura
AGORA = "2026-10-28T12:00:00.000Z"
venda = lambda nome, pago: {"nome": nome, "tel": "", "pago": pago, "obs": "", "criado": AGORA, "atualizado": AGORA}
# formato de hoje, na ordem em que o painel grava, mais um campo desconhecido
ESTADO = {"modelo": 1, "riscar": "todos", "numeros": {"3": venda("Teste A", True), "7": venda("Teste B", False), "12": venda("Teste A", True)},
          "ultimoBackup": None, "alteracoes": 0, "frase": "Sorteio pela Loteria Federal", "valor": "20", "qtd": 300,
          "causa": "Em prol de um teste automático do painel", "campoNovo": "preservado"}
# formato de 27/10: sem causa, valor e quantidade
ANTIGO = {"modelo": 2, "riscar": "todos", "numeros": {"1": venda("Antigo", True), "2": venda("Antigo", False)},
          "ultimoBackup": None, "alteracoes": 3, "frase": "Em prol da reforma da escola"}
# registra todo acesso ao localStorage e ao sessionStorage da página e dos iframes
ESPIAO = """(() => {
  const log = window.__acessos = [];
  for (const m of ['getItem', 'setItem', 'removeItem', 'clear', 'key']) {
    const orig = Storage.prototype[m];
    Storage.prototype[m] = function (...a) { log.push(m + ' ' + String(a[0])); return orig.apply(this, a); };
  }
})();"""
TUDO = "() => Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)]))"
SALVO = f"localStorage.getItem('{CHAVE}')"
OK = "document.querySelector('#quadro').classList.contains('ok')"
resultados, erros, ignorados = [], [], []


def checar(nome, ok, detalhe=""):
    resultados.append((bool(ok), nome, detalhe))


def vigiar(pg, nome):
    def anotar(texto, url=""):
        (ignorados if url.split("?")[0].endswith("/favicon.ico") else erros).append(f"{nome}: {texto}")
    pg.on("pageerror", lambda e: anotar(f"pageerror {e}"))
    pg.on("console", lambda m: anotar(f"console {m.text}", m.location.get("url", "")) if m.type == "error" else None)
    pg.on("response", lambda r: anotar(f"http {r.status} {r.url}", r.url) if r.status >= 400 else None)
    pg.on("requestfailed", lambda q: anotar(f"falhou {q.url} {q.failure}", q.url) if "ERR_ABORTED" not in (q.failure or "") else None)
    dialogos = []
    def dialogo(d):
        dialogos.append(d.message)
        d.accept()
    pg.on("dialog", dialogo)
    return dialogos


def esperar(pg, expressao, timeout=30000):
    # o wait_for_function avalia texto com eval, que a CSP do painel bloqueia; o evaluate não passa pela CSP
    fim = time.monotonic() + timeout / 1000
    while not pg.evaluate(f"() => !!({expressao})"):
        if time.monotonic() > fim:
            raise TimeoutError(f"esperei {timeout} ms por: {expressao}")
        pg.wait_for_timeout(100)


def esperar_dialogo(pg, dialogos, n):
    for _ in range(60):
        if len(dialogos) > n:
            return dialogos[-1]
        pg.wait_for_timeout(100)
    return None


def png_do_painel(pg):
    url = pg.evaluate("""async () => { const g = await window.__rifa.gerarImagem();
        return await new Promise(ok => { const f = new FileReader(); f.onload = () => ok(f.result); f.readAsDataURL(g.blob); }); }""")
    return Image.open(io.BytesIO(base64.b64decode(url.split(",", 1)[1]))).convert("RGB")


def testar(base, tmp):
    with sync_playwright() as p:
        nav = p.chromium.launch(channel=os.environ.get("PLAYWRIGHT_CANAL") or None)

        # aparelho sem dados
        c = nav.new_context()
        pg = c.new_page(); vigiar(pg, "aparelho novo")
        pg.goto(base + "index.html")
        esperar(pg, OK, timeout=30000)
        checar("aparelho novo: causa vazia", pg.evaluate("window.__rifa.estado.causa") == "")
        checar("aparelho novo: a arte esconde o bloco da causa",
               pg.evaluate("document.querySelector('#quadro').contentDocument.documentElement.classList.contains('sem-causa')"))
        checar("aparelho novo: grava o estado com a causa vazia", json.loads(pg.evaluate(SALVO)).get("causa") == "")
        checar("painel de verdade: sem a faixa da demonstração", pg.locator("#faixa-demo").is_hidden() and pg.locator("#salvo").is_visible())
        c.close()

        # migração do formato de 27/10
        for frase, causa, fica in [(ANTIGO["frase"], ANTIGO["frase"], ""), ("Sorteio no sábado", "", "Sorteio no sábado")]:
            c = nav.new_context()
            pg = c.new_page(); vigiar(pg, "migração")
            pg.goto(base + "arte/m01.html")
            pg.evaluate("([k, e]) => localStorage.setItem(k, JSON.stringify(e))", [CHAVE, dict(ANTIGO, frase=frase)])
            pg.goto(base + "index.html")
            esperar(pg, OK, timeout=30000)
            e = json.loads(pg.evaluate(SALVO))
            checar(f"migração de 27/10 com a frase {frase!r}", e["causa"] == causa and e["frase"] == fica and sorted(e["numeros"]) == ["1", "2"]
                   and e["modelo"] == 2 and e["alteracoes"] == 3, json.dumps(e, ensure_ascii=False)[:160])
            c.close()

        # estado de hoje com um campo desconhecido; 10 PNGs do painel x captura de cada modelo
        ctx = nav.new_context(viewport={"width": 1400, "height": 1000})
        pg = ctx.new_page(); dial_real = vigiar(pg, "painel")
        pg.goto(base + "arte/m01.html")
        texto = pg.evaluate("([k, e]) => { const t = JSON.stringify(e); localStorage.setItem(k, t); return t; }", [CHAVE, ESTADO])
        pg.goto(base + "index.html")
        esperar(pg, OK, timeout=30000)
        checar("estado de hoje: igual byte a byte ao abrir o painel", pg.evaluate(SALVO) == texto)
        ref = nav.new_page(viewport={"width": 1080, "height": 1920}); vigiar(ref, "captura")
        q = urllib.parse.urlencode({"causa": ESTADO["causa"], "frase": ESTADO["frase"], "valor": "20", "qtd": 300, "vendidos": "3,7,12"})
        difs = {}
        for m in range(1, 11):
            if m != 1:
                pg.click(f'.modelo[data-m="{m}"]')
            esperar(pg, f"window.__rifa.estado.modelo === {m} && document.querySelector('#quadro').src.endsWith('m{m:02d}.html') && " + OK, timeout=30000)
            img = png_do_painel(pg)
            ref.goto(base + f"arte/m{m:02d}.html?" + q)
            esperar(ref, "document.documentElement.dataset.pronto", timeout=30000)
            cap = Image.open(io.BytesIO(ref.screenshot(clip={"x": 0, "y": 0, "width": 1080, "height": 1920}))).convert("RGB")
            difs[m] = round(sum(ImageStat.Stat(ImageChops.difference(img, cap)).mean) / 3, 2) if img.size == cap.size else float("inf")
        ref.close()
        checar(f"10 PNGs do painel batem com a captura de cada modelo (até {LIMITE_DIFERENCA} em 255)",
               all(d <= LIMITE_DIFERENCA for d in difs.values()), ", ".join(f"m{m}: {d}" for m, d in difs.items()))
        checar("estado de hoje: igual depois de passar pelos 10 modelos", json.loads(pg.evaluate(SALVO)) == dict(ESTADO, modelo=10))

        # demonstração num aparelho que já tem um estado real (em outro formato de texto: qualquer gravação mudaria os bytes)
        cd = nav.new_context(viewport={"width": 1400, "height": 1000}, accept_downloads=True)
        prep = cd.new_page()
        prep.goto(base + "arte/m01.html")
        original = json.dumps(dict(ESTADO, causa="Em prol de um estado real que não pode mudar"), ensure_ascii=False, indent=1)
        prep.evaluate("([k, t]) => { localStorage.setItem(k, t); localStorage.setItem('outro.app', 'intocado'); }", [CHAVE, original])
        antes = prep.evaluate(TUDO)
        prep.close()
        pd = cd.new_page(); dial_demo = vigiar(pd, "demonstração")
        pd.add_init_script(ESPIAO)
        pd.goto(base + "index.html?demo=1")
        esperar(pd, OK, timeout=30000)
        e = pd.evaluate("window.__rifa.estado")
        checar("demonstração: abre a rifa fictícia, não os dados salvos",
               e["causa"] == CAUSA_DEMO and len(e["numeros"]) == 41 and 0 < sum(x["pago"] for x in e["numeros"].values()) < 41)
        checar("demonstração: faixa visível", pd.locator("#faixa-demo").is_visible() and "Demonstração: nada é salvo" in pd.locator("#faixa-demo").inner_text())
        checar("demonstração: sem o selo de salvo e sem links de WhatsApp", pd.locator("#salvo").is_hidden() and pd.locator("#tabela a").count() == 0)
        pd.click('.num[data-n="5"]'); pd.click('.num[data-n="6"]')
        pd.fill("#f-nome", "Comprador da demonstração"); pd.check("#f-pago")
        pd.click("#form button[type=submit]")
        esperar(pd, "window.__rifa.estado.numeros[5] && window.__rifa.estado.numeros[6]")
        pd.locator("#tabela [data-pagar]").first.click()
        pd.click('.modelo[data-m="2"]')
        esperar(pd, "window.__rifa.estado.modelo === 2 && document.querySelector('#quadro').src.endsWith('m02.html') && " + OK, timeout=30000)
        pd.fill("#f-valor", "25")
        pd.click('#seg-qtd button[data-qtd="400"]'); pd.click('#seg-qtd button[data-qtd="300"]')
        pd.fill("#f-causa", "Em prol de um teste da demonstração"); pd.fill("#f-frase", "Frase de teste")
        pd.check("input[name=riscar][value=pagos]")
        pd.wait_for_timeout(700)  # o painel espera 400 ms para salvar o que é digitado
        with pd.expect_download() as d:
            pd.click("#b-baixar")
        checar("demonstração: o PNG sai com \"demonstração\" no nome", "demonstração" in d.value.suggested_filename, d.value.suggested_filename)
        with pd.expect_download() as d:
            pd.click("#b-backup")
        bk = tmp / "backup-demo.json"; d.value.save_as(bk)
        j = json.loads(bk.read_text(encoding="utf-8"))
        checar("demonstração: o backup sai marcado e com o que foi feito nela", "demonstração" in d.value.suggested_filename and j.get("demo") is True
               and j["estado"]["causa"] == "Em prol de um teste da demonstração" and j["estado"]["valor"] == "25" and len(j["estado"]["numeros"]) == 43)
        with pd.expect_download() as d:
            pd.click("#b-csv")
        csv = tmp / "demo.csv"; d.value.save_as(csv)
        checar("demonstração: a planilha sai com 301 linhas", "demonstração" in d.value.suggested_filename and len(csv.read_bytes().split(b"\r\n")) == 301)
        pd.fill("#f-causa", "Outra causa antes de restaurar"); pd.wait_for_timeout(500)
        n = len(dial_demo)
        pd.set_input_files("#arquivo", str(bk))
        msg = esperar_dialogo(pd, dial_demo, n)
        esperar(pd, "window.__rifa.estado.causa === 'Em prol de um teste da demonstração'")
        checar("demonstração: restaurar só abre o arquivo na página", bool(msg) and "Nada será salvo" in msg, msg or "")
        pd.click('.num[data-n="5"]'); pd.click("#b-liberar")
        esperar(pd, "!window.__rifa.estado.numeros[5]")
        checar("demonstração: gera o PNG", pd.evaluate("async () => (await window.__rifa.gerarImagem()).blob.size") > 100000)
        pd.wait_for_timeout(700)
        acessos = {f.url.replace(base, ""): f.evaluate("window.__acessos || []") for f in pd.frames}
        checar("demonstração: nenhum acesso ao armazenamento, nem do painel nem da arte", not any(acessos.values()), json.dumps(acessos))
        pd.reload()
        esperar(pd, OK, timeout=30000)
        e = pd.evaluate("window.__rifa.estado")
        checar("demonstração: recarregar volta ao começo", e["causa"] == CAUSA_DEMO and len(e["numeros"]) == 41 and "5" not in e["numeros"]
               and e["modelo"] == 1 and e["valor"] == "20" and not pd.evaluate("window.__acessos"))
        pd.close()
        ver = cd.new_page(); ver.goto(base + "arte/m01.html")
        depois = ver.evaluate(TUDO)
        checar("demonstração: os dados salvos ficam iguais byte a byte", depois == antes and depois.get(CHAVE) == original)
        cd.close()

        # painel de verdade: o backup da demonstração é recusado; os backups antigos continuam restaurando
        antes_real = pg.evaluate(SALVO)
        n = len(dial_real)
        pg.set_input_files("#arquivo", str(bk))
        msg = esperar_dialogo(pg, dial_real, n)
        pg.wait_for_timeout(300)
        checar("painel de verdade: recusa o backup da demonstração sem mexer nos dados",
               bool(msg) and "demonstração" in msg and len(dial_real) == n + 1 and pg.evaluate(SALVO) == antes_real, msg or "")
        for versao, est, esperado in [(1, ANTIGO, {"causa": ANTIGO["frase"], "frase": "", "valor": "20", "qtd": 300}), (2, ESTADO, ESTADO)]:
            arq = tmp / f"backup-v{versao}.json"
            arq.write_text(json.dumps({"app": "painel-da-rifa", "versao": versao, "salvoEm": AGORA, "estado": est}, ensure_ascii=False, indent=2), encoding="utf-8")
            nums = ",".join(sorted(est["numeros"], key=int))
            pg.set_input_files("#arquivo", str(arq))
            esperar(pg, f"Object.keys(window.__rifa.estado.numeros).join() === '{nums}'", timeout=10000)
            pg.wait_for_timeout(300)
            salvo = json.loads(pg.evaluate(SALVO))
            checar(f"painel de verdade: restaura o backup da versão {versao}",
                   all(salvo.get(k) == v for k, v in esperado.items()) and sorted(salvo["numeros"], key=int) == sorted(est["numeros"], key=int))
        ctx.close()
        nav.close()


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    srv = None
    if len(sys.argv) > 1:
        base = sys.argv[1].rstrip("/") + "/"
    else:
        class Quieto(SimpleHTTPRequestHandler):
            def log_message(self, *a):
                pass
        class Servidor(ThreadingHTTPServer):
            request_queue_size = 64  # o navegador abre muitas conexões de uma vez; no Windows, a fila padrão (5) recusa as que sobram
        srv = Servidor(("127.0.0.1", 0), functools.partial(Quieto, directory=str(RAIZ)))
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        base = f"http://127.0.0.1:{srv.server_address[1]}/"
    try:
        with tempfile.TemporaryDirectory() as tmp:
            testar(base, pathlib.Path(tmp))
    finally:
        if srv:
            srv.shutdown()
    checar("nenhum erro no console nem na rede", not erros, " | ".join(erros))
    for ok, nome, detalhe in resultados:
        print(("ok     " if ok else "FALHA  ") + nome + (f"  [{detalhe}]" if detalhe and (not ok or "PNG" in nome) else ""))
    if ignorados:
        print("ignorado:", " | ".join(ignorados))
    falhas = sum(not ok for ok, *_ in resultados)
    print(f"\n{len(resultados) - falhas} de {len(resultados)} conferências passaram em {base}")
    sys.exit(1 if falhas else 0)
