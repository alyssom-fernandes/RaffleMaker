/* motor.js — monta a arte da rifa a partir dos dados e ajusta os tamanhos.
   Dados: window.RIFA (quando o painel abre o modelo) ou parâmetros da URL:
   ?causa=...&valor=...&frase=...&qtd=300|400|500&vendidos=1,2,3
   O painel chama window.rifaAplicar(dados), que devolve uma Promise quando a arte está pronta. */
(function () {
  'use strict';
  var doc = document, raiz = doc.documentElement, rodada = 0;

  var PADRAO = {
    causa: 'Em prol da reforma da creche do bairro',
    frase: '', valor: '20', qtd: 300, vendidos: []
  };

  function lerURL() {
    var q = new URLSearchParams(location.search), d = {};
    ['causa', 'frase', 'valor'].forEach(function (k) { if (q.has(k)) d[k] = q.get(k); });
    if (q.has('qtd')) d.qtd = parseInt(q.get('qtd'), 10);
    if (q.has('vendidos')) d.vendidos = q.get('vendidos').split(/[\s,;]+/).filter(Boolean).map(Number);
    return d;
  }

  // "12,50" / "12.5" / "1.000" / "1000" -> "12,50" / "12,50" / "1.000" / "1.000"
  function formatarValor(v) {
    var s = String(v == null ? '' : v).trim().replace(/[^\d.,]/g, ''), n;
    if (!s) return '';
    if (/,\d{1,2}$/.test(s)) n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
    else if (/\.\d{1,2}$/.test(s)) n = parseFloat(s.replace(/,/g, ''));
    else n = parseFloat(s.replace(/[.,]/g, ''));
    if (!isFinite(n) || n <= 0) return '';
    var inteiro = Math.floor(n + 1e-9), cent = Math.round((n - inteiro) * 100);
    if (cent >= 100) { inteiro += 1; cent = 0; }
    var txt = String(inteiro).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return cent ? txt + ',' + String(cent).padStart(2, '0') : txt;
  }

  // iniciais seguidas ("P. A.") nunca se separam na quebra de linha
  function cuidarTexto(t) {
    return String(t || '').replace(/\s+/g, ' ').trim()
      .replace(/\b([A-ZÀ-Ý])\. (?=[A-ZÀ-Ý]\.)/g, '$1. ');
  }

  function normalizar(d) {
    var P = Object.assign({}, PADRAO, d || {});
    P.qtd = [300, 400, 500].indexOf(+P.qtd) >= 0 ? +P.qtd : 300;
    P.valor = formatarValor(P.valor) || '20';
    P.causa = cuidarTexto(P.causa);
    P.frase = cuidarTexto(P.frase);
    P.vendidos = (P.vendidos || []).map(Number).filter(function (n) { return n >= 1 && n <= P.qtd; });
    return P;
  }

  function preencher(P) {
    raiz.dataset.qtd = P.qtd;
    doc.querySelectorAll('.qtd-fim').forEach(function (e) { e.textContent = String(P.qtd).padStart(3, '0'); });
    doc.querySelectorAll('.qtd-total').forEach(function (e) { e.textContent = P.qtd; });
    doc.querySelectorAll('[data-valor]').forEach(function (e) { e.textContent = P.valor; });
    doc.querySelectorAll('[data-causa]').forEach(function (e) { e.textContent = P.causa; });
    doc.querySelectorAll('[data-frase]').forEach(function (e) { e.textContent = P.frase; });
    raiz.classList.toggle('sem-causa', !P.causa);
    raiz.classList.toggle('sem-frase', !P.frase);
  }

  function montarGrade(P) {
    var grade = doc.getElementById('grade');
    if (!grade) return;
    grade.innerHTML = '';
    grade.style.removeProperty('--fonte');
    var tpl = doc.getElementById('tpl-marca'), depois = tpl && tpl.dataset.onde === 'depois';
    var tplSep = doc.getElementById('tpl-sep');
    var comSep = grade.hasAttribute('data-sep'), vend = new Set(P.vendidos);
    for (var b = 0; b < P.qtd / 100; b++) {
      var bloco = doc.createElement('div');
      bloco.className = 'bloco';
      if (comSep && b > 0) {
        if (tplSep) bloco.appendChild(tplSep.content.cloneNode(true));
        else { var sep = doc.createElement('i'); sep.className = 'sep'; bloco.appendChild(sep); }
      }
      for (var i = 1; i <= 100; i++) {
        var n = b * 100 + i, s = String(n).padStart(3, '0'), z = s.match(/^0*/)[0];
        var cel = doc.createElement('div');
        cel.className = 'cel' + (vend.has(n) ? ' vendido' : '');
        cel.dataset.n = n;
        cel.innerHTML = (z ? '<span class="z">' + z + '</span>' : '') + '<span class="d">' + s.slice(z.length) + '</span>';
        if (vend.has(n) && tpl) {
          var m = tpl.content.cloneNode(true);
          if (depois) cel.appendChild(m); else cel.insertBefore(m, cel.firstChild);
        }
        bloco.appendChild(cel);
      }
      grade.appendChild(bloco);
    }
  }

  function status(P) {
    var el = doc.getElementById('status');
    if (!el) return;
    var v = P.vendidos.length, r = P.qtd - v;
    el.innerHTML = !v ? '' : r <= 0 ? '<b>esgotado!</b>'
      : 'restam <b>' + r + '</b> ' + (r === 1 ? 'número' : 'números');
  }

  // ---------- ajustes de tamanho ----------
  function cfg(el, nome) {
    var o = {};
    (el.getAttribute(nome) || '').split(';').forEach(function (p) {
      var kv = p.split(':');
      if (kv.length < 2) return;
      var k = kv[0].trim(), v = kv.slice(1).join(':').trim();
      if (/^var\(/.test(v)) v = getComputedStyle(el).getPropertyValue(v.slice(4, -1).trim());
      o[k] = parseFloat(v);
    });
    return o;
  }

  // conta as linhas pelo centro dos trechos de texto (ícones no meio da linha não atrapalham)
  function contarLinhas(el) {
    var centros = [], r = doc.createRange(), w = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT), no;
    while ((no = w.nextNode())) {
      if (!no.data.trim()) continue;
      r.selectNodeContents(no);
      Array.prototype.forEach.call(r.getClientRects(), function (q) {
        if (q.width < 1 || q.height < 1) return;
        var c = q.top + q.height / 2;
        if (!centros.some(function (x) { return Math.abs(x - c) < q.height * 0.4; })) centros.push(c);
      });
    }
    return centros.length;
  }

  // maior fonte (entre min e max) em que o texto cabe em `linhas` linhas, sem estourar a largura
  function ajustarTexto(el) {
    el.style.removeProperty('font-size');
    if (!el.textContent.trim() || el.getClientRects().length === 0) return;
    var c = cfg(el, 'data-ajuste'), lim = c.linhas || 3;
    var cabe = function (t) {
      el.style.fontSize = t + 'px';
      return contarLinhas(el) <= lim && el.scrollWidth <= el.clientWidth + 1;
    };
    if (cabe(c.max)) return;
    var lo = c.min, hi = c.max;
    if (!cabe(lo)) { el.style.fontSize = lo + 'px'; return; }
    while (hi - lo > 0.25) { var m = (lo + hi) / 2; if (cabe(m)) lo = m; else hi = m; }
    el.style.fontSize = (Math.floor(lo * 4) / 4) + 'px';
  }

  // diminui a fonte até o conteúdo caber na largura do próprio elemento
  function encaixar(el) {
    el.style.removeProperty('font-size');
    var base = parseFloat(getComputedStyle(el).fontSize), t = base, i = 0;
    while (el.scrollWidth > el.clientWidth + 1 && i++ < 60) { t *= 0.97; el.style.fontSize = t + 'px'; }
  }

  // no SVG (selo): reduz o grupo em volta do próprio centro
  function encaixarSVG(g) {
    g.removeAttribute('transform');
    var lim = parseFloat(g.getAttribute('data-encaixe-svg')), b = g.getBBox();
    if (b.width <= lim) return;
    var s = lim / b.width, cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    g.setAttribute('transform', 'translate(' + cx + ' ' + cy + ') scale(' + s.toFixed(4) + ') translate(' + (-cx) + ' ' + (-cy) + ')');
  }

  // se a grade ficar apertada (causa longa + muitos números + frase), as fotos encolhem até 75%
  function abrirEspaco() {
    var g = doc.getElementById('grade'), c = g && g.querySelector('.cel');
    if (!c) return;
    var vars = (raiz.getAttribute('data-encolher') || '--foto').split(/\s+/);
    vars.forEach(function (v) { raiz.style.removeProperty(v); });
    var cs = getComputedStyle(raiz), base = vars.map(function (v) { return parseFloat(cs.getPropertyValue(v)); });
    var alvo = parseFloat(getComputedStyle(c).fontSize) / 0.7;
    for (var f = 0.97; f >= 0.749; f -= 0.03) {
      if (c.getBoundingClientRect().height >= alvo - 0.5) break;
      vars.forEach(function (v, i) { if (base[i]) raiz.style.setProperty(v, (base[i] * f).toFixed(1) + 'px'); });
    }
  }

  // a letra dos números nunca passa de 70% da altura da casa
  function ajustarGrade() {
    var g = doc.getElementById('grade'), c = g && g.querySelector('.cel');
    if (!c) return;
    var h = c.getBoundingClientRect().height, f = parseFloat(getComputedStyle(c).fontSize);
    if (f > h * 0.7) g.style.setProperty('--fonte', (h * 0.7).toFixed(1) + 'px');
  }

  function quadro() { return new Promise(function (ok) { requestAnimationFrame(function () { ok(); }); }); }

  async function fontesProntas() {
    void raiz.offsetHeight;
    await quadro();
    if (doc.fonts && doc.fonts.ready) await doc.fonts.ready;
  }

  async function imagensProntas() {
    var imgs = Array.prototype.slice.call(doc.images);
    await Promise.all(imgs.map(function (i) {
      return (i.complete ? Promise.resolve() : new Promise(function (ok) { i.onload = i.onerror = ok; }))
        .then(function () { return i.decode ? i.decode().catch(function () {}) : null; });
    }));
  }

  window.rifaAplicar = async function (dados) {
    var minha = ++rodada;
    delete raiz.dataset.pronto;
    var P = normalizar(dados);
    preencher(P);
    montarGrade(P);
    status(P);
    await fontesProntas();
    if (minha !== rodada) return P;
    doc.querySelectorAll('[data-encaixe]').forEach(encaixar);
    doc.querySelectorAll('[data-encaixe-svg]').forEach(encaixarSVG);
    doc.querySelectorAll('[data-ajuste]').forEach(ajustarTexto);
    if (typeof window.rifaDepois === 'function') window.rifaDepois(P);
    abrirEspaco();
    ajustarGrade();
    await fontesProntas();
    await imagensProntas();
    if (minha !== rodada) return P;
    raiz.dataset.pronto = String(minha);
    return P;
  };

  window.rifaFormatarValor = formatarValor;
  window.rifaAplicar(Object.assign({}, window.RIFA || {}, lerURL()));
})();
