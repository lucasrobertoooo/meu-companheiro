// Companheiro mobile — espelho READ-ONLY do snapshot.json (schema v1).
// Fonte: repo privado via GitHub Contents API (PAT no aparelho) OU ./snapshot.json (dev local).
import { CREATURE_ART } from './creature-art.js';

const $ = id => document.getElementById(id);
const CFG_KEY = 'companheiro.sync.cfg';
const SNAP_CACHE = 'companheiro.sync.lastSnap';
const POLL_MS = 25000;
let _pending = {};        // otimista: mapa key→alvo(bool) aguardando o Mac confirmar no snapshot

const AURA = { normal:'rgba(138,92,240,.42)', prata:'rgba(184,184,196,.44)', ouro:'rgba(232,192,90,.52)' };
const TODAY_MODULES = [
  { key:'agua',       ic:'💧', lbl:'Água' },
  { key:'pelvico',    ic:'💪', lbl:'Pélvico' },
  { key:'meditacao',  ic:'🧘', lbl:'Meditação' },
  { key:'leitura',    ic:'📖', lbl:'Leitura' },
  { key:'mobilidade', ic:'🤸', lbl:'Mobilidade' },
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
  if (!cfg || !cfg.repo || !cfg.pat) throw new Error('conecte o token primeiro (⚙)');
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
  $('moodEmoji').textContent = c.moodEmoji || '';
  $('crName').textContent = c.name || 'Companheiro';
  $('crLevel').textContent = `${c.levelName || ''} · nível ${c.level ?? '—'}`;
  const pct = Math.round((c.levelProgress || 0) * 100);
  $('xpfill').style.width = pct + '%';
  $('xpnum').textContent = c.xpToNextLevel > 0
    ? `${c.xp} / ${c.xp + c.xpToNextLevel} xp`
    : `${c.xp} xp · máximo`;
  $('crCap').textContent = c.cap || '';
  const chips = [];
  if (c.streak >= 1) chips.push(`<span class="chip hot">🔥 ${c.streak} ${c.streak===1?'dia':'dias'}</span>`);
  if (c.best > 1)   chips.push(`<span class="chip">recorde ${c.best}d</span>`);
  if (c.prestige && c.prestige !== 'normal') chips.push(`<span class="chip gold">✦ ${c.prestige}</span>`);
  if (c.restDay)    chips.push(`<span class="chip">descanso</span>`);
  $('chips').innerHTML = chips.join('');
}

function renderToday(done){
  done = done || {};
  $('todayGrid').innerHTML = TODAY_MODULES.map(m => {
    const on = !!done[m.key];
    return `<div class="pill ${on?'done':''}">
      <span class="dot">${on?'✓':m.ic}</span>
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
// botão de rotina do skincare (toggle marcar⇄desfazer)
function skinBtn(routine, slot){
  const done = !!slot.complete, key = 'skincare.' + routine, pend = pendingFor(key, done);
  const rl = routine === 'am' ? 'manhã' : 'noite';
  const lbl = pend ? '…' : (done ? `${rl} ✓` : `marcar ${rl}`);
  const cls = pend ? 'wait' : (done ? 'done' : '');
  return `<button class="mark-btn half ${cls}" data-ev="skincare.${routine}" data-done="${done?1:0}" ${pend?'disabled':''}>${lbl}</button>`;
}

function renderCards(snap){
  const parts = [];

  // ÁGUA (com anel de %)
  if (snap.water){
    const w = snap.water, p = Math.max(0, Math.min(100, w.pct||0));
    parts.push(card('Água', '💧', `meta ${(w.goalMl/1000).toFixed(1)} L`, `
      <div class="ring-row">
        <div class="ring" style="--p:${p};position:relative"><b>${p}%</b></div>
        <div class="ring-meta"><b>${(w.ml/1000).toFixed(2)} L</b> bebidos hoje
          <small>${w.bottles||0} garrafa(s) de ${w.bottleMl||0} ml</small></div>
      </div>`));
  }

  // PRIORIDADES
  if (snap.prioridades){
    const pr = snap.prioridades;
    const body = (pr.itens && pr.itens.length)
      ? `<ul class="todo-list">${pr.itens.map(t=>`<li>${escapeHtml(t)}</li>`).join('')}</ul>`
      : `<div class="todo-empty">tudo em dia por aqui ✨</div>`;
    parts.push(card('Prioridades', '🎯', `${pr.pending}/${pr.total} pendentes`, body));
  }

  // SKINCARE (AM/PM/streak) + botões toggle marcar⇄desfazer de cada rotina
  if (snap.skincare){
    const s = snap.skincare, am = s.am||{}, pm = s.pm||{};
    parts.push(card('Skincare', '🧴', s.streak!=null?`🔥 ${s.streak}d`:'', `
      <div class="skin-row">
        <div class="skin-slot ${am.complete?'full':''}"><div class="s-lbl">Manhã</div><div class="s-val">${am.done||0}/${am.total||0}</div></div>
        <div class="skin-slot ${pm.complete?'full':''}"><div class="s-lbl">Noite</div><div class="s-val">${pm.done||0}/${pm.total||0}</div></div>
      </div>
      <div class="btn-row">${skinBtn('am', am)}${skinBtn('pm', pm)}</div>`));
  }

  // MEDITAÇÃO (só marcar — não desmarca pelo celular)
  if (snap.doneToday){
    const done = !!snap.doneToday.meditacao, pend = pendingFor('meditacao', done);
    const lbl = pend ? 'enviando… atualizando' : (done ? 'atenção feita hoje ✓' : 'marcar atenção do dia');
    parts.push(card('Atenção / Meditação', '🧘', '',
      `<button class="mark-btn ${pend?'wait':(done?'done':'')}" data-ev="meditacao" data-done="${done?1:0}" ${(pend||done)?'disabled':''}>${lbl}</button>`));
  }

  // LEITURA (lista os livros em andamento — toca no que leu; só marcar)
  if (snap.leitura && Array.isArray(snap.leitura.books) && snap.leitura.books.length){
    const rows = snap.leitura.books.map(b => {
      const key = 'leitura:' + b.id, pend = pendingFor(key, !!b.done);
      const st = pend ? '…' : (b.done ? '✓ lido hoje' : 'li hoje');
      return `<button class="book-btn ${pend?'wait':(b.done?'done':'')}" data-ev="leitura" data-book="${escapeHtml(b.id)}" data-done="${b.done?1:0}" ${(pend||b.done)?'disabled':''}>
        <span class="book-title">${escapeHtml(b.title)}</span><span class="book-mark">${st}</span></button>`;
    }).join('');
    parts.push(card('Leitura', '📖', '', `<div class="book-list">${rows}</div>`));
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
  document.body.classList.remove('loading', 'needcfg');
  renderFreshness(snap);
  renderHero(snap.creature || {});
  renderToday(snap.doneToday);
  renderCards(snap);
}

/* ---------- loop ---------- */
let _timer = null, _lastRendered = null;
function stripTs(snap){ const c = { ...snap }; delete c.ts; return JSON.stringify(c); }
async function refresh(){
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

/* ---------- ações (delegado uma vez; renderCards troca o innerHTML a cada poll) ---------- */
$('cards').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-ev]');
  if (!btn || btn.disabled) return;
  const ev = btn.dataset.ev, label = btn.textContent;
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
document.addEventListener('visibilitychange', ()=>{ if (!document.hidden) refresh(); });

if ('serviceWorker' in navigator){
  window.addEventListener('load', ()=> navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}

startLoop();
