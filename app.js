// Companheiro mobile — espelho READ-ONLY do snapshot.json (schema v1).
// Fonte: repo privado via GitHub Contents API (PAT no aparelho) OU ./snapshot.json (dev local).
import { CREATURE_ART } from './creature-art.js';
import { SKIN_LIB } from './skincare-catalog.js';

const $ = id => document.getElementById(id);
const CFG_KEY = 'companheiro.sync.cfg';
const SNAP_CACHE = 'companheiro.sync.lastSnap';
const POLL_MS = 25000;
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
    _etag = r.headers.get('ETag') || null;
    return JSON.parse(await r.text());
  }
  // dev/local
  const r = await fetch('./snapshot.json', { cache:'no-store' });
  if (!r.ok) throw new Error('sem snapshot local');
  return r.json();
}

// PLUGGY-RECONNECT · lê um arquivo qualquer do repo (ex.: reconnect.json com o connect_token). Null se não achar.
async function fetchRepoFile(path){
  const cfg = getCfg();
  if (cfg && cfg.repo && cfg.pat){
    const [owner, repo] = cfg.repo.split('/');
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=main`;
    try {
      const r = await fetch(url, { headers:{ Authorization:`Bearer ${cfg.pat}`, Accept:'application/vnd.github.raw+json' }, cache:'no-store' });
      return r.ok ? JSON.parse(await r.text()) : null;
    } catch { return null; }
  }
  try { const r = await fetch('./' + path, { cache:'no-store' }); return r.ok ? r.json() : null; } catch { return null; }
}

/* ---------- escrita de evento (celular → inbox do repo) ---------- */
function todayStr(){
  // DAYSYNC-2026-07-16 · usa o dia LÓGICO do Mac (snap.date) como fonte ÚNICA — evita o celular e o Mac
  // discordarem do "hoje" (corte 4h + cache do app causavam eventos no dia errado). Fallback: corte 4h local.
  if (_lastSnap && _lastSnap.date) return _lastSnap.date;
  const d = new Date(Date.now() - 4*3600*1000);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function uuid(){
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'e-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}
// cria inbox/{uuid}.json no repo via Contents API (arquivo novo = zero conflito de escrita).
// PRECISA de token com Contents: Read AND Write (o de leitura dá 403 aqui).
async function postEvent(partial){
  const cfg = getCfg();
  if (!cfg || !cfg.repo || !cfg.pat) throw new Error('conecte o token primeiro (engrenagem)');
  const [owner, repo] = cfg.repo.split('/');
  const id = uuid();
  const evt = { id, ts: Math.floor(Date.now()/1000), date: todayStr(), source: 'mobile', v: 1, ...partial };
  const json = JSON.stringify(evt);
  const b64 = btoa(unescape(encodeURIComponent(json)));   // base64 utf-8-safe
  const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/inbox/${id}.json`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${cfg.pat}`, Accept: 'application/vnd.github+json' },
    body: JSON.stringify({ message: `evt ${evt.type}`, content: b64, branch: 'main' }),
  });
  if (r.status === 401 || r.status === 403) throw new Error('token sem permissão de escrita');
  if (!r.ok) throw new Error('GitHub ' + r.status);
  return true;
}

/* ---------- render ---------- */
function renderHero(c){
  const form = c.form || 1;
  const img = $('crImg');
  const src = CREATURE_ART[String(form)] || CREATURE_ART['1'];
  if (src && img.getAttribute('src') !== src) img.setAttribute('src', src);
  $('aura').style.setProperty('--auraColor', AURA[c.prestige] || AURA.normal);
  $('moodEmoji').innerHTML = icon(c.moodKey === 'radiante' ? 'sun' : 'moon');
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
  const steps = slot.steps || [], open = _skinOpen[rt];
  const head = `<button class="skin-rthead ${slot.complete ? 'full' : ''}" data-ev="skin.open" data-rt="${rt}">
    <span class="skin-rtname">${label}</span><span class="skin-rtcount">${slot.done || 0}/${slot.total || 0}</span>
    <span class="skin-rtchev">${icon(open ? 'up' : 'down')}</span></button>`;
  if (!open) return `<div class="skin-rt">${head}</div>`;
  const rows = steps.length ? steps.map(st => {
    const sub = (SKIN_LIB[st.type] || {}).name || '';
    return `<div class="skin-step ${st.done ? 'done' : ''}">
      <button class="prio-chk ${st.done ? 'on' : ''}" data-ev="skincare.step" data-rt="${rt}" data-title="${escapeHtml(st.title)}" data-done="${st.done ? 1 : 0}" aria-label="marcar passo">${st.done ? icon('check') : ''}</button>
      <button class="skin-stepmain" data-ev="skin.info" data-type="${escapeHtml(st.type || '')}" data-title="${escapeHtml(st.title)}">
        <span class="skin-steptitle">${escapeHtml(st.title)}</span>${sub ? `<span class="skin-stepsub">${escapeHtml(sub)}</span>` : ''}<span class="skin-stepinfo">${icon('info')}</span>
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
  slot.done = slot.steps.filter(x => x.done).length;
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
  postEvent({ type:'intent.move', intentId:id, beforeId }).then(schedulePrioRefresh).catch(err => { flashError(err.message || 'falha ao mover'); refresh(); });
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
  let tenho = 0, livres = null;
  const pend = { Receber:0, Fixo:0, 'Variável':0, 'Cartão':0, Investir:0 };
  for (const r of (rows||[])){
    if (r.cat === 'Tenho') tenho += r.valor || 0;
    else if (r.status === 'Pago'){ /* realizado — fora do pendente */ }
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
  $('extratoBody').innerHTML = ex.accounts.map((a, i) => {
    const open = !!_extratoOpen[i];
    const txs = a.txs || [];
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

  // MEDITAÇÃO — toggle: marca / desfaz (marcou por engano).
  if (snap.doneToday){
    const done = !!snap.doneToday.meditacao, pend = pendingFor('meditacao', done);
    const lbl = pend ? 'enviando…' : (done ? 'atenção feita hoje ✓ · desfazer' : 'marcar atenção do dia');
    daily.push({ key:'med', title:'Atenção / Meditação', ic:icon('meditacao'), badge:'',
      body:`<button class="mark-btn ${pend?'wait':(done?'done':'')}" data-ev="meditacao" data-done="${done?1:0}" ${pend?'disabled':''}>${lbl}</button>`,
      done, mini:'feito' });
  }

  // MOBILIDADE — toggle: marca / desfaz.
  if (snap.doneToday){
    const done = !!snap.doneToday.mobilidade, pend = pendingFor('mobilidade', done);
    const lbl = pend ? 'enviando…' : (done ? 'treino feito hoje ✓ · desfazer' : 'marcar treino de mobilidade');
    daily.push({ key:'mob', title:'Mobilidade', ic:icon('mobilidade'), badge:'',
      body:`<button class="mark-btn ${pend?'wait':(done?'done':'')}" data-ev="mobilidade" data-done="${done?1:0}" ${pend?'disabled':''}>${lbl}</button>`,
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
    const undo = n > 0 ? `<button class="pv-undo" data-ev="pelvico.undo">−1</button>` : '';
    const body = `<div class="pv-count"><b>${n}</b> de ${tot} sessões hoje${done?' · meta batida 🎉':''}</div>`+
      `<div class="pv-btns"><button class="mark-btn" data-ev="pelvico.add">+1 sessão feita</button>${undo}</div>`;
    daily.push({ key:'pelv', title:'Pélvico', ic:icon('pelvico'), badge:`${n}/${tot}`, body, done, mini:`${n}/${tot}` });
  }

  // LEITURA — MOBILE-LEITURA-COMPLETA-2026-07-21 · card completo (autor, página/total, %, barra).
  // Toca o livro (ou "registrar leitura") → modal pra marcar em que página parou (atualiza % e streak).
  // O ✓ do lado é o check rápido "li hoje" (toggle), como antes.
  if (snap.leitura && Array.isArray(snap.leitura.books) && snap.leitura.books.length){
    const books = snap.leitura.books;
    const rows = books.map(b => {
      const key = 'leitura:' + b.id, pend = pendingFor(key, !!b.done);
      const cur = b.current || 0, tot = b.total || 0, pct = Math.max(0, Math.min(100, b.pct || 0));
      const unit = b.audio ? 'min' : 'pág';
      const meta = tot > 0 ? `${unit} <b>${cur}</b> de <b>${tot}</b> · <b>${pct}%</b>` : `${unit} <b>${cur}</b>`;
      const dataAttrs = `data-book="${escapeHtml(b.id)}" data-title="${escapeHtml(b.title)}" data-cur="${cur}" data-tot="${tot}" data-audio="${b.audio?1:0}"`;
      return `<div class="book-card ${pend?'wait':(b.done?'done':'')}">
        <div class="book-top">
          <button class="book-main" data-ev="leit.log" ${dataAttrs}>
            <div class="book-t">${escapeHtml(b.title)}</div>
            ${b.author ? `<div class="book-a">${escapeHtml(b.author)}</div>` : ''}
          </button>
          <button class="book-chk ${b.done?'on':''}" data-ev="leitura" data-book="${escapeHtml(b.id)}" data-done="${b.done?1:0}" ${pend?'disabled':''} aria-label="li hoje">${pend?'…':(b.done?'✓':'')}</button>
        </div>
        <div class="book-bar"><div class="book-fill" style="width:${pct}%"></div></div>
        <div class="book-meta"><span>${meta}</span>
          <button class="book-reg" data-ev="leit.log" ${dataAttrs}>${b.done?'atualizar página':'registrar leitura'}</button></div>
      </div>`;
    }).join('');
    const stk = snap.leitura.streak || 0;
    daily.push({ key:'leit', title:'Leitura', ic:icon('leitura'), badge: stk > 0 ? `${stk}d` : '',
      body:`<div class="book-list">${rows}</div>`, done: books.every(b => b.done), mini:'lido' });
  }

  // ---- ordena e renderiza ---- (Fechar o dia/Reflexão são de fim de dia → vão pro fim; ORDEM-2026-07-16)
  const CARD_ORDER = { agua:1, remedios:2, prio:3, skin:4, med:5, mob:6, pelv:7, leit:8, reflexao:9, daylog:10 };
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

  $('cards').innerHTML = parts.join('');
}

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

function renderFreshness(snap){
  const el = $('freshness');
  if (!snap.ts){ el.textContent = snap.date || ''; return; }
  const d = new Date(snap.ts * 1000);
  const hh = String(d.getHours()).padStart(2,'0'), mm = String(d.getMinutes()).padStart(2,'0');
  el.textContent = `atualizado ${hh}:${mm}`;
}

function render(snap){
  _lastSnap = snap;
  document.body.classList.remove('loading', 'needcfg');
  renderFreshness(snap);
  renderHero(snap.creature || {});
  renderToday(snap);
  renderCards(snap);
  if (!$('finFull').hidden) renderFinFull();   // mantém a tela cheia do financeiro em sincronia
  if (!$('extratoFull').hidden) renderExtrato();
}

/* ---------- loop ---------- */
let _timer = null, _lastRendered = null;
function stripTs(snap){ const c = { ...snap }; delete c.ts; return JSON.stringify(c); }
async function refresh(){
  if (_dragging) return;                 // não repinta no meio de um arraste
  try{
    const snap = await fetchSnapshot();
    if (snap === NOT_MODIFIED){ if (_lastSnap) renderFreshness(_lastSnap); return; }   // só atualiza o "há X min"
    const key = stripTs(snap);          // dedup sem o ts (igual ao Mac) → não repinta/pisca à toa
    localStorage.setItem(SNAP_CACHE, JSON.stringify(snap));
    if (key === _lastRendered){ renderFreshness(snap); return; }
    _lastRendered = key;
    render(snap);
  }catch(e){
    // offline/erro → tenta o último snapshot em cache
    const cached = localStorage.getItem(SNAP_CACHE);
    if (cached){ render(JSON.parse(cached)); flashError('sem conexão — mostrando último'); }
    else if (!getCfg()) showOnboarding();          // 1º uso no site público: pede o token
    else showError(e.message || 'falha ao carregar');
  }
}
function showOnboarding(){
  document.body.classList.remove('loading');
  document.body.classList.add('needcfg');   // CSS esconde hero/today/cards e mostra #onboard (DOM intacto)
  $('freshness').textContent = '';
  if (!showOnboarding._once){ showOnboarding._once = true; openModal(); }
}
function startLoop(){ if (_timer) clearInterval(_timer); refresh(); _timer = setInterval(refresh, POLL_MS); }
function showError(msg){ $('cards').innerHTML = `<div class="state-msg err">${escapeHtml(msg)}</div>`; }
function flashError(msg){ const f=$('freshness'); const old=f.textContent; f.textContent=msg; setTimeout(()=>{f.textContent=old;},3000); }

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
    postEvent({ type:'intent.edit', intentId:id, text, note }).then(schedulePrioRefresh).catch(err => { flashError(err.message || 'falha ao salvar'); refresh(); });
  } else {   // adicionar — o celular gera o ts (id real) e manda; o item otimista já nasce com o id certo,
    const newTs = Date.now();   // (assim mexer nele antes de sincronizar não quebra — mesmo id nos 2 lados)
    optimisticPrio(pr => { pr.itens.push({ id: newTs, text, done:false, note: note || undefined, type: itype }); });
    postEvent({ type:'intent.add', text, note, itype, newTs }).then(schedulePrioRefresh).catch(err => { flashError(err.message || 'falha ao adicionar'); refresh(); });
  }
}
function deleteIntent(){
  if (!_editId) return;
  const id = _editId;
  closeEditor();
  optimisticPrio(pr => { pr.itens = pr.itens.filter(i => i.id !== id); });
  postEvent({ type:'intent.remove', intentId:id }).then(schedulePrioRefresh).catch(err => { flashError(err.message || 'falha ao apagar'); refresh(); });
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
function openLeitModal(bookId, title, cur, tot, audio){
  _leitBook = { id: bookId };
  const unit = audio ? 'minuto' : 'página';
  $('leitModalTitle').textContent = title || 'Registrar leitura';
  $('leitModalSub').textContent = `${unit} atual: ${cur}${tot ? ` de ${tot}` : ''}`;
  const inp = $('leitPage');
  inp.value = cur || '';
  inp.placeholder = audio ? 'ex: 120' : 'ex: 84';
  if (tot) inp.max = tot; else inp.removeAttribute('max');
  $('leitHint').textContent = tot ? (audio ? `total: ${tot} min` : `total: ${tot} páginas`) : '';
  $('leitModal').hidden = false;
  setTimeout(() => { try { inp.focus(); inp.select(); } catch(e){} }, 60);
}
function closeLeitModal(){ $('leitModal').hidden = true; _leitBook = null; }
function saveLeitModal(){
  if (!_leitBook) return;
  const v = parseInt($('leitPage').value, 10);
  if (isNaN(v) || v < 0){ flashError('coloca onde você parou'); return; }
  const id = _leitBook.id, key = 'leitura:' + id;
  closeLeitModal();
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
  $('dayNote').value = '';
  $('dayCap').value = '';
  [...document.querySelectorAll('#dayMoods .dmood')].forEach(b => b.classList.toggle('on', b.dataset.mood === _dayMood));
  $('daySave').disabled = !_dayMood;
  $('dayModal').hidden = false;
}
function closeDayModal(){ $('dayModal').hidden = true; }
function saveDayModal(){
  if (!_dayMood) return;
  const wellDone = $('dayNote').value.trim();
  const capText = $('dayCap').value.trim();
  closeDayModal();
  _pending['daylog'] = true;              // pendente até o snapshot confirmar (hub aplica)
  if (_lastSnap) render(_lastSnap);
  postEvent({ type:'daylog.close', mood:_dayMood, wellDone, capText })
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
    .catch(err => { flashError(err.message || 'falha ao enviar'); refresh(); });
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
      .then(schedulePrioRefresh).catch(err => { flashError(err.message||'falha ao salvar'); refresh(); });
  } else {   // nova — o celular gera o id (real = otimista)
    const nid = finNewId();
    optimisticFin(fin => { fin.rows.push({ id:nid, mes, label, valor, cat, status, venc: venc||undefined, split, nota: nota||undefined }); });
    if (!_finOpen[cat]){ _finOpen[cat] = true; saveFinOpen(); }
    postEvent({ type:'fin.add', id:nid, mes, label, valor, cat, status, venc: (venc===null?undefined:venc), split, nota })
      .then(schedulePrioRefresh).catch(err => { flashError(err.message||'falha ao adicionar'); refresh(); });
  }
}
function deleteFinRow(){
  if (!_finEditId) return;
  const id = _finEditId; closeFinEditor();
  optimisticFin(fin => { fin.rows = (fin.rows||[]).filter(r => String(r.id) !== id); });
  postEvent({ type:'fin.delete', id }).then(schedulePrioRefresh).catch(err => { flashError(err.message||'falha ao apagar'); refresh(); });
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
    catch(err){ flashError(err.message || 'falha ao enviar'); refresh(); }
    return;
  }
  if (ev === 'intent.edit'){ openEditor(Number(btn.dataset.id), btn.dataset.text || '', btn.dataset.note || ''); return; }
  if (ev === 'leit.log'){ openLeitModal(btn.dataset.book, btn.dataset.title || '', Number(btn.dataset.cur) || 0,
                                        Number(btn.dataset.tot) || 0, btn.dataset.audio === '1'); return; }
  if (ev === 'intent.new'){ openEditor(null, '', ''); return; }

  // PRIORIDADE toggle — OTIMISTA: muda na HORA no celular; o Mac reconcilia em 2º plano.
  if (ev === 'intent.toggle'){
    const id = Number(btn.dataset.id);
    optimisticPrio(pr => { const it = pr.itens.find(i => i.id === id); if (it) it.done = !it.done; });
    try{ await postEvent({ type:'intent.toggle', intentId:id }); schedulePrioRefresh(); }
    catch(err){ flashError(err.message || 'falha ao enviar'); refresh(); }
    return;
  }

  // SKINCARE: expandir rotina (local), ver info do passo (local), marcar passo (otimista)
  if (ev === 'skin.open'){ _skinOpen[btn.dataset.rt] = !_skinOpen[btn.dataset.rt]; if (_lastSnap) render(_lastSnap); return; }
  if (ev === 'skin.info'){ openSkinInfo(btn.dataset.type, btn.dataset.title); return; }
  if (ev === 'skincare.step'){
    const rt = btn.dataset.rt, title = btn.dataset.title, target = btn.dataset.done !== '1';
    optimisticSkinStep(rt, title);
    try{ await postEvent({ type:'skincare.step', routine:rt, title, done: target }); schedulePrioRefresh(); }
    catch(err){ flashError(err.message || 'falha ao enviar'); refresh(); }
    return;
  }

  // HÁBITOS: marcar/desmarcar um hábito (otimista, igual ao passo do skincare)
  if (ev === 'habito.toggle'){
    const id = btn.dataset.id, target = btn.dataset.done !== '1';
    _pending['habito.' + id] = target;
    optimisticHabito(id);
    try{ await postEvent({ type:'habito.toggle', id, done: target }); schedulePrioRefresh(); }
    catch(err){ delete _pending['habito.' + id]; flashError(err.message || 'falha ao enviar'); refresh(); }
    return;
  }

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
    catch(err){ flashError(err.message || 'falha ao enviar'); refresh(); }
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
