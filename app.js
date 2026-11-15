// Elke Dag – app om dagelijkse gezonde gewoontes op te volgen.
// Alles blijft op de telefoon zelf: gewoontes en vinkjes in localStorage, foto's in IndexedDB.

const VERSION = 8;
const PREVIEW = !!window.PREVIEW; // voorbeeldversie: geen agenda-bestand, meldingen of kopieën
const $ = s => document.querySelector(s);
const main = $('#main');
const COLORS = ['teal', 'coral', 'indigo', 'amber', 'rose', 'sky'];
const ICONS = ['💪', '🚶', '🏃', '🧘', '🦵', '💧', '🍎', '🥦', '😴', '🫁', '📖', '🦷', '💊', '☀️'];
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 0]; // ma t/m zo
const SHORT = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const DAYS = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];

// ---------- opslag ----------
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } }
};
let NAME = store.get('name', '');
let habits = store.get('habits', null);
if (!habits) habits = [{ id: uid(), name: '1 minuut armspieroefeningen', time: '10:00', color: 'teal', icon: '💪' }];
habits.forEach((h, i) => { h.color = h.color || COLORS[i % COLORS.length]; h.icon = h.icon || ICONS[i % ICONS.length]; h.created = h.created || dayKey(); h.days = h.days || [...ALL_DAYS]; h.start = h.start || h.created; h.endType = h.endType || 'never'; });
let log = store.get('log', {});          // { 'YYYY-MM-DD': { habitId: { at, photo } } }
let notified = store.get('notified', {}); // { 'YYYY-MM-DD': [habitId] }
let demo = false;                         // voorbeeldgegevens tonen in het overzicht
save();

function uid() { return Math.random().toString(36).slice(2, 10); }
function dayKey(d = new Date()) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function addDays(d, n) { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() + n); return x; }
function save() { store.set('habits', habits); store.set('log', log); store.set('notified', notified); }
function sortedHabits() { return [...habits].sort((a, b) => a.time.localeCompare(b.time)); }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function hourText(t) { const [h, m] = t.split(':').map(Number); return m ? `${h}u${String(m).padStart(2, '0')}` : `${h} uur`; }
function nowHM() { return new Date().toTimeString().slice(0, 5); }
function col(h) { return `var(--c-${h.color})`; }
function mins(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }

// foto's in IndexedDB
const dbP = new Promise((res, rej) => {
  try {
    const r = indexedDB.open('elkedag', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('photos');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  } catch (e) { rej(e); }
});
dbP.catch(() => { });
async function tx(mode, fn) { const db = await dbP; return new Promise(r => { const t = db.transaction('photos', mode); const q = fn(t.objectStore('photos')); t.oncomplete = () => r(q && q.result); t.onerror = () => r(null); }); }
const photoPut = (k, v) => tx('readwrite', s => s.put(v, k)).catch(() => null);
const photoGet = k => tx('readonly', s => s.get(k)).catch(() => null);
const photoDel = k => tx('readwrite', s => s.delete(k)).catch(() => null);

function shrink(file, max = 1400) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      res(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}

// ---------- planning ----------
// Een gewoonte is gepland op dag d als d na de startdatum valt, op een gekozen weekdag,
// en (afhankelijk van het einde) vóór de einddatum of binnen het gekozen aantal keer.
function occurrence(h, d) { // hoeveelste geplande keer is dag d (vanaf de start)?
  let n = 0, x = new Date(h.start + 'T12:00');
  while (x <= d) { if (h.days.includes(x.getDay())) n++; x = addDays(x, 1); }
  return n;
}
function scheduled(h, d) {
  const k = dayKey(d);
  if (!h.days.includes(d.getDay())) return false;
  if (demo) return true;
  if (k < h.start) return false;
  if (h.endType === 'until' && h.until && k > h.until) return false;
  if (h.endType === 'count' && h.count && occurrence(h, d) > h.count) return false;
  return true;
}
function finished(h) {
  const t = dayKey();
  if (h.endType === 'until' && h.until && h.until < t) return true;
  if (h.endType === 'count' && h.count && occurrence(h, addDays(new Date(), 0)) >= h.count && !scheduled(h, addDays(new Date(), 0))) return true;
  return false;
}
function daysText(days) {
  if (days.length === 7) return 'elke dag';
  const s = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  if (s.length === 5 && !s.includes(0) && !s.includes(6)) return 'weekdagen';
  if (s.length === 2 && s.includes(0) && s.includes(6)) return 'in het weekend';
  return s.map(d => SHORT[d]).join(', ');
}
function niceDate(k) { return new Date(k + 'T12:00').toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: k.slice(0, 4) === String(new Date().getFullYear()) ? undefined : 'numeric' }); }
function planText(h) {
  let t = `${daysText(h.days)} om ${hourText(h.time)}`;
  if (h.start > dayKey()) t += ` · vanaf ${niceDate(h.start)}`;
  if (h.endType === 'until' && h.until) t += ` · tot ${niceDate(h.until)}`;
  if (h.endType === 'count' && h.count) {
    const done = Math.min(h.count, occurrence(h, addDays(new Date(), -1)) );
    t += ` · ${h.count} keer (nog ${Math.max(0, h.count - done)})`;
  }
  return t;
}

// ---------- statistiek ----------
function L() { return demo ? demoLog() : log; }
function isDone(lg, d, id) { return !!lg[dayKey(d)]?.[id]; }
function dayRate(lg, d) {
  const hs = habits.filter(h => scheduled(h, d));
  if (!hs.length) return null;
  return hs.filter(h => isDone(lg, d, h.id)).length / hs.length;
}
function rangeRate(lg, from, days, id) {
  let done = 0, tot = 0;
  for (let i = 0; i < days; i++) {
    const d = addDays(from, i);
    for (const h of habits) {
      if (id && h.id !== id) continue;
      if (!scheduled(h, d)) continue;
      tot++; if (isDone(lg, d, h.id)) done++;
    }
  }
  return tot ? done / tot : 0;
}
// reeks = aantal geplande dagen na elkaar gedaan; dagen zonder planning tellen niet mee en breken niets
function streak(lg, id) {
  const h = habits.find(x => x.id === id); if (!h) return 0;
  let d = addDays(new Date(), 0), n = 0;
  if (!isDone(lg, d, id)) d = addDays(d, -1); // vandaag nog niet gedaan breekt de reeks niet
  for (let i = 0; i < 800; i++, d = addDays(d, -1)) {
    if (isDone(lg, d, id)) n++;
    else if (scheduled(h, d)) break;
  }
  return n;
}
function bestStreak(lg, id) {
  const keys = Object.keys(lg).sort(); if (!keys.length) return 0;
  let best = 0, cur = 0, d = new Date(keys[0] + 'T12:00'); const end = addDays(new Date(), 0);
  const h = habits.find(x => x.id === id); if (!h) return 0;
  while (d <= end) { if (isDone(lg, d, id)) { cur++; best = Math.max(best, cur); } else if (scheduled(h, d)) cur = 0; d = addDays(d, 1); }
  return best;
}
function totalDone(lg) { return Object.values(lg).reduce((a, v) => a + Object.keys(v).length, 0); }
function demoLog() {
  if (demoLog.cache) return demoLog.cache;
  const lg = {}; let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let i = 83; i >= 1; i--) {
    const d = addDays(new Date(), -i), k = dayKey(d), weekend = d.getDay() === 0 || d.getDay() === 6;
    habits.forEach((h, j) => {
      if (!h.days.includes(d.getDay())) return;
      const p = 0.55 + (83 - i) / 83 * 0.35 - (weekend ? 0.2 : 0) - j * 0.05;
      if (rnd() < p) { const off = Math.round((rnd() - 0.35) * 40); const m = Math.max(0, mins(h.time) + off); (lg[k] = lg[k] || {})[h.id] = { at: String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0') }; }
    });
  }
  const t = dayKey(); if (log[t]) lg[t] = log[t];
  return (demoLog.cache = lg);
}

// ---------- navigatie ----------
let tab = 'today';
document.querySelectorAll('nav button').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(true); });
function render(top) {
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  if (!NAME) return renderWelcome();
  $('#ring').hidden = tab !== 'today';
  ({ today: renderToday, overview: renderOverview, photos: renderPhotos, habits: renderHabits })[tab]();
  if (top) window.scrollTo(0, 0);
}
function head(title, sub) { $('#title').textContent = title; $('#subtitle').textContent = sub.charAt(0).toUpperCase() + sub.slice(1); }
const CHECK = '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
const CAM = '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="14" rx="3"/><circle cx="12" cy="13" r="3.5"/><path d="M8.5 6l1.5-2.5h4L15.5 6"/></svg>';

// ---------- welkom: eerste keer openen ----------
function renderWelcome() {
  head('Welkom bij Elke Dag', 'Kleine gezonde gewoontes, elke dag opnieuw.');
  $('#ring').hidden = true;
  main.innerHTML = `<div class="card stack"><div style="font-size:40px">👋</div>
    <div><b>Hoe heet je?</b><div class="small">Dan weet de app wie hij een seintje geeft.</div></div>
    <input type="text" id="nameIn" autocomplete="given-name" placeholder="Je voornaam">
    <button class="btn" id="nameOk">Aan de slag</button></div>`;
  const go = () => { const v = $('#nameIn').value.trim(); if (!v) { $('#nameIn').focus(); return; } NAME = v; store.set('name', v); tab = 'today'; render(true); };
  $('#nameOk').onclick = go;
  $('#nameIn').onkeydown = e => { if (e.key === 'Enter') go(); };
}

// ---------- vandaag ----------
function groet(d) { const h = d.getHours(); return (h < 6 ? 'Goeienacht' : h < 12 ? 'Goeiemorgen' : h < 18 ? 'Goeiemiddag' : 'Goeienavond') + ` ${NAME}`; }
function renderToday() {
  const now = new Date(), done = log[dayKey(now)] || {}, hm = nowHM();
  const list = sortedHabits().filter(h => scheduled(h, now) || done[h.id]), n = list.filter(h => done[h.id]).length;
  head(groet(now), now.toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' }));
  const r = 34, c = 2 * Math.PI * r, frac = list.length ? n / list.length : 0;
  $('#ring').innerHTML = `<svg viewBox="0 0 84 84"><circle cx="42" cy="42" r="${r}" stroke="rgba(255,255,255,.2)" stroke-width="8" fill="none"/>
    <circle cx="42" cy="42" r="${r}" stroke="#fff" stroke-width="8" fill="none" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - frac)}" style="transition:stroke-dashoffset .6s"/></svg><b>${n}/${list.length}</b>`;

  let html = '';
  if (list.length && n === list.length) html += `<div class="card celebrate"><b>Alles gedaan vandaag! 🎉</b><span class="small">Goed bezig, ${NAME}. Morgen opnieuw.</span></div>`;
  if (!PREVIEW && !store.get('bannerDone', false)) html += `<div class="banner" id="rb"><div class="e">⏰</div><div><b>Krijg een seintje op het juiste uur</b><div class="small">Tik hier om de herinneringen in je agenda te zetten.</div></div></div>`;
  if (!list.length && habits.length) html += `<div class="card empty"><div class="big">☕</div>Vandaag staat er niets gepland.<br>Geniet van je rustdag, ${esc(NAME)}.</div>`;
  else if (!list.length) html += `<div class="card empty"><div class="big">🌱</div>Nog geen gewoontes.<br>Begin klein: voeg er één toe bij <b>Gewoontes</b>.</div>`;
  for (const h of list) {
    const d = done[h.id], late = !d && h.time <= hm, s = streak(log, h.id);
    html += `<div class="card habit ${d ? 'done' : ''}" data-id="${h.id}" style="--hc:${col(h)}">
      <div class="icon">${h.icon}</div>
      <div class="info"><div class="name">${esc(h.name)}</div>
        <div class="meta">${hourText(h.time)}
          ${d ? `<span class="pill">gedaan om ${d.at}</span>` : late ? '<span class="pill late">nog te doen</span>' : ''}
          ${s >= 2 ? `<span class="pill fire">🔥 ${s} dagen</span>` : ''}</div></div>
      ${d && d.photo ? `<img class="thumb" data-photo="${d.photo}" data-cap="${esc(h.name)}" alt="foto">` : `<button class="cam" aria-label="Foto toevoegen">${CAM}</button>`}
      <button class="check" aria-label="${d ? 'Niet gedaan' : 'Afvinken'}">${CHECK}</button>
    </div>`;
  }
  main.innerHTML = html;
  main.querySelectorAll('.habit').forEach(el => {
    const id = el.dataset.id;
    el.querySelector('.check').onclick = () => toggle(id, el);
    const pb = el.querySelector('.cam'); if (pb) pb.onclick = () => pickPhoto(id);
  });
  const rb = $('#rb'); if (rb) rb.onclick = () => { store.set('bannerDone', true); tab = 'habits'; render(true); };
  loadThumbs();
}
async function toggle(id, el) {
  const k = dayKey(); log[k] = log[k] || {};
  if (log[k][id]) { if (log[k][id].photo) await photoDel(log[k][id].photo); delete log[k][id]; }
  else { log[k][id] = { at: nowHM() }; if (navigator.vibrate) navigator.vibrate(30); }
  save(); demoLog.cache = null;
  el.classList.toggle('done', !!log[k][id]); el.querySelector('.check').classList.add('pop');
  setTimeout(() => render(), 380);
}
let photoTarget = null;
function pickPhoto(id) { photoTarget = id; $('#photoInput').value = ''; $('#photoInput').click(); }
$('#photoInput').onchange = async e => {
  const f = e.target.files[0]; if (!f || !photoTarget) return;
  const k = dayKey(), key = k + '_' + photoTarget;
  await photoPut(key, await shrink(f));
  log[k] = log[k] || {};
  log[k][photoTarget] = log[k][photoTarget] || { at: nowHM() };
  log[k][photoTarget].photo = key;
  save(); render();
};
async function loadThumbs() {
  for (const img of main.querySelectorAll('img[data-photo]')) {
    const src = await photoGet(img.dataset.photo);
    if (src) { img.src = src; img.closest('figure, .habit').addEventListener('click', ev => { if (ev.target.closest('.check')) return; if (ev.target === img || img.closest('figure')) openViewer(src, img.dataset.cap); }); }
  }
}
function openViewer(src, cap) { $('#viewer img').src = src; $('#viewerCap').textContent = cap || ''; $('#viewer').style.display = 'flex'; }
$('#viewer').onclick = () => $('#viewer').style.display = 'none';

// ---------- overzicht en analyse ----------
function renderOverview() {
  const lg = L(), today = addDays(new Date(), 0);
  const days = Object.keys(log).filter(k => Object.keys(log[k]).length).length;
  head('Overzicht', demo ? 'Met voorbeeldgegevens' : 'Hoe gaat het met je gewoontes?');
  let html = '';
  if (!habits.length) { main.innerHTML = `<div class="card empty"><div class="big">📊</div>Voeg eerst een gewoonte toe.</div>`; return; }
  if (demo) html += `<div class="demo"><div style="flex:1">Dit zijn <b>voorbeeldgegevens</b>, zodat je ziet hoe het overzicht eruitziet.</div><button id="demoBtn">Toon mijn echte</button></div>`;
  else if (days < 7) html += `<div class="demo"><div style="flex:1">Na een week afvinken wordt dit overzicht pas echt interessant.</div><button id="demoBtn">Toon voorbeeld</button></div>`;

  // tegels
  const wk = rangeRate(lg, addDays(today, -6), 7), prev = rangeRate(lg, addDays(today, -13), 7);
  const diff = Math.round((wk - prev) * 100);
  const bestNow = Math.max(0, ...habits.map(h => streak(lg, h.id)));
  html += `<div class="tiles">
    <div class="tile"><div class="v">${Math.round(wk * 100)}%</div><div class="l">gedaan deze week</div>${prev || wk ? `<div class="d ${diff >= 0 ? 'up' : 'down'}">${diff >= 0 ? '▲' : '▼'} ${Math.abs(diff)}% t.o.v. vorige</div>` : ''}</div>
    <div class="tile"><div class="v">🔥${bestNow}</div><div class="l">dagen op rij, langste lopende reeks</div></div>
    <div class="tile"><div class="v">${totalDone(lg)}</div><div class="l">keer afgevinkt in totaal</div></div></div>`;

  // staafgrafiek 14 dagen
  const W = 320, H = 130, pad = 18, bw = (W - 8) / 14;
  let bars = '';
  for (let i = 0; i < 14; i++) {
    const d = addDays(today, i - 13), r = dayRate(lg, d) ?? 0, bh = Math.max(3, r * (H - pad - 10)), x = 4 + i * bw;
    bars += `<rect x="${x + 3}" y="${H - pad - bh}" width="${bw - 6}" height="${bh}" rx="4" fill="${i === 13 ? 'var(--brand-2)' : 'color-mix(in srgb,var(--brand-2) 55%,var(--line))'}"/>`;
    bars += `<text x="${x + bw / 2}" y="${H - 4}" text-anchor="middle">${DAYS[d.getDay()].slice(0, 2)}</text>`;
  }
  const grid = [0, .5, 1].map(f => `<line x1="0" x2="${W}" y1="${H - pad - f * (H - pad - 10)}" y2="${H - pad - f * (H - pad - 10)}" stroke="var(--line)" stroke-dasharray="${f ? '3 3' : ''}"/>`).join('');
  html += `<div class="card chart"><div class="legend"><b>Laatste 2 weken</b><span class="small">% gedaan per dag</span></div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Percentage gedaan per dag, laatste 14 dagen">${grid}${bars}</svg></div>`;

  // inzichten
  html += `<div class="h2">Wat valt op</div><div class="card">${insights(lg, today).map(i => `<div class="insight"><div class="e">${i[0]}</div><div><b>${i[1]}</b><span class="small">${i[2]}</span></div></div>`).join('')}</div>`;

  // per gewoonte
  html += `<div class="h2">Per gewoonte · 30 dagen</div>`;
  for (const h of sortedHabits()) {
    const r = rangeRate(lg, addDays(today, -29), 30, h.id);
    let dots = ''; for (let i = 29; i >= 0; i--) { const dd = addDays(today, -i); dots += `<i class="${isDone(lg, dd, h.id) ? 'on' : scheduled(h, dd) ? '' : 'off'}"></i>`; }
    html += `<div class="card" style="--hc:${col(h)}"><div class="hrow"><div class="icon">${h.icon}</div>
      <div style="flex:1;min-width:0"><b>${esc(h.name)}</b><div class="small">🔥 ${streak(lg, h.id)} op rij · record ${bestStreak(lg, h.id)}</div></div>
      <div class="pct">${Math.round(r * 100)}%</div></div><div class="dots">${dots}</div></div>`;
  }

  // heatmap 12 weken
  const start = addDays(today, -(7 * 11) - ((today.getDay() + 6) % 7));
  let cells = '';
  for (let i = 0; i < 84; i++) {
    const d = addDays(start, i);
    if (d > today) { cells += '<i style="background:transparent"></i>'; continue; }
    const r = dayRate(lg, d) ?? 0;
    cells += `<i title="${dayKey(d)}" style="background:${r ? `color-mix(in srgb,var(--brand-2) ${Math.round(25 + r * 75)}%,var(--line))` : 'var(--line)'}"></i>`;
  }
  html += `<div class="h2">Laatste 12 weken</div><div class="card"><div class="heatwrap"><div class="heatdays">${['ma', '', 'wo', '', 'vr', '', 'zo'].map(x => `<span>${x}</span>`).join('')}</div>
    <div class="heat" style="flex:1">${cells}</div></div><div class="small" style="margin-top:8px">Hoe donkerder, hoe meer je die dag gedaan hebt.</div></div>`;

  main.innerHTML = html;
  const b = $('#demoBtn'); if (b) b.onclick = () => { demo = !demo; demoLog.cache = null; render(true); };
}
function insights(lg, today) {
  const out = [];
  // beste dag van de week
  const per = Array.from({ length: 7 }, () => [0, 0]);
  for (let i = 0; i < 56; i++) { const d = addDays(today, -i), r = dayRate(lg, d); if (r !== null && Object.keys(lg).some(k => k <= dayKey(d))) { per[d.getDay()][0] += r; per[d.getDay()][1]++; } }
  const avg = per.map(([s, n]) => n ? s / n : -1);
  const best = avg.indexOf(Math.max(...avg)), worst = avg.indexOf(Math.min(...avg.filter(x => x >= 0)));
  if (totalDone(lg) >= 5 && best !== worst) out.push(['📅', `Op ${DAYS[best]} doe je het best`, `Op ${DAYS[worst]} lukt het het minst vaak (${Math.round(avg[worst] * 100)}%). Misschien daar een extra seintje?`]);
  // stiptheid
  let off = [], h0 = null;
  for (const [k, v] of Object.entries(lg)) for (const [id, e] of Object.entries(v)) { const h = habits.find(x => x.id === id); if (h && e.at) off.push(mins(e.at) - mins(h.time)); }
  if (off.length >= 3) {
    const m = Math.round(off.reduce((a, b) => a + b, 0) / off.length);
    out.push(['⏱️', m <= 5 && m >= -5 ? 'Je bent heel stipt' : m > 0 ? `Gemiddeld ${m} minuten na het geplande uur` : `Gemiddeld ${-m} minuten vóór het geplande uur`,
      m > 30 ? 'Misschien past een later uur beter bij je dag.' : 'Je seintje komt op een goed moment.']);
  }
  // sterkste en zwakste gewoonte
  if (habits.length > 1) {
    const rs = habits.map(h => [h, rangeRate(lg, addDays(today, -29), 30, h.id)]).sort((a, b) => b[1] - a[1]);
    out.push(['🏆', `${rs[0][0].icon} ${rs[0][0].name} gaat het best`, `${Math.round(rs[0][1] * 100)}% van de geplande dagen. ${rs.at(-1)[0].name} zit op ${Math.round(rs.at(-1)[1] * 100)}%.`]);
  }
  // trend
  const a = rangeRate(lg, addDays(today, -13), 14), b = rangeRate(lg, addDays(today, -27), 14);
  if (b > 0) out.push([a >= b ? '📈' : '📉', a >= b ? 'Je gaat vooruit' : 'Iets minder dan eerder', `De laatste 2 weken ${Math.round(a * 100)}%, de 2 weken daarvoor ${Math.round(b * 100)}%.`]);
  if (!out.length) out.push(['🌱', 'Goed begonnen', 'Vink een paar dagen af, dan zie je hier wat opvalt: je beste dag, of je op tijd bent en of je vooruitgaat.']);
  return out;
}

// ---------- foto's ----------
function renderPhotos() {
  const items = [];
  for (const k of Object.keys(log).sort().reverse()) for (const [id, v] of Object.entries(log[k])) if (v.photo) { const h = habits.find(x => x.id === id); items.push({ k, v, h }); }
  head("Foto's", items.length ? `${items.length} foto${items.length === 1 ? '' : "'s"} van je gewoontes` : 'Je fotodagboek');
  if (!items.length) { main.innerHTML = `<div class="card empty"><div class="big">📸</div>Nog geen foto's.<br>Tik op het fototoestel naast een gewoonte bij <b>Vandaag</b>.</div>`; return; }
  const byMonth = {};
  for (const it of items) (byMonth[it.k.slice(0, 7)] = byMonth[it.k.slice(0, 7)] || []).push(it);
  main.innerHTML = Object.entries(byMonth).map(([m, its]) => `<div class="h2">${new Date(m + '-15').toLocaleDateString('nl-BE', { month: 'long', year: 'numeric' })}</div>
    <div class="gallery">${its.map(it => { const d = new Date(it.k + 'T12:00'); const cap = `${it.h ? it.h.name : ''} · ${d.toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' })}`; return `<figure><img data-photo="${it.v.photo}" data-cap="${esc(cap)}" alt=""><figcaption>${it.h ? it.h.icon : ''} ${d.getDate()}/${d.getMonth() + 1}</figcaption></figure>`; }).join('')}</div>`).join('');
  loadThumbs();
}

// ---------- gewoontes beheren ----------
let openId = null;
function editor(h) {
  return `<div class="stack">
    <div><label for="n-${h.id}">Wat</label><input type="text" id="n-${h.id}" class="hn" value="${esc(h.name)}"></div>
    <div class="row"><div><label for="t-${h.id}">Hoe laat</label><input type="time" id="t-${h.id}" class="ht" value="${h.time}"></div>
      ${h.id !== 'new' ? '<div style="flex:0 0 auto"><button class="btn danger del">Wis</button></div>' : ''}</div>
    <div><label>Op welke dagen</label><div class="chips">${ALL_DAYS.map(d => `<button class="chip ${h.days.includes(d) ? 'on' : ''}" data-d="${d}" aria-pressed="${h.days.includes(d)}">${SHORT[d]}</button>`).join('')}</div>
      <div class="quick"><button data-q="all">Elke dag</button><button data-q="week">Weekdagen</button><button data-q="weekend">Weekend</button></div></div>
    <div class="row"><div><label for="s-${h.id}">Vanaf</label><input type="date" id="s-${h.id}" class="hs" value="${h.start}"></div>
      <div><label for="e-${h.id}">Hoe lang</label><select id="e-${h.id}" class="he">
        <option value="never" ${h.endType === 'never' ? 'selected' : ''}>Altijd</option>
        <option value="until" ${h.endType === 'until' ? 'selected' : ''}>Tot een datum</option>
        <option value="count" ${h.endType === 'count' ? 'selected' : ''}>Aantal keer</option></select></div></div>
    ${h.endType === 'until' ? `<div><label for="u-${h.id}">Tot en met</label><input type="date" id="u-${h.id}" class="hu" value="${h.until || ''}" min="${h.start}"></div>` : ''}
    ${h.endType === 'count' ? `<div><label for="c-${h.id}">Hoeveel keer in totaal</label><input type="number" inputmode="numeric" min="1" max="999" id="c-${h.id}" class="hc" value="${h.count || ''}" placeholder="bv. 30"></div>` : ''}
    <div><label>Kleur</label><div class="swatches">${COLORS.map(c => `<button class="sw ${h.color === c ? 'on' : ''}" data-c="${c}" style="--c:var(--c-${c})" aria-label="${c}"></button>`).join('')}</div></div>
    <div><label>Icoon</label><div class="icons">${ICONS.map(i => `<button class="ic ${h.icon === i ? 'on' : ''}" data-i="${i}">${i}</button>`).join('')}</div></div></div>`;
}
let draft = null;
function renderHabits() {
  head('Gewoontes', 'Begin klein. Eén of twee is genoeg.');
  draft = draft || { id: 'new', name: '', time: '12:00', days: [...ALL_DAYS], start: dayKey(), endType: 'never', color: COLORS[habits.length % COLORS.length], icon: ICONS[(habits.length + 1) % ICONS.length] };
  let html = sortedHabits().map(h => `<div class="card ${openId === h.id ? 'open' : ''}" data-id="${h.id}" style="--hc:${col(h)}">
      <div class="edit-head"><div class="icon">${h.icon}</div><div class="name">${esc(h.name)}<div class="small">${finished(h) ? '✓ afgelopen · ' : ''}${planText(h)}</div></div>
      <svg class="chev" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></div>
      ${openId === h.id ? `<div class="edit-body">${editor(h)}</div>` : ''}</div>`).join('');
  html += `<div class="h2">Nieuwe gewoonte</div><div class="card" data-id="new">${editor(draft).replace('<div class="stack">', '<div class="stack">')}
    <button class="btn" id="add" style="margin-top:14px">Toevoegen</button></div>`;
  html += `<div class="h2">Jouw naam</div><div class="card"><input type="text" id="nameEdit" value="${esc(NAME)}" aria-label="Jouw naam"></div>`;
  if (PREVIEW) html += `<div class="card"><b>Herinneringen en reservekopie</b>
      <p class="small" style="margin-bottom:0">Dit is de voorbeeldversie. Herinneringen in je agenda, meldingen en een reservekopie werken pas in de echte app op je beginscherm.</p></div>`;
  else html += `<div class="h2">Herinneringen</div><div class="card stack">
      <p class="small" style="margin:0">Zet je gewoontes in de agenda van je telefoon. Die stuurt je dan op de gekozen dagen en het juiste uur een berichtje, ook als deze app dicht is. Doe dit opnieuw als je iets verandert.</p>
      <div class="small" style="background:var(--bg);border-radius:12px;padding:10px 12px"><b style="color:var(--ink)">Dit komt in je agenda:</b><br>${sortedHabits().filter(h => !finished(h)).map(h => `${h.icon} ${esc(h.name)}: ${planText(h)}`).join('<br>') || 'Niets: geen lopende gewoontes.'}</div>
      <button class="btn" id="ics">📆 Zet herinneringen in mijn agenda</button>
      <details class="small"><summary style="cursor:pointer;font-weight:700;color:var(--brand-2)">Herinneringen weer uit je agenda halen?</summary>
        <p style="margin:8px 0 0">De app kan je agenda zelf niet aanpassen, maar het gaat zo, per gewoonte:<br>
        1. Open de app <b>Agenda</b> en tik op de afspraak van je gewoonte.<br>
        2. Tik onderaan op <b>Verwijder activiteit</b>.<br>
        3. Kies <b>Verwijder alle toekomstige activiteiten</b>.</p></details>
      <button class="btn ghost" id="notif">🔔 Meldingen in de app toestaan</button>
      <p class="small" id="notifState" style="margin:0"></p></div>
    <div class="h2">Reservekopie</div><div class="card stack">
      <p class="small" style="margin:0">Alles staat enkel op deze telefoon. Bewaar af en toe een kopie (zonder foto's).</p>
      <button class="btn ghost" id="export">💾 Kopie bewaren</button>
      <button class="btn ghost" id="import">📂 Kopie terugzetten</button>
      <input type="file" id="importFile" accept="application/json" hidden></div>
    <p class="small" style="text-align:center;margin:4px 0 0">Elke Dag · versie ${VERSION}</p>`;
  main.innerHTML = html;

  main.querySelectorAll('.card[data-id]').forEach(el => {
    const id = el.dataset.id, h = id === 'new' ? draft : habits.find(x => x.id === id);
    const hd = el.querySelector('.edit-head'); if (hd) hd.onclick = () => { openId = openId === id ? null : id; render(); };
    const hn = el.querySelector('.hn'); if (!hn) return;
    hn.oninput = e => { h.name = e.target.value; };
    hn.onchange = e => { h.name = e.target.value.trim() || h.name; if (id !== 'new') { save(); render(); } };
    el.querySelector('.ht').onchange = e => { if (e.target.value) { h.time = e.target.value; if (id !== 'new') { save(); render(); } } };
    const upd = () => { if (id !== 'new') { save(); demoLog.cache = null; } render(); };
    el.querySelectorAll('.chip').forEach(b => b.onclick = () => {
      const d = Number(b.dataset.d);
      if (h.days.includes(d)) { if (h.days.length > 1) h.days = h.days.filter(x => x !== d); } else h.days = [...h.days, d];
      upd();
    });
    el.querySelectorAll('.quick button').forEach(b => b.onclick = () => { h.days = { all: [...ALL_DAYS], week: [1, 2, 3, 4, 5], weekend: [6, 0] }[b.dataset.q]; upd(); });
    el.querySelector('.hs').onchange = e => { if (e.target.value) { h.start = e.target.value; upd(); } };
    el.querySelector('.he').onchange = e => { h.endType = e.target.value; if (h.endType === 'until' && !h.until) h.until = dayKey(addDays(new Date(h.start + 'T12:00'), 29)); if (h.endType === 'count' && !h.count) h.count = 30; upd(); };
    const hu = el.querySelector('.hu'); if (hu) hu.onchange = e => { if (e.target.value) { h.until = e.target.value; upd(); } };
    const hc = el.querySelector('.hc'); if (hc) hc.onchange = e => { const v = parseInt(e.target.value, 10); if (v > 0) { h.count = v; upd(); } };
    el.querySelectorAll('.sw').forEach(b => b.onclick = () => { h.color = b.dataset.c; if (id !== 'new') save(); render(); });
    el.querySelectorAll('.ic').forEach(b => b.onclick = () => { h.icon = b.dataset.i; if (id !== 'new') save(); render(); });
    const del = el.querySelector('.del');
    if (del) del.onclick = () => {
      if (del.dataset.sure) { habits = habits.filter(x => x !== h); openId = null; save(); render(); return; }
      del.dataset.sure = '1'; del.textContent = 'Zeker wissen?';
      setTimeout(() => { delete del.dataset.sure; del.textContent = 'Wis'; }, 3000);
    };
  });
  $('#nameEdit').onchange = e => { const v = e.target.value.trim(); if (v) { NAME = v; store.set('name', v); } };
  $('#add').onclick = () => {
    const name = draft.name.trim(); if (!name) { $('#n-new').focus(); return; }
    habits.push({ ...draft, id: uid(), name, created: dayKey() }); draft = null; demoLog.cache = null; save(); render();
  };
  if (!PREVIEW) bindTools();
}

function bindTools() {
  $('#ics').onclick = downloadIcs;
  $('#notif').onclick = askNotif;
  $('#notifState').textContent = notifStateText();
  $('#export').onclick = () => download('elkedag-kopie-' + dayKey() + '.json', JSON.stringify({ name: NAME, habits, log }, null, 1), 'application/json');
  $('#import').onclick = () => $('#importFile').click();
  $('#importFile').onchange = async e => {
    try {
      const d = JSON.parse(await e.target.files[0].text());
      if (!Array.isArray(d.habits)) throw 0;
      habits = d.habits; log = d.log || {}; if (d.name) { NAME = d.name; store.set('name', NAME); } save(); tab = 'today'; render(true);
    } catch { $('#notifState').textContent = 'Dat kopiebestand kon ik niet lezen.'; }
  };
}
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// Agenda-bestand (.ics): elke gewoonte als terugkerende afspraak (gekozen dagen, start en einde) van 5 min met een melding op het uur zelf.
function downloadIcs() {
  if (!habits.length) return;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Elke Dag//NL', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  const BY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  for (const h of habits) {
    // eerste geplande dag vanaf vandaag (geen afspraken in het verleden)
    let first = addDays(new Date(Math.max(new Date(h.start + 'T12:00'), addDays(new Date(), 0))), 0);
    for (let i = 0; i < 7 && !h.days.includes(first.getDay()); i++) first = addDays(first, 1);
    const fk = dayKey(first);
    let rule = h.days.length === 7 ? 'FREQ=DAILY' : 'FREQ=WEEKLY;BYDAY=' + [...h.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(d => BY[d]).join(',');
    if (h.endType === 'until' && h.until) { if (h.until < fk) continue; rule += `;UNTIL=${h.until.replace(/-/g, '')}T235959`; }
    if (h.endType === 'count' && h.count) { const left = h.count - occurrence(h, addDays(first, -1)); if (left <= 0) continue; rule += `;COUNT=${left}`; }
    const d = fk.replace(/-/g, '');
    const [hh, mm] = h.time.split(':');
    const endMin = Number(hh) * 60 + Number(mm) + 5;
    const end = String(Math.floor(endMin / 60) % 24).padStart(2, '0') + String(endMin % 60).padStart(2, '0');
    const text = `Hé ${NAME}, het is ${hourText(h.time)}: ${h.name}`;
    lines.push('BEGIN:VEVENT', `UID:elkedag-${h.id}@elkedag`, `DTSTAMP:${stamp}`,
      `DTSTART:${d}T${hh}${mm}00`, `DTEND:${d}T${end}00`, 'RRULE:' + rule,
      `SUMMARY:${icsEsc(h.icon + ' ' + h.name)}`, `DESCRIPTION:${icsEsc(text + '. Vink het af in Elke Dag.')}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(text)}`, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  download('elkedag-herinneringen.ics', lines.join('\r\n'), 'text/calendar');
}
function icsEsc(s) { return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }

// ---------- meldingen terwijl de app open is ----------
function notifStateText() {
  if (!('Notification' in window)) return 'Meldingen in de app werken hier niet. Gebruik de agenda-herinneringen hierboven.';
  return { granted: 'Meldingen staan aan (werkt wanneer de app open is).', denied: 'Meldingen zijn geweigerd. Je kan dit aanpassen in de instellingen van je telefoon.', default: '' }[Notification.permission];
}
async function askNotif() {
  if (!('Notification' in window)) { $('#notifState').textContent = notifStateText(); return; }
  const p = await Notification.requestPermission();
  if (p === 'granted') notify('Top! 👍', `Zo krijg je een seintje, ${NAME}.`);
  render();
}
async function notify(title, body) {
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg) return reg.showNotification(title, { body, icon: 'ring-192.png', badge: 'ring-192.png', tag: title });
    new Notification(title, { body, icon: 'ring-192.png' });
  } catch { }
}
function checkReminders() {
  if (PREVIEW) return;
  const k = dayKey(), hm = nowHM();
  notified[k] = notified[k] || [];
  for (const h of habits) {
    if (scheduled(h, addDays(new Date(), 0)) && h.time <= hm && !log[k]?.[h.id] && !notified[k].includes(h.id)) {
      notified[k].push(h.id);
      if ('Notification' in window && Notification.permission === 'granted') notify(`Hé ${NAME}! ⏰`, `Het is ${hourText(h.time)}: ${h.name}.`);
    }
  }
  for (const d of Object.keys(notified)) if (d < k) delete notified[d];
  save();
}

// ---------- start ----------
if (!PREVIEW && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
render(true);
checkReminders();
setInterval(() => { checkReminders(); if (tab === 'today' && !document.activeElement?.matches('input')) renderToday(); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkReminders(); if (tab === 'today') render(); } });
