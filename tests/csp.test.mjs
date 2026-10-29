/* A CSP das páginas libera cada script inline pelo hash SHA-256 do texto dele.
   Mudou um script e esqueceu a CSP: o navegador bloqueia o script e a página
   não abre. Este teste pega isso antes do envio e diz os hashes certos.
     node --test                                                            */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

/* O navegador lê o script já com as quebras de linha normalizadas (\r\n vira \n) */
const ler = pagina => readFileSync(fileURLToPath(new URL('../' + pagina, import.meta.url)), 'utf8').replace(/\r\n?/g, '\n');
const hashes = html => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(([, js]) => `'sha256-${createHash('sha256').update(js, 'utf8').digest('base64')}'`);
const politica = html => (html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/) || [])[1];

for (const pagina of ['index.html', '404.html']) {
  test(`${pagina}: a CSP libera exatamente os scripts da página`, () => {
    const html = ler(pagina), csp = politica(html);
    assert.ok(csp, 'sem a meta Content-Security-Policy');
    assert.ok(html.indexOf('http-equiv="Content-Security-Policy"') < html.indexOf('<script'), 'a meta da CSP tem de vir antes do primeiro script');
    const diretivas = Object.fromEntries(csp.split(';').map(d => d.trim().split(/\s+/)).map(([nome, ...valores]) => [nome, valores]));
    for (const d of ['default-src', 'base-uri', 'form-action']) assert.deepEqual(diretivas[d], ["'none'"], d);
    // 'self' só onde a página carrega script do próprio site (no painel, o arte/svgshot.js); o inline entra pelo hash
    const esperado = [...(/<script src=/.test(html) ? ["'self'"] : []), ...hashes(html)];
    assert.deepEqual([...diretivas['script-src']].sort(), [...esperado].sort(), `script-src deveria ser: ${esperado.join(' ')}`);
  });
}
