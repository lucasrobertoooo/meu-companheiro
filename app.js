// Companheiro mobile — espelho READ-ONLY do snapshot.json (schema v1).
// Fonte: repo privado via GitHub Contents API (PAT no aparelho) OU ./snapshot.json (dev local).
import { CREATURE_ART } from './creature-art.js';
// CORE-2026-08-24 · núcleo compartilhado de regras (o MESMO arquivo que o widget do Mac injeta).
// Import por efeito colateral: o arquivo não usa export (precisa rodar também como <script> inline).
import './_shared/regras.js';
import { SKIN_LIB } from './skincare-catalog.js';

const $ = id => document.getElementById(id);
const CFG_KEY = 'companheiro.sync.cfg';
const SNAP_CACHE = 'companheiro.sync.lastSnap';
const POLL_MS = 25000;
let _flashTimer = null, _flashOrig = null;   // LEITURA-FIX-2026-09-08 · declarado no topo: renderFreshness (bem acima) o consulta
let _pending = {};        // otimista: mapa key→alvo(bool) aguardando o Mac confirmar no snapshot
let _prioTab = localStorage.getItem('companheiro.prioTab') || 'todos';   // filtro local (não sincroniza)
let _showHist = false;    // histórico de prioridades expandido?
let _lastSnap = null;     // último snapshot (pra re-render local ao trocar tab/histórico)
let _skinOpen = { am: false, pm: false };   // rotinas de skincare expandidas (mostrar passos)?

const AURA = { normal:'rgba(138,92,240,.42)', prata:'rgba(184,184,196,.44)', ouro:'rgba(232,192,90,.52)' };

// ícones SVG (line-style, herdam a cor via currentColor) — substituem os emojis
const _svg = p => `<svg class="ic-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ICONS = {
  agua:        _svg('<path d="M12 2.7S5.5 9.7 5.5 14a6.5 6.5 0 0 0 13 0C18.5 9.7 12 2.7 12 2.7z"/>'),
  pelvico:     _svg('<path d="M22 12h-4l-3 8-4-16-3 8H2"/>'),
  meditacao:   _svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/>'),
  leitura:     _svg('<rect x="5" y="4" width="14" height="16" rx="1.6"/><path d="M9 4v16"/>'),
  mobilidade:  _svg('<circle cx="12" cy="4" r="1.7"/><path d="M12 6.6v6M12 12.6l-3.6 5.6M12 12.6l3.6 5.6M6 9.4l6 1.7 6-1.7"/>'),
  prioridades: _svg('<path d="M9 12.2l2.3 2.3L22 4"/><path d="M21 12.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11.5"/>'),
  habitos:     _svg('<path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z"/>'),
  comer:       _svg('<path d="M11 2v20M8 2v7a3 3 0 01-3 3M5 2v7M16 2c-1 2-1 5 0 7 1 1 2 1 2 3v10"/>'),
  skincare:    _svg('<path d="M12 3l1.9 5.6 5.6 1.9-5.6 1.9L12 18l-1.9-5.6L4.5 10.5 10.1 8.6z"/>'),
  flame:       _svg('<path d="M12 2.5c2.5 3.2 4 5.4 4 8a4 4 0 0 1-8 0c0-.9.3-1.7.8-2.4C7.2 8.2 8.2 10.6 9.6 11 8.9 8 10 4.9 12 2.5z"/>'),
  check:       _svg('<path d="M20 6.5L9.5 17 5 12.5"/>'),
  sun:         _svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M4.7 4.7l1.5 1.5M17.8 17.8l1.5 1.5M2.5 12h2.2M19.3 12h2.2M4.7 19.3l1.5-1.5M17.8 6.2l1.5-1.5"/>'),
  moon:        _svg('<path d="M20 14.4A8 8 0 1 1 9.6 4 6.5 6.5 0 0 0 20 14.4z"/>'),
  link:        _svg('<path d="M10.5 13.5a4 4 0 0 0 6 .4l2-2a4 4 0 0 0-5.7-5.7l-1.1 1.1"/><path d="M13.5 10.5a4 4 0 0 0-6-.4l-2 2a4 4 0 0 0 5.7 5.7l1.1-1.1"/>'),
  up:          _svg('<path d="M18 15l-6-6-6 6"/>'),
  down:        _svg('<path d="M6 9l6 6 6-6"/>'),
  plus:        _svg('<path d="M12 5v14M5 12h14"/>'),
  grip:        _svg('<circle cx="9" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.4" fill="currentColor" stroke="none"/>'),
  info:        _svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5h.01"/>'),
  financeiro:  _svg('<rect x="2.5" y="6" width="19" height="13" rx="2.2"/><path d="M2.5 10.5h19"/><path d="M15.5 15h3"/>'),
  remedios:    _svg('<rect x="3" y="8.5" width="18" height="7" rx="3.5"/><path d="M12 8.5v7"/>'),
};
const icon = n => ICONS[n] || '';

const TODAY_MODULES = [
  { key:'agua',       lbl:'Água' },
  { key:'pelvico',    lbl:'Pélvico' },
  { key:'meditacao',  lbl:'Meditação' },
  { key:'leitura',    lbl:'Leitura' },
  { key:'mobilidade', lbl:'Mobilidade' },
  { key:'remedios',   lbl:'Remédios' },
];

/* ---------- config ---------- */
function getCfg(){ try{ return JSON.parse(localStorage.getItem(CFG_KEY)) || null; }catch{ return null; } }
function setCfg(c){ localStorage.setItem(CFG_KEY, JSON.stringify(c)); _etag = null; }

// ETAG-2026-07-22 · o snapshot só muda quando o Mac reescreve de verdade (o publishNow() já deduplica
// pelo conteúdo, ignorando o ts). Sem revalidação condicional o celular rebaixava ~98 KB a cada 25 s
// mesmo com tudo igual (~14 MB/h de app aberto). Com If-None-Match isso vira um 304 sem corpo — que
// ainda por cima não conta no rate limit da API do GitHub. Se a API não mandar ETag, _etag fica null e
// o comportamento volta a ser o de antes (degradação segura).
const NOT_MODIFIED = Symbol('not-modified');
let _etag = null;
function clearCfg(){ localStorage.removeItem(CFG_KEY); }

/* ---------- data source ---------- */
async function fetchSnapshot(){
  const cfg = getCfg();
  if (cfg && cfg.repo && cfg.pat){
    const [owner, repo] = cfg.repo.split('/');
    const path = cfg.path || 'snapshot.json';
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=main`;
    const headers = { Authorization:`Bearer ${cfg.pat}`, Accept:'application/vnd.github.raw+json' };
    if (_etag) headers['If-None-Match'] = _etag;
    const r = await fetch(url, { headers, cache:'no-store' });
    if (r.status === 304) return NOT_MODIFIED;          // nada mudou no Mac — zero bytes de corpo
    if (r.status === 401 || r.status === 403) throw new Error('Token inválido ou sem permissão.');
    if (r.status === 404) throw new Error('Repo/arquivo não encontrado.');
    if (!r.ok) throw new Error('GitHub API '+r.status);
    /* AUDIT-2026-09-02 · o etag era gravado ANTES do parse: corpo truncado em rede móvel deixava o etag
       apontando pra um snapshot que nunca renderizou → todos os polls seguintes viravam 304 e o app
       ficava preso no dado velho. Só confirma o etag quando o JSON chegou inteiro. */
    const _novoEtag = r.headers.get('ETag') || null;
    const _corpo = JSON.parse(await r.text());
    _etag = _novoEtag;
    return _corpo;
  }
  // dev/local
  const r = await fetch('./snapshot.json', { cache:'no-store' });
  if (!r.ok) throw new Error('sem snapshot local');
  return r.json();
}

// PLUGGY-RECONNECT · lê um arquivo qualquer do repo (ex.: reconnect.json com o connect_token). Null se não achar.
/* AUDIT2-2026-09-02 · fetchRepoFile removido: 0 chamadas (fluxo de reconexão Pluggy morreu no app) */

/* ---------- escrita de evento (celular → inbox do repo) ---------- */
// FRESCOR-2026-08-24 · idade do BATIMENTO do Mac (snap.pub, truncado em blocos de 6h). O `ts` não serve:
// ele só muda quando o CONTEÚDO muda, então um dia parado pareceria "Mac desligado".
// Retorna horas, ou null se o snapshot é antigo demais pra ter o campo.
function idadeBatimentoH(snap){
  const s = snap || _lastSnap;
  if (!s || !s.pub) return null;
  const t = Date.parse(s.pub);
  if (isNaN(t)) return null;
  return (Date.now() - t) / 3600000;
}
const DEFASADO_H = 12;   // 2 blocos de 6h sem publicar = o Mac provavelmente está desligado
function snapshotDefasado(snap){
  const h = idadeBatimentoH(snap);
  return h != null && h > DEFASADO_H;
}

function todayStr(){
  // DAYSYNC-2026-07-16 · usa o dia LÓGICO do Mac (snap.date) como fonte ÚNICA — evita o celular e o Mac
  // discordarem do "hoje" (corte 4h + cache do app causavam eventos no dia errado). Fallback: corte 4h local.
  // FRESCOR-2026-08-24 · MAS se o snapshot está defasado (Mac desligado há +12h), confiar no snap.date
  // DATA O EVENTO NO DIA ERRADO — aí é melhor cair no corte local.
  // AUDIT-2026-09-02 · sem `pub` (Mac antigo) a idade é indetectável e `snapshotDefasado` devolve false
  // — um cache de dias confiaria no snap.date e dataria eventos no dia errado. Sem pub → corte local
  // (que usa o MESMO corteH vindo do snapshot, então o resultado coincide quando o cache é fresco).
  if (_lastSnap && _lastSnap.date && idadeBatimentoH(_lastSnap) != null && !snapshotDefasado(_lastSnap)) return _lastSnap.date;
  // REVISAO-2026-08-26 · o corte é CONFIGURÁVEL no Mac (0-12h) e aqui estava chumbado em 4h. Com o
  // FRESCOR, este fallback virou caminho quente — datar errado entre o corte antigo e o novo era real.
  // Usa o corte que veio no snapshot (mesmo que velho, é o que o Mac usa) e o cálculo do núcleo.
  const corte = (_lastSnap && typeof _lastSnap.corteH === 'number') ? _lastSnap.corteH : 4;
  if (globalThis.Regras && Regras.hoje) return Regras.hoje(corte);
  const d = new Date(Date.now() - corte*3600*1000);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function uuid(){
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'e-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}
// cria inbox/{uuid}.json no repo via Contents API (arquivo novo = zero conflito de escrita).
// PRECISA de token com Contents: Read AND Write (o de leitura dá 403 aqui).
/* FILA-OFFLINE-2026-08-24 · antes, evento criado sem rede simplesmente SUMIA: o postEvent falhava, um
   flash de 3s aparecia e pronto — o "inbox de eventos" só funcionava online. Agora falha de REDE guarda
   o evento numa fila local e reenvia sozinho (ao voltar a conexão, ao abrir o app e a cada refresh).
   O evento já nasce com id e data — reenviar é seguro: o Mac deduplica por id (mobileSeen/HANDLERS).
   Erro de PERMISSÃO (401/403) não entra na fila: reenviar não resolveria, o token é que está errado. */
const FILA_KEY = 'companheiro_fila_eventos';
function filaLer(){ try{ return JSON.parse(localStorage.getItem(FILA_KEY) || '[]'); }catch{ return []; } }
function filaGravar(f){
  // REVISAO-2026-08-26 · devolve se conseguiu gravar. Antes engolia a falha com catch vazio e o
  // postEvent retornava true assim mesmo — a UI dava por feito algo que não foi guardado em lugar nenhum.
  // AUDIT-2026-09-02 · o corte em 200 protegia a quota mas era MUDO — os eventos mais velhos sumiam
  // sem sinal nenhum. Cenário raro (offline por dias marcando muito), mas perda de dado avisa sempre.
  if (f.length > 200){ try{ flashError((f.length - 200) + ' evento(s) antigos descartados — fila cheia'); }catch(e){} }
  try{ localStorage.setItem(FILA_KEY, JSON.stringify(f.slice(-200))); return true; }catch{ return false; }
}
function filaTamanho(){ return filaLer().length; }
function filaEnfileirar(evt){
  const f = filaLer();
  let ok = true;
  if (!f.some(e => e.id === evt.id)) { f.push(evt); ok = filaGravar(f); }
  renderFilaAviso();
  return ok;
}

async function enviarEvento(evt){
  const cfg = getCfg();
  if (!cfg || !cfg.repo || !cfg.pat) throw new Error('conecte o token primeiro (engrenagem)');
  const [owner, repo] = cfg.repo.split('/');
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(evt))));   // base64 utf-8-safe
  const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/inbox/${evt.id}.json`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${cfg.pat}`, Accept: 'application/vnd.github+json' },
    body: JSON.stringify({ message: `evt ${evt.type}`, content: b64, branch: 'main' }),
  });
  if (r.status === 401 || r.status === 403) { const e = new Error('token sem permissão de escrita'); e.semRetry = true; throw e; }
  if (r.status === 422) return true;   // já existe no repo = já entregue
  // AUDIT-2026-09-02 · 408 (timeout), 409 (branch avançou: o Mac também escreve em main — corriqueiro)
  // e 429 (rate limit) são TRANSITÓRIOS: reenviar resolve. Marcar como permanente descartava a marcação
  // em silêncio. Só o resto do 4xx (404 repo errado, 400 payload) é de fato insolúvel por reenvio.
  if (r.status === 408 || r.status === 409 || r.status === 429) throw new Error('GitHub ' + r.status + ' (transitório)');
  if (r.status >= 400 && r.status < 500) { const e = new Error('GitHub ' + r.status); e.permanente = true; throw e; }
  if (!r.ok) throw new Error('GitHub ' + r.status);
  return true;
}

async function postEvent(partial){
  /* AUDIT2-2026-09-02 (M3) · `seq` em ms desempata eventos do MESMO segundo no ingest do Mac (o nome
     do arquivo é uuid aleatório — log-até-100% + finish em <1s podiam inverter e envenenar o finish). */
  /* IDHIJACK-2026-09-08 · O BUG MAIS CARO DA FILA. O spread vem por último, então um payload com `id:`
     (o id do alimento, do hábito, da nota, da música, da linha do financeiro) SOBRESCREVIA o uuid do
     envelope. E o envelope é o nome do arquivo no inbox — que o Mac deduplica contra `_done/`, guardado
     por 60 dias, e que o GitHub recusa com 422 ("já entregue") se ainda existir. Resultado: cada id de
     domínio passava UMA VEZ a cada 60 dias e do segundo em diante era descartado EM SILÊNCIO, com a UI
     otimista mostrando sucesso. Marcar o hábito "cypher" funcionava no primeiro dia e nunca mais;
     ciclar o status de uma linha do financeiro, uma vez por linha; registrar whey, uma vez por bimestre.
     Correção: o envelope manda no `id` sempre; o id de domínio viaja em `rid` (e o Mac lê `rid or id`,
     então os eventos velhos que já estão na fila do celular continuam sendo aplicados certo). */
  const envId = uuid();
  const evt = { id: envId, ts: Math.floor(Date.now()/1000), seq: Date.now(), date: todayStr(), source: 'mobile', v: 1, ...partial };
  if (evt.id !== envId) { evt.rid = evt.id; evt.id = envId; }
  if (!getCfg() || !getCfg().pat) throw new Error('conecte o token primeiro (engrenagem)');
  /* AUDIT-2026-09-02 · PERSISTE ANTES de enviar. O iOS mata o JS sem aviso (trocar de app, travar a
     tela) — com o PUT em voo e nada na fila, a marcação que a UI já mostrou evaporava. Agora o evento
     nasce na fila e sai dela no sucesso; se o app morrer no meio, o dreno reenvia (o arquivo do inbox é
     create-only: reenvio do mesmo id leva 422 = já entregue, sem duplicar). */
  if (!filaEnfileirar(evt)) { throw new Error('não deu pra guardar o evento — tente de novo'); }
  try {
    const r = await enviarEvento(evt);
    filaGravar(filaLer().filter(e => e.id !== evt.id));   // entregue → sai da fila
    renderFilaAviso();
    filaDrenar();            // aproveita que a rede está boa pra escoar o que ficou pra trás
    return r;
  } catch (err) {
    if (err && (err.semRetry || err.permanente)) {        // reenviar não resolve → não deixa apodrecer na fila
      filaGravar(filaLer().filter(e => e.id !== evt.id));
      renderFilaAviso();
      throw err;
    }
    // Fica na fila: NÃO lança. Se lançasse, cada handler desfaria a marcação otimista e o usuário veria o
    // item desmarcar sozinho — mesmo com o evento salvo. A UI segue marcada e a faixa "N aguardando
    // conexão" conta a verdade; quando a rede voltar, o dreno entrega e o snapshot confirma.
    try{ flashError('sem conexão — guardado, envia sozinho'); }catch(e2){}
    return true;
  }
}

let _drenando = false;
/* REVISAO-2026-08-26 · a 1ª versão montava `restantes` e gravava por cima da fila inteira. Dois furos:
   (a) o `break` do erro de auth saía do laço e os eventos SEGUINTES nunca entravam em `restantes` →
       eram APAGADOS pelo filaGravar (perda silenciosa, e a faixa mostrava número menor como se tivessem
       sido entregues); (b) o que fosse enfileirado DURANTE os awaits era sobrescrito pelo snapshot velho.
   Agora remove um a um, relendo a fila a cada entrega — nada é perdido por sobrescrita. */
async function filaDrenar(){
  if (_drenando) return;
  const fila = filaLer();
  if (!fila.length) return;
  _drenando = true;
  let entregues = 0;
  try {
    for (const evt of fila) {
      try {
        await enviarEvento(evt);
        filaGravar(filaLer().filter(e => e.id !== evt.id));   // relê: preserva quem chegou no meio
        entregues++;
      } catch (err) {
        if (err && err.permanente) {                          // 4xx não-auth: reenviar não resolve
          filaGravar(filaLer().filter(e => e.id !== evt.id));
          console.warn('evento descartado (erro permanente):', evt.type, err.message);
          /* AUDIT-2026-09-02 · descartar em silêncio deixava o card em "…" pra sempre (_pending nunca
             confirmado) e a marcação sumia sem aviso. Avisa e derruba o otimismo pra UI contar a verdade. */
          try{ flashError('não deu pra enviar "' + evt.type + '" — descartado (' + err.message + ')'); }catch(e2){}
          /* AUDIT2-2026-09-02 (M1) · render(_lastSnap) não desfazia mutações otimistas feitas NO próprio
             _lastSnap (item adicionado ficava na tela pra sempre, já que o dedup engole polls iguais).
             refreshForcado repinta a verdade do servidor — o mesmo fix dos catches, que faltou aqui. */
          _pending = {};
          try{ refreshForcado(); }catch(e2){}
          continue;
        }
        break;                                                // auth ou rede: para e MANTÉM o resto
      }
    }
  } finally { _drenando = false; }
  renderFilaAviso();
  if (entregues) refresh();
}

function renderFilaAviso(){
  const el = $('filaAviso'); if (!el) return;
  const n = filaTamanho();
  el.hidden = n === 0;
  if (n) el.textContent = `${n} ${n === 1 ? 'marcação aguardando' : 'marcações aguardando'} conexão · reenvia sozinho`;
}
window.addEventListener('online', () => { filaDrenar(); });

/* ---------- render ---------- */
function renderHero(c){
  const form = c.form || 1;
  const img = $('crImg');
  const src = CREATURE_ART[String(form)] || CREATURE_ART['1'];
  if (src && img.getAttribute('src') !== src) img.setAttribute('src', src);
  $('aura').style.setProperty('--auraColor', AURA[c.prestige] || AURA.normal);
  // HUMOR-5-2026-08-24 · o app colapsava os 5 humores em sol(radiante)/lua(todo o resto) — "com fome" e
  // "se escondeu" ficavam visualmente iguais a "tranquilo". O snapshot já mandava moodEmoji; agora usa.
  const _me = $('moodEmoji');
  if (c.moodEmoji) { _me.textContent = c.moodEmoji; }
  else { _me.innerHTML = icon(c.moodKey === 'radiante' ? 'sun' : 'moon'); }
  _me.title = { radiante:'radiante — você cuidou dele hoje', tranquilo:'tranquilo',
                fome:'com fome — dias sem treino', escondido:'se escondeu — faz tempo',
                neutro:'à espreita' }[c.moodKey] || '';
  $('crName').textContent = c.name || 'Companheiro';
  $('crLevel').textContent = `${c.levelName || ''} · nível ${c.level ?? '—'}`;
  const pct = Math.round((c.levelProgress || 0) * 100);
  $('xpfill').style.width = pct + '%';
  $('xpnum').textContent = c.xpToNextLevel > 0
    ? `${c.xp} / ${c.xp + c.xpToNextLevel} xp`
    : `${c.xp} xp · máximo`;
  $('crCap').textContent = c.cap || '';
  const chips = [];
  if (c.streak >= 1) chips.push(`<span class="chip hot">${icon('flame')} ${c.streak} ${c.streak===1?'dia':'dias'}</span>`);
  if (c.best > 1)   chips.push(`<span class="chip">recorde ${c.best}d</span>`);
  if (c.prestige && c.prestige !== 'normal') chips.push(`<span class="chip gold">✦ ${c.prestige}</span>`);
  if (c.restDay)    chips.push(`<span class="chip">descanso</span>`);
  $('chips').innerHTML = chips.join('');
}

function renderToday(snap){
  const done = snap.doneToday || {};
  const pel = snap.pelvico;                 // {done, total} — pélvico é 3x/dia
  $('todayGrid').innerHTML = TODAY_MODULES.map(m => {
    let on, badge;
    if (m.key === 'pelvico' && pel && pel.total){
      on = pel.done >= pel.total;
      badge = on ? icon('check') : `<span class="frac">${pel.done}/${pel.total}</span>`;
    } else {
      on = !!done[m.key];
      badge = on ? icon('check') : icon(m.key);
    }
    return `<div class="pill ${on?'done':''}">
      <span class="dot">${badge}</span>
      <span class="lbl">${m.lbl}</span>
    </div>`;
  }).join('');
}

function card(title, ic, badge, body){
  return `<div class="card fade-in">
    <div class="card-head">
      <div class="card-title"><span class="ic">${ic}</span>${title}</div>
      ${badge ? `<div class="card-badge">${badge}</div>` : ''}
    </div>${body}</div>`;
}

// otimista: limpa o pendente quando o snapshot confirma o alvo; retorna se ainda está pendente.
function pendingFor(key, done){
  if (key in _pending && _pending[key] === done) delete _pending[key];
  return key in _pending;
}
// botão "marcar tudo / limpar" de uma rotina do skincare (toggle da rotina inteira)
function skinBtn(routine, slot){
  const done = !!slot.complete, key = 'skincare.' + routine, pend = pendingFor(key, done);
  const lbl = pend ? '…' : (done ? 'limpar tudo' : 'marcar tudo');
  const cls = pend ? 'wait' : '';
  return `<button class="mark-btn skin-all ${cls}" data-ev="skincare.${routine}" data-done="${done?1:0}" ${pend?'disabled':''}>${lbl}</button>`;
}

// rotina de skincare expansível: cabeçalho (N/M) + passos (marcar item a item) + "marcar tudo". F-SKINSTEP.
function skinRoutine(rt, slot, label){
  const steps = (slot.steps || []).filter(Boolean), open = _skinOpen[rt];
  const head = `<button class="skin-rthead ${slot.complete ? 'full' : ''}" data-ev="skin.open" data-rt="${rt}">
    <span class="skin-rtname">${label}</span><span class="skin-rtcount">${slot.done || 0}/${slot.total || 0}</span>
    <span class="skin-rtchev">${icon(open ? 'up' : 'down')}</span></button>`;
  if (!open) return `<div class="skin-rt">${head}</div>`;
  const rows = steps.length ? steps.map(st => {
    // SKIN-FREQ-2026-08-18 · passo de frequência semanal (retinoide) é marcado à parte e NÃO conta
    // como pendência do dia — o Mac só conta os diários (freq>=7).
    const fq = (globalThis.Regras && Regras.freqDoPasso) ? Regras.freqDoPasso(st) : ((st.freq == null) ? 7 : st.freq);  // CORE-2026-08-24
    const freqTag = fq >= 7 ? '' : `<span class="skin-stepfreq">${fq === 1 ? '1×/sem' : fq + '×/sem'}</span>`;
    const sub = [(SKIN_LIB[st.type] || {}).name || '', st.product || ''].filter(Boolean).join(' · ');
    return `<div class="skin-step ${st.done ? 'done' : ''}">
      <button class="prio-chk ${st.done ? 'on' : ''}" data-ev="skincare.step" data-rt="${rt}" data-title="${escapeHtml(st.title)}" data-done="${st.done ? 1 : 0}" aria-label="marcar passo">${st.done ? icon('check') : ''}</button>
      <button class="skin-stepmain" data-ev="skin.info" data-type="${escapeHtml(st.type || '')}" data-title="${escapeHtml(st.title)}">
        <span class="skin-steptitle">${escapeHtml(st.title)}${freqTag}</span>${sub ? `<span class="skin-stepsub">${escapeHtml(sub)}</span>` : ''}<span class="skin-stepinfo">${icon('info')}</span>
      </button>
    </div>`;
  }).join('') : `<div class="todo-empty">sem passos habilitados</div>`;
  return `<div class="skin-rt">${head}<div class="skin-steps">${rows}${skinBtn(rt, slot)}</div></div>`;
}
// HÁBITOS · o celular NÃO recalcula regra nenhuma: quem é "devido hoje" já vem decidido pelo Mac
// (regra de ritmo, teto de foco, graduação moram no habitos.lua). Aqui só marca. MOBILE-HABITOS-2026-07-21.
function habitosBody(hb){
  const itens = hb.itens || [];
  if (!itens.length) return `<div class="todo-empty">nenhum hábito ativo</div>`;
  const rows = itens.map(h => {
    const pend = pendingFor('habito.' + h.id, h.done);
    const semanal = h.freq >= 7 ? '' : `<span class="hb-wk${h.devido && !h.done ? ' due' : ''}">${h.devido && !h.done ? 'hoje · ' : ''}sem ${h.semana}/${h.freq}</span>`;
    const tipo = `<span class="hb-tp${h.tipo === 'foco' ? ' foco' : ''}">${h.tipo === 'foco' ? 'foco' : 'âncora'}</span>`;
    return `<div class="hb-row ${h.done ? 'done' : ''}">
      <button class="prio-chk ${h.done ? 'on' : ''}" data-ev="habito.toggle" data-id="${escapeHtml(h.id)}" data-done="${h.done ? 1 : 0}" ${pend ? 'disabled' : ''} aria-label="marcar hábito">${h.done ? icon('check') : ''}</button>
      <span class="hb-nm">${escapeHtml(h.nome)}</span>${semanal}${tipo}
    </div>`;
  }).join('');
  return `<div class="hb-list">${rows}</div>`;
}
// otimista: marca o hábito no snapshot local e recomputa o contador do dia
// COMER · barra de proteína + sugestão + toque nos favoritos/combos pra somar. MOBILE-COMER-2026-07-29.
// O celular NÃO recalcula meta/sugestão — vêm decididos pelo Mac (recomp mora lá).
function mealByHour(){ const h=new Date().getHours(); return h<12?'cafe':h<15?'almoco':h<19?'lanche':'janta'; }
function comerBody(cm){
  const n = cm.prot||0, m = cm.meta, pct = Math.min(100, Math.round(n/m*100)), done = n>=m;
  const barCol = done ? 'var(--sage,#93b184)' : '#5b9bd5';
  let h = `<div class="cm-track"><div class="cm-fill" style="width:${pct}%;background:${barCol}"></div></div>`;
  h += `<div class="cm-sugg">${done ? '✓ meta batida hoje' : escapeHtml(cm.sugestao || ('faltam '+(m-n)+'g'))}</div>`;
  const meals = (cm.meals || []).filter(Boolean), combos = (cm.combos || []).filter(Boolean);
  const byId = {}; (cm.banco||[]).filter(Boolean).forEach(b => byId[b.id]=b);   // AUDIT-2026-09-02 · null não derruba o render
  // MONTÁVEL: abas de refeição — escolhe a refeição, toca o que comeu
  if (meals.length){
    if (!_comerMeal || !meals.find(x=>x.id===_comerMeal)) _comerMeal = meals.find(x=>x.id===mealByHour())?mealByHour():meals[0].id;
    h += `<div class="cm-mtabs">` + meals.map(mm =>
      `<button class="cm-mtab ${mm.id===_comerMeal?'on':''}" data-ev="comer.meal" data-meal="${escapeHtml(mm.id)}">${escapeHtml(mm.nome)}</button>`).join('') + `</div>`;
  }
  // atalhos (shakes)
  if (combos.length){
    h += `<div class="cm-lbl">atalhos</div><div class="cm-chips">`;
    h += combos.map(c => `<button class="cm-chip combo" data-ev="comer.portion" data-id="${escapeHtml(c.id)}" data-nome="${escapeHtml(c.nome)}" data-prot="${c.prot}" data-medida="${escapeHtml(c.desc||'')}"><b>${escapeHtml(c.nome)}</b><small>${escapeHtml(c.desc||'')}</small><i>+${c.prot}g</i></button>`).join('');
    h += `</div>`;
  }
  // opções da refeição escolhida
  const meal = meals.find(x=>x.id===_comerMeal);
  if (meal){
    h += `<div class="cm-lbl">monte seu ${escapeHtml(String(meal.nome||'').toLowerCase())}</div><div class="cm-chips">`;
    h += (meal.itens||[]).map(id=>byId[id]).filter(Boolean).map(b =>
      `<button class="cm-chip" data-ev="comer.portion" data-id="${escapeHtml(b.id)}" data-nome="${escapeHtml(b.nome)}" data-prot="${b.prot}" data-medida="${escapeHtml(b.medida||'')}" data-info="${escapeHtml(b.info||'')}"><b>${escapeHtml(b.nome)}</b><small>${escapeHtml(b.medida||'')}</small><i>+${b.prot}g</i></button>`).join('');
    h += `</div>`;
  }
  h += `<button class="cm-more" data-ev="comer.all">＋ outro item / buscar…</button>`;
  // log de hoje
  // PARIDADE-COMER-2026-08-24 · faixa do coach de recomposição (só existia no Mac)
  if (cm.coach && cm.coach.txt) h += `<div class="cm-coach">${cm.coach.status && cm.coach.status !== 'coletando' ? '<b>coach:</b> ' : ''}${escapeHtml(cm.coach.txt)}</div>`;
  // PESO-MOBILE-2026-08-24 · o coach pede peso; agora dá pra registrar daqui (era só no Mac)
  h += `<button class="cm-peso" data-ev="comer.peso">⚖ ${cm.peso ? `${cm.peso} kg` : 'registrar peso'}${cm.pesoEm ? ` <small>· ${escapeHtml(cm.pesoEm)}</small>` : ''}</button>`;
  const lg = cm.log || [];
  if (lg.length){
    h += `<div class="cm-lbl">hoje</div><div class="cm-log">`;
    // COMER-UNDO-IDX-2026-08-18 · leva o ÍNDICE (x.i): o horário é ambíguo (refeição inteira no mesmo minuto)
    h += lg.map((x, k) => `<div class="cm-lrow"><span>${escapeHtml(x.nome)}</span><small>${escapeHtml(x.t||'')}</small><i>+${x.prot}g</i><button class="cm-lx" data-ev="comer.undo" data-t="${escapeHtml(x.t||'')}" data-idx="${x.i || (k+1)}">×</button></div>`).join('');
    h += `</div>`;
  }
  return h;
}
let _comerMeal = '';
// otimista: ajusta a barra na hora (o log detalhado chega no próximo snapshot)
function optimisticComer(delta, entry){
  const cm = _lastSnap && _lastSnap.comer; if (!cm) return;
  cm.prot = Math.max(0, (cm.prot||0) + delta);
  if (entry){ cm.log = (cm.log||[]); if (delta>0) cm.log.push(entry); }
  render(_lastSnap);
}
function optimisticHabito(id){
  const hb = _lastSnap && _lastSnap.habitos; if (!hb || !Array.isArray(hb.itens)) return;
  const h = hb.itens.find(x => x.id === id); if (!h) return;
  h.done = !h.done;
  h.semana = Math.max(0, (h.semana || 0) + (h.done ? 1 : -1));
  hb.done = hb.itens.filter(x => x.done).length;
  render(_lastSnap);
}
// otimista: alterna o passo no snapshot local + recomputa a contagem da rotina
function optimisticSkinStep(rt, title){
  const slot = _lastSnap && _lastSnap.skincare && _lastSnap.skincare[rt]; if (!slot || !Array.isArray(slot.steps)) return;
  const st = slot.steps.find(x => x.title === title); if (!st) return;
  st.done = !st.done;
  // CORE-2026-08-24 · o critério de "passo do dia" mora no núcleo (mesmo do Mac)
  const _diario = x => (globalThis.Regras && Regras.ehDiario) ? Regras.ehDiario(x) : ((x.freq == null ? 7 : x.freq) >= 7);
  slot.done = slot.steps.filter(x => x.done && _diario(x)).length;
  slot.complete = slot.total > 0 && slot.done >= slot.total;
  render(_lastSnap);
}

/* ---------- prioridades: UI otimista + drag-and-drop ---------- */
let _dragging = false;
// aplica a mudança JÁ no snapshot local + repinta (feedback instantâneo); o Mac reconcilia depois.
function optimisticPrio(fn){
  if (_lastSnap && _lastSnap.prioridades && Array.isArray(_lastSnap.prioridades.itens)){
    fn(_lastSnap.prioridades); render(_lastSnap);
  }
}
function schedulePrioRefresh(){ [3, 8, 15, 25].forEach(s => setTimeout(refresh, s * 1000)); }

let _drag = null;
function prioDragStart(e){
  const handle = e.target.closest('.prio-drag'); if (!handle) return;
  const item = handle.closest('.prio-item'); if (!item) return;
  e.preventDefault();
  _dragging = true;
  _drag = { item, list: item.parentElement, id: Number(item.dataset.id), moved: false };
  item.classList.add('dragging');
  try{ handle.setPointerCapture(e.pointerId); }catch(err){}
}
function prioDragMove(e){
  if (!_drag) return;
  e.preventDefault();
  const { item, list } = _drag, y = e.clientY;
  const sibs = [...list.querySelectorAll('.prio-item:not(.dragging)')];
  let ref = null;
  for (const s of sibs){ const r = s.getBoundingClientRect(); if (y < r.top + r.height / 2){ ref = s; break; } }
  if (ref){ if (item.nextSibling !== ref){ list.insertBefore(item, ref); _drag.moved = true; } }
  else if (list.lastElementChild !== item){ list.appendChild(item); _drag.moved = true; }
}
function prioDragEnd(){
  if (!_drag) return;
  const { item, list, id, moved } = _drag;
  item.classList.remove('dragging');
  _drag = null;
  setTimeout(() => { _dragging = false; }, 350);   // cobre o ghost-click do iOS após soltar o arraste
  if (!moved) return;
  const dom = [...list.querySelectorAll('.prio-item')];
  const idx = dom.findIndex(x => Number(x.dataset.id) === id);
  const beforeEl = dom[idx + 1];
  const beforeId = beforeEl ? Number(beforeEl.dataset.id) : null;
  // reordena o snapshot local (o DOM já está na ordem certa → não re-renderiza pra não piscar)
  if (_lastSnap && _lastSnap.prioridades){
    const arr = _lastSnap.prioridades.itens, from = arr.findIndex(i => i.id === id);
    if (from >= 0){ const [it] = arr.splice(from, 1); let to = arr.length; if (beforeId){ const b = arr.findIndex(i => i.id === beforeId); if (b >= 0) to = b; } arr.splice(to, 0, it); }
  }
  postEvent({ type:'intent.move', intentId:id, beforeId }).then(schedulePrioRefresh).catch(err => { flashError(err.message || 'falha ao mover'); refreshForcado(); });
}

// corpo do card de Prioridades: tabs (filtro local) + itens (toggle/nota/arrastar) + histórico. PRIORIDADES-EDIT-F.A.
function prioBody(pr){
  const items = pr.itens || [];
  const tab = _prioTab;
  const filtered = items.filter(i => tab === 'todos' || (i.type || 'pessoal') === tab);
  const tabs = ['trabalho', 'pessoal', 'todos']
    .map(t => `<button class="ptab ${t === tab ? 'on' : ''}" data-ptab="${t}">${t}</button>`).join('');
  const rows = filtered.length ? filtered.map(it => {
    const note = it.note ? `<div class="prio-note">${escapeHtml(it.note)}</div>` : '';
    return `<div class="prio-item ${it.done ? 'done' : ''}" data-id="${it.id}">
      <button class="prio-chk ${it.done ? 'on' : ''}" data-ev="intent.toggle" data-id="${it.id}" aria-label="marcar/desmarcar">${it.done ? icon('check') : ''}</button>
      <button class="prio-main" data-ev="intent.edit" data-id="${it.id}" data-text="${escapeHtml(it.text)}" data-note="${escapeHtml(it.note || '')}">
        <span class="prio-txt">${escapeHtml(it.text)}</span>${note}
      </button>
      <div class="prio-drag" aria-label="arrastar pra reordenar">${icon('grip')}</div>
    </div>`;
  }).join('') : `<div class="todo-empty">nada em ${tab}</div>`;
  const addBtn = `<button class="prio-add" data-ev="intent.new">${icon('plus')} nova prioridade</button>`;
  const hist = pr.history || [];
  const histBtn = hist.length ? `<button class="prio-histbtn" data-ev="prio.hist">${_showHist ? 'ocultar histórico' : 'ver histórico'}</button>` : '';
  let histSec = '';
  if (_showHist && hist.length){
    histSec = '<div class="prio-hist">' + hist.map(day =>
      `<div class="prio-histday">${day.date}</div>` +
      (day.itens || []).map(h => `<div class="prio-histitem">${icon('check')} ${escapeHtml(h.text)}</div>`).join('')
    ).join('') + '</div>';
  }
  return `<div class="ptabs">${tabs}</div><div class="prio-list">${rows}</div>${addBtn}${histBtn}${histSec}`;
}

/* ---------- financeiro: home enxuta + TELA CHEIA (navegação de meses, categorias, edição). FIN-MOBILE-FULL-2026-07-15 ---------- */
const FIN_CATS = ['Tenho', 'Receber', 'Fixo', 'Variável', 'Cartão', 'Investir'];
const FIN_STATUS = ['Previsto', 'Pago', 'Atrasado', 'Cancelado'];
const _MES_ABBR = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
let _finOpen = {};
try{ _finOpen = JSON.parse(localStorage.getItem('companheiro.finOpen')) || {}; }catch{ _finOpen = {}; }
function saveFinOpen(){ localStorage.setItem('companheiro.finOpen', JSON.stringify(_finOpen)); }
let _finMonth = null;   // mês em foco na tela cheia (null = mês corrente do snapshot)
function fmtBRL(v){ return 'R$ ' + (Number(v)||0).toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 }); }
// PLUGGY-FRESH · "há X" a partir de um ISO (string) ou unix ts. Frescor REAL do dado bancário.
function agoStr(v){
  if (!v) return 'nunca';
  const ts = (typeof v === 'string') ? Math.floor(Date.parse(v)/1000) : v;
  if (!ts || isNaN(ts)) return 'nunca';
  const s = Math.max(0, Math.floor(Date.now()/1000 - ts));
  if (s < 90) return 'agora';
  const m = Math.floor(s/60); if (m < 90) return `há ${m} min`;
  const h = Math.floor(m/60);  if (h < 36) return `há ${h}h`;
  return `há ${Math.floor(h/24)}d`;
}
function fmtMes(mes){ const p = String(mes||'').split('-'); return (_MES_ABBR[(+p[1])-1] || p[1] || '') + '/' + (p[0]||''); }
function monthShift(mes, d){ let [y,m] = String(mes).split('-').map(Number); m += d; while(m>12){m-=12;y++;} while(m<1){m+=12;y--;} return y + '-' + String(m).padStart(2,'0'); }
function rowsOfMonth(rows, mes){ return (rows||[]).filter(r => r.mes === mes); }
// pt-BR: ponto = milhar, vírgula = decimal ("1.234,56" → 1234.56)
function parseValBR(s){
  s = String(s).trim().replace(/[^\d.,-]/g, '');
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s); return isNaN(n) ? 0 : n;
}
// resumo de um conjunto de linhas — MESMA lógica do Mac (summarize). Retorna {tenho,receber,previsto,investir,sobra,livres}
function summaryOf(rows){
  // CORE-2026-08-24 · fórmula única no núcleo (estava escrita em 3 lugares: financeiro.lua,
  // financeiro.html e aqui). Fallback local mantido — se o núcleo faltar, nada quebra.
  if (globalThis.Regras && Regras.resumoFinanceiro) return Regras.resumoFinanceiro(rows);
  let tenho = 0, livres = null;
  const pend = { Receber:0, Fixo:0, 'Variável':0, 'Cartão':0, Investir:0 };
  for (const r of (rows||[])){
    if (!r) continue;   /* AUDIT2-2026-09-02 (B2) · linha null: o núcleo sobrevive, o fallback lançava */
    if (r.cat === 'Tenho') tenho += r.valor || 0;
    else if (r.status === 'Pago'){ /* realizado */ }
    else if (r.status !== 'Cancelado' && (r.cat in pend)) pend[r.cat] += r.valor || 0;
    if (r.cat === 'Variável' && String(r.label||'').toLowerCase().includes('livre')) livres = (livres||0) + (r.valor||0);
  }
  const previsto = pend.Fixo + pend['Variável'] + pend['Cartão'];
  return { tenho, receber: pend.Receber, previsto, investir: pend.Investir,
           sobra: tenho + pend.Receber - previsto - pend.Investir, livres };
}
// otimista: muda o snapshot local + repinta a home E a tela cheia (se aberta); o Mac reconcilia depois
function optimisticFin(fn){
  if (_lastSnap && _lastSnap.financeiro && Array.isArray(_lastSnap.financeiro.rows)){
    fn(_lastSnap.financeiro); render(_lastSnap);
  }
}

// bloco de resumo (4 números principais) — usado na home e no topo da tela cheia
function finSumHtml(sm){
  const stat = (lbl, v, extra='') => `<div class="fin-stat ${extra}"><small>${lbl}</small><b>${fmtBRL(v)}</b></div>`;
  const sobraCls = (sm.sobra||0) < 0 ? 'neg' : 'pos';
  return `<div class="fin-sum fin-sum4">${stat('tenho', sm.tenho||0)}${stat('a receber', sm.receber||0)}${stat('sobra', sm.sobra||0, 'sobra '+sobraCls)}${stat('gastos livres', sm.livres||0)}</div>`;
}
// HOME: só o resumo do mês corrente + botão "ver completo"
function finHomeBody(fin){
  const rows = rowsOfMonth(fin.rows, fin.mes);
  return finSumHtml(summaryOf(rows)) + `<button class="mark-btn fin-open" data-ev="fin.full">ver completo</button>`;
}
// categorias + linhas de um mês (usado na tela cheia)
function finCatsHtml(rows){
  const cats = FIN_CATS.map(cat => {
    const crows = rows.filter(r => r.cat === cat);
    const sub = crows.reduce((a, r) => a + (r.valor||0), 0);
    const open = !!_finOpen[cat];
    const h = `<button class="fin-cathead" data-ev="fin.cat" data-cat="${cat}">
      <span class="fin-catname">${cat}</span><span class="fin-catcount">${crows.length}</span>
      <span class="fin-catsub">${fmtBRL(sub)}</span><span class="fin-catchev">${icon(open ? 'up' : 'down')}</span></button>`;
    if (!open) return `<div class="fin-cat">${h}</div>`;
    const list = crows.length ? crows.map(r => {
      const badges = [];
      if (r.origem === 'Pluggy') badges.push(`<span class="fin-bdg plug" title="sincronizado do banco (Pluggy) — atualiza sozinho">🔗</span>`);
      if (r.venc)  badges.push(`<span class="fin-bdg" title="vence dia ${r.venc}">d${r.venc}</span>`);
      if (r.split) badges.push(`<span class="fin-bdg split" title="dividir com a esposa">÷</span>`);
      if (r.manualOverride) badges.push(`<span class="fin-bdg manual" title="valor editado manualmente — some no próximo sync real do Pluggy">✎</span>`);
      const sc = 's-' + String(r.status||'Previsto').toLowerCase();
      const rid = escapeHtml(String(r.id));
      return `<div class="fin-row ${r.status==='Pago'?'pago':''} ${r.status==='Cancelado'?'canc':''}" data-id="${rid}">
        <button class="fin-status ${sc}" data-ev="fin.status" data-id="${rid}" data-status="${escapeHtml(r.status||'Previsto')}">${escapeHtml(r.status||'Previsto')}</button>
        <button class="fin-main" data-ev="fin.edit" data-id="${rid}">
          <span class="fin-lbl">${escapeHtml(r.label||'(sem nome)')}</span>${badges.length?`<span class="fin-badges">${badges.join('')}</span>`:''}
        </button>
        <span class="fin-val">${fmtBRL(r.valor)}</span>
      </div>`;
    }).join('') : `<div class="todo-empty">sem linhas</div>`;
    return `<div class="fin-cat">${h}<div class="fin-rows">${list}<button class="fin-add" data-ev="fin.new" data-cat="${cat}">${icon('plus')} nova linha</button></div></div>`;
  }).join('');
  return `<div class="fin-cats">${cats}</div>`;
}

/* ---------- trava de scroll do fundo p/ os overlays (iOS PWA: senão o toque "puxa" a home) ---------- */
let _scrollLockY = 0;
function syncScrollLock(){
  const anyOpen = !$('finFull').hidden || !$('extratoFull').hidden;
  const locked = document.body.classList.contains('finfull-on');
  if (anyOpen && !locked){
    _scrollLockY = window.scrollY || 0;
    document.body.style.top = `-${_scrollLockY}px`;
    document.body.classList.add('finfull-on');
  } else if (!anyOpen && locked){
    document.body.classList.remove('finfull-on');
    document.body.style.top = '';
    window.scrollTo(0, _scrollLockY);
  }
}

/* ---------- financeiro TELA CHEIA (overlay #finFull) ---------- */
function openFinFull(){
  const fin = _lastSnap && _lastSnap.financeiro; if (!fin) return;
  _finMonth = _finMonth || fin.mes;
  renderFinFull();
  $('finFull').hidden = false;
  syncScrollLock();
}
function closeFinFull(){ $('finFull').hidden = true; syncScrollLock(); }
function finShiftMonth(d){ const fin = _lastSnap && _lastSnap.financeiro; if (!fin) return; _finMonth = monthShift(_finMonth || fin.mes, d); renderFinFull(); }
function renderFinFull(){
  const fin = _lastSnap && _lastSnap.financeiro; if (!fin) return;
  const mes = _finMonth || fin.mes;
  $('finMonthLbl').textContent = fmtMes(mes) + (mes === fin.mes ? ' · atual' : '');
  const rows = rowsOfMonth(fin.rows, mes);
  const manual = rows.filter(r => !r.pid);   // linhas do Pluggy têm pid; manuais não
  // PLUGGY-FRESH · faixa de frescor: quando os bancos foram sincronizados + botão "puxar agora"
  const dataAsOf = _lastSnap.pluggy && _lastSnap.pluggy.dataAsOf;
  const hasBanks = _lastSnap.pluggy && Array.isArray(_lastSnap.pluggy.banks) && _lastSnap.pluggy.banks.length;
  let body = `<div class="fin-fresh"><span class="fin-fresh-lbl">🔄 bancos atualizados ${agoStr(dataAsOf)}</span>` +
             `<span class="fin-fresh-acts"><button class="fin-refresh" data-ev="pluggy.refresh">puxar agora</button>` +
             // forçar atualização só é possível no próprio Meu Pluggy (MeuPluggy bloqueia refresh de terceiros)
             (hasBanks ? `<a class="fin-refresh" href="https://meu.pluggy.ai/overview" target="_blank" rel="noopener">Meu Pluggy ↗</a>` : '') +
             `</span></div>`;
  body += finSumHtml(summaryOf(rows));
  if (rows.length) body += finCatsHtml(rows);
  // Sem linhas MANUAIS (o mês pode já ter só os cartões do Pluggy) → oferece copiar a estrutura.
  // Copia só o manual do mês anterior (Fixo/Variável/Receber…); os cartões o Pluggy já mantém.
  if (manual.length === 0){
    const prev = monthShift(mes, -1);
    const prevN = rowsOfMonth(fin.rows, prev).filter(r => !r.pid).length;
    body += `<div class="fin-rollover">` +
      (rows.length ? '' : `<p class="fin-empty">Nenhuma linha em ${fmtMes(mes)}.</p>`) +
      (prevN ? `<button class="mark-btn" data-ev="fin.rollover" data-mes="${mes}">copiar estrutura de ${fmtMes(prev)} (${prevN} linhas)</button>`
             : `<button class="fin-add" data-ev="fin.new" data-cat="Fixo">${icon('plus')} adicionar a primeira linha</button>`) +
      `</div>`;
  }
  $('finFullBody').innerHTML = body;
}

/* ---------- EXTRATO read-only (dados reais via Pluggy) · overlay #extratoFull ---------- */
let _extratoOpen = {};
function openExtrato(){ renderExtrato(); $('extratoFull').hidden = false; syncScrollLock(); }
function closeExtrato(){ $('extratoFull').hidden = true; syncScrollLock(); }

/* Reconexão forçada: só é possível no próprio Meu Pluggy (link "Meu Pluggy ↗" na faixa de frescor abre
   meu.pluggy.ai/overview). O MeuPluggy bloqueia refresh via widget de terceiros — ver HANDOFF §10. */
function renderExtrato(){
  const ex = _lastSnap && _lastSnap.extrato;
  const when = $('extratoWhen');
  if (!ex || !Array.isArray(ex.accounts) || !ex.accounts.length){
    $('extratoBody').innerHTML = `<div class="todo-empty">Sem extrato ainda — sincroniza no Mac (Pluggy).</div>`;
    if (when) when.textContent = '';
    return;
  }
  if (when) when.textContent = ex.iso ? ('atualizado ' + ex.iso) : '';
  const fmtDay = d => { const p = String(d).split('-'); return p.length === 3 ? (p[2] + '/' + p[1]) : d; };
  const noR$ = v => fmtBRL(Math.abs(v)).replace('R$ ', '');
  $('extratoBody').innerHTML = ex.accounts.filter(Boolean).map((a, i) => {
    const open = !!_extratoOpen[i];
    const txs = (a.txs || []).filter(Boolean);
    const outSum = txs.reduce((s, t) => s + (t.v < 0 ? -t.v : 0), 0);
    const head = `<button class="fin-cathead" data-ev="ext.acc" data-i="${i}">
      <span class="fin-catname">${a.cat === 'Cartão' ? '💳' : '🏦'} ${escapeHtml(a.label)}</span>
      <span class="fin-catcount">${txs.length}</span>
      <span class="fin-catsub">saiu ${fmtBRL(outSum)}</span>
      <span class="fin-catchev">${icon(open ? 'up' : 'down')}</span></button>`;
    if (!open) return `<div class="fin-cat">${head}</div>`;
    const list = txs.length ? txs.map(t => `
      <div class="ext-row">
        <span class="ext-date">${fmtDay(t.d)}</span>
        <span class="ext-desc">${escapeHtml(t.t || '')}${t.c ? `<em class="ext-catg">${escapeHtml(t.c)}</em>` : ''}</span>
        <span class="ext-val ${t.v < 0 ? 'out' : 'in'}">${t.v < 0 ? '−' : '+'}${noR$(t.v)}</span>
      </div>`).join('') : `<div class="todo-empty">sem lançamentos recentes</div>`;
    return `<div class="fin-cat">${head}<div class="fin-rows">${list}</div></div>`;
  }).join('');
}

const DAY_MOOD_EMOJI = { leve:'😊', normal:'😐', puxado:'😩' };
let _cardExpanded = {};   // cards concluídos que o Lucas expandiu (default = minimizado; não persiste)
// PELVIC-COUNT-2026-07-23 · otimista: soma/subtrai uma sessão (não é mais slot de faixa)
function optimisticPelvic(delta){
  const pv = _lastSnap && _lastSnap.pelvico; if (!pv) return;
  pv.done = Math.max(0, (pv.done||0) + delta);
  render(_lastSnap);
}
// LAYOUT-DIA-2026-07-15 · monta os cards de hábito como descritores {done} e ordena:
// pendentes (abertos, topo) → concluídos (minimizados, embaixo) → Financeiro (ferramenta, fim).
function renderCards(snap){
  const daily = [];

  // FECHAR O DIA — sacro (+15 XP/streak) → aplica pelo widget quando o hub abre; fire-and-forget.
  if (snap.daylog){
    const dl = snap.daylog, closed = !!dl.closed, pend = pendingFor('daylog', closed);
    const em = DAY_MOOD_EMOJI[dl.mood] || '';
    let body;
    if (pend && !closed) body = `<button class="mark-btn wait" disabled>enviado ✓ · fecha quando o Mac abrir</button>`;
    else if (closed)     body = `<button class="mark-btn done" data-ev="day.open">dia fechado hoje ${em} · revisar</button>`;
    else                 body = `<div class="day-prompt">Como foi o seu dia?</div><button class="mark-btn" data-ev="day.open">fechar o dia</button>`;
    daily.push({ key:'daylog', title:'Fechar o dia', ic:icon('moon'), badge:'', body, done:closed, mini:`fechado ${em}` });
  }

  // REFLEXÃO — sacro (+12 XP). Editar (reabrir modal) desfaz/ajusta.
  if (snap.reflexao && snap.reflexao.question){
    const rf = snap.reflexao, q = `<div class="refl-q">${escapeHtml(rf.question)}</div>`;
    const body = rf.answered
      ? q + `<div class="refl-ans">${escapeHtml(rf.answer || '')}</div><button class="mark-btn done" data-ev="refl.open">respondido ✓ · editar</button>`
      : q + `<button class="mark-btn" data-ev="refl.open">responder</button>`;
    daily.push({ key:'reflexao', title:'Reflexão do dia', ic:icon('meditacao'), badge:'', body, done:!!rf.answered, mini:'respondido' });
  }

  // ÁGUA — +1 garrafa e −1 (desfazer). "done" = bateu a meta (100%).
  if (snap.water){
    const w = snap.water, p = Math.max(0, Math.min(100, w.pct||0)), done = p >= 100;
    const undo = (w.bottles||0) > 0 ? `<button class="mark-btn ghost-btn" data-ev="agua.undo">−1 garrafa (desfazer)</button>` : '';
    const body = `
      <div class="ring-row">
        <div class="ring" style="--p:${p};position:relative"><b>${p}%</b></div>
        <div class="ring-meta"><b>${(w.ml/1000).toFixed(2)} L</b> bebidos hoje
          <small>${w.bottles||0} garrafa(s) de ${w.bottleMl||0} ml</small></div>
      </div>
      <button class="mark-btn" data-ev="agua.bottle">+1 garrafa (${w.bottleMl||700} ml)</button>${undo}`;
    daily.push({ key:'agua', title:'Água', ic:icon('agua'), badge:`meta ${(w.goalMl/1000).toFixed(1)} L`, body, done, mini:`${(w.ml/1000).toFixed(1)} L` });
  }

  // PRIORIDADES — done só quando não sobra pendente. Toggle já desmarca por item.
  if (snap.prioridades){
    const pr = snap.prioridades, done = (pr.total > 0 && pr.pending === 0);
    daily.push({ key:'prio', title:'Prioridades', ic:icon('prioridades'), badge:`${pr.pending}/${pr.total}`, body:prioBody(pr), done, mini:'tudo feito' });
  }

  // SKINCARE — done quando manhã+noite completas. Toggle já desfaz (rotina e passo).
  if (snap.skincare){
    const s = snap.skincare, am = s.am||{}, pm = s.pm||{}, done = !!(am.complete && pm.complete);
    daily.push({ key:'skin', title:'Skincare', ic:icon('skincare'), badge: s.streak!=null?`${icon('flame')} ${s.streak}d`:'',
      body: skinRoutine('am', am, 'Manhã') + skinRoutine('pm', pm, 'Noite'), done, mini:'manhã + noite' });
  }

  // HÁBITOS — âncoras + foco da semana. done quando nada devido continua pendente.
  if (snap.habitos && (snap.habitos.itens || []).length){
    const hb = snap.habitos, done = (hb.total > 0 && hb.done >= hb.total);
    daily.push({ key:'habitos', title:'Hábitos', ic:icon('habitos'),
      badge: hb.streak ? `${icon('flame')} ${hb.streak}d` : '',
      body: habitosBody(hb), done, mini: hb.total ? `${hb.done}/${hb.total}` : 'nada devido' });
  }

  // COMER — barra de proteína + toque pra somar (proteína-primeiro). MOBILE-COMER-2026-07-29.
  if (snap.comer && snap.comer.meta){
    const cm = snap.comer, n = cm.prot||0, m = cm.meta, done = n >= m;
    daily.push({ key:'comer', title:'Comer', ic:icon('comer'),
      badge:`${n}/${m}g`, body: comerBody(cm), done, mini:`${n}/${m}g` });
  }

  // MEDITAÇÃO — toggle: marca / desfaz (marcou por engano).
  if (snap.doneToday){
    const done = !!snap.doneToday.meditacao, pend = pendingFor('meditacao', done);
    const lbl = pend ? 'enviando…' : (done ? 'atenção feita hoje ✓ · desfazer' : 'marcar atenção do dia');
    daily.push({ key:'med', title:'Atenção / Meditação', ic:icon('meditacao'), badge:'',
      // PARIDADE-MEDIT-2026-08-24 · a prática do dia (rotação que escolhe pro sábado justamente a que
      // "cabe sem laptop") agora vem no snapshot e aparece aqui.
      body:`${(snap.meditacao&&snap.meditacao.practice)?`<div class="med-pratica">${escapeHtml(snap.meditacao.practice.emoji||'')} <b>${escapeHtml(snap.meditacao.practice.label||'')}</b>${snap.meditacao.practice.durationSec?` · ${Math.round(snap.meditacao.practice.durationSec/60)} min`:''}</div>`:''}<button class="mark-btn ${pend?'wait':(done?'done':'')}" data-ev="meditacao" data-done="${done?1:0}" ${pend?'disabled':''}>${lbl}</button>`,
      done, mini:'feito' });
  }

  // MOBILIDADE — toggle: marca / desfaz.
  if (snap.doneToday){
    const done = !!snap.doneToday.mobilidade, pend = pendingFor('mobilidade', done);
    // UNDO-FANTASMA-2026-08-24 · check-in feito no MobiApp não pode ser desfeito daqui (o handler só mexe
    // no arquivo do celular) — então o rótulo não promete o que não cumpre.
    const ownMob = snap.mobiOwnHoje !== false;
    const lbl = pend ? 'enviando…'
      : (done ? (ownMob ? 'treino feito hoje ✓ · desfazer' : 'treino feito hoje ✓ (marcado no Mac)')
              : 'marcar treino de mobilidade');
    // MOBI-AB-2026-08-24 · desde o SESSAO-FOCO (12/08) a sessão é A pernas / B flexão / leve, e o card do
    // celular ainda dizia só "marcar treino" — não sabia qual era o foco de hoje.
    const foco = (snap.mobi && snap.mobi.focoLabel)
      ? `<div class="mobi-foco">hoje: <b>${escapeHtml(snap.mobi.focoLabel)}</b>${snap.mobi.semanaA != null ? ` <small>· A ${snap.mobi.semanaA} · B ${snap.mobi.semanaB} na semana</small>` : ''}</div>` : '';
    daily.push({ key:'mob', title:'Mobilidade', ic:icon('mobilidade'), badge:'',
      body:`${foco}<button class="mark-btn ${pend?'wait':(done?'done':'')}" data-ev="mobilidade" data-done="${done?1:0}" ${(pend||(done&&!ownMob))?'disabled':''}>${lbl}</button>`,
      done, mini:'treino feito' });
  }

  // REMÉDIOS — toggle "tomei hoje" (complementa o push das 13h30). REMEDIOS-2026-07-16.
  if (snap.doneToday){
    const done = !!snap.doneToday.remedios, pend = pendingFor('remedios', done);
    const lbl = pend ? 'enviando…' : (done ? 'remédio tomado hoje ✓ · desfazer' : 'marcar remédio de hoje');
    daily.push({ key:'remedios', title:'Remédios', ic:icon('remedios'), badge:'',
      body:`<button class="mark-btn ${pend?'wait':(done?'done':'')}" data-ev="remedios" data-done="${done?1:0}" ${pend?'disabled':''}>${lbl}</button>`,
      done, mini:'tomado' });
  }

  // PÉLVICO — 3 slots; toca pra marcar, toca de novo pra desfazer (só os marcados pelo celular).
  if (snap.pelvico){
    const pv = snap.pelvico, n = pv.done||0, tot = pv.total||3, done = n >= tot;
    // UNDO-FANTASMA-2026-08-24 · só dá pra desfazer o que o CELULAR marcou. Antes o "−1" aparecia sempre
    // que o total > 0 — e se a sessão tinha vindo do Mac, ele decrementava a UI e voltava no refresh.
    const own = (pv.own == null) ? n : pv.own;
    const undo = own > 0 ? `<button class="pv-undo" data-ev="pelvico.undo">−1</button>` : '';
    const body = `<div class="pv-count"><b>${n}</b> de ${tot} sessões hoje${done?' · meta batida 🎉':''}</div>`+
      `<div class="pv-btns"><button class="mark-btn" data-ev="pelvico.add">+1 sessão feita</button>${undo}</div>`;
    daily.push({ key:'pelv', title:'Pélvico', ic:icon('pelvico'), badge:`${n}/${tot}`, body, done, mini:`${n}/${tot}` });
  }

  // LEITURA — MOBILE-LEITURA-COMPLETA-2026-07-21 · card completo (autor, página/total, %, barra).
  // Toca o livro (ou "registrar leitura") → modal pra marcar em que página parou (atualiza % e streak).
  // O ✓ do lado é o check rápido "li hoje" (toggle), como antes.
  if (snap.leitura && Array.isArray(snap.leitura.books) && snap.leitura.books.length){
    const books = snap.leitura.books.filter(Boolean);   // AUDIT-2026-09-02
    const rows = books.map(b => {
      const key = 'leitura:' + b.id, pend = pendingFor(key, !!b.done);
      const cur = b.current || 0, tot = b.total || 0, pct = Math.max(0, Math.min(100, b.pct || 0));
      const unit = b.audio ? 'min' : 'pág';
      let meta;
      if (b.audio && tot > 0){ meta = `faltam <b>${fmtDur(Math.max(0, tot - cur))}</b> · <b>${pct}%</b>`; }
      else meta = tot > 0 ? `${unit} <b>${cur}</b> de <b>${tot}</b> · <b>${pct}%</b>` : `${unit} <b>${cur}</b>`;
      // PARIDADE-LEITURA-2026-08-24 · ritmo e estimativa de término só existiam no Mac
      const ritmo = (b.porDia && b.diasFalta != null)
        ? `<div class="book-ritmo">${b.audio ? fmtDur(b.porDia) : b.porDia + ' ' + unit}/dia · termina em ~${b.diasFalta} dia${b.diasFalta === 1 ? '' : 's'}</div>` : '';
      const dataAttrs = `data-book="${escapeHtml(b.id)}" data-title="${escapeHtml(b.title)}" data-cur="${cur}" data-tot="${tot}" data-audio="${b.audio?1:0}"`;
      return `<div class="book-card ${pend?'wait':(b.done?'done':'')}">
        <div class="book-top">
          <button class="book-main" data-ev="leit.log" ${dataAttrs}>
            <div class="book-t">${escapeHtml(b.title)}</div>
            ${b.author ? `<div class="book-a">${escapeHtml(b.author)}</div>` : ''}
            ${ritmo}
          </button>
          <button class="book-chk ${b.done?'on':''}" data-ev="leitura" data-book="${escapeHtml(b.id)}" data-done="${b.done?1:0}" ${pend?'disabled':''} aria-label="li hoje">${pend?'…':(b.done?'✓':'')}</button>
        </div>
        <div class="book-bar"><div class="book-fill" style="width:${pct}%"></div></div>
        <div class="book-meta"><span>${meta}</span>
          <button class="book-reg" data-ev="leit.log" ${dataAttrs}>${b.done?(b.audio?'atualizar tempo':'atualizar página'):'registrar leitura'}</button></div>
        <div class="book-acts">
          <button class="mini-btn" data-ev="leit.hl" data-book="${escapeHtml(b.id)}" data-title="${escapeHtml(b.title)}">✎ destaques${(b.hl && b.hl.length) ? ` (${b.hl.length})` : ''}</button>
          <button class="book-done-btn" data-ev="leit.finish" data-book="${escapeHtml(b.id)}" data-title="${escapeHtml(b.title)}">✔ concluir</button></div>
      </div>`;
    }).join('');
    const stk = snap.leitura.streak || 0;
    /* PARIDADE-LEITURA-2026-08-30 · lista de futuros + terminados (antes só existiam no widget do Mac) */
    const lst = snap.leituraLista || null;
    const nLista = (lst && Array.isArray(lst.toRead)) ? lst.toRead.length : 0;
    const rodape = lst ? `<div class="book-acts">
        <button class="mini-btn" data-ev="leit.lista">📚 lista de leitura (${nLista})</button>
        <button class="mini-btn" data-ev="leit.fin">📕 ${lst.fin || 0} terminado${(lst.fin||0)===1?'':'s'}${lst.finAno?` · ${lst.finAno} no ano`:''}</button>
      </div>` : '';
    daily.push({ key:'leit', title:'Leitura', ic:icon('leitura'), badge: stk > 0 ? `${stk}d` : '',
      body:`<div class="book-list">${rows}</div>${rodape}`, done: books.length > 0 && books.every(b => b.done), mini:'lido' });
  } else if (snap.leituraLista){
    /* sem livro aberto: o card vive só com a lista (no Mac o backlog aparece sempre) */
    const lst = snap.leituraLista;
    const nLista = Array.isArray(lst.toRead) ? lst.toRead.length : 0;
    daily.push({ key:'leit', title:'Leitura', ic:icon('leitura'), badge:'',
      body:`<div class="book-acts"><button class="mini-btn" data-ev="leit.lista">📚 lista de leitura (${nLista})</button>
        <button class="mini-btn" data-ev="leit.novo">+ começar um livro</button></div>`, done:false, mini:'lido' });
  }

  // PÍLULA DO DIA — MENTE-2026-09-02 · espelho do card do hub (mesma seleção; "li" marca no Mac)
  if (snap.pilula && snap.pilula.titulo){
    const pl = snap.pilula, pend = pendingFor('pilula', !!pl.lida);
    const body = `<div class="pil-cat">${escapeHtml(pl.categoria || 'saúde sexual')}</div>
      <div><b>${escapeHtml(pl.titulo)}</b></div>
      <div class="pil-claim">${escapeHtml(pl.claim || '')}</div>
      <div class="pv-btns"><button class="mark-btn" data-ev="pilula.abrir">ler completa</button>
      ${pl.lida || pend ? '' : '<button class="mark-btn" data-ev="pilula.li">✓ li</button>'}</div>`;
    daily.push({ key:'pilula', title:'Pílula do dia', ic:'💊', badge:'', body, done: !!pl.lida, mini:'lida' });
  }

  // ---- ordena e renderiza ---- (Fechar o dia/Reflexão são de fim de dia → vão pro fim; ORDEM-2026-07-16)
  const CARD_ORDER = { agua:1, comer:2, remedios:3, prio:4, habitos:5, skin:6, med:7, mob:8, pelv:9, leit:10, pilula:10.5, reflexao:11, daylog:12 };
  const ord = c => (CARD_ORDER[c.key] || 50);
  const parts = [];
  const pend = daily.filter(c => !c.done).sort((a,b) => ord(a)-ord(b));
  const doneCards = daily.filter(c => c.done).sort((a,b) => ord(a)-ord(b));
  pend.forEach(c => parts.push(card(c.title, c.ic, c.badge, c.body)));
  if (doneCards.length && pend.length) parts.push(`<div class="cards-sep">concluído hoje</div>`);
  doneCards.forEach(c => {
    if (_cardExpanded[c.key]){
      parts.push(`<div class="card fade-in"><div class="card-head"><div class="card-title"><span class="ic">${c.ic}</span>${c.title}</div>` +
        `<button class="card-collapse" data-ev="card.collapse" data-key="${c.key}">minimizar ${icon('up')}</button></div>${c.body}</div>`);
    } else {
      parts.push(`<button class="card card-mini" data-ev="card.expand" data-key="${c.key}"><span class="ic">${c.ic}</span>` +
        `<span class="mini-title">${c.title}</span><span class="mini-done">${c.mini} ${icon('check')}</span><span class="mini-chev">${icon('down')}</span></button>`);
    }
  });
  // FINANCEIRO — ferramenta (nunca "conclui"): fixo no fim.
  if (snap.financeiro) parts.push(card('Financeiro', icon('financeiro'), fmtMes(snap.financeiro.mes), finHomeBody(snap.financeiro)));

  // ANALISE-2026-09-08 · leitura de gastos (só aparece com dado; o Mac é quem calcula)
  if (snap.gastos && snap.gastos.projecao){
    const g = snap.gastos, pct = g.variacaoPct || 0;
    const alto = pct >= 25, seta = pct > 0 ? '↑' : (pct < 0 ? '↓' : '·');
    const lista = arr => (arr||[]).filter(Boolean).map(x =>
      `<div class="gx-row"><span>${escapeHtml(x.origem||'')}</span><b>${fmtBRL(x.mes||0)}</b></div>`).join('');
    const body = `<div class="gx-big ${alto?'alto':''}">${fmtBRL(g.gastoMes||0)}<small>até o dia ${g.dia}</small></div>
      <div class="gx-sub">nesse ritmo fecha em <b>${fmtBRL(g.projecao)}</b> · ${seta} ${Math.abs(pct)}% ${pct>=0?'acima':'abaixo'} da média (${fmtBRL(g.mediaAnterior||0)})</div>
      ${g.maiorGasto&&g.maiorGasto.v?`<div class="gx-sub">maior: <b>${fmtBRL(g.maiorGasto.v)}</b> · ${escapeHtml(g.maiorGasto.t||'')}</div>`:''}
      <div class="gx-lbl">assinaturas · ${fmtBRL(g.totalAssinaturas||0)}/mês</div>${lista(g.assinaturas)}
      <div class="gx-lbl">hábitos · ${fmtBRL(g.totalHabitos||0)}/mês</div>${lista(g.habitos)}`;
    parts.push(card('Gastos', '💳', fmtMes(g.mes||''), body));
  }

  // MENTE-2026-09-02 · notas / terapia / vícios — ferramentas de apoio, sem estado de "concluído"
  if (snap.notas || snap.terapia || snap.vicios || snap.musicas){
    const nN = Array.isArray(snap.notas) ? snap.notas.length : 0;
    const tR = (snap.terapia && snap.terapia.registros) || 0;
    const vH = (snap.vicios && snap.vicios.haltsHoje) || 0;
    parts.push(`<div class="mente-row">
      <button data-ev="mente.notas">🗒 Notas<small>${nN} nota${nN === 1 ? '' : 's'}</small></button>
      <button data-ev="mente.terapia">🧠 Terapia<small>${tR} registro${tR === 1 ? '' : 's'}</small></button>
      <button data-ev="mente.vicios">🌊 Vícios<small>${vH ? vH + ' check hoje' : 'check HALT'}</small></button>
      <button data-ev="mente.musicas">🎵 Músicas<small>${(snap.musicas && Array.isArray(snap.musicas.itens)) ? snap.musicas.itens.filter(m => m && !m.ouvido).length + ' na fila' : 'sua fila'}</small></button>
    </div>`);
  }

  $('cards').innerHTML = parts.join('');
}

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function nowHHMM(){ const d=new Date(), p=n=>n<10?'0'+n:''+n; return p(d.getHours())+':'+p(d.getMinutes()); }
function cmNorm(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
// modal "outro item" — busca em TODO o banco (acento-insensível), toca pra somar
function openComerModal(){
  const cm = _lastSnap && _lastSnap.comer; if (!cm || !cm.banco) return;
  _comerModalQ = '';
  $('comerModal').hidden = false;
  const inp = $('comerSearch'); if (inp){ inp.value=''; setTimeout(()=>inp.focus(),50); }
  renderComerModalList();
}
function closeComerModal(){ $('comerModal').hidden = true; }
// seletor de PORÇÃO — flexibiliza a quantidade (½/1/1½/2/3 ou exato em g). MOBILE-COMER-2026-07-29.
let _cmPortion = null;
function cmMultLabel(m){ return m===0.5?'½':m===1.5?'1½':m===0.25?'¼':(m+'×'); }
function openComerPortion(id, nome, baseProt, medida){
  _cmPortion = { id, nome, baseProt };
  $('cmPortionTitle').textContent = nome;
  $('cmPortionSub').textContent = (medida||'') + '  ·  1× = ' + baseProt + 'g';
  const cm = _lastSnap && _lastSnap.comer;
  const item = cm && ((cm.banco||[]).find(b => b.id===id) || (cm.combos||[]).find(b => b.id===id));  // PARIDADE-COMER-2026-08-24
  /* PARIDADE-COMER-2026-09-08 · guia de medidas do ⓘ (o Mac abre num scrim; aqui vem junto da escolha) */
  const info = (item && item.info) || '';
  $('cmPortionInfo').textContent = info;
  $('cmPortionInfo').hidden = !info;
  const opts = item && item.opts;
  if (opts && opts.length){
    // opções próprias do item (ex.: leite em 150/200/250/300ml)
    $('cmPortionBtns').innerHTML = opts.map(o => {
      const lbl = o.ml ? (o.ml+'ml') : (o.label||'');
      return `<button class="cm-pbtn ${o.ml===250?'main':''}" data-optprot="${o.prot||0}" data-optlabel="${escapeHtml(lbl)}"><b>${escapeHtml(lbl)}</b><small>${o.prot||0}g</small></button>`;
    }).join('');
  } else {
    const mults = [0.5, 1, 1.5, 2, 3];
    $('cmPortionBtns').innerHTML = mults.map(m =>
      `<button class="cm-pbtn ${m===1?'main':''}" data-mult="${m}"><b>${cmMultLabel(m)}</b><small>${Math.round(baseProt*m)}g</small></button>`).join('');
  }
  $('cmPortionExact').value = '';
  $('comerPortion').hidden = false;
}
function closeComerPortion(){ $('comerPortion').hidden = true; _cmPortion = null; }
async function comerAddPortion(prot, label){
  const p = _cmPortion; if (!p) return;
  const nome = p.nome + (label ? ` (${label})` : '');
  const t = nowHHMM();
  closeComerPortion();
  optimisticComer(+prot, { nome, prot, t });
  try{ await postEvent({ type:'comer.add', id:p.id, nome, prot, t }); schedulePrioRefresh(); }
  catch(err){ optimisticComer(-prot); flashError(err.message || 'falha ao enviar'); refreshForcado(); }
}
function renderComerModalList(){
  const cm = _lastSnap && _lastSnap.comer; if (!cm) return;
  const q = cmNorm(_comerModalQ);
  const list = (cm.banco||[]).filter(b => !q || cmNorm(b.nome).indexOf(q)>=0 || cmNorm(b.medida).indexOf(q)>=0);
  $('comerModalList').innerHTML = list.length
    ? list.map(b => `<button class="cm-chip" data-ev="comer.portion" data-id="${escapeHtml(b.id)}" data-nome="${escapeHtml(b.nome)}" data-prot="${b.prot}" data-medida="${escapeHtml(b.medida||'')}" data-info="${escapeHtml(b.info||'')}"><b>${escapeHtml(b.nome)}</b><small>${escapeHtml(b.medida||'')}</small><i>+${b.prot}g</i></button>`).join('')
    : '<div class="todo-empty">nada encontrado</div>';
}
let _comerModalQ = '';

function renderFreshness(snap){
  /* LEITURA-FIX-2026-09-08 · o aviso do flashError vivia 3s, mas QUALQUER render no meio o apagava
     na hora (renderFreshness escreve direto no mesmo elemento). Resultado: mensagens que confirmam uma
     ação — "adicionado em cânone", "já está na lista" — sumiam antes de serem lidas, e a ação parecia
     não ter acontecido. Enquanto há flash na tela, o frescor espera a vez. */
  if (_flashTimer) return;
  const el = $('freshness');
  // FRESCOR-2026-08-24 · avisa quando o Mac não publica há muito (antes mostrava só "atualizado 14:32",
  // e um snapshot de 3 dias parecia fresco).
  const _h = idadeBatimentoH(snap);
  if (_h != null && _h > DEFASADO_H){
    const dias = Math.floor(_h / 24);
    el.innerHTML = `<span class="stale">⚠ sem sincronizar há ${dias >= 1 ? dias + (dias === 1 ? ' dia' : ' dias') : Math.round(_h) + 'h'} · o Mac pode estar desligado</span>`;
    el.title = 'Enquanto isso, o que você marcar entra com a data de hoje do celular.';
    return;
  }
  if (!snap.ts){ el.textContent = snap.date || ''; return; }
  const d = new Date(snap.ts * 1000);
  const hh = String(d.getHours()).padStart(2,'0'), mm = String(d.getMinutes()).padStart(2,'0');
  el.textContent = `atualizado ${hh}:${mm}`;
}

function render(snap){
  try{ renderFilaAviso(); }catch(e){}   // FILA-OFFLINE-2026-08-24
  _lastSnap = snap;
  document.body.classList.remove('loading', 'needcfg');
  renderFreshness(snap);
  renderHero(snap.creature || {});
  renderToday(snap);
  renderCards(snap);
  try{ renderAvisosDoMac(snap); }catch(e){}    // CANAL-DE-VOLTA-2026-09-08
  if (!$('finFull').hidden) renderFinFull();   // mantém a tela cheia do financeiro em sincronia
  if (!$('extratoFull').hidden) renderExtrato();
  /* AUDIT2-2026-09-02 (B6) · modais abertos ficavam com DOM defasado até a próxima interação */
  try{ if (!$('musModal').hidden) renderMusModal(); }catch(e){}
  try{ if (!$('notasModal').hidden) openNotasModal(); }catch(e){}
  try{ if (!$('listaModal').hidden) openListaModal(); }catch(e){}
}

/* ---------- loop ---------- */
let _timer = null, _lastRendered = null;
function stripTs(snap){ const c = { ...snap }; delete c.ts; return JSON.stringify(c); }
async function refresh(){
  try{ filaDrenar(); }catch(e){}       // FILA-OFFLINE-2026-08-24 · escoa o que ficou offline
  if (_dragging) return;                 // não repinta no meio de um arraste
  try{
    const snap = await fetchSnapshot();
    if (snap === NOT_MODIFIED){ if (_lastSnap) renderFreshness(_lastSnap); return; }   // só atualiza o "há X min"
    const key = stripTs(snap);          // dedup sem o ts (igual ao Mac) → não repinta/pisca à toa
    if (key === _lastRendered){ renderFreshness(snap); return; }
    render(snap);
    /* AUDIT-2026-09-02 · dedup e cache só DEPOIS do render dar certo. Antes, um snapshot que quebrasse o
       render já estava gravado como "renderizado" E como cache: o catch repintava o MESMO snapshot
       envenenado (quebrava de novo) e os polls seguintes pulavam pelo dedup — app congelado sem mensagem.
       Agora um render quebrado nem vira cache e o próximo poll tenta de novo. setItem blindado: quota
       estourada não pode virar um falso "sem conexão". */
    _lastRendered = key;
    try{ localStorage.setItem(SNAP_CACHE, JSON.stringify(snap)); }catch(e2){}
  }catch(e){
    // offline/erro → tenta o último snapshot em cache
    let cachedSnap = null;
    try{ const c = localStorage.getItem(SNAP_CACHE); if (c) cachedSnap = JSON.parse(c); }
    catch(e2){ try{ localStorage.removeItem(SNAP_CACHE); }catch(e3){} }   // cache corrompido: fora, e segue o fluxo normal
    if (cachedSnap){ try{ render(cachedSnap); }catch(e2){}
      /* AUDIT2-2026-09-02 (B3) · token inválido mascarado como "sem conexão" escondia o problema real */
      flashError(/[Tt]oken/.test(e.message||'') ? (e.message + ' (mostrando último)') : 'sem conexão — mostrando último'); }
    else if (!getCfg()) showOnboarding();          // 1º uso no site público: pede o token
    else showError(e.message || 'falha ao carregar');
  }
}

/* AUDIT-2026-09-02 · rollback otimista de verdade. O padrão antigo dos catches era `refresh()` — mas o
   snapshot do servidor NÃO mudou quando o envio falha, então o 304/dedup engolia o repaint e a UI ficava
   mentindo "marcado" até o Mac publicar qualquer coisa. Zerar o etag e o dedup força buscar e REPINTAR a
   verdade do servidor (o que também desfaz mutações otimistas feitas direto em _lastSnap). */
function refreshForcado(){ _etag = null; _lastRendered = null; return refresh(); }
function showOnboarding(){
  document.body.classList.remove('loading');
  document.body.classList.add('needcfg');   // CSS esconde hero/today/cards e mostra #onboard (DOM intacto)
  $('freshness').textContent = '';
  if (!showOnboarding._once){ showOnboarding._once = true; openModal(); }
}
function startLoop(){ if (_timer) clearInterval(_timer); refresh(); _timer = setInterval(refresh, POLL_MS); }
function showError(msg){ $('cards').innerHTML = `<div class="state-msg err">${escapeHtml(msg)}</div>`; }
/* FLASH-2026-08-26 · dois erros dentro da mesma janela de 3s se aninhavam: o segundo capturava a MENSAGEM
   DE ERRO do primeiro como "texto original" e restaurava ela — a mensagem de erro ficava grudada no lugar
   do frescor pra sempre. Agora só a primeira chamada guarda o original e o timer é único. */
function flashError(msg, ms){
  const f = $('freshness'); if (!f) return;
  /* AUDIT-2026-09-02 · guarda/restaura innerHTML: o aviso de defasagem ("⚠ sem sincronizar") tem markup
     e voltava como texto puro, perdendo o estilo até o próximo poll. */
  if (_flashTimer) clearTimeout(_flashTimer); else _flashOrig = f.innerHTML;
  f.textContent = msg;
  _flashTimer = setTimeout(() => { f.innerHTML = _flashOrig; _flashTimer = null; _flashOrig = null; }, ms || 3000);
}

/* ===== CANAL-DE-VOLTA-2026-09-08 · o que o Mac fez com o que eu mandei =====
   Até agora o celular só sabia se o GitHub aceitou o arquivo. O que acontecia DEPOIS — o Mac descartar
   "já está na lista", "esse livro já foi concluído", "hábito inexistente", ou mandar o evento pra
   quarentena — não voltava por canal nenhum, e a tela otimista seguia mostrando sucesso. Era a raiz do
   "adicionei e não aconteceu nada". Agora o ingest grava o veredicto, ele viaja em `snap.avisos`, e
   aqui a gente mostra os que ainda não foram mostrados (guardando os ids pra não repetir a cada poll). */
const AVISOS_VISTOS_KEY = 'avisosMacVistos';
let _avisoFila = [], _avisoRodando = false;
function _avisosVistos(){
  try{ const v = JSON.parse(localStorage.getItem(AVISOS_VISTOS_KEY) || '[]'); return Array.isArray(v) ? v : []; }
  catch{ return []; }
}
function _avisoDrenar(){
  if (_avisoRodando || !_avisoFila.length) return;
  _avisoRodando = true;
  const a = _avisoFila.shift();
  flashError((a.nivel === 'erro' ? '⚠ ' : '') + a.motivo, 5200);
  setTimeout(() => { _avisoRodando = false; _avisoDrenar(); }, 5600);
}
function renderAvisosDoMac(snap){
  const lista = (snap && Array.isArray(snap.avisos)) ? snap.avisos.filter(Boolean) : [];
  if (!lista.length) return;
  const vistos = _avisosVistos(), setV = new Set(vistos);
  const novos = lista.filter(a => a && a.id && a.motivo && !setV.has(a.id));
  if (!novos.length) return;
  novos.forEach(a => setV.add(a.id));
  /* só os 3 mais recentes viram toast — se ficou uma semana offline não vale enfileirar 20 */
  novos.slice(-3).forEach(a => _avisoFila.push(a));
  try{ localStorage.setItem(AVISOS_VISTOS_KEY, JSON.stringify([...setV].slice(-60))); }catch(e){}
  _avisoDrenar();
}

/* ---------- push nativo (iOS 16.4+ · precisa do app instalado na tela inicial) ---------- */
const VAPID_PUBLIC = 'BMxE9r6DrUygHVJkhr2sDXSyeguI7zzeDeunLkOgY2qZr7lS52logWdLOCblLdmuiFm6TweBneHldcQ_V4Wfhag';
function urlB64ToUint8(b64){
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  const s = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(s), arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
async function enablePush(){
  const st = $('pushStatus');
  const set = (cls, msg) => { if (st){ st.className = 'modal-status ' + cls; st.textContent = msg; } };
  try{
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)){
      set('err', 'Sem suporte a push aqui. No iPhone: Compartilhar → Adicionar à Tela de Início, e abra pelo ícone.'); return;
    }
    const cfg = getCfg();
    if (!cfg || !cfg.repo || !cfg.pat){ set('err', 'Conecte o token primeiro (acima).'); return; }
    set('', 'pedindo permissão…');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted'){ set('err', 'Permissão negada. Ative em Ajustes → Notificações → Companheiro.'); return; }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(VAPID_PUBLIC) });
    const [owner, repo] = cfg.repo.split('/');
    const path = 'push-subscription.json';
    const content = btoa(unescape(encodeURIComponent(JSON.stringify({ subscription: sub.toJSON(), tz: 'America/Sao_Paulo', updated: todayStr() }, null, 2))));
    let sha = null;
    try{
      const g = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=main`, { headers:{ Authorization:`Bearer ${cfg.pat}`, Accept:'application/vnd.github+json' }, cache:'no-store' });
      if (g.ok){ sha = (await g.json()).sha; }
    }catch(e){}
    const put = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
      method:'PUT', headers:{ Authorization:`Bearer ${cfg.pat}`, Accept:'application/vnd.github+json' },
      body: JSON.stringify({ message:'push subscription', content, branch:'main', sha }),
    });
    if (!put.ok){ set('err', 'Falha ao salvar inscrição (' + put.status + ').'); return; }
    set('ok', 'Notificações ativadas ✓ — feche o app e peça um teste.');
  }catch(err){ set('err', (err && err.message) || 'falhou'); }
}

/* ---------- modal de config ---------- */
function openModal(){
  const c = getCfg() || {};
  $('cfgRepo').value = c.repo || 'lucasrobertoooo/companheiro-sync';
  $('cfgPat').value  = c.pat || '';
  $('cfgPath').value = c.path || 'snapshot.json';
  $('cfgStatus').textContent = ''; $('cfgStatus').className = 'modal-status';
  $('modal').hidden = false;
}
function closeModal(){ $('modal').hidden = true; }
async function saveCfg(){
  const repo = $('cfgRepo').value.trim(), pat = $('cfgPat').value.trim(), path = $('cfgPath').value.trim() || 'snapshot.json';
  const st = $('cfgStatus');
  if (!repo.includes('/')){ st.className='modal-status err'; st.textContent='Formato: dono/repo'; return; }
  setCfg({ repo, pat, path });
  st.className='modal-status'; st.textContent='testando…';
  try{
    await fetchSnapshot();
    st.className='modal-status ok'; st.textContent='conectado ✓';
    setTimeout(()=>{ closeModal(); startLoop(); }, 700);
  }catch(e){
    st.className='modal-status err'; st.textContent=e.message || 'falhou';
  }
}

/* ---------- editor de prioridade (nova / editar texto+nota / apagar) ---------- */
let _editId = null;   // null = nova prioridade
function openEditor(id, text, note){
  _editId = id || null;
  $('editTitle').textContent = _editId ? 'Editar prioridade' : 'Nova prioridade';
  $('editText').value = text || '';
  $('editNote').value = note || '';
  $('editDelete').style.display = _editId ? '' : 'none';
  $('editModal').hidden = false;
  setTimeout(() => { try{ $('editText').focus(); }catch(e){} }, 120);
}
function closeEditor(){ $('editModal').hidden = true; _editId = null; }
function saveEditor(){
  const text = $('editText').value.trim(), note = $('editNote').value.trim();
  if (!text){ flashError('a tarefa não pode ficar vazia'); return; }
  const id = _editId, itype = (_prioTab === 'pessoal' ? 'pessoal' : 'trabalho');
  closeEditor();
  if (id){   // editar (OTIMISTA — muda na hora)
    optimisticPrio(pr => { const it = pr.itens.find(i => i.id === id); if (it){ it.text = text; it.note = note || undefined; } });
    postEvent({ type:'intent.edit', intentId:id, text, note }).then(schedulePrioRefresh).catch(err => { flashError(err.message || 'falha ao salvar'); refreshForcado(); });
  } else {   // adicionar — o celular gera o ts (id real) e manda; o item otimista já nasce com o id certo,
    const newTs = Date.now();   // (assim mexer nele antes de sincronizar não quebra — mesmo id nos 2 lados)
    optimisticPrio(pr => { pr.itens.push({ id: newTs, text, done:false, note: note || undefined, type: itype }); });
    postEvent({ type:'intent.add', text, note, itype, newTs }).then(schedulePrioRefresh).catch(err => { flashError(err.message || 'falha ao adicionar'); refreshForcado(); });
  }
}
function deleteIntent(){
  if (!_editId) return;
  const id = _editId;
  closeEditor();
  optimisticPrio(pr => { pr.itens = pr.itens.filter(i => i.id !== id); });
  postEvent({ type:'intent.remove', intentId:id }).then(schedulePrioRefresh).catch(err => { flashError(err.message || 'falha ao apagar'); refreshForcado(); });
}

/* ---------- info de um passo do skincare (o que fazer / como aplicar) ---------- */
function openSkinInfo(type, title){
  const lib = SKIN_LIB[type] || {}, info = lib.info || {};
  $('skinInfoTitle').textContent = title + (lib.name ? ' · ' + lib.name : '');
  const rows = [];
  if (info.funcao)  rows.push(`<p><b>Função</b><br>${escapeHtml(info.funcao)}</p>`);
  if (info.aplicar) rows.push(`<p><b>Como aplicar</b><br>${escapeHtml(info.aplicar)}</p>`);
  if (info.esperar) rows.push(`<p><b>Esperar</b><br>${escapeHtml(info.esperar)}</p>`);
  if (info.regra)   rows.push(`<p><b>Regra</b><br>${escapeHtml(info.regra)}</p>`);
  $('skinInfoBody').innerHTML = rows.join('') || '<p>Sem detalhes pra este passo.</p>';
  $('skinInfoModal').hidden = false;
}
function closeSkinInfo(){ $('skinInfoModal').hidden = true; }

/* ---------- leitura: registrar sessão ("parei na página X") · MOBILE-LEITURA-COMPLETA-2026-07-21 ----------
   Evento leitura.log é ABSOLUTO e idempotente: o Mac seta currentPage, garante a entrada de hoje
   no log (= lido hoje) e move o streak de leitura na 1ª sessão do dia. Não toca o sagrado, sem XP. */
let _leitBook = null;
function fmtDur(min){ min = Math.max(0, Math.round(min)); const h = Math.floor(min/60), m = min%60;
  if (h && m) return `${h}h ${m}min`; if (h) return `${h}h`; return `${m}min`; }
// AUDIO-TEMPO-2026-07-31 · audiolivro com total → registra por TEMPO QUE FALTA (h/min, como o app do Lucas).
function openLeitModal(bookId, title, cur, tot, audio){
  const timeMode = audio && tot > 0;         // só dá pra falar "quanto falta" se souber o total
  _leitBook = { id: bookId, audio, tot, timeMode };
  $('leitModalTitle').textContent = title || 'Registrar leitura';
  $('leitPageWrap').hidden = timeMode;
  $('leitAudioWrap').hidden = !timeMode;
  if (timeMode){
    const rem = Math.max(0, tot - cur);
    $('leitModalSub').textContent = `faltam ${fmtDur(rem)} de ${fmtDur(tot)}`;
    $('leitRemH').value = Math.floor(rem/60) || '';
    $('leitRemM').value = rem % 60 || '';
    $('leitHint').textContent = 'quanto ainda falta pra terminar';
    $('leitModal').hidden = false;
    setTimeout(() => { try { const h=$('leitRemH'); h.focus(); h.select(); } catch(e){} }, 60);
  } else {
    const unit = audio ? 'minuto' : 'página';
    $('leitModalSub').textContent = `${unit} atual: ${cur}${tot ? ` de ${tot}` : ''}`;
    const inp = $('leitPage');
    inp.value = cur || '';
    inp.placeholder = audio ? 'ex: 120' : 'ex: 84';
    if (tot) inp.max = tot; else inp.removeAttribute('max');
    $('leitHint').textContent = tot ? (audio ? `total: ${tot} min` : `total: ${tot} páginas`) : '';
    $('leitModal').hidden = false;
    setTimeout(() => { try { inp.focus(); inp.select(); } catch(e){} }, 60);
  }
}
function closeLeitModal(){ $('leitModal').hidden = true; _leitBook = null; }

/* ===== PARIDADE-LEITURA-2026-08-30 · lista de futuros / começar / concluir (espelho do leitura.html) ===== */
const CAT_ORDEM = ['vampiro','terror','teatro','danca','audiovisual','canone','transformadores','outros'];
const CAT_LABEL = { vampiro:'🩸 vampiro', terror:'👁 terror', teatro:'🎭 teatro e dramaturgia', danca:'💃 dança',
  audiovisual:'🎬 audiovisual', canone:'📚 cânone', transformadores:'⚡ transformadores', outros:'📕 outros' };
let _catAberta = {}, _startCtx = null, _finishCtx = null, _startFmt = 'paper';

/* ===== MENTE-2026-09-02 · pílula / notas / terapia / vícios ===== */
function openPilulaModal(){
  const pl = _lastSnap && _lastSnap.pilula; if (!pl) return;
  $('pilCat').textContent = pl.categoria || 'saúde sexual';
  $('pilTitulo').textContent = pl.titulo || '';
  $('pilTexto').textContent = pl.texto || pl.claim || '';
  $('pilApl').textContent = pl.aplicacao || '';
  $('pilLi').hidden = !!pl.lida;
  $('pilulaModal').hidden = false;
}
function marcarPilulaLida(){
  $('pilulaModal').hidden = true;
  _pending['pilula'] = true;
  if (_lastSnap) render(_lastSnap);
  postEvent({ type:'pilula.read' }).then(schedulePrioRefresh)
    .catch(err => { delete _pending['pilula']; flashError(err.message || 'falha ao enviar'); if (_lastSnap) render(_lastSnap); });
}

let _notaEdit = null;   // null = nova · {id} = editando
function openNotasModal(){
  const ns = (_lastSnap && Array.isArray(_lastSnap.notas)) ? _lastSnap.notas : [];
  $('notasN').textContent = `· ${ns.length}`;
  $('notasCorpo').innerHTML = ns.map(n => `
    <button class="nota-item nota-item-btn" data-nid="${escapeHtml(n.id)}">
      <span class="nota-dot" style="background:${escapeHtml(n.color || '#999')}"></span>
      <span class="nota-tit"><b>${escapeHtml(n.title || '(sem título)')}</b><span>${escapeHtml(n.body || '')}</span></span>
      ${n.pinned ? '<span class="nota-pin">📌</span>' : ''}
    </button>`).join('') || '<div class="leit-hint">nenhuma nota — cria a primeira aí embaixo</div>';
  $('notasModal').hidden = false;
}
function openNotaEdit(id){
  const ns = (_lastSnap && Array.isArray(_lastSnap.notas)) ? _lastSnap.notas : [];
  const n = id ? ns.find(x => x && x.id === id) : null;
  if (id && !n){ flashError('essa nota já não existe'); return; }   // AUDIT-2026-09-02 · apagada no Mac entre renders
  _notaEdit = n ? { id: n.id, pinned: !!n.pinned } : null;
  $('notaEditTitulo').textContent = n ? 'Editar nota' : 'Nova nota';
  $('neTitulo').value = n ? (n.title || '') : '';
  $('neCorpo').value = n ? (n.body || '') : '';
  $('neApagar').hidden = !n;
  $('nePin').hidden = !n;
  if (n) $('nePin').textContent = n.pinned ? 'soltar 📌' : '📌 fixar';
  $('notaEditModal').hidden = false;
  if (!n) setTimeout(() => { try { $('neTitulo').focus(); } catch(e){} }, 60);
}
function closeNotaEdit(){ $('notaEditModal').hidden = true; _notaEdit = null; }
function saveNotaEdit(){
  const title = $('neTitulo').value.trim(), body = $('neCorpo').value.trim();
  if (!title && !body){ flashError('nota vazia'); return; }
  const evt = _notaEdit ? { type:'nota.edit', id:_notaEdit.id, title, body } : { type:'nota.add', title, body };
  closeNotaEdit(); $('notasModal').hidden = true;
  postEvent(evt).then(schedulePrioRefresh).catch(err => { flashError(err.message || 'falha ao enviar'); refreshForcado(); });
}
function apagarNota(){
  if (!_notaEdit) return;
  if (!confirm('Apagar esta nota?')) return;
  const evt = { type:'nota.remove', id:_notaEdit.id };
  closeNotaEdit(); $('notasModal').hidden = true;
  postEvent(evt).then(schedulePrioRefresh).catch(err => { flashError(err.message || 'falha ao enviar'); refreshForcado(); });
}
function togglePinNota(){
  if (!_notaEdit) return;
  const evt = { type:'nota.pin', id:_notaEdit.id, pinned: !_notaEdit.pinned };
  closeNotaEdit(); $('notasModal').hidden = true;
  postEvent(evt).then(schedulePrioRefresh).catch(err => { flashError(err.message || 'falha ao enviar'); refreshForcado(); });
}

let _terTab = 'reg';
function openTerapiaModal(){
  _terTab = 'reg'; _terPaint();
  ['trSit','trEmo','trTho','trResp','tg1','tg2','tg3','tgPessoa'].forEach(id => { $(id).value = ''; });
  $('trScore').value = 5; $('trScoreV').textContent = '5';
  $('terapiaModal').hidden = false;
}
function _terPaint(){
  document.querySelectorAll('#terTabs button').forEach(b => b.classList.toggle('on', b.dataset.t === _terTab));
  $('terReg').hidden = _terTab !== 'reg';
  $('terGrat').hidden = _terTab !== 'grat';
}
function saveTerapia(){
  let evt;
  if (_terTab === 'reg'){
    const sit = $('trSit').value.trim(), tho = $('trTho').value.trim();
    if (!sit && !tho){ flashError('conta pelo menos a situação ou o pensamento'); return; }
    evt = { type:'terapia.registro', situation:sit, emotion:$('trEmo').value.trim(),
            emotionScore:+$('trScore').value, thought:tho, distortion:'', response:$('trResp').value.trim() };
  } else {
    const items = ['tg1','tg2','tg3'].map(id => $(id).value.trim()).filter(Boolean).map(t => ({ thing:t, why:'' }));
    if (!items.length){ flashError('pelo menos uma coisa boa'); return; }
    evt = { type:'terapia.gratidao', items, person:$('tgPessoa').value.trim(), personWhy:'' };
  }
  $('terapiaModal').hidden = true;
  postEvent(evt).then(schedulePrioRefresh).catch(err => { flashError(err.message || 'falha ao enviar'); refreshForcado(); });
}

let _vicTab = 'halt', _halt = {};
function openViciosModal(){
  _vicTab = 'halt'; _halt = {}; _vicPaint();
  $('vsAntes').value = 5; $('vsAntesV').textContent = '5';
  $('vsDepois').value = 2; $('vsDepoisV').textContent = '2';
  $('vsMin').value = ''; $('vsGatilho').value = '';
  $('viciosModal').hidden = false;
}
function _vicPaint(){
  document.querySelectorAll('#vicTabs button').forEach(b => b.classList.toggle('on', b.dataset.t === _vicTab));
  $('vicHalt').hidden = _vicTab !== 'halt';
  $('vicSurf').hidden = _vicTab !== 'surf';
  document.querySelectorAll('#haltChips button').forEach(b => b.classList.toggle('on', !!_halt[b.dataset.h]));
}
function saveVicios(){
  let evt;
  if (_vicTab === 'halt'){
    if (!Object.values(_halt).some(Boolean)){ flashError('marca pelo menos um'); return; }
    evt = { type:'vicios.halt', hungry:!!_halt.hungry, angry:!!_halt.angry, lonely:!!_halt.lonely, tired:!!_halt.tired };
  } else {
    evt = { type:'vicios.surf', before:+$('vsAntes').value, after:+$('vsDepois').value,
            duration:(parseInt($('vsMin').value, 10) || 0) * 60, trigger:$('vsGatilho').value.trim(), note:'' };
  }
  $('viciosModal').hidden = true;
  postEvent(evt).then(schedulePrioRefresh).catch(err => { flashError(err.message || 'falha ao enviar'); refreshForcado(); });
}

/* ===== MUSICAS-2026-09-02 · fila de bandas/álbuns/músicas (espelho do modal do Mac) ===== */
let _musTab = 'fila';
const MUS_ICON = { banda:'🎤', album:'💿', musica:'🎵' };
function musItens(){ return (_lastSnap && _lastSnap.musicas && Array.isArray(_lastSnap.musicas.itens)) ? _lastSnap.musicas.itens.filter(Boolean) : []; }
function openMusModal(){
  _musTab = 'fila'; renderMusModal();
  $('musTitulo').value = ''; $('musArtista').value = ''; $('musBulkTxt').value = '';
  $('musBulkBox').hidden = true; $('musAddBox').hidden = false; $('musBulkTog').textContent = 'colar lista';
  $('musModal').hidden = false;
}
function renderMusModal(){
  document.querySelectorAll('#musTabs button').forEach(b => b.classList.toggle('on', b.dataset.mt === _musTab));
  const todos = musItens();
  const lista = todos.filter(m => (_musTab === 'fila') ? !m.ouvido : m.ouvido);
  $('musN').textContent = `· ${todos.filter(m => !m.ouvido).length} na fila`;
  $('musLista').innerHTML = lista.map(m => `
    <div class="mus-row">
      <span class="mus-ic">${MUS_ICON[m.tipo] || '🎵'}</span>
      <span class="mus-nm"><b>${escapeHtml(m.titulo || '')}</b>${m.artista ? `<span>${escapeHtml(m.artista)}</span>` : ''}</span>
      <button class="mus-tg" data-mid="${escapeHtml(m.id)}" data-ouv="${m.ouvido ? 1 : 0}">${m.ouvido ? '↩' : '✓'}</button>
      <button class="mus-rm" data-mrm="${escapeHtml(m.id)}">✕</button>
    </div>`).join('') || `<div class="leit-hint">${_musTab === 'fila' ? 'fila vazia — solta a pesquisa aqui' : 'nada ouvido ainda'}</div>`;
}
function musAddPhone(){
  if (!$('musBulkBox').hidden){
    const txt = $('musBulkTxt').value.trim();
    if (!txt){ flashError('cola a lista primeiro'); return; }
    postEvent({ type:'musica.bulk', texto:txt, tipo:$('musTipo').value }).then(schedulePrioRefresh)
      .catch(err => { flashError(err.message || 'falha ao enviar'); refreshForcado(); });
    $('musModal').hidden = true; flashError('lista enviada — sincroniza em segundos');
    return;
  }
  const titulo = $('musTitulo').value.trim();
  if (!titulo){ flashError('nome?'); return; }
  /* AUDIT2-2026-09-02 (M2) · id REAL gerado aqui (mesmo formato do Mac: mus<epoch><3 dígitos>) e enviado
     no evento — o id temporário fazia ✓/✕ pré-sync postarem contra um id que o Mac não conhecia, e o
     handler arquivava sem aplicar (marcação perdida em silêncio). Prioridades/financeiro já faziam assim. */
  const musId = 'mus' + Math.floor(Date.now()/1000) + String(100 + Math.floor(Math.random()*900));
  postEvent({ type:'musica.add', id2:musId, tipo:$('musTipo').value, titulo, artista:$('musArtista').value.trim() })
    .then(schedulePrioRefresh).catch(err => { flashError(err.message || 'falha ao enviar'); refreshForcado(); });
  if (_lastSnap){ _lastSnap.musicas = _lastSnap.musicas || { itens: [] };
    _lastSnap.musicas.itens.push({ id:musId, tipo:$('musTipo').value, titulo, artista:$('musArtista').value.trim(), ouvido:false });
    renderMusModal(); render(_lastSnap); }
  $('musTitulo').value = ''; $('musArtista').value = ''; $('musTitulo').focus();
}

function openListaModal(){
  const lst = (_lastSnap && _lastSnap.leituraLista) || null;
  if (!lst){ flashError('lista ainda não sincronizada'); return; }
  const podeComecar = (lst.abertos || 0) < (lst.max || 3);
  const porCat = {};
  (Array.isArray(lst.toRead) ? lst.toRead : []).forEach(b => {
    const c = CAT_LABEL[b.cat] ? b.cat : 'outros';
    (porCat[c] = porCat[c] || []).push(b);
  });
  $('listaN').textContent = `· ${(lst.toRead || []).length} livros`;
  $('listaCorpo').innerHTML = CAT_ORDEM.filter(c => porCat[c] && porCat[c].length).map(c => {
    const aberta = !!_catAberta[c];
    /* PARIDADE-LEITURA-2026-09-08 · o celular só sabia ADICIONAR. Tirar da lista e mudar de categoria
       eram só no Mac — e é o que mais acontece (título errado, livro que ele decidiu não ler, livro que
       entrou sem categoria pela importação). Tocar no título reabre o formulário preenchido (salvar com
       outra categoria MOVE, pelo mesmo caminho de "já está na lista"); o ✕ tira. */
    const livros = porCat[c].map(b => `
      <div class="lst-item">
        <button class="lst-tit" data-edit="1" data-title="${escapeHtml(b.title)}"
          data-author="${escapeHtml(b.author || '')}" data-cat="${escapeHtml(b.cat || 'outros')}">
          <b>${escapeHtml(b.title)}${b.rec ? '<span class="lst-rec">recomendado</span>' : ''}</b>${b.author ? `<span>${escapeHtml(b.author)}</span>` : ''}${b.rec && b.recPor ? `<span class="lst-recpor">${escapeHtml(b.recPor)}</span>` : ''}</button>
        <button class="lst-comecar" data-tid="${escapeHtml(b.id)}" data-title="${escapeHtml(b.title)}"
          data-author="${escapeHtml(b.author || '')}" data-fmt="${escapeHtml(b.format || '')}" ${podeComecar ? '' : 'disabled'}>começar</button>
        <button class="lst-tirar" data-tid="${escapeHtml(b.id)}" data-title="${escapeHtml(b.title)}" aria-label="tirar da lista">✕</button>
      </div>`).join('');
    return `<div class="cat-sec">
      <button class="cat-head" data-cat="${c}"><span>${CAT_LABEL[c]}</span><span class="n">${porCat[c].length} ${aberta ? '▾' : '▸'}</span></button>
      <div class="cat-livros" ${aberta ? '' : 'hidden'}>${livros}</div>
    </div>`;
  }).join('') || '<div class="leit-hint">lista vazia — adiciona um livro aí embaixo</div>';
  if (!podeComecar) $('listaN').textContent += ` · ${lst.abertos}/${lst.max} abertos (termina um pra começar outro)`;
  $('listaModal').hidden = false;
}
function closeListaModal(){ $('listaModal').hidden = true; }

function openStartModal(ctx){        // ctx = {tId, title, author, format?} · sem title = livro fora da lista
  _startCtx = ctx;
  _startFmt = (ctx.format === 'audio' || ctx.format === 'paper') ? ctx.format : 'paper';
  /* PARIDADE-LEITURA-2026-09-08 · o Mac deixa começar um livro digitando o título (openAddBook com
     título livre). No celular só dava pra começar item da lista: lista vazia = sem saída. */
  const livre = !ctx.title;
  $('startTituloLivre').hidden = !livre;
  if (livre) $('startTituloLivre').value = '';
  $('startTitulo').textContent = livre ? 'Começar um livro' : `Começar “${ctx.title}”`;
  $('startSub').textContent = ctx.author || '';
  /* PARIDADE-2026-09-08 · o toggle papel/áudio SEMPRE aparece no modal de início, pré-marcado com o
     formato que veio da lista. Escondê-lo congelava o formato: um item gravado como papel nunca podia
     virar audiobook, e é comum decidir isso na hora de começar. */
  $('startFmt').hidden = false;
  _startFmtPaint();
  $('startTot').value = ''; $('startCur').value = '';
  $('startModal').hidden = false;
  setTimeout(() => { try { $('startTot').focus(); } catch(e){} }, 60);
}
function _startFmtPaint(){
  document.querySelectorAll('#startFmt button').forEach(b => b.classList.toggle('on', b.dataset.f === _startFmt));
  const audio = _startFmt === 'audio';
  $('startTotLbl').firstChild.textContent = audio ? 'Duração total (min) ' : 'Total de páginas ';
  $('startCurLbl').firstChild.textContent = audio ? 'Onde você está (min, opcional) ' : 'Onde você está (opcional) ';
}
function closeStartModal(){ $('startModal').hidden = true; _startCtx = null; }
function saveStartModal(){
  if (!_startCtx) return;
  if (!_startCtx.title){                       // livro fora da lista: o título vem do campo
    const t = $('startTituloLivre').value.trim();
    if (!t){ flashError('qual é o título?'); return; }
    _startCtx.title = t;
  }
  const total = parseInt($('startTot').value, 10);
  if (isNaN(total) || total < 1){ flashError(_startFmt === 'audio' ? 'quantos minutos dura?' : 'quantas páginas tem?'); return; }
  const cur = Math.max(0, parseInt($('startCur').value, 10) || 0);
  const evt = { type:'leitura.start', tId:_startCtx.tId, title:_startCtx.title, author:_startCtx.author || '',
                format:_startFmt, total, cur: Math.min(cur, total) };
  closeStartModal(); closeListaModal();
  flashError('começando “' + (evt.title || '').slice(0, 24) + '”…');
  postEvent(evt).then(schedulePrioRefresh).catch(err => { flashError(err.message || 'falha ao enviar'); refreshForcado(); });
}

function openFinishModal(bookId, title){
  _finishCtx = { id: bookId, rating: 4 };
  $('finishTitulo').textContent = `Concluiu “${title}”`;
  _finishPaint();
  $('finishModal').hidden = false;
}
function _finishPaint(){
  $('finishStars').innerHTML = [1,2,3,4,5].map(n =>
    `<span class="${n <= _finishCtx.rating ? 'on' : ''}" data-n="${n}">★</span>`).join('');
}
function closeFinishModal(){ $('finishModal').hidden = true; _finishCtx = null; }
function saveFinishModal(){
  if (!_finishCtx) return;
  const evt = { type:'leitura.finish', bookId:_finishCtx.id, rating:_finishCtx.rating };
  closeFinishModal();
  postEvent(evt).then(schedulePrioRefresh).catch(err => { flashError(err.message || 'falha ao enviar'); refreshForcado(); });
}
function tirarLivro(){
  if (!_finishCtx) return;
  if (!confirm('Tirar do “em leitura” sem marcar como concluído?')) return;
  const evt = { type:'leitura.tirar', bookId:_finishCtx.id };
  closeFinishModal();
  postEvent(evt).then(schedulePrioRefresh).catch(err => { flashError(err.message || 'falha ao enviar'); refreshForcado(); });
}

function openListaAddModal(pre){
  $('laTitulo').value = (pre && pre.title) || ''; $('laAutor').value = (pre && pre.author) || '';
  if (!$('laCat').options.length) $('laCat').innerHTML = CAT_ORDEM.map(c => `<option value="${c}">${CAT_LABEL[c]}</option>`).join('');
  $('laCat').value = (pre && CAT_LABEL[pre.cat]) ? pre.cat : 'outros';
  $('listaAddModal').hidden = false;
  setTimeout(() => { try { $('laTitulo').focus(); } catch(e){} }, 60);
}
function closeListaAddModal(){ $('listaAddModal').hidden = true; }
/* LEITURA-FIX-2026-09-08 · adicionar livro dava ZERO retorno na tela: o modal fechava, o evento ia
   pro Mac, e só depois de segundos (ou 15s) o snapshot voltava com o livro. Se o título já existisse,
   o Mac descartava em silêncio e NADA acontecia nunca. Do lado de cá isso é indistinguível de quebrado
   — foi exatamente o que o Lucas viu ao adicionar "Carmilla", que já estava na lista desde a
   importação da pesquisa. Agora: avisa na hora se já existe (e onde), e insere OTIMISTA quando é novo. */
function saveListaAdd(){
  const title = $('laTitulo').value.trim();
  if (!title){ flashError('título?'); return; }
  const cat = $('laCat').value, author = $('laAutor').value.trim();
  const lst = (_lastSnap && _lastSnap.leituraLista) || null;
  const existente = lst && Array.isArray(lst.toRead)
    ? lst.toRead.filter(Boolean).find(b => (b.title||'').trim().toLowerCase() === title.toLowerCase())
    : null;
  const novoId = 'tr_c' + Math.floor(Date.now()/1000).toString(36) + Math.floor(Math.random()*900+100);
  const evt = { type:'leitura.addlista', id2:novoId, title, author, cat };
  closeListaAddModal();
  if (existente){
    /* já está lá: diz onde, e manda o evento assim mesmo pra corrigir categoria/autor que faltem */
    const ondeAgora = CAT_LABEL[existente.cat] || CAT_LABEL.outros;
    const mudaCat = cat && existente.cat !== cat;
    flashError(mudaCat ? `"${title}" já estava em ${ondeAgora} — movendo pra ${CAT_LABEL[cat]||cat}`
                       : `"${title}" já está na lista, em ${ondeAgora}`);
    if (mudaCat && _lastSnap){ existente.cat = cat; renderListaSeAberta(); }
    if (!mudaCat && !(author && !existente.author)) return;   // nada a mudar: nem manda evento
  } else if (_lastSnap){
    /* novo: aparece na hora, com id real (o Mac honra o id que vem do celular) */
    _lastSnap.leituraLista = _lastSnap.leituraLista || { toRead: [] };
    _lastSnap.leituraLista.toRead = (_lastSnap.leituraLista.toRead || []).concat([{ id:novoId, title, author, cat }]);
    flashError(`"${title}" adicionado em ${CAT_LABEL[cat]||cat}`);
    _catAberta[cat] = true;                 // abre a seção pra ele VER o livro entrando
    renderListaSeAberta();
  }
  postEvent(evt).then(schedulePrioRefresh).catch(err => { flashError(err.message || 'falha ao enviar'); refreshForcado(); });
}
/* PARIDADE-LEITURA-2026-09-08 · tirar da lista (espelho do removeToRead do leitura.html) */
function tirarDaLista(tId, title){
  if (!confirm(`Tirar “${title}” da lista?`)) return;
  if (_lastSnap && _lastSnap.leituraLista && Array.isArray(_lastSnap.leituraLista.toRead)){
    _lastSnap.leituraLista.toRead = _lastSnap.leituraLista.toRead.filter(b => b && b.id !== tId);
    renderListaSeAberta();
  }
  flashError(`“${title}” saiu da lista`);
  postEvent({ type:'leitura.dellista', tId, title }).then(schedulePrioRefresh)
    .catch(err => { flashError(err.message || 'falha ao enviar'); refreshForcado(); });
}

/* PARIDADE-LEITURA-2026-09-08 · estante de terminados. O celular mostrava só o NÚMERO, num botão
   desligado — 18 livros lidos que ele não conseguia abrir fora do Mac. */
function openFinModal(){
  const lst = (_lastSnap && _lastSnap.leituraLista) || null;
  const fins = (lst && Array.isArray(lst.finished)) ? lst.finished.filter(Boolean) : [];
  $('finN').textContent = `· ${fins.length}`;
  $('finCorpo').innerHTML = fins.slice().reverse().map(b => {
    const est = b.rating ? '★'.repeat(b.rating) + '☆'.repeat(5 - b.rating) : '';
    const nHl = Array.isArray(b.hl) ? b.hl.length : 0;
    const quando = b.endDate ? b.endDate.split('-').reverse().slice(0, 2).join('/') : '';
    return `<div class="fin-item">
      <div class="fin-tit"><b>${escapeHtml(b.title)}${b.audio ? ' 🎧' : ''}</b>
        <span>${escapeHtml(b.author || '')}${est ? ' · ' + est : ''}${quando ? ' · ' + quando : ''}</span></div>
      <button class="fin-hl" data-book="${escapeHtml(b.id)}" data-title="${escapeHtml(b.title)}" ${nHl ? '' : 'disabled'}>✎ ${nHl}</button>
    </div>`;
  }).join('') || '<div class="leit-hint">nenhum livro concluído ainda</div>';
  $('finModal').hidden = false;
}
function closeFinModal(){ $('finModal').hidden = true; }

/* PARIDADE-LEITURA-2026-09-08 · destaques. Era a parte da leitura que MAIS pede o celular (a frase que
   te pega, no ônibus, longe do Mac) e era a única que só existia lá. O HALT do módulo de vícios come
   desses destaques, então guardar aqui alimenta o resto do sistema. */
let _hlCtx = null;      // { id, title }
function _hlDoLivro(bookId){
  const snap = _lastSnap || {};
  const emCurso = ((snap.leitura && snap.leitura.books) || []).find(b => b && b.id === bookId);
  if (emCurso) return Array.isArray(emCurso.hl) ? emCurso.hl : [];
  const fin = ((snap.leituraLista && snap.leituraLista.finished) || []).find(b => b && b.id === bookId);
  return (fin && Array.isArray(fin.hl)) ? fin.hl : [];
}
function openHlModal(bookId, title){
  _hlCtx = { id: bookId, title };
  $('hlTitulo').textContent = `Destaques · ${title}`;
  renderHl();
  $('hlTexto').value = ''; $('hlSrc').value = '';
  $('hlModal').hidden = false;
}
function renderHl(){
  if (!_hlCtx) return;
  const hs = _hlDoLivro(_hlCtx.id);
  $('hlCorpo').innerHTML = hs.map(h => `<div class="hl-item">
      <div class="hl-txt">${escapeHtml(h.text || '')}${h.src ? `<span class="hl-src">${escapeHtml(h.src)}</span>` : ''}</div>
      <button class="hl-del" data-hl="${escapeHtml(h.id || '')}" aria-label="apagar">✕</button>
    </div>`).join('') || '<div class="leit-hint">nenhum destaque ainda — guarda o primeiro aí embaixo</div>';
}
function closeHlModal(){ $('hlModal').hidden = true; _hlCtx = null; }
function _hlListaLocal(bookId){
  /* devolve o array vivo dentro do _lastSnap, pra inserção/remoção otimista aparecer na hora */
  const snap = _lastSnap || {};
  const emCurso = ((snap.leitura && snap.leitura.books) || []).find(b => b && b.id === bookId);
  if (emCurso){ emCurso.hl = Array.isArray(emCurso.hl) ? emCurso.hl : []; return emCurso.hl; }
  const fin = ((snap.leituraLista && snap.leituraLista.finished) || []).find(b => b && b.id === bookId);
  if (fin){ fin.hl = Array.isArray(fin.hl) ? fin.hl : []; return fin.hl; }
  return null;
}
function saveHl(){
  if (!_hlCtx) return;
  const text = $('hlTexto').value.trim();
  if (!text){ flashError('escreve o destaque primeiro'); return; }
  const src = $('hlSrc').value.trim();
  const hlId = 'h_c' + Math.floor(Date.now()/1000).toString(36) + Math.floor(Math.random()*900+100);
  const local = _hlListaLocal(_hlCtx.id);
  if (local){ local.push({ id:hlId, text, src, tags:[] }); renderHl(); }
  $('hlTexto').value = ''; $('hlSrc').value = '';
  postEvent({ type:'leitura.hladd', bookId:_hlCtx.id, hlId, text, src }).then(schedulePrioRefresh)
    .catch(err => { flashError(err.message || 'falha ao enviar'); refreshForcado(); });
}
function apagarHl(hlId){
  if (!_hlCtx || !hlId) return;
  if (!confirm('Apagar este destaque?')) return;
  const local = _hlListaLocal(_hlCtx.id);
  if (local){ const i = local.findIndex(h => h && h.id === hlId); if (i >= 0) local.splice(i, 1); renderHl(); }
  postEvent({ type:'leitura.hldel', bookId:_hlCtx.id, hlId }).then(schedulePrioRefresh)
    .catch(err => { flashError(err.message || 'falha ao enviar'); refreshForcado(); });
}

/* re-render do modal da lista se ele estiver aberto (o add fecha só o modal de cima) */
function renderListaSeAberta(){
  try{ if (!$('listaModal').hidden) openListaModal(); }catch(e){}
  try{ if (_lastSnap) render(_lastSnap); }catch(e){}
}
function saveLeitModal(){
  if (!_leitBook) return;
  let v;
  if (_leitBook.timeMode){
    const h = parseInt($('leitRemH').value, 10) || 0, m = parseInt($('leitRemM').value, 10) || 0;
    const rem = h*60 + m;                    // quanto falta → posição atual = total − falta
    v = Math.max(0, Math.min(_leitBook.tot, _leitBook.tot - rem));
  } else {
    v = parseInt($('leitPage').value, 10);
    if (isNaN(v) || v < 0){ flashError('coloca onde você parou'); return; }
  }
  const id = _leitBook.id, key = 'leitura:' + id;
  const chegouAoFim = _leitBook.tot > 0 && v >= _leitBook.tot;
  const tituloFim = $('leitModalTitle').textContent;
  closeLeitModal();
  /* PARIDADE-LEITURA-2026-08-30 · no Mac, chegar a 100% abre o "Concluiu?" sozinho */
  if (chegouAoFim) setTimeout(() => openFinishModal(id, tituloFim), 400);
  _pending[key] = true;                    // otimista: marca lido até o snapshot confirmar
  if (_lastSnap) render(_lastSnap);
  postEvent({ type:'leitura.log', bookId:id, page:v })
    .then(() => { [6, 14, 24, 34].forEach(s => setTimeout(refresh, s * 1000)); })
    .catch(err => { delete _pending[key]; flashError(err.message || 'falha ao enviar'); if (_lastSnap) render(_lastSnap); });
}

/* ---------- fechar o dia (modal: humor + frase). Sacro (+15 XP/streak) → fire-and-forget pelo hub ---------- */
let _dayMood = null;
function openDayModal(){
  const dl = _lastSnap && _lastSnap.daylog;
  _dayMood = (dl && dl.mood) || null;
  // DAYLOG-MERGE-2026-08-19 · PRÉ-POPULA com o que já foi escrito (inclusive no Mac). Antes abria vazio e
  // o "revisar" mandava texto em branco, apagando o registro do dia no arquivo sagrado.
  $('dayNote').value = (dl && dl.wellDone) || '';
  $('dayCap').value = (dl && dl.capText) || '';
  /* DIARIO-MOBILE-2026-09-02 · modo completo aqui também — pré-popula pra edição não apagar o do Mac */
  $('dayLearn').value = (dl && dl.learning) || '';
  $('dayChange').value = (dl && dl.wouldChange) || '';
  [...document.querySelectorAll('#dayMoods .dmood')].forEach(b => b.classList.toggle('on', b.dataset.mood === _dayMood));
  $('daySave').disabled = !_dayMood;
  $('dayModal').hidden = false;
}
function closeDayModal(){ $('dayModal').hidden = true; }
function saveDayModal(){
  if (!_dayMood) return;
  const wellDone = $('dayNote').value.trim();
  const capText = $('dayCap').value.trim();
  const learning = $('dayLearn').value.trim();
  const wouldChange = $('dayChange').value.trim();
  closeDayModal();
  _pending['daylog'] = true;              // pendente até o snapshot confirmar (hub aplica)
  if (_lastSnap) render(_lastSnap);
  // `prefilled` avisa o Mac que este cliente abriu o modal já preenchido → limpar de propósito funciona.
  // AUDIT-2026-09-02 · MAS só vale com snapshot FRESCO: com cache velho o modal pode ter aberto vazio
  // sem saber do que o Mac escreveu depois — mandar prefilled aí re-cria o bug clássico do daylog
  // (vazio apagando texto). Sem frescor: vazio preserva, preenchido grava. Ninguém perde diário.
  const _idadeH = idadeBatimentoH(_lastSnap);
  const _fresco = _idadeH != null && _idadeH <= 2;
  postEvent({ type:'daylog.close', mood:_dayMood, wellDone, capText, learning, wouldChange, prefilled:_fresco })
    .then(() => { [6, 14, 24, 34].forEach(s => setTimeout(refresh, s * 1000)); })
    .catch(err => { delete _pending['daylog']; flashError(err.message || 'falha ao enviar'); if (_lastSnap) render(_lastSnap); });
}

/* ---------- reflexão do dia (modal: pergunta + resposta). Sacro (+12 XP) → fire-and-forget pelo hub ---------- */
function openReflModal(){
  const rf = _lastSnap && _lastSnap.reflexao; if (!rf) return;
  $('reflModalQ').textContent = rf.question || '';
  $('reflInput').value = rf.answer || '';
  $('reflModal').hidden = false;
  setTimeout(() => { try{ $('reflInput').focus(); }catch(e){} }, 120);
}
function closeReflModal(){ $('reflModal').hidden = true; }
function saveReflModal(){
  const response = $('reflInput').value.trim();
  if (!response){ flashError('escreve uma linha'); return; }
  closeReflModal();
  if (_lastSnap && _lastSnap.reflexao){ _lastSnap.reflexao.answer = response; _lastSnap.reflexao.answered = true; render(_lastSnap); }
  postEvent({ type:'reflexao.answer', response })
    .then(() => { [6, 14, 24, 34].forEach(s => setTimeout(refresh, s * 1000)); })
    .catch(err => { flashError(err.message || 'falha ao enviar'); refreshForcado(); });
}

/* ---------- editor de linha do financeiro (nova / editar / apagar) ---------- */
let _finEditId = null;
function finNewId(){ return 'm' + Date.now(); }   // id do celular = id real (mesmo nos 2 lados; sem temp-id)
function openFinEditor(id, cat){
  const fin = _lastSnap && _lastSnap.financeiro;
  const row = (id && fin) ? (fin.rows||[]).find(r => String(r.id) === String(id)) : null;
  _finEditId = row ? String(row.id) : null;
  $('finTitle').textContent = row ? 'Editar linha' : 'Nova linha';
  $('finLabel').value  = row ? (row.label||'') : '';
  $('finValor').value  = row ? String(row.valor||0).replace('.', ',') : '';
  $('finCat').value    = row ? row.cat : (cat || 'Variável');
  $('finStatus').value = row ? (row.status||'Previsto') : 'Previsto';
  $('finVenc').value   = (row && row.venc) ? String(row.venc) : '';
  $('finSplit').checked = row ? !!row.split : false;
  $('finNota').value   = row ? (row.nota||'') : '';
  $('finDelete').style.display = row ? '' : 'none';
  $('finModal').hidden = false;
  setTimeout(() => { try{ $('finLabel').focus(); }catch(e){} }, 120);
}
function closeFinEditor(){ $('finModal').hidden = true; _finEditId = null; }
function saveFinEditor(){
  const label = $('finLabel').value.trim();
  if (!label){ flashError('a descrição não pode ficar vazia'); return; }
  const valor = parseValBR($('finValor').value);
  const cat = $('finCat').value, status = $('finStatus').value;
  const vencRaw = parseInt($('finVenc').value, 10);
  const venc = (!isNaN(vencRaw) && vencRaw >= 1 && vencRaw <= 31) ? vencRaw : null;
  const split = $('finSplit').checked;
  const nota = $('finNota').value.trim();
  const mes = (_lastSnap && _lastSnap.financeiro && _lastSnap.financeiro.mes) || undefined;
  const id = _finEditId;
  closeFinEditor();
  if (id){   // editar (OTIMISTA)
    optimisticFin(fin => { const r = (fin.rows||[]).find(x => String(x.id) === id);
      if (r){ r.label=label; r.valor=valor; r.cat=cat; r.status=status; r.venc=venc||undefined; r.split=split; r.nota=nota||undefined; } });
    postEvent({ type:'fin.edit', id, label, valor, cat, status, venc: (venc===null?'':venc), split, nota })
      .then(schedulePrioRefresh).catch(err => { flashError(err.message||'falha ao salvar'); refreshForcado(); });
  } else {   // nova — o celular gera o id (real = otimista)
    const nid = finNewId();
    optimisticFin(fin => { fin.rows.push({ id:nid, mes, label, valor, cat, status, venc: venc||undefined, split, nota: nota||undefined }); });
    if (!_finOpen[cat]){ _finOpen[cat] = true; saveFinOpen(); }
    postEvent({ type:'fin.add', id:nid, mes, label, valor, cat, status, venc: (venc===null?undefined:venc), split, nota })
      .then(schedulePrioRefresh).catch(err => { flashError(err.message||'falha ao adicionar'); refreshForcado(); });
  }
}
function deleteFinRow(){
  if (!_finEditId) return;
  const id = _finEditId; closeFinEditor();
  optimisticFin(fin => { fin.rows = (fin.rows||[]).filter(r => String(r.id) !== id); });
  postEvent({ type:'fin.delete', id }).then(schedulePrioRefresh).catch(err => { flashError(err.message||'falha ao apagar'); refreshForcado(); });
}

/* ---------- ações (delegado; usado na home #cards E na tela cheia #finFull) ---------- */
const onCardClick = async (e) => {
  // ANTI-MARCAÇÃO-FANTASMA · (1) ignora o "ghost click" que o iOS dispara ao soltar um arraste
  // (reordenar prioridade podia marcar uma tarefa sem querer); (2) se algum modal está aberto, não
  // deixa o clique "vazar" pros cards atrás. FIX-2026-07-20.
  if (_dragging) return;
  if ([...document.querySelectorAll('.modal-backdrop')].some(m => !m.hidden)) return;
  const btn = e.target.closest('[data-ev],[data-ptab]');
  if (!btn || btn.disabled) return;
  const ev = btn.dataset.ev, label = btn.textContent;

  // LOCAL (sem rede): tab de prioridades / mostrar-ocultar histórico / abrir editor
  if (btn.dataset.ptab){ _prioTab = btn.dataset.ptab; localStorage.setItem('companheiro.prioTab', _prioTab); if (_lastSnap) render(_lastSnap); return; }
  if (ev === 'prio.hist'){ _showHist = !_showHist; if (_lastSnap) render(_lastSnap); return; }
  if (ev === 'card.expand'){ _cardExpanded[btn.dataset.key] = true; if (_lastSnap) render(_lastSnap); return; }
  if (ev === 'card.collapse'){ delete _cardExpanded[btn.dataset.key]; if (_lastSnap) render(_lastSnap); return; }
  if (ev === 'day.open'){ openDayModal(); return; }
  if (ev === 'refl.open'){ openReflModal(); return; }
  if (ev === 'pelvico.add' || ev === 'pelvico.undo'){   // PELVIC-COUNT-2026-07-23 · +1 / −1 sessão
    const add = ev === 'pelvico.add';
    optimisticPelvic(add ? +1 : -1);
    try{ await postEvent({ type:'pelvico.session', done: add }); schedulePrioRefresh(); }
    catch(err){ flashError(err.message || 'falha ao enviar'); refreshForcado(); }
    return;
  }
  if (ev === 'intent.edit'){ openEditor(Number(btn.dataset.id), btn.dataset.text || '', btn.dataset.note || ''); return; }
  if (ev === 'pilula.abrir'){ openPilulaModal(); return; }
  if (ev === 'pilula.li'){ marcarPilulaLida(); return; }
  if (ev === 'mente.notas'){ openNotasModal(); return; }
  if (ev === 'mente.terapia'){ openTerapiaModal(); return; }
  if (ev === 'mente.vicios'){ openViciosModal(); return; }
  if (ev === 'mente.musicas'){ openMusModal(); return; }
  if (ev === 'leit.lista'){ openListaModal(); return; }
  if (ev === 'leit.fin'){ openFinModal(); return; }                                    // PARIDADE-2026-09-08
  if (ev === 'leit.hl'){ openHlModal(btn.dataset.book, btn.dataset.title || 'livro'); return; }
  if (ev === 'leit.novo'){ openStartModal({ tId:'', title:'', author:'', format:'' }); return; }
  if (ev === 'leit.finish'){ openFinishModal(btn.dataset.book, btn.dataset.title || 'este livro'); return; }
  if (ev === 'leit.log'){ openLeitModal(btn.dataset.book, btn.dataset.title || '', Number(btn.dataset.cur) || 0,
                                        Number(btn.dataset.tot) || 0, btn.dataset.audio === '1'); return; }
  if (ev === 'intent.new'){ openEditor(null, '', ''); return; }

  // PRIORIDADE toggle — OTIMISTA: muda na HORA no celular; o Mac reconcilia em 2º plano.
  if (ev === 'intent.toggle'){
    const id = Number(btn.dataset.id);
    optimisticPrio(pr => { const it = pr.itens.find(i => i.id === id); if (it) it.done = !it.done; });
    try{ await postEvent({ type:'intent.toggle', intentId:id }); schedulePrioRefresh(); }
    catch(err){ flashError(err.message || 'falha ao enviar'); refreshForcado(); }
    return;
  }

  // SKINCARE: expandir rotina (local), ver info do passo (local), marcar passo (otimista)
  if (ev === 'skin.open'){ _skinOpen[btn.dataset.rt] = !_skinOpen[btn.dataset.rt]; if (_lastSnap) render(_lastSnap); return; }
  if (ev === 'skin.info'){ openSkinInfo(btn.dataset.type, btn.dataset.title); return; }
  if (ev === 'skincare.step'){
    const rt = btn.dataset.rt, title = btn.dataset.title, target = btn.dataset.done !== '1';
    optimisticSkinStep(rt, title);
    try{ await postEvent({ type:'skincare.step', routine:rt, title, done: target }); schedulePrioRefresh(); }
    catch(err){ flashError(err.message || 'falha ao enviar'); refreshForcado(); }
    return;
  }

  // HÁBITOS: marcar/desmarcar um hábito (otimista, igual ao passo do skincare)
  if (ev === 'habito.toggle'){
    const id = btn.dataset.id, target = btn.dataset.done !== '1';
  /* AUDIT2-2026-09-02 (B1) · _pending aqui era auto-cancelante (o flip otimista igualava o alvo e o
     pendingFor deletava o flag no mesmo render) — mecanismo morto removido; o dedup segura o repaint. */
    optimisticHabito(id);
    try{ await postEvent({ type:'habito.toggle', id, done: target }); schedulePrioRefresh(); }
    catch(err){ delete _pending['habito.' + id]; flashError(err.message || 'falha ao enviar'); refreshForcado(); }
    return;
  }

  // COMER · marcar refeição/item, desfazer, ou abrir a busca de todos os itens. MOBILE-COMER-2026-07-29.
  /* AUDIT-2026-09-02 · branch comer.add removido: nenhum elemento emite esse data-ev desde o montável (comer.portion) */
  if (ev === 'comer.undo'){
    // COMER-UNDO-IDX-2026-08-18 · casa pelo índice (o `t` vira só conferência no Mac). Antes o celular
    // removia a PRIMEIRA entrada daquele minuto e o Mac removia a ÚLTIMA → apagava item errado.
    const t = btn.dataset.t;
    const idx = Number(btn.dataset.idx) || null;
    const cm = _lastSnap && _lastSnap.comer;
    const entry = cm && (cm.log||[]).find(x => (idx && x.i === idx) || (!idx && x.t === t));
    optimisticComer(entry ? -(entry.prot||0) : 0);
    if (cm) cm.log = (cm.log||[]).filter(x => x !== entry);
    render(_lastSnap);
    try{ await postEvent({ type:'comer.undo', t, idx }); schedulePrioRefresh(); }
    catch(err){ flashError(err.message || 'falha ao enviar'); refreshForcado(); }
    return;
  }
  if (ev === 'comer.peso'){
    // PESO-MOBILE-2026-08-24 · prompt simples: é registro semanal, não vale uma tela inteira.
    const cm = _lastSnap && _lastSnap.comer;
    const kg = prompt('Peso de hoje (kg):', cm && cm.peso ? String(cm.peso) : '');
    if (kg === null) return;
    const n = parseFloat(String(kg).replace(',', '.'));
    if (!n || n <= 0 || n > 400) { flashError('peso inválido'); return; }
    const cin = prompt('Cintura (cm) — opcional, deixe vazio pra pular:', cm && cm.cintura ? String(cm.cintura) : '');
    try{
      await postEvent({ type:'comer.peso', kg:n });
      const c = cin === null ? null : parseFloat(String(cin).replace(',', '.'));
      if (c && c > 0 && c < 300) await postEvent({ type:'comer.cintura', cm:c });
      flashError('registrado · a meta reescala sozinha');
      schedulePrioRefresh();
    }catch(err){ flashError(err.message || 'falha ao enviar'); }
    return;
  }
  if (ev === 'comer.meal'){ _comerMeal = btn.dataset.meal; if (_lastSnap) render(_lastSnap); return; }
  if (ev === 'comer.portion'){ openComerPortion(btn.dataset.id, btn.dataset.nome, +btn.dataset.prot||0, btn.dataset.medida||''); return; }
  if (ev === 'comer.all'){ openComerModal(); return; }

  // FINANCEIRO (local, aplica direto — funciona com o hub fechado)
  if (ev === 'fin.full'){ openFinFull(); return; }                                    // abre a tela cheia
  if (ev === 'ext.acc'){ const i = btn.dataset.i; _extratoOpen[i] = !_extratoOpen[i]; renderExtrato(); return; }
  if (ev === 'pluggy.refresh'){        // pede um sync do Pluggy no Mac + re-busca (pega o snapshot fresco)
    btn.disabled = true; btn.textContent = 'puxando…';
    try { await postEvent({ type:'pluggy.sync' }); } catch(err){ flashError(err.message || 'falha ao pedir'); }
    refresh(); [8, 16, 26, 40].forEach(s => setTimeout(refresh, s*1000));
    return;
  }
  if (ev === 'fin.cat'){ const c = btn.dataset.cat; _finOpen[c] = !_finOpen[c]; saveFinOpen(); if (!$('finFull').hidden) renderFinFull(); else if (_lastSnap) render(_lastSnap); return; }
  if (ev === 'fin.edit'){ openFinEditor(btn.dataset.id); return; }
  if (ev === 'fin.new'){ openFinEditor(null, btn.dataset.cat); return; }
  if (ev === 'fin.status'){
    const id = btn.dataset.id, cur = btn.dataset.status || 'Previsto';
    const next = FIN_STATUS[(FIN_STATUS.indexOf(cur) + 1) % FIN_STATUS.length];
    optimisticFin(fin => { const r = (fin.rows||[]).find(x => String(x.id) === String(id)); if (r) r.status = next; });
    try{ await postEvent({ type:'fin.edit', id, status: next }); schedulePrioRefresh(); }
    catch(err){ flashError(err.message || 'falha ao enviar'); refreshForcado(); }
    return;
  }
  if (ev === 'fin.rollover'){
    const mes = btn.dataset.mes;
    btn.disabled = true; btn.textContent = 'criando…';
    try{ await postEvent({ type:'fin.rollover', mes }); [4, 9, 15, 22, 32].forEach(s => setTimeout(refresh, s*1000)); }
    catch(err){ btn.disabled = false; flashError(err.message || 'falha ao criar'); }
    return;
  }

  // ÁGUA: toca o sagrado + XP → aplica pelo widget quando o hub abre. fire-and-forget. (+1 e −1 desfazer)
  if (ev === 'agua.bottle' || ev === 'agua.undo'){
    const undo = ev === 'agua.undo';
    btn.disabled = true; btn.textContent = undo ? 'desfazendo…' : 'enviado ✓';
    try{
      await postEvent(undo ? { type:'agua.bottle', undo:true } : { type:'agua.bottle' });
      [6, 14, 24, 34].forEach(sec => setTimeout(refresh, sec * 1000));
      setTimeout(() => { btn.disabled = false; btn.textContent = label; }, 4000);
    }catch(err){ btn.disabled = false; btn.textContent = label; flashError(err.message || 'falha ao enviar'); }
    return;
  }

  let evt, key, target;
  if (ev === 'skincare.am' || ev === 'skincare.pm'){         // toggle
    const routine = ev.split('.')[1];
    target = btn.dataset.done !== '1';
    key = ev; evt = { type: 'skincare.done', routine, done: target };
  } else if (ev === 'meditacao'){                            // toggle (marca / desfaz)
    target = btn.dataset.done !== '1';
    key = 'meditacao'; evt = { type: 'meditacao.done', done: target };
  } else if (ev === 'leitura'){                               // toggle por livro (marca / desfaz)
    const bookId = btn.dataset.book;
    target = btn.dataset.done !== '1';
    key = 'leitura:' + bookId; evt = { type: 'leitura.read', bookId, done: target };
  } else if (ev === 'mobilidade'){                            // toggle (marca/desmarca)
    target = btn.dataset.done !== '1';
    key = 'mobilidade'; evt = { type: 'mobilidade.checkin', done: target };
  } else if (ev === 'remedios'){                              // toggle "tomei hoje"
    target = btn.dataset.done !== '1';
    key = 'remedios'; evt = { type: 'remedios.taken', done: target };
  } else return;

  btn.disabled = true; btn.textContent = target ? 'enviando…' : 'desfazendo…';
  try{
    await postEvent(evt);
    _pending[key] = target;               // otimista até o snapshot confirmar (sobrevive aos re-renders)
    // o Mac processa no tick (~15s) e publica novo snapshot → estes polls pegam a confirmação
    [4, 9, 15, 22, 32].forEach(sec => setTimeout(refresh, sec * 1000));
  }catch(err){
    btn.disabled = false; btn.textContent = label;
    flashError(err.message || 'falha ao enviar');
  }
};
$('cards').addEventListener('click', onCardClick);
$('finFull').addEventListener('click', onCardClick);
$('extratoFull').addEventListener('click', onCardClick);
// COMER modal: cliques nos itens (comer.add) passam pelo mesmo dispatcher; busca + fechar
// FIX-2026-07-31 · a lista de busca vive DENTRO de um modal, e onCardClick ignora cliques com modal
// aberto (anti-vazamento) → o item pesquisado nunca era adicionado. Handler próprio: fecha a busca e
// abre o seletor de porção direto.
$('comerModalList').addEventListener('click', e => {
  const btn = e.target.closest('[data-ev="comer.portion"]'); if (!btn) return;
  closeComerModal();
  openComerPortion(btn.dataset.id, btn.dataset.nome, +btn.dataset.prot||0, btn.dataset.medida||'');
});
$('comerSearch').addEventListener('input', function(){ _comerModalQ = this.value; renderComerModalList(); });
$('comerModalClose').addEventListener('click', closeComerModal);
$('comerModal').addEventListener('click', e => { if (e.target === $('comerModal')) closeComerModal(); });
// seletor de porção
$('cmPortionBtns').addEventListener('click', e => {
  const opt = e.target.closest('[data-optprot]');
  if (opt && _cmPortion){ comerAddPortion(+opt.dataset.optprot||0, opt.dataset.optlabel||''); return; }
  const b = e.target.closest('[data-mult]'); if (!b || !_cmPortion) return;
  const m = +b.dataset.mult;
  comerAddPortion(Math.round(_cmPortion.baseProt * m), m===1 ? '' : cmMultLabel(m));
});
$('cmPortionGo').addEventListener('click', () => {
  const g = parseInt($('cmPortionExact').value, 10); if (g>0) comerAddPortion(g, '');
});
$('cmPortionClose').addEventListener('click', closeComerPortion);
$('comerPortion').addEventListener('click', e => { if (e.target === $('comerPortion')) closeComerPortion(); });

/* ---------- boot ---------- */
$('gear').addEventListener('click', openModal);
$('cfgSave').addEventListener('click', saveCfg);
$('cfgClear').addEventListener('click', ()=>{ clearCfg(); $('cfgPat').value=''; $('cfgStatus').className='modal-status'; $('cfgStatus').textContent='limpo'; });
$('pushBtn').addEventListener('click', enablePush);
$('modal').addEventListener('click', e=>{ if (e.target === $('modal')) closeModal(); });
$('editSave').addEventListener('click', saveEditor);
/* MOBILE-LEITURA-COMPLETA-2026-07-21 · modal de registrar leitura */
$('leitSave').addEventListener('click', saveLeitModal);
$('leitCancel').addEventListener('click', closeLeitModal);
$('leitModal').addEventListener('click', e => { if (e.target === $('leitModal')) closeLeitModal(); });
$('leitPage').addEventListener('keydown', e => { if (e.key === 'Enter') saveLeitModal(); });
['leitRemH','leitRemM'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') saveLeitModal(); }));
/* MENTE-2026-09-02 · pílula / notas / terapia / vícios */
$('pilFechar').addEventListener('click', () => { $('pilulaModal').hidden = true; });
$('pilLi').addEventListener('click', marcarPilulaLida);
$('pilulaModal').addEventListener('click', e => { if (e.target === $('pilulaModal')) $('pilulaModal').hidden = true; });
$('notasFechar').addEventListener('click', () => { $('notasModal').hidden = true; });
$('notaNova').addEventListener('click', () => openNotaEdit(null));
$('notasModal').addEventListener('click', e => { if (e.target === $('notasModal')) $('notasModal').hidden = true; });
$('notasCorpo').addEventListener('click', e => { const it = e.target.closest('[data-nid]'); if (it) openNotaEdit(it.dataset.nid); });
$('neSave').addEventListener('click', saveNotaEdit);
$('neTitulo').addEventListener('keydown', e => { if (e.key === 'Enter') saveNotaEdit(); });
$('laTitulo').addEventListener('keydown', e => { if (e.key === 'Enter') saveListaAdd(); });
$('startCur').addEventListener('keydown', e => { if (e.key === 'Enter') saveStartModal(); });
$('neCancel').addEventListener('click', closeNotaEdit);
$('neApagar').addEventListener('click', apagarNota);
$('nePin').addEventListener('click', togglePinNota);
$('notaEditModal').addEventListener('click', e => { if (e.target === $('notaEditModal')) closeNotaEdit(); });
$('terTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b){ _terTab = b.dataset.t; _terPaint(); } });
$('trScore').addEventListener('input', () => { $('trScoreV').textContent = $('trScore').value; });
$('terSave').addEventListener('click', saveTerapia);
$('terCancel').addEventListener('click', () => { $('terapiaModal').hidden = true; });
$('terapiaModal').addEventListener('click', e => { if (e.target === $('terapiaModal')) $('terapiaModal').hidden = true; });
$('vicTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b){ _vicTab = b.dataset.t; _vicPaint(); } });
$('haltChips').addEventListener('click', e => { const b = e.target.closest('button'); if (b){ _halt[b.dataset.h] = !_halt[b.dataset.h]; _vicPaint(); } });
$('vsAntes').addEventListener('input', () => { $('vsAntesV').textContent = $('vsAntes').value; });
$('vsDepois').addEventListener('input', () => { $('vsDepoisV').textContent = $('vsDepois').value; });
$('vicSave').addEventListener('click', saveVicios);
$('vicCancel').addEventListener('click', () => { $('viciosModal').hidden = true; });
$('viciosModal').addEventListener('click', e => { if (e.target === $('viciosModal')) $('viciosModal').hidden = true; });
/* MUSICAS-2026-09-02 */
$('musFechar').addEventListener('click', () => { $('musModal').hidden = true; });
$('musModal').addEventListener('click', e => { if (e.target === $('musModal')) $('musModal').hidden = true; });
$('musTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b){ _musTab = b.dataset.mt; renderMusModal(); } });
$('musAdd').addEventListener('click', musAddPhone);
$('musTitulo').addEventListener('keydown', e => { if (e.key === 'Enter') musAddPhone(); });
$('musBulkTog').addEventListener('click', () => {
  const b = $('musBulkBox');
  b.hidden = !b.hidden; $('musAddBox').hidden = !b.hidden;
  $('musBulkTog').textContent = b.hidden ? 'colar lista' : 'um por vez';
  if (!b.hidden) setTimeout(() => { try { $('musBulkTxt').focus(); } catch(e){} }, 60);
});
$('musLista').addEventListener('click', e => {
  const tg = e.target.closest('[data-mid]');
  if (tg){
    const id = tg.dataset.mid, novo = tg.dataset.ouv !== '1';
    postEvent({ type:'musica.toggle', id, ouvido:novo }).then(schedulePrioRefresh)
      .catch(err => { flashError(err.message || 'falha ao enviar'); refreshForcado(); });
    const it = musItens().find(m => m.id === id); if (it){ it.ouvido = novo; renderMusModal(); render(_lastSnap); }
    return;
  }
  const rm = e.target.closest('[data-mrm]');
  if (rm && confirm('Tirar da lista?')){
    const id = rm.dataset.mrm;
    postEvent({ type:'musica.remove', id }).then(schedulePrioRefresh)
      .catch(err => { flashError(err.message || 'falha ao enviar'); refreshForcado(); });
    if (_lastSnap && _lastSnap.musicas) _lastSnap.musicas.itens = musItens().filter(m => m.id !== id);
    renderMusModal(); render(_lastSnap);
  }
});
/* PARIDADE-LEITURA-2026-08-30 · lista / começar / concluir */
$('listaFechar').addEventListener('click', closeListaModal);
$('listaAdd').addEventListener('click', () => openListaAddModal());   // sem o wrapper, o Event virava `pre`
$('listaModal').addEventListener('click', e => { if (e.target === $('listaModal')) closeListaModal(); });
$('listaCorpo').addEventListener('click', e => {
  const h = e.target.closest('.cat-head');
  if (h){ _catAberta[h.dataset.cat] = !_catAberta[h.dataset.cat]; openListaModal(); return; }
  const x = e.target.closest('.lst-tirar');
  if (x){ tirarDaLista(x.dataset.tid, x.dataset.title); return; }
  const ed = e.target.closest('.lst-tit');
  if (ed){ openListaAddModal({ title:ed.dataset.title, author:ed.dataset.author, cat:ed.dataset.cat }); return; }
  const c = e.target.closest('.lst-comecar');
  if (c && !c.disabled) openStartModal({ tId:c.dataset.tid, title:c.dataset.title, author:c.dataset.author, format:c.dataset.fmt || '' });
});
/* PARIDADE-LEITURA-2026-09-08 · terminados e destaques */
$('finFechar').addEventListener('click', closeFinModal);
$('finModal').addEventListener('click', e => { if (e.target === $('finModal')) closeFinModal(); });
$('finCorpo').addEventListener('click', e => {
  const b = e.target.closest('.fin-hl');
  if (b && !b.disabled) openHlModal(b.dataset.book, b.dataset.title || 'livro');
});
$('hlFechar').addEventListener('click', closeHlModal);
$('hlSave').addEventListener('click', saveHl);
$('hlModal').addEventListener('click', e => { if (e.target === $('hlModal')) closeHlModal(); });
$('hlCorpo').addEventListener('click', e => {
  const d = e.target.closest('.hl-del');
  if (d) apagarHl(d.dataset.hl);
});
$('laSave').addEventListener('click', saveListaAdd);
$('laCancel').addEventListener('click', closeListaAddModal);
$('listaAddModal').addEventListener('click', e => { if (e.target === $('listaAddModal')) closeListaAddModal(); });
$('startSave').addEventListener('click', saveStartModal);
$('startCancel').addEventListener('click', closeStartModal);
$('startModal').addEventListener('click', e => { if (e.target === $('startModal')) closeStartModal(); });
$('startFmt').addEventListener('click', e => { const b = e.target.closest('button'); if (b){ _startFmt = b.dataset.f; _startFmtPaint(); } });
$('startTot').addEventListener('keydown', e => { if (e.key === 'Enter') saveStartModal(); });
$('finishSave').addEventListener('click', saveFinishModal);
$('finishCancel').addEventListener('click', closeFinishModal);
$('finishTirar').addEventListener('click', tirarLivro);
$('finishModal').addEventListener('click', e => { if (e.target === $('finishModal')) closeFinishModal(); });
$('finishStars').addEventListener('click', e => { const n = parseInt(e.target.dataset.n, 10); if (n && _finishCtx){ _finishCtx.rating = n; _finishPaint(); } });
$('editCancel').addEventListener('click', closeEditor);
$('editDelete').addEventListener('click', deleteIntent);
$('editModal').addEventListener('click', e=>{ if (e.target === $('editModal')) closeEditor(); });
$('skinInfoClose').addEventListener('click', closeSkinInfo);
$('skinInfoModal').addEventListener('click', e=>{ if (e.target === $('skinInfoModal')) closeSkinInfo(); });
$('finSave').addEventListener('click', saveFinEditor);
$('finCancel').addEventListener('click', closeFinEditor);
$('finDelete').addEventListener('click', deleteFinRow);
$('finModal').addEventListener('click', e=>{ if (e.target === $('finModal')) closeFinEditor(); });
$('finFullClose').addEventListener('click', closeFinFull);
$('finPrev').addEventListener('click', ()=> finShiftMonth(-1));
$('finNext').addEventListener('click', ()=> finShiftMonth(1));
$('finExtratoBtn').addEventListener('click', openExtrato);
$('extratoClose').addEventListener('click', closeExtrato);
$('daySave').addEventListener('click', saveDayModal);
$('dayCancel').addEventListener('click', closeDayModal);
$('dayModal').addEventListener('click', e=>{ if (e.target === $('dayModal')) closeDayModal(); });
$('dayMoods').addEventListener('click', e=>{
  const b = e.target.closest('.dmood'); if (!b) return;
  _dayMood = b.dataset.mood;
  [...document.querySelectorAll('#dayMoods .dmood')].forEach(x => x.classList.toggle('on', x === b));
  $('daySave').disabled = false;
});
$('reflSave').addEventListener('click', saveReflModal);
$('reflCancel').addEventListener('click', closeReflModal);
$('reflModal').addEventListener('click', e=>{ if (e.target === $('reflModal')) closeReflModal(); });
// drag-and-drop de prioridades (pointer/touch)
$('cards').addEventListener('pointerdown', prioDragStart);
document.addEventListener('pointermove', prioDragMove);
document.addEventListener('pointerup', prioDragEnd);
document.addEventListener('pointercancel', prioDragEnd);
document.addEventListener('visibilitychange', ()=>{ if (!document.hidden) refresh(); });

if ('serviceWorker' in navigator){
  window.addEventListener('load', ()=> navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}

startLoop();
