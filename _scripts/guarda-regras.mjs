/* ===========================================================================
   GUARDA DE DIVERGÊNCIA · CORE-2026-08-24
   ---------------------------------------------------------------------------
   O núcleo (_shared/regras.js) resolve a duplicação entre os DOIS lados em JS
   (widget do Mac ↔ app do iPhone). Mas parte das mesmas regras também é
   calculada em LUA (companheiro_inbox.lua, financeiro.lua, daycut.lua) — e Lua
   não lê JS. Onde não dá pra compartilhar código, o contrato é mantido AQUI:
   os mesmos vetores passam pelas duas implementações e o script falha se elas
   discordarem.

   Rodar:  node _scripts/guarda-regras.mjs
   Saída:  0 = alinhado · 1 = DIVERGÊNCIA (mostra vetor, JS e Lua)

   Foi exatamente esse tipo de divergência que causou os bugs de 2026-08-18:
   streak de leitura, dose do retinoide e resumo do financeiro.
   =========================================================================== */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
await import(join(AQUI, '..', '_shared', 'regras.js'));
const R = globalThis.Regras;
if (!R) { console.error('✗ núcleo não carregou'); process.exit(1); }

/* ---- vetores: casos normais + as bordas que já quebraram na vida real ---- */
const VET_STREAK = [            // [streakAtual, ultimaData, hoje, carencia]
  [5, '2026-08-23', '2026-08-24', 2],   // dia seguinte → soma
  [5, '2026-08-22', '2026-08-24', 2],   // 1 dia de folga → AINDA soma (a regra que divergia)
  [5, '2026-08-21', '2026-08-24', 2],   // 2 dias de folga → zera
  [5, '2026-08-24', '2026-08-24', 2],   // já contou hoje → não mexe
  [0, null,         '2026-08-24', 2],   // primeira vez
];
const VET_FREQ = [              // passo → é do dia?
  { freq: 7 }, { freq: 2 }, { freq: 1 }, { freq: null }, {}, { freq: 14 },
];
const VET_NIVEL = [0, 499, 500, 999, 2600, 9999, 10000, 20000, 25000];
const VET_HUMOR = [   // [diasAtivos, treinouHoje, diaDeDescanso, temUltimo]
  [0,true,false,true],[0,false,true,true],[0,false,false,true],
  [1,false,false,true],[2,false,false,true],[5,false,false,true],[0,false,false,false],
];
const VET_FIN = [
  [{cat:'Tenho',valor:1000},{cat:'Receber',valor:500,status:'Previsto'},
   {cat:'Fixo',valor:200,status:'Previsto'},{cat:'Cartão',valor:300,status:'Previsto'},
   {cat:'Investir',valor:100,status:'Previsto'},{cat:'Variável',valor:80,status:'Previsto',label:'Gastos livres'},
   {cat:'Fixo',valor:999,status:'Pago'},{cat:'Fixo',valor:777,status:'Cancelado'}],
  [],
];

/* ---- lado JS ---- */
const js = {
  streak: VET_STREAK.map(v => R.proximoStreak(v[0], v[1], v[2], v[3])),
  diario: VET_FREQ.map(p => R.ehDiario(p)),
  nivel: VET_NIVEL.map(x => R.nivelDe(x)),
  forma: VET_NIVEL.map(x => R.formaDe(x)),
  humor: VET_HUMOR.map(v => R.humorKey(v[0], v[1], v[2], v[3])),
  fin: VET_FIN.map(rows => {
    const s = R.resumoFinanceiro(rows);
    return [s.tenho, s.receber, s.previsto, s.investir, s.sobra, s.livres];
  }),
};

/* ---- lado LUA: reimplementação FIEL do que roda nos módulos ----
   (copiada de companheiro_inbox.lua e financeiro.lua — se um deles mudar sem
   atualizar o outro, é aqui que a divergência aparece) */
const LUA = String.raw`
local function diasEntre(a,b)
  local function toD(s) local y,m,d=s:match("(%d+)-(%d+)-(%d+)"); return os.time({year=tonumber(y),month=tonumber(m),day=tonumber(d),hour=12}) end
  return math.floor((toD(b)-toD(a))/86400 + 0.5)
end
-- companheiro_inbox.lua · applyLeituraLog (streak de leitura)
local function proximoStreak(atual, ultima, hoje, carencia)
  if ultima == hoje then return atual end
  if ultima == nil or ultima == "" then return 1 end
  local gap = diasEntre(ultima, hoje)
  return (gap >= 1 and gap <= carencia) and (atual + 1) or 1
end
-- companheiro_inbox.lua · freqOf/dailyTitles (skincare)
local function ehDiario(freq) local f = tonumber(freq); if f == nil then f = 7 end; return f >= 7 end
-- companheiro_sync.lua · creatureLevel / STAGE_ART / creatureMoodKey
local NIVEIS = {0,500,1000,2000,3000,4000,5000,7000,10000,20000}
local FORMA  = {1,1,2,2,3,3,4,4,5,6}
local function nivelDe(xp) local st=0; for i=0,9 do if xp >= NIVEIS[i+1] then st=i end end; return st end
local function formaDe(xp) return FORMA[nivelDe(xp)+1] or 1 end
local function humorKey(ds, treinouHoje, descanso, temUltimo)
  if not temUltimo then return "neutro" end
  if ds <= 0 then
    if (not treinouHoje) and descanso then return "tranquilo" end
    return "radiante"
  end
  if ds == 1 then return "tranquilo" end
  if ds == 2 then return "fome" end
  return "escondido"
end
-- financeiro.lua · summarize
local function resumoFin(linhas)
  local tenho, livres = 0, nil
  local pend = { Receber=0, Fixo=0, ["Variável"]=0, ["Cartão"]=0, Investir=0 }
  for _,r in ipairs(linhas) do
    if r.cat == "Tenho" then tenho = tenho + (r.valor or 0)
    elseif r.status == "Pago" then
    elseif r.status ~= "Cancelado" and pend[r.cat] ~= nil then pend[r.cat] = pend[r.cat] + (r.valor or 0) end
    if r.cat == "Variável" and (r.label or ""):lower():find("livre",1,true) then livres = (livres or 0) + (r.valor or 0) end
  end
  local previsto = pend.Fixo + pend["Variável"] + pend["Cartão"]
  return tenho, pend.Receber, previsto, pend.Investir,
         tenho + pend.Receber - previsto - pend.Investir, livres
end
local function J(v) if v == nil then return "null" elseif v == true then return "true" elseif v == false then return "false" else return tostring(v) end end
local out = {}
__VETORES__
print("{" .. table.concat(out, ",") .. "}")
`;

const vetLua = `
local s = {}
${VET_STREAK.map(v => `s[#s+1] = J(proximoStreak(${v[0]}, ${v[1] === null ? 'nil' : `"${v[1]}"`}, "${v[2]}", ${v[3]}))`).join('\n')}
out[#out+1] = '"streak":[' .. table.concat(s, ",") .. ']'
local d = {}
${VET_FREQ.map(p => `d[#d+1] = J(ehDiario(${p.freq === null || p.freq === undefined ? 'nil' : p.freq}))`).join('\n')}
out[#out+1] = '"diario":[' .. table.concat(d, ",") .. ']'
local nv = {}
${VET_NIVEL.map(x => `nv[#nv+1] = J(nivelDe(${x}))`).join('\n')}
out[#out+1] = '"nivel":[' .. table.concat(nv, ",") .. ']'
local fo = {}
${VET_NIVEL.map(x => `fo[#fo+1] = J(formaDe(${x}))`).join('\n')}
out[#out+1] = '"forma":[' .. table.concat(fo, ",") .. ']'
local hu = {}
${VET_HUMOR.map(v => `hu[#hu+1] = '"' .. humorKey(${v[0]}, ${v[1]}, ${v[2]}, ${v[3]}) .. '"'`).join('\n')}
out[#out+1] = '"humor":[' .. table.concat(hu, ",") .. ']'
local f = {}
${VET_FIN.map(rows => {
  const lua = rows.map(r => `{cat="${r.cat}",valor=${r.valor}${r.status ? `,status="${r.status}"` : ''}${r.label ? `,label="${r.label}"` : ''}}`).join(',');
  return `do local a,b,c,dd,e,g = resumoFin({${lua}}); f[#f+1] = "[" .. J(a)..","..J(b)..","..J(c)..","..J(dd)..","..J(e)..","..J(g) .. "]" end`;
}).join('\n')}
out[#out+1] = '"fin":[' .. table.concat(f, ",") .. ']'
`;

const dir = mkdtempSync(join(tmpdir(), 'guarda-'));
const arq = join(dir, 'g.lua');
writeFileSync(arq, LUA.replace('__VETORES__', vetLua));
let lua;
try { lua = JSON.parse(execFileSync('lua', [arq], { encoding: 'utf8' }).trim()); }
catch (e) { console.error('✗ não deu pra rodar o lado Lua:', e.message); process.exit(1); }

/* ---- SENTINELAS · REVISAO-2026-08-26 ------------------------------------
   Limite honesto deste guarda: o "lado Lua" acima é uma TRANSCRIÇÃO dos módulos,
   não os módulos em si (eles precisam do runtime do Hammerspoon). Então ele pega
   divergência quando o JS muda — mas não quando alguém edita o LUA e esquece de
   atualizar a transcrição. As sentinelas cobrem esse furo: se a expressão-chave
   sumir do arquivo real, o guarda falha pedindo pra revisar a transcrição. */
const HS = join(homedir(), '.hammerspoon');
const SENTINELAS = [
  ['companheiro_inbox.lua', /gap\s*==\s*1\s+or\s+gap\s*==\s*2/,        'streak de leitura com carência de 1 dia'],
  ['companheiro_inbox.lua', /freqOf\(st\)\s*>=\s*7/,                      'skincare: passo do dia = freq>=7'],
  ['financeiro.lua',        /tenho\s*\+\s*pending\.Receber\s*-\s*previsto\s*-\s*pending\.Investir/, 'financeiro: fórmula da sobra'],
  ['companheiro_sync.lua',  /if ds == 2 then return "fome" end/,            'criatura: humor "fome" em 2 dias'],
  ['companheiro_sync.lua',  /radiante="✨"/,                                 'criatura: emoji do humor'],
  ['companheiro_sync.lua',  /local LEVELS\s*=\s*\{0,500,1000,2000,3000,4000,5000,7000,10000,20000\}/, 'criatura: tabela de níveis'],
  // MENTE-2026-09-02 · a seleção da pílula do dia existe em DOIS lugares (hub JS + snapshot Lua)
  ['companheiro.html',      /passivas\[\(\(n%passivas\.length\)/,       'pílula: indexação por dia no hub'],
  ['companheiro.html',      /_pelvicIds=\['assoalho_pelvico_kegel','reverse_kegel_hipertonia','ponr_calibragem','stop_start_edging'\]/, 'pílula: exclusão das práticas de pélvico (hub)'],
  ['companheiro_sync.lua',  /assoalho_pelvico_kegel = true, reverse_kegel_hipertonia = true/, 'pílula: exclusão das práticas de pélvico (snapshot)'],
  // AUDIT-2026-09-02 · o corte do dia é a regra dupla mais antiga (JS Regras.hoje × daycut.lua) e não
  // tinha proteção nenhuma — e skincare já quebrou exatamente por corte divergente.
  ['daycut.lua',            /os\.date\("%Y-%m-%d", os\.time\(\) - refresh\(\) \* 3600\)/, 'daycut: fórmula do dia lógico'],
];
let sentinelasQuebradas = 0;
for (const [arq, re, desc] of SENTINELAS) {
  let txt = '';
  try { txt = readFileSync(join(HS, arq), 'utf8'); }
  catch (e) { console.log(`  ⚠ sentinela: não li ${arq} — ${e.message}`); sentinelasQuebradas++; continue; }
  if (!re.test(txt)) { console.log(`  ✗ sentinela QUEBROU em ${arq}: ${desc}\n      a regra em Lua mudou — atualize a transcrição neste guarda`); sentinelasQuebradas++; }
}

/* ---- comparação ---- */
let falhas = 0;
const cmp = (nome, a, b) => {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa === sb) { console.log(`  ✓ ${nome}`); return; }
  falhas++;
  console.log(`  ✗ ${nome}\n      JS : ${sa}\n      Lua: ${sb}`);
};
console.log(`guarda de divergência · núcleo ${R.versao}`);
cmp('streak (carência de 1 dia)', js.streak, lua.streak);
cmp('skincare · passo do dia (freq>=7)', js.diario, lua.diario);
cmp('criatura · nível por XP', js.nivel, lua.nivel);
cmp('criatura · forma da arte', js.forma, lua.forma);
cmp('criatura · humor (radiante/fome/escondido)', js.humor, lua.humor);
/* AUDIT-2026-09-02 · antes comparava contra um array chumbado AQUI (e a sentinela só vigiava o
   radiante) — mudar fome/escondido no Lua passava batido. Agora extrai a tabela REAL do arquivo. */
{
  const syncTxt = readFileSync(join(HS, 'companheiro_sync.lua'), 'utf8');
  const mLinha = syncTxt.match(/local MOOD_EMOJI = \{([^}]*)\}/);
  const luaEmoji = {};
  if (mLinha) for (const [, k, v] of mLinha[1].matchAll(/(\w+)="([^"]+)"/g)) luaEmoji[k] = v;
  const chaves = ['radiante','tranquilo','neutro','fome','escondido'];
  cmp('criatura · emoji por humor (5/5, tabela real do Lua)',
      chaves.map(k => R.HUMOR_EMOJI[k]), chaves.map(k => luaEmoji[k]));
}
/* AUDIT-2026-09-02 · corte do dia: roda a MESMA fórmula do daycut.lua (os.time()-corte*3600) em Lua
   e compara com Regras.hoje(corte, agora) pra 8 instantes ao redor da virada (corte 4h e 0h). */
{
  const instantes = [
    ['2026-09-02T03:59:00', 4], ['2026-09-02T04:00:00', 4], ['2026-09-02T04:01:00', 4],
    ['2026-09-02T23:59:00', 4], ['2026-09-03T00:30:00', 4],
    ['2026-09-02T23:59:00', 0], ['2026-09-03T00:00:30', 0], ['2026-09-02T12:00:00', 0],
  ];
  const jsCut = instantes.map(([iso, c]) => R.hoje(c, new Date(iso).getTime()));
  const luaProg = instantes.map(([iso, c]) => {
    const [d, t] = iso.split('T'); const [Y, M, D] = d.split('-').map(Number); const [h, mi, se] = t.split(':').map(Number);
    return `io.write(os.date("%Y-%m-%d", os.time({year=${Y},month=${M},day=${D},hour=${h},min=${mi},sec=${se}}) - ${c} * 3600), "\\n")`;
  }).join('\n');
  const tmpCut = join(dir, 'cut.lua'); writeFileSync(tmpCut, luaProg);
  const luaCut = execFileSync('lua', [tmpCut], { encoding: 'utf8' }).trim().split('\n');
  cmp('corte do dia lógico (8 instantes, fórmula do daycut)', jsCut, luaCut);
}
/* AUDIT2-2026-09-02 · categorias da lista de leitura existem em DOIS lugares (app.js × leitura.html
   do Mac) — comparação REAL dos dois arquivos, mesmo padrão da tabela de emojis. */
{
  const appTxt = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'app.js'), 'utf8');
  const macTxt = readFileSync(join(HS, 'leitura.html'), 'utf8');
  const pegaOrdem = t => { const m = t.match(/CAT_ORDEM\s*=\s*\[([^\]]+)\]/); return m ? m[1].replace(/\s|'/g, '') : null; };
  const pegaLabel = t => { const m = t.match(/CAT_LABEL\s*=\s*\{([\s\S]*?)\}/); return m ? m[1].replace(/\s/g, '') : null; };
  cmp('leitura · CAT_ORDEM (app × Mac)', [pegaOrdem(appTxt)], [pegaOrdem(macTxt)]);
  cmp('leitura · CAT_LABEL (app × Mac)', [pegaLabel(appTxt)], [pegaLabel(macTxt)]);
}
cmp('financeiro · resumo (sobra/livres)', js.fin, lua.fin);

if (falhas || sentinelasQuebradas) {
  if (falhas) console.log(`\n✗ ${falhas} regra(s) DIVERGINDO entre JS e Lua`);
  if (sentinelasQuebradas) console.log(`✗ ${sentinelasQuebradas} sentinela(s) quebrada(s) — o Lua real mudou`);
  process.exit(1);
}
console.log(`\n✓ JS e Lua alinhados · ${SENTINELAS.length} sentinelas nos módulos reais OK`);
