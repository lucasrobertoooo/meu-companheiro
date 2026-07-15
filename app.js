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
};
const icon = n => ICONS[n] || '';

const TODAY_MODULES = [
  { key:'agua',       lbl:'Água' },
  { key:'pelvico',    lbl:'Pélvico' },
  { key:'meditacao',  lbl:'Meditação' },
  { key:'leitura',    lbl:'Leitura' },
  { key:'mobilidade', lbl:'Mobilidade' },
];

/* ---------- config ---------- */
function getCfg(){ try{ return JSON.parse(localStorage.getItem(CFG_KEY)) || null; }catch{ return null; } }
function setCfg(c){ localStorage.setItem(CFG_KEY, JSON.stringify(c)); }
function clearCfg(){ localStorage.removeItem(CFG_KEY); }

/* ---------- data source ---------- */
async function fetchSnapshot(){
  const cfg = getCfg();
  if (cfg && cfg.repo && cfg.pat){
    const [owner, repo] = cfg.repo.split('/');
    const path = cfg.path || 'snapshot.json';
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=main`;
    const r = await fetch(url, {
      headers:{ Authorization:`Bearer ${cfg.pat}`, Accept:'application/vnd.github.raw+json' },
      cache:'no-store',
    });
    if (r.status === 401 || r.status === 403) throw new Error('Token inválido ou sem permissão.');
    if (r.status === 404) throw new Error('Repo/arquivo não encontrado.');
    if (!r.ok) throw new Error('GitHub API '+r.status);
    return JSON.parse(await r.text());
  }
  // dev/local
  const r = await fetch('./snapshot.json', { cache:'no-store' });
  if (!r.ok) throw new Error('sem snapshot local');
  return r.json();
}

/* ---------- escrita de evento (celular → inbox do repo) ---------- */
function todayStr(){
  const d = new Date();
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
  setTimeout(() => { _dragging = false; }, 60);
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

function renderCards(snap){
  const parts = [];

  // ÁGUA (com anel de %) + botão "+1 garrafa"
  if (snap.water){
    const w = snap.water, p = Math.max(0, Math.min(100, w.pct||0));
    parts.push(card('Água', icon('agua'), `meta ${(w.goalMl/1000).toFixed(1)} L`, `
      <div class="ring-row">
        <div class="ring" style="--p:${p};position:relative"><b>${p}%</b></div>
        <div class="ring-meta"><b>${(w.ml/1000).toFixed(2)} L</b> bebidos hoje
          <small>${w.bottles||0} garrafa(s) de ${w.bottleMl||0} ml</small></div>
      </div>
      <button class="mark-btn" data-ev="agua.bottle">+1 garrafa (${w.bottleMl||700} ml)</button>`));
  }

  // PRIORIDADES — lista editável (tabs, notas, histórico, marcar/desmarcar). PRIORIDADES-EDIT-F.A.
  if (snap.prioridades){
    const pr = snap.prioridades;
    parts.push(card('Prioridades', icon('prioridades'), `${pr.pending}/${pr.total}`, prioBody(pr)));
  }

  // SKINCARE (AM/PM/streak) + botões toggle marcar⇄desfazer de cada rotina
  if (snap.skincare){
    const s = snap.skincare, am = s.am||{}, pm = s.pm||{};
    parts.push(card('Skincare', icon('skincare'), s.streak!=null?`${icon('flame')} ${s.streak}d`:'',
      skinRoutine('am', am, 'Manhã') + skinRoutine('pm', pm, 'Noite')));
  }

  // MEDITAÇÃO (só marcar — não desmarca pelo celular)
  if (snap.doneToday){
    const done = !!snap.doneToday.meditacao, pend = pendingFor('meditacao', done);
    const lbl = pend ? 'enviando… atualizando' : (done ? 'atenção feita hoje ✓' : 'marcar atenção do dia');
    parts.push(card('Atenção / Meditação', icon('meditacao'), '',
      `<button class="mark-btn ${pend?'wait':(done?'done':'')}" data-ev="meditacao" data-done="${done?1:0}" ${(pend||done)?'disabled':''}>${lbl}</button>`));
  }

  // MOBILIDADE (check-in de treino — toggle marcar⇄desfazer; aplica direto, funciona hub fechado)
  if (snap.doneToday){
    const done = !!snap.doneToday.mobilidade, pend = pendingFor('mobilidade', done);
    const lbl = pend ? 'enviando… atualizando' : (done ? 'treino feito hoje ✓' : 'marcar treino de mobilidade');
    // só marcar (como a meditação): desfazer mobilidade é ambíguo (o MobiApp é a fonte real do treino)
    parts.push(card('Mobilidade', icon('mobilidade'), '',
      `<button class="mark-btn ${pend?'wait':(done?'done':'')}" data-ev="mobilidade" data-done="${done?1:0}" ${(pend||done)?'disabled':''}>${lbl}</button>`));
  }

  // LEITURA (lista os livros em andamento — toca no que leu; só marcar)
  if (snap.leitura && Array.isArray(snap.leitura.books) && snap.leitura.books.length){
    const rows = snap.leitura.books.map(b => {
      const key = 'leitura:' + b.id, pend = pendingFor(key, !!b.done);
      const st = pend ? '…' : (b.done ? '✓ lido hoje' : 'li hoje');
      return `<button class="book-btn ${pend?'wait':(b.done?'done':'')}" data-ev="leitura" data-book="${escapeHtml(b.id)}" data-done="${b.done?1:0}" ${(pend||b.done)?'disabled':''}>
        <span class="book-title">${escapeHtml(b.title)}</span><span class="book-mark">${st}</span></button>`;
    }).join('');
    parts.push(card('Leitura', icon('leitura'), '', `<div class="book-list">${rows}</div>`));
  }

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
}

/* ---------- loop ---------- */
let _timer = null, _lastRendered = null;
function stripTs(snap){ const c = { ...snap }; delete c.ts; return JSON.stringify(c); }
async function refresh(){
  if (_dragging) return;                 // não repinta no meio de um arraste
  try{
    const snap = await fetchSnapshot();
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

/* ---------- ações (delegado uma vez; renderCards troca o innerHTML a cada poll) ---------- */
$('cards').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-ev],[data-ptab]');
  if (!btn || btn.disabled) return;
  const ev = btn.dataset.ev, label = btn.textContent;

  // LOCAL (sem rede): tab de prioridades / mostrar-ocultar histórico / abrir editor
  if (btn.dataset.ptab){ _prioTab = btn.dataset.ptab; localStorage.setItem('companheiro.prioTab', _prioTab); if (_lastSnap) render(_lastSnap); return; }
  if (ev === 'prio.hist'){ _showHist = !_showHist; if (_lastSnap) render(_lastSnap); return; }
  if (ev === 'intent.edit'){ openEditor(Number(btn.dataset.id), btn.dataset.text || '', btn.dataset.note || ''); return; }
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

  // ÁGUA: toca o sagrado + XP → aplica pelo widget quando o hub abre. fire-and-forget.
  if (ev === 'agua.bottle'){
    btn.disabled = true; btn.textContent = 'enviado ✓';
    try{
      await postEvent({ type:'agua.bottle' });
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
  } else if (ev === 'meditacao'){                            // só marcar
    if (btn.dataset.done === '1') return;
    target = true; key = 'meditacao'; evt = { type: 'meditacao.done' };
  } else if (ev === 'leitura'){                               // só marcar, por livro
    if (btn.dataset.done === '1') return;
    const bookId = btn.dataset.book;
    target = true; key = 'leitura:' + bookId; evt = { type: 'leitura.read', bookId };
  } else if (ev === 'mobilidade'){                            // toggle (marca/desmarca)
    target = btn.dataset.done !== '1';
    key = 'mobilidade'; evt = { type: 'mobilidade.checkin', done: target };
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
});

/* ---------- boot ---------- */
$('gear').addEventListener('click', openModal);
$('cfgSave').addEventListener('click', saveCfg);
$('cfgClear').addEventListener('click', ()=>{ clearCfg(); $('cfgPat').value=''; $('cfgStatus').className='modal-status'; $('cfgStatus').textContent='limpo'; });
$('modal').addEventListener('click', e=>{ if (e.target === $('modal')) closeModal(); });
$('editSave').addEventListener('click', saveEditor);
$('editCancel').addEventListener('click', closeEditor);
$('editDelete').addEventListener('click', deleteIntent);
$('editModal').addEventListener('click', e=>{ if (e.target === $('editModal')) closeEditor(); });
$('skinInfoClose').addEventListener('click', closeSkinInfo);
$('skinInfoModal').addEventListener('click', e=>{ if (e.target === $('skinInfoModal')) closeSkinInfo(); });
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
