/* Testes das funções puras do painel (index.html) e do motor da arte (arte/motor.js).

   Cada arquivo guarda as funções sem DOM entre "══ PURO" e "══ FIM PURO ══";
   este teste recorta esse bloco e roda num contexto isolado. Sem dependências:
     node --test                                                            */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

function abrir(arquivo) {
  const txt = readFileSync(fileURLToPath(new URL('../' + arquivo, import.meta.url)), 'utf8');
  const inicio = txt.indexOf('/* ══ PURO'), fim = txt.indexOf('/* ══ FIM PURO ══ */');
  assert.ok(inicio > 0 && fim > inicio, `bloco PURO não encontrado em ${arquivo}`);
  const ctx = vm.createContext({});
  vm.runInContext(txt.slice(inicio, fim), ctx);
  return nome => vm.runInContext(nome, ctx);
}
const painel = abrir('index.html'), motor = abrir('arte/motor.js');
// objetos criados no outro contexto têm outro protótipo; o JSON traz para este
const json = x => JSON.parse(JSON.stringify(x));
const AGORA = '2026-10-28T12:00:00.000Z';
const venda = (nome, pago, extra) => ({ nome, tel: '', pago, obs: '', criado: AGORA, atualizado: AGORA, ...extra });

test('lerValor entende os jeitos comuns de digitar o valor', () => {
  const lerValor = painel('lerValor');
  assert.equal(lerValor('20'), 20);
  assert.equal(lerValor(' 7 '), 7);
  assert.equal(lerValor('12,5'), 12.5);
  assert.equal(lerValor('12,50'), 12.5);
  assert.equal(lerValor('12.5'), 12.5, 'ponto com 1 ou 2 casas é decimal');
  assert.equal(lerValor('1.000'), 1000, 'ponto com 3 casas é milhar');
  assert.equal(lerValor('1000'), 1000);
  assert.equal(lerValor('1.000,99'), 1000.99);
  assert.equal(lerValor('1,234.56'), 1234.56);
  assert.equal(lerValor('R$ 5,99'), 5.99);
  for (const ruim of ['', '   ', 'abc', '0', '0,00', null, undefined]) assert.ok(Number.isNaN(lerValor(ruim)), `${ruim} não é valor`);
});

test('textoValor escreve o valor no formato brasileiro', () => {
  const textoValor = painel('textoValor');
  assert.equal(textoValor(20), '20');
  assert.equal(textoValor(0.5), '0,50');
  assert.equal(textoValor(12.5), '12,50');
  assert.equal(textoValor(1000), '1.000');
  assert.equal(textoValor(9999.99), '9.999,99');
});

test('o valor sai igual no painel e na arte, de R$ 0,01 a R$ 9.999,99', () => {
  const lerValor = painel('lerValor'), textoValor = painel('textoValor'), formatarValor = motor('formatarValor');
  for (const inteiro of [0, 1, 7, 20, 99, 999, 1000, 9999]) {
    for (let centavos = 0; centavos < 100; centavos++) {
      if (!inteiro && !centavos) continue;
      const v = inteiro + centavos / 100, t = textoValor(v);
      assert.equal(formatarValor(t), t, `a arte reescreveu ${t}`);
      assert.equal(lerValor(t), Math.round(v * 100) / 100, `o painel leu ${t} errado`);
    }
  }
});

test('aparelho sem dados: causa vazia e os padrões de sempre', () => {
  assert.deepEqual(json(painel('completar')({})),
    { modelo: 1, riscar: 'todos', numeros: {}, ultimoBackup: null, alteracoes: 0, frase: '', valor: '20', qtd: 300, causa: '' });
});

test('formato de 27/10: frase com "em prol" vira a causa, sem perder nada', () => {
  const completar = painel('completar');
  const antigo = { modelo: 2, riscar: 'pagos', numeros: { 5: venda('Ana', true) }, ultimoBackup: null, alteracoes: 3 };
  const e = json(completar({ ...antigo, frase: '  Em prol da reforma da escola  ' }));
  assert.equal(e.causa, 'Em prol da reforma da escola');
  assert.equal(e.frase, '');
  for (const k of ['modelo', 'riscar', 'numeros', 'ultimoBackup', 'alteracoes']) assert.deepEqual(e[k], json(antigo)[k], k);
  assert.equal(e.valor, '20');
  assert.equal(e.qtd, 300);
  const sem = json(completar({ ...antigo, frase: 'Sorteio no sábado' }));
  assert.equal(sem.causa, '', 'sem "em prol", a causa fica vazia');
  assert.equal(sem.frase, 'Sorteio no sábado');
});

test('formato de hoje entra e sai igual, byte a byte, com campos desconhecidos', () => {
  const hoje = { modelo: 3, riscar: 'todos', numeros: { 3: venda('Ana', true), 7: venda('Bruno', false) }, ultimoBackup: AGORA, alteracoes: 2,
    frase: 'Sorteio pela Loteria Federal', valor: '25', qtd: 400, causa: 'Em prol de um teste', campoNovo: { fica: true } };
  assert.equal(JSON.stringify(painel('completar')(hoje)), JSON.stringify(hoje));
});

test('valores fora do esperado voltam para o padrão', () => {
  const completar = painel('completar');
  const e = json(completar({ numeros: {}, causa: 'c', qtd: 350, valor: 'abc', modelo: 99 }));
  assert.deepEqual([e.qtd, e.valor, e.modelo], [300, '20', 1]);
  const s = json(completar({ numeros: {}, causa: 'c', qtd: '500', valor: '0', modelo: '7' }));
  assert.deepEqual([s.qtd, s.valor, s.modelo], [500, '20', 7], 'texto vira número; valor zero volta para 20');
});

test('demonstração: rifa fictícia válida, com vendas pagas e por pagar', () => {
  const completar = painel('completar'), demo = json(painel('demonstracao')());
  assert.deepEqual(json(completar(demo)), demo, 'a demonstração já vem no formato do painel');
  const nums = Object.keys(demo.numeros).map(Number), pagos = Object.values(demo.numeros).filter(d => d.pago).length;
  assert.equal(nums.length, 41);
  assert.ok(nums.every(n => n >= 1 && n <= demo.qtd));
  assert.ok(pagos > 0 && pagos < nums.length);
  assert.equal(demo.causa, 'Em prol da reforma da creche do bairro');
  // prêmios fictícios, com as fotos da demonstração no repositório
  const originais = json(painel('PREMIOS_ORIGINAIS')).map(p => p.nome);
  assert.equal(demo.premios.length, 4);
  for (const p of demo.premios) {
    assert.ok(!originais.includes(p.nome), `${p.nome} não pode ser um dos prêmios originais`);
    assert.match(p.foto, /^fotos\/demo-[1-4]\.jpg$/);
    assert.ok(readFileSync(fileURLToPath(new URL('../arte/' + p.foto, import.meta.url))).length > 10000, `${p.foto} existe`);
  }
  // scripts/miniaturas.py marca estes números com a causa da demonstração
  for (const n of [3, 7, 12, 13, 21, 40, 77, 100, 150, 207, 256]) assert.ok(demo.numeros[n], `número ${n} vendido na demonstração`);
});

test('planilha: uma linha por número, ponto e vírgula e BOM para os acentos', () => {
  const csv = painel('montarCSV')({ qtd: 300, numeros: { 2: venda('Ana; Lima', true, { tel: '(11) 90000-0001', obs: 'disse "ok"\nna sexta' }), 300: venda('Bruno', false) } });
  assert.ok(csv.startsWith('﻿'));
  const linhas = csv.slice(1).split('\r\n');
  assert.equal(linhas.length, 301);
  assert.equal(linhas[0], 'Número;Comprador;WhatsApp;Pago;Observação;Atualizado em');
  assert.equal(linhas[1], '001;;;;;');
  assert.ok(linhas[2].startsWith('002;"Ana; Lima";(11) 90000-0001;Sim;"disse ""ok""\nna sexta";'), linhas[2]);
  assert.ok(linhas[300].startsWith('300;Bruno;;Não;;') && linhas[300].length > '300;Bruno;;Não;;'.length, 'data da última alteração');
});

test('arte: normaliza causa, valor, quantidade e números vendidos', () => {
  const normalizar = motor('normalizar');
  const P = json(normalizar({ causa: '  Em prol   da escola ', valor: '12.5', qtd: 350, vendidos: [0, 1, '7', 300, 301] }));
  assert.equal(P.causa, 'Em prol da escola');
  assert.equal(P.valor, '12,50');
  assert.equal(P.qtd, 300);
  assert.deepEqual(P.vendidos, [1, 7, 300]);
  assert.equal(json(normalizar({})).causa, '', 'a causa padrão da arte é vazia');
  assert.equal(json(normalizar({ valor: 'abc' })).valor, '20');
  assert.deepEqual(json(normalizar({ qtd: '500', vendidos: [450] })).vendidos, [450]);
});

test('arte: iniciais seguidas não se separam na quebra de linha', () => {
  assert.equal(motor('cuidarTexto')('Em prol de J. R. Souza'), 'Em prol de J. R. Souza');
});

test('os prêmios originais do painel são os que os 10 modelos trazem', () => {
  const originais = json(painel('PREMIOS_ORIGINAIS'));
  for (let m = 1; m <= 10; m++) {
    const html = readFileSync(fileURLToPath(new URL(`../arte/m${String(m).padStart(2, '0')}.html`, import.meta.url)), 'utf8');
    originais.forEach((p, i) => {
      const n = i + 1;
      const abertura = html.match(new RegExp(`<[a-z]+[^>]*data-premio-nome="${n}"[^>]*>`))[0];
      const resto = html.slice(html.indexOf(abertura) + abertura.length).replace(/^<(i|b)>[^<]*<\/\1>/, '');
      const nome = resto.match(/^([\s\S]*?)(?:<span data-premio-marca|<\/(?:p|b|span|figcaption)>)/)[1]
        .replace(/<br>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (abertura.includes('data-premio-formato="legenda"')) {
        assert.equal(nome, `${p.nome}, ${p.marca}.`, `m${m}, legenda do ${n}º prêmio`);
      } else {
        assert.equal(nome, p.nome, `m${m}, nome do ${n}º prêmio`);
        assert.equal(html.match(new RegExp(`data-premio-marca="${n}"[^>]*>([^<]*)<`))[1], p.marca, `m${m}, marca do ${n}º prêmio`);
      }
      assert.match(html, new RegExp(`fotos/[hv]${n}-[a-z-]+\\.jpg" alt="" data-premio-foto="${n}"`), `m${m}, foto do ${n}º prêmio`);
    });
  }
});

test('prêmios: estado sem "premios" usa os originais, e a arte não troca nada', () => {
  const premiosDe = painel('premiosDe'), premiosArte = painel('premiosArte');
  assert.deepEqual(json(premiosDe({})), json(painel('PREMIOS_ORIGINAIS')));
  assert.deepEqual(json(premiosArte(premiosDe({}), f => 'url:' + f)), [null, null, null, null]);
});

test('prêmios: só o que mudou vai para a arte, com a foto traduzida em endereço', () => {
  const originais = json(painel('PREMIOS_ORIGINAIS')), premios = originais.map(p => ({ ...p }));
  premios[1].nome = 'Air fryer 4 litros';
  premios[2].foto = 'idb:premio-3';
  premios[3] = { nome: '', marca: '', foto: null };
  assert.deepEqual(json(painel('premiosArte')(premios, f => 'url:' + f)), [null,
    { nome: 'Air fryer 4 litros', marca: originais[1].marca, foto: 'legado' },
    { nome: originais[2].nome, marca: originais[2].marca, foto: 'url:idb:premio-3' },
    { nome: '', marca: '', foto: null }]);
});

test('prêmios: entrada estranha é limpa, foto de fora é recusada, campos desconhecidos ficam', () => {
  const normalizarPremios = painel('normalizarPremios');
  assert.equal(normalizarPremios('quebrado'), undefined);
  assert.equal(normalizarPremios([{}, {}, {}]), undefined, 'são sempre 4 prêmios');
  const p = json(normalizarPremios([
    { nome: 'A', marca: 'B', foto: 'idb:premio-1', extra: 1 },
    { nome: 'x'.repeat(80), marca: 'y'.repeat(40), foto: 'javascript:alert(1)' },
    { foto: 'https://exemplo.com/a.jpg' },
    null]));
  assert.deepEqual(p[0], { nome: 'A', marca: 'B', foto: 'idb:premio-1', extra: 1 });
  assert.deepEqual([p[1].nome.length, p[1].marca.length, p[1].foto], [40, 30, null]);
  assert.equal(p[2].foto, null);
  assert.deepEqual(p[3], { nome: '', marca: '', foto: null });
  assert.equal(json(normalizarPremios([{ foto: 'fotos/demo-1.jpg' }, {}, {}, {}]))[0].foto, 'fotos/demo-1.jpg');
});

test('aparelho sem dados e estado antigo ficam com os prêmios originais, sem ganhar o campo', () => {
  const completar = painel('completar');
  assert.equal('premios' in json(completar({})), false);
  assert.equal('premios' in json(completar({ numeros: {} })), false);
  assert.equal('premios' in json(completar({ numeros: {}, premios: 'quebrado' })), false, 'prêmios inválidos voltam aos originais');
});

test('arte: prêmio ausente fica como o modelo traz; nome vazio vira "Nome do prêmio"', () => {
  const normalizar = motor('normalizar');
  assert.deepEqual(json(normalizar({}).premios), [null, null, null, null]);
  const P = json(normalizar({ premios: [{ nome: '  Air   fryer ', marca: '', foto: '' }, null, 'x', { nome: '', foto: 'legado' }] }));
  assert.deepEqual(P.premios, [{ nome: 'Air fryer', marca: '', foto: null }, null, null, { nome: 'Nome do prêmio', marca: '', foto: 'legado' }]);
});
