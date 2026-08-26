/* ===========================================================================
   GERADOR DO CATÁLOGO DE SKINCARE · CORE-2026-08-24
   ---------------------------------------------------------------------------
   `mobile-pwa/skincare-catalog.js` era uma CÓPIA MANUAL do `var LIB` que vive
   no `~/.hammerspoon/skincare.html`. A auditoria de 18/08 achou que o texto
   ainda batia 1:1, mas que o `freq` default já tinha se perdido em 3 tipos na
   transcrição — ou seja, a cópia já estava derivando em silêncio.
   Agora o app é GERADO da fonte. Uma edição no skincare.html vira um comando.

   Uso:
     node _scripts/gerar-skincare-catalog.mjs           → grava o catálogo
     node _scripts/gerar-skincare-catalog.mjs --check   → NÃO grava; sai 1 se
                                                          o commitado divergir
   O modo --check é o guarda: rode junto do guarda-regras antes do deploy.
   =========================================================================== */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const AQUI = dirname(fileURLToPath(import.meta.url));
const FONTE = join(homedir(), '.hammerspoon', 'skincare.html');
const DESTINO = join(AQUI, '..', 'skincare-catalog.js');
const checar = process.argv.includes('--check');

/* ---- extrai o objeto LIB balanceando as chaves (regex não dá conta) ---- */
const html = readFileSync(FONTE, 'utf8');
const ini = html.indexOf('var LIB=');
if (ini < 0) { console.error('✗ não achei `var LIB=` em', FONTE); process.exit(1); }
const abre = html.indexOf('{', ini);
let prof = 0, fim = -1, emStr = null, esc = false;
for (let i = abre; i < html.length; i++) {
  const c = html[i];
  if (emStr) {
    if (esc) esc = false;
    else if (c === '\\') esc = true;
    else if (c === emStr) emStr = null;
    continue;
  }
  if (c === '"' || c === "'" || c === '`') { emStr = c; continue; }
  if (c === '{') prof++;
  else if (c === '}') { prof--; if (prof === 0) { fim = i + 1; break; } }
}
if (fim < 0) { console.error('✗ chaves do LIB não fecham'); process.exit(1); }

const LIB = eval('(' + html.slice(abre, fim) + ')');   // é o nosso próprio arquivo

/* ---- o app não usa icon/color (é lista de texto): sai só o que ele consome --- */
const limpo = {};
for (const [k, v] of Object.entries(LIB)) {
  limpo[k] = { label: v.label, name: v.name || '', info: v.info || {} };
  if (v.freq != null) limpo[k].freq = v.freq;          // o freq default se perdia na cópia manual
}

const saida =
`// GERADO por _scripts/gerar-skincare-catalog.mjs — NÃO EDITE À MÃO.
// Fonte: ~/.hammerspoon/skincare.html (var LIB). Para mudar, edite lá e rode o gerador.
// Confira com: node _scripts/gerar-skincare-catalog.mjs --check
export const SKIN_LIB = ${JSON.stringify(limpo)};
`;

const atual = (() => { try { return readFileSync(DESTINO, 'utf8'); } catch { return null; } })();
const tipos = Object.keys(limpo).length;
const comFreq = Object.values(limpo).filter(v => v.freq != null).length;

if (checar) {
  if (atual === saida) { console.log(`✓ catálogo de skincare em dia (${tipos} tipos, ${comFreq} com freq)`); process.exit(0); }
  console.log('✗ catálogo de skincare DIVERGE da fonte (skincare.html)');
  console.log('  rode: node _scripts/gerar-skincare-catalog.mjs');
  process.exit(1);
}
writeFileSync(DESTINO, saida);
console.log(`✓ catálogo gerado: ${tipos} tipos (${comFreq} com freq) → ${DESTINO}`);
