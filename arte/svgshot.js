/* svgshot.js — transforma a arte montada (HTML) num SVG feito só de formas, textos e imagens
   e desenha num canvas, para baixar como PNG. Não usa <foreignObject>, que o Safari bloqueia.
   Uso: const canvas = await rifaFoto(documentoDaArte); */
(function (global) {
  'use strict';
  var SVGNS = 'http://www.w3.org/2000/svg';
  var cacheArquivo = {}, cacheCss = {}, cacheTam = {};

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function n(v) { return Math.round(v * 100) / 100; }
  function px(v) { return parseFloat(v) || 0; }
  function transparente(c) { return !c || c === 'transparent' || /^rgba\([^)]*,\s*0\)$/.test(c); }

  function lerComoDataURL(url) {
    if (/^data:/.test(url)) return Promise.resolve(url);
    if (!cacheArquivo[url]) {
      cacheArquivo[url] = fetch(url).then(function (r) {
        if (!r.ok) throw new Error('Não consegui baixar ' + url);
        return r.blob();
      }).then(function (b) {
        return new Promise(function (ok, erro) {
          var fr = new FileReader();
          fr.onload = function () { ok(fr.result); };
          fr.onerror = erro;
          fr.readAsDataURL(b);
        });
      });
    }
    return cacheArquivo[url];
  }

  function tamanhoImagem(url) {
    if (!cacheTam[url]) {
      cacheTam[url] = new Promise(function (ok) {
        var i = new Image();
        i.onload = function () { ok([i.naturalWidth, i.naturalHeight]); };
        i.onerror = function () { ok([0, 0]); };
        i.src = url;
      });
    }
    return cacheTam[url];
  }

  // @font-face do Google com os arquivos embutidos (só os blocos que cobrem o alfabeto latino básico)
  function cssFontes(doc) {
    var links = Array.prototype.slice.call(doc.querySelectorAll('link[rel="stylesheet"][href*="fonts.googleapis.com"]'));
    return Promise.all(links.map(function (l) {
      var url = l.href;
      if (!cacheCss[url]) {
        cacheCss[url] = fetch(url).then(function (r) { return r.text(); }).then(function (css) {
          var blocos = (css.match(/@font-face\s*{[^}]*}/g) || []).filter(function (b) {
            var m = b.match(/unicode-range:\s*([^;]+);/i);
            return !m || /U\+0000-00FF/i.test(m[1]);
          });
          return Promise.all(blocos.map(function (b) {
            var m = b.match(/url\(([^)]+)\)/);
            if (!m) return '';
            return lerComoDataURL(m[1].replace(/^['"]|['"]$/g, '')).then(function (d) { return b.replace(m[0], 'url(' + d + ')'); });
          }));
        }).then(function (r) { return r.join('\n'); });
      }
      return cacheCss[url];
    })).then(function (r) { return r.join('\n'); });
  }

  // ---------- geometria ----------
  function medida(v, base) { return /%$/.test(v) ? parseFloat(v) / 100 * base : px(v); }

  function raios(cs, w, h) {
    var r = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'].map(function (k) {
      var v = (cs[k] || '0px').split(' ');
      return [medida(v[0], w), medida(v[1] || v[0], h)];
    });
    var f = Math.min(1,
      w / Math.max(1e-6, r[0][0] + r[1][0]), w / Math.max(1e-6, r[3][0] + r[2][0]),
      h / Math.max(1e-6, r[0][1] + r[3][1]), h / Math.max(1e-6, r[1][1] + r[2][1]));
    return r.map(function (c) { return [c[0] * f, c[1] * f]; });
  }

  function caminho(x, y, w, h, r) {
    if (!r || r.every(function (c) { return !c[0] && !c[1]; })) {
      return 'M' + n(x) + ',' + n(y) + 'H' + n(x + w) + 'V' + n(y + h) + 'H' + n(x) + 'Z';
    }
    var arco = function (c, px2, py2) { return (c[0] && c[1]) ? 'A' + n(c[0]) + ',' + n(c[1]) + ' 0 0 1 ' + n(px2) + ',' + n(py2) : 'L' + n(px2) + ',' + n(py2); };
    return 'M' + n(x + r[0][0]) + ',' + n(y) +
      'H' + n(x + w - r[1][0]) + arco(r[1], x + w, y + r[1][1]) +
      'V' + n(y + h - r[2][1]) + arco(r[2], x + w - r[2][0], y + h) +
      'H' + n(x + r[3][0]) + arco(r[3], x, y + h - r[3][1]) +
      'V' + n(y + r[0][1]) + arco(r[0], x + r[0][0], y) + 'Z';
  }

  function bordas(cs) {
    return ['Top', 'Right', 'Bottom', 'Left'].map(function (s) {
      var estilo = cs['border' + s + 'Style'];
      var w = (estilo === 'none' || estilo === 'hidden') ? 0 : px(cs['border' + s + 'Width']);
      return { estilo: estilo, w: w, cor: cs['border' + s + 'Color'] };
    });
  }

  // caixa interna (sem as bordas), com os raios internos
  function interna(q, b, r) {
    var bt = b[0].w, br = b[1].w, bb = b[2].w, bl = b[3].w;
    return {
      x: q.x + bl, y: q.y + bt, w: Math.max(0, q.w - bl - br), h: Math.max(0, q.h - bt - bb),
      r: [[Math.max(0, r[0][0] - bl), Math.max(0, r[0][1] - bt)], [Math.max(0, r[1][0] - br), Math.max(0, r[1][1] - bt)],
          [Math.max(0, r[2][0] - br), Math.max(0, r[2][1] - bb)], [Math.max(0, r[3][0] - bl), Math.max(0, r[3][1] - bb)]]
    };
  }

  function tracejado(estilo, w) {
    return estilo === 'dotted' ? ' stroke-linecap="round" stroke-dasharray="0 ' + n(w * 2) + '"' : ' stroke-dasharray="' + n(w * 3) + ' ' + n(w * 3) + '"';
  }

  // ---------- pintura ----------
  // cada textura entra uma vez só no SVG; os padrões reaproveitam com <use>
  function idTextura(ctx, url, tam) {
    if (!ctx.texturas[url]) {
      var id = ctx.novoId('t');
      ctx.defs.push('<image id="' + id + '" xlink:href="' + esc(ctx.dados[url] || url) + '" width="' + tam[0] + '" height="' + tam[1] + '"/>');
      ctx.texturas[url] = id;
    }
    return ctx.texturas[url];
  }

  function pintarFundo(saida, ctx, cs, q, r) {
    if (!transparente(cs.backgroundColor)) saida.push('<path d="' + caminho(q.x, q.y, q.w, q.h, r) + '" style="fill:' + cs.backgroundColor + '"/>');
    var bi = cs.backgroundImage;
    if (bi && bi !== 'none') {
      var m = bi.match(/^url\(["']?(.+?)["']?\)$/);
      if (!m) { ctx.avisos.push('fundo não suportado: ' + bi.slice(0, 60)); return; }
      var url = m[1], tam = ctx.tamanhos[url] || [0, 0];
      if (!tam[0]) return;
      var id = ctx.novoId('p');
      ctx.defs.push('<pattern id="' + id + '" patternUnits="userSpaceOnUse" x="' + n(q.x) + '" y="' + n(q.y) + '" width="' + tam[0] + '" height="' + tam[1] + '">' +
        '<use xlink:href="#' + idTextura(ctx, url, tam) + '"/></pattern>');
      saida.push('<path d="' + caminho(q.x, q.y, q.w, q.h, r) + '" fill="url(#' + id + ')"/>');
    }
  }

  function pintarBordas(saida, cs, q, r) {
    var b = bordas(cs), vis = b.filter(function (s) { return s.w > 0; });
    if (!vis.length) return;
    var mesmo = vis.every(function (s) { return s.estilo === vis[0].estilo && s.cor === vis[0].cor; });
    if (mesmo && vis[0].estilo === 'solid') {
      var i = interna(q, b, r);
      saida.push('<path fill-rule="evenodd" style="fill:' + vis[0].cor + '" d="' + caminho(q.x, q.y, q.w, q.h, r) + caminho(i.x, i.y, i.w, i.h, i.r) + '"/>');
      return;
    }
    if (mesmo && vis.length === 4 && (vis[0].estilo === 'dotted' || vis[0].estilo === 'dashed') && vis.every(function (s) { return s.w === vis[0].w; })) {
      var w = vis[0].w, rr = r.map(function (c) { return [Math.max(0, c[0] - w / 2), Math.max(0, c[1] - w / 2)]; });
      saida.push('<path fill="none" style="stroke:' + vis[0].cor + '" stroke-width="' + n(w) + '"' + tracejado(vis[0].estilo, w) +
        ' d="' + caminho(q.x + w / 2, q.y + w / 2, q.w - w, q.h - w, rr) + '"/>');
      return;
    }
    // lados com cores ou estilos diferentes: cada lado separado (sem cantos arredondados)
    var bt = b[0].w, br = b[1].w, bb = b[2].w, bl = b[3].w, x = q.x, y = q.y, W = q.w, H = q.h;
    var lados = [
      { s: b[0], poli: [[x, y], [x + W, y], [x + W - br, y + bt], [x + bl, y + bt]], linha: [[x, y + bt / 2], [x + W, y + bt / 2]] },
      { s: b[1], poli: [[x + W, y], [x + W, y + H], [x + W - br, y + H - bb], [x + W - br, y + bt]], linha: [[x + W - br / 2, y], [x + W - br / 2, y + H]] },
      { s: b[2], poli: [[x, y + H], [x + W, y + H], [x + W - br, y + H - bb], [x + bl, y + H - bb]], linha: [[x, y + H - bb / 2], [x + W, y + H - bb / 2]] },
      { s: b[3], poli: [[x, y], [x, y + H], [x + bl, y + H - bb], [x + bl, y + bt]], linha: [[x + bl / 2, y], [x + bl / 2, y + H]] }
    ];
    lados.forEach(function (l, k) {
      if (!l.s.w) return;
      if (l.s.estilo === 'dotted' || l.s.estilo === 'dashed') {
        saida.push('<path fill="none" style="stroke:' + l.s.cor + '" stroke-width="' + n(l.s.w) + '"' + tracejado(l.s.estilo, l.s.w) +
          ' d="M' + n(l.linha[0][0]) + ',' + n(l.linha[0][1]) + 'L' + n(l.linha[1][0]) + ',' + n(l.linha[1][1]) + '"/>');
      } else if (l.s.estilo === 'double') {
        var t = l.s.w / 3, hz = k % 2 === 0, faixa = function (off) {
          return hz ? [x, (k === 0 ? y : y + H - l.s.w) + off, W, t] : [(k === 3 ? x : x + W - l.s.w) + off, y, t, H];
        };
        [faixa(0), faixa(2 * t)].forEach(function (f) {
          saida.push('<rect x="' + n(f[0]) + '" y="' + n(f[1]) + '" width="' + n(f[2]) + '" height="' + n(f[3]) + '" style="fill:' + l.s.cor + '"/>');
        });
      } else {
        saida.push('<path style="fill:' + l.s.cor + '" d="M' + l.poli.map(function (p) { return n(p[0]) + ',' + n(p[1]); }).join('L') + 'Z"/>');
      }
    });
  }

  function subida(ctx, cs) {
    var chave = [cs.fontFamily, cs.fontSize, cs.fontWeight, cs.fontStyle, cs.fontStretch, cs.fontVariationSettings].join('|');
    if (ctx.asc.has(chave)) return ctx.asc.get(chave);
    var d = ctx.doc, s = d.createElement('span'), m = d.createElement('span');
    s.style.cssText = 'position:absolute;left:0;top:0;white-space:nowrap;line-height:normal;visibility:hidden';
    ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontStretch', 'fontVariationSettings', 'fontOpticalSizing'].forEach(function (k) { s.style[k] = cs[k]; });
    s.appendChild(d.createTextNode('Hxg'));
    m.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
    s.appendChild(m);
    d.body.appendChild(s);
    var r = d.createRange();
    r.selectNodeContents(s.firstChild);
    var v = m.getBoundingClientRect().top - r.getClientRects()[0].top;
    s.parentNode.removeChild(s);
    ctx.asc.set(chave, v);
    return v;
  }

  function estiloTexto(cs) {
    var feat = [], fvn = cs.fontVariantNumeric || '';
    if (/tabular-nums/.test(fvn)) feat.push('"tnum" 1');
    if (/lining-nums/.test(fvn)) feat.push('"lnum" 1');
    if (cs.fontFeatureSettings && cs.fontFeatureSettings !== 'normal') feat.push(cs.fontFeatureSettings);
    var e = 'font-family:' + cs.fontFamily + ';font-size:' + cs.fontSize + ';font-weight:' + cs.fontWeight +
      ';font-style:' + cs.fontStyle + ';font-stretch:' + cs.fontStretch + ';fill:' + cs.color + ';white-space:pre';
    if (cs.fontVariationSettings && cs.fontVariationSettings !== 'normal') e += ';font-variation-settings:' + cs.fontVariationSettings;
    if (cs.letterSpacing && cs.letterSpacing !== 'normal') e += ';letter-spacing:' + cs.letterSpacing;
    if (feat.length) e += ';font-feature-settings:' + feat.join(',');
    return esc(e);
  }

  // cada linha do texto vira um <text> na posição exata em que o navegador desenhou
  function pintarTexto(saida, ctx, no, cs) {
    var txt = no.data;
    if (!txt || cs.visibility === 'hidden') return;
    var r = ctx.doc.createRange(), linhas = [], atual = null;
    for (var i = 0; i < txt.length; i++) {
      var fim = i + 1, code = txt.charCodeAt(i);
      if (code >= 0xD800 && code <= 0xDBFF && i + 1 < txt.length) fim = i + 2;
      r.setStart(no, i);
      r.setEnd(no, fim);
      var rs = r.getClientRects(), q = null;
      for (var k = 0; k < rs.length; k++) if (rs[k].width > 0.01 && rs[k].height > 0.01) { q = rs[k]; break; }
      var ch = txt.slice(i, fim);
      i = fim - 1;
      if (!q) continue;
      if (/[\n\r\t]/.test(ch)) ch = ' ';
      var meio = q.top + q.height / 2;
      if (!atual || Math.abs(meio - atual.meio) > q.height * 0.4) {
        atual = { meio: meio, topo: q.top, x: q.left, s: '' };
        linhas.push(atual);
      }
      atual.s += ch;
    }
    if (!linhas.length) return;
    var asc = subida(ctx, cs), estilo = estiloTexto(cs);
    linhas.forEach(function (L) {
      var s = L.s.replace(/[  ]+$/, '');
      if (!s) return;
      if (cs.textTransform === 'uppercase') s = s.toLocaleUpperCase('pt-BR');
      else if (cs.textTransform === 'lowercase') s = s.toLocaleLowerCase('pt-BR');
      saida.push('<text x="' + n(L.x) + '" y="' + n(L.topo + asc) + '" xml:space="preserve" style="' + estilo + '">' + esc(s) + '</text>');
    });
  }

  function posicao(v, livre) {
    if (/%$/.test(v)) return parseFloat(v) / 100 * livre;
    if (v === 'left' || v === 'top') return 0;
    if (v === 'right' || v === 'bottom') return livre;
    if (v === 'center') return livre / 2;
    return px(v);
  }

  function pintarImagem(saida, ctx, img, cs, q) {
    var src = img.currentSrc || img.src, nw = img.naturalWidth, nh = img.naturalHeight;
    if (!src || !nw) return;
    var dw = q.w, dh = q.h, dx = q.x, dy = q.y, fit = cs.objectFit;
    if (fit === 'cover' || fit === 'contain') {
      var s = fit === 'cover' ? Math.max(q.w / nw, q.h / nh) : Math.min(q.w / nw, q.h / nh);
      dw = nw * s; dh = nh * s;
      var pos = (cs.objectPosition || '50% 50%').split(/\s+/);
      dx = q.x + posicao(pos[0], q.w - dw);
      dy = q.y + posicao(pos[1] || '50%', q.h - dh);
    }
    var id = ctx.novoId('c');
    ctx.defs.push('<clipPath id="' + id + '"><rect x="' + n(q.x) + '" y="' + n(q.y) + '" width="' + n(q.w) + '" height="' + n(q.h) + '"/></clipPath>');
    saida.push('<image xlink:href="' + esc(ctx.dados[src] || src) + '" x="' + n(dx) + '" y="' + n(dy) + '" width="' + n(dw) + '" height="' + n(dh) + '" preserveAspectRatio="none" clip-path="url(#' + id + ')"/>');
  }

  function caixa(q) { return { x: q.left, y: q.top, w: q.width, h: q.height }; }

  // o navegador encaixa fundos e bordas em pixels inteiros; fazemos igual para as linhas saírem nítidas
  function encaixe(q) {
    var x0 = Math.round(q.x), y0 = Math.round(q.y), x1 = Math.round(q.x + q.w), y1 = Math.round(q.y + q.h);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  function pintar(el, saida, ctx) {
    var nome = el.localName;
    if (/^(script|style|template|link|meta|head|title|noscript|br)$/.test(nome)) return;
    var cs = ctx.win.getComputedStyle(el);
    if (cs.display === 'none') return;
    var q = encaixe(caixa(el.getBoundingClientRect())), abertos = 0;
    var op = parseFloat(cs.opacity);
    if (op < 1) { saida.push('<g opacity="' + op + '">'); abertos++; }
    var t = ctx.transf.get(el);
    if (t) {
      var o = t.origem.split(' ').map(px), ox = q.x + o[0], oy = q.y + o[1];
      var m = t.matriz.match(/^matrix\(([^)]+)\)$/);
      if (m) {
        saida.push('<g transform="translate(' + n(ox) + ' ' + n(oy) + ') matrix(' + m[1].split(',').map(function (v) { return +v; }).join(' ') + ') translate(' + n(-ox) + ' ' + n(-oy) + ')">');
        abertos++;
      } else ctx.avisos.push('transformação não suportada: ' + t.matriz);
    }
    var cp = cs.clipPath;
    if (cp && cp !== 'none') {
      var pm = cp.match(/^path\((?:\s*(?:nonzero|evenodd)\s*,)?\s*["'](.+)["']\s*\)$/);
      if (pm) {
        var idc = ctx.novoId('k');
        ctx.defs.push('<clipPath id="' + idc + '"><path transform="translate(' + n(q.x) + ' ' + n(q.y) + ')" d="' + esc(pm[1]) + '"/></clipPath>');
        saida.push('<g clip-path="url(#' + idc + ')">');
        abertos++;
      } else ctx.avisos.push('clip-path não suportado: ' + cp.slice(0, 40));
    }

    if (el.namespaceURI === SVGNS && nome === 'svg') {
      var c = el.cloneNode(true);
      ['class', 'style', 'id'].forEach(function (a) { c.removeAttribute(a); });
      c.setAttribute('x', n(q.x)); c.setAttribute('y', n(q.y)); c.setAttribute('width', n(q.w)); c.setAttribute('height', n(q.h));
      if (!c.hasAttribute('overflow')) c.setAttribute('overflow', 'hidden');
      saida.push(new XMLSerializer().serializeToString(c));
    } else if (nome === 'img') {
      pintarImagem(saida, ctx, el, cs, q);
    } else {
      if (cs.visibility !== 'hidden') {
        if (cs.display === 'inline') {
          Array.prototype.forEach.call(el.getClientRects(), function (f) {
            var qf = encaixe(caixa(f));
            pintarFundo(saida, ctx, cs, qf, raios(cs, qf.w, qf.h));
          });
        } else {
          var r = raios(cs, q.w, q.h);
          pintarFundo(saida, ctx, cs, q, r);
          pintarBordas(saida, cs, q, r);
        }
      }
      var recorta = cs.display !== 'inline' && el !== ctx.doc.documentElement && el !== ctx.doc.body &&
        (cs.overflowX !== 'visible' || cs.overflowY !== 'visible');
      if (recorta) {
        var i = interna(q, bordas(cs), raios(cs, q.w, q.h)), idr = ctx.novoId('o');
        ctx.defs.push('<clipPath id="' + idr + '"><path d="' + caminho(i.x, i.y, i.w, i.h, i.r) + '"/></clipPath>');
        saida.push('<g clip-path="url(#' + idr + ')">');
      }
      for (var f = el.firstChild; f; f = f.nextSibling) {
        if (f.nodeType === 3) pintarTexto(saida, ctx, f, cs);
        else if (f.nodeType === 1) pintar(f, saida, ctx);
      }
      if (recorta) saida.push('</g>');
    }
    while (abertos--) saida.push('</g>');
  }

  async function paraSVG(doc) {
    var win = doc.defaultView, raiz = doc.documentElement;
    if (doc.fonts && doc.fonts.ready) await doc.fonts.ready;
    var L = Math.round(raiz.getBoundingClientRect().width) || 1080, A = Math.round(raiz.getBoundingClientRect().height) || 1920;
    var ctx = { doc: doc, win: win, defs: [], avisos: [], asc: new Map(), transf: new Map(), dados: {}, tamanhos: {}, texturas: {}, seq: 0 };
    ctx.novoId = function (p) { return 'r' + p + (++ctx.seq); };

    // imagens e texturas viram data: (um SVG desenhado como imagem não busca nada fora dele)
    var urls = [];
    Array.prototype.forEach.call(doc.images, function (i) { if (i.currentSrc || i.src) urls.push(i.currentSrc || i.src); });
    var todos = doc.querySelectorAll('*');
    Array.prototype.forEach.call(todos, function (e) {
      var bi = win.getComputedStyle(e).backgroundImage, m = bi && bi.match(/^url\(["']?(.+?)["']?\)$/);
      if (m) urls.push(m[1]);
    });
    await Promise.all(urls.map(function (u) {
      return lerComoDataURL(u).then(function (d) { ctx.dados[u] = d; return tamanhoImagem(d); }).then(function (t) { ctx.tamanhos[u] = t; });
    }));
    var fontes = await cssFontes(doc);

    // tira as rotações para medir as posições sem elas; elas voltam no SVG como transform
    Array.prototype.forEach.call(todos, function (e) {
      if (e.ownerSVGElement) return;
      var cs = win.getComputedStyle(e);
      if (cs.transform && cs.transform !== 'none') {
        ctx.transf.set(e, { matriz: cs.transform, origem: cs.transformOrigin, antes: e.style.getPropertyValue('transform'), prio: e.style.getPropertyPriority('transform') });
      }
    });
    ctx.transf.forEach(function (v, e) { e.style.setProperty('transform', 'none', 'important'); });
    var saida = [];
    try {
      pintar(raiz, saida, ctx);
    } finally {
      ctx.transf.forEach(function (v, e) {
        if (v.antes) e.style.setProperty('transform', v.antes, v.prio); else e.style.removeProperty('transform');
      });
    }
    if (ctx.avisos.length && global.console) console.warn('svgshot:', ctx.avisos);
    var svg = '<svg xmlns="' + SVGNS + '" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + L + '" height="' + A + '" viewBox="0 0 ' + L + ' ' + A + '">' +
      '<defs><style>' + fontes + '</style>' + ctx.defs.join('') + '</defs>' + saida.join('') + '</svg>';
    return { svg: svg, largura: L, altura: A, avisos: ctx.avisos };
  }

  function carregar(url) {
    return new Promise(function (ok, erro) {
      var i = new Image();
      i.onload = function () { ok(i); };
      i.onerror = function () { erro(new Error('O navegador não conseguiu desenhar a arte.')); };
      i.src = url;
    });
  }

  async function desenhar(r) {
    var url = URL.createObjectURL(new Blob([r.svg], { type: 'image/svg+xml;charset=utf-8' })), img;
    try { img = await carregar(url); } catch (e) { img = await carregar('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(r.svg)); }
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    if (img.decode) { try { await img.decode(); } catch (e) { /* segue */ } }
    var c = document.createElement('canvas');
    c.width = r.largura;
    c.height = r.altura;
    var g = c.getContext('2d');
    g.drawImage(img, 0, 0, r.largura, r.altura);
    // no Safari as fontes embutidas às vezes entram só no segundo desenho
    await new Promise(function (ok) { setTimeout(ok, 150); });
    g.clearRect(0, 0, r.largura, r.altura);
    g.drawImage(img, 0, 0, r.largura, r.altura);
    return c;
  }

  global.rifaSVG = paraSVG;
  global.rifaFoto = async function (doc) { return desenhar(await paraSVG(doc)); };
})(window);
