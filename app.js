// Elke Dag – app om dagelijkse gezonde gewoontes op te volgen.
// Alles blijft op de telefoon zelf: gewoontes en vinkjes in localStorage, foto's in IndexedDB.

const VERSION = 26;
const PREVIEW = !!window.PREVIEW; // voorbeeldversie: geen agenda-bestand, meldingen of kopieën
const $ = s => document.querySelector(s);
const main = $('#main');
const COLORS = ['teal', 'coral', 'indigo', 'amber', 'rose', 'sky'];
const ICONS = ['💪', '🚶', '🏃', '🧘', '🦵', '💧', '🍎', '🥦', '😴', '🫁', '📖', '🦷', '💊', '☀️'];
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 0]; // ma t/m zo

// ---------- taal: Nederlands (standaard), English, Français ----------
const LANGS = { nl: 'nl-BE', en: 'en-GB', fr: 'fr-BE' };
let LANG = (() => { try { const l = JSON.parse(localStorage.getItem('lang')); return LANGS[l] ? l : 'nl'; } catch { return 'nl'; } })();
function T(nl, en, fr) { return LANG === 'en' ? en : LANG === 'fr' ? fr : nl; }
function LOC() { return LANGS[LANG]; }
const SHORTS = { nl: ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'], en: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'], fr: ['di', 'lu', 'ma', 'me', 'je', 've', 'sa'] };
const DAYSS = { nl: ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'], en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], fr: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'] };
let SHORT = SHORTS[LANG], DAYS = DAYSS[LANG];
function setLang(l) {
  if (!LANGS[l]) return;
  LANG = l; SHORT = SHORTS[l]; DAYS = DAYSS[l];
  try { localStorage.setItem('lang', JSON.stringify(l)); } catch { }
  document.documentElement.lang = l;
  document.querySelectorAll('nav [data-t]').forEach(el => el.textContent = { today: T('Vandaag', 'Today', "Aujourd'hui"), overview: T('Overzicht', 'Overview', 'Aperçu'), photos: T("Foto's", 'Photos', 'Photos'), habits: T('Gewoontes', 'Habits', 'Habitudes') }[el.dataset.t]);
  document.querySelectorAll('#langs button').forEach(b => { b.classList.toggle('on', b.dataset.l === l); b.setAttribute('aria-pressed', b.dataset.l === l); });
  const u = document.getElementById('upd'); if (u) u.textContent = updText();
}
function updText() { return T('✨ Nieuwe versie van Elke Dag. Tik om te vernieuwen.', '✨ New version of Elke Dag. Tap to refresh.', '✨ Nouvelle version d’Elke Dag. Touchez pour actualiser.'); }

// ---------- opslag ----------
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } }
};
let NAME = store.get('name', '');
let habits = store.get('habits', null);
if (!habits) habits = [{ id: uid(), name: '1 minuut armspieroefeningen', time: '10:00', color: 'teal', icon: '💪' }];
habits.forEach((h, i) => { h.color = h.color || COLORS[i % COLORS.length]; h.icon = h.icon || ICONS[i % ICONS.length]; h.created = h.created || dayKey(); h.days = h.days || [...ALL_DAYS]; h.start = h.start || h.created; h.endType = h.endType || 'never'; if (h.timer === undefined) h.timer = /zen/i.test(h.name); });
let log = store.get('log', {});          // { 'YYYY-MM-DD': { habitId: { at, photo } } }
let notified = store.get('notified', {}); // { 'YYYY-MM-DD': [habitId] }
let demo = false;                         // voorbeeldgegevens tonen in het overzicht
save();

function uid() { return Math.random().toString(36).slice(2, 10); }
function dayKey(d = new Date()) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function addDays(d, n) { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() + n); return x; }
function save() { store.set('habits', habits); store.set('log', log); store.set('notified', notified); }
// Wanneer: een vast uur ('time'), de voormiddag ('am'), de namiddag ('pm') of in de loop van de dag ('any').
const PART = {
  am: { from: '09:00', to: '12:00', get text() { return T('in de voormiddag', 'in the morning', 'dans la matinée'); }, get short() { return T('deze voormiddag', 'this morning', 'ce matin'); } },
  pm: { from: '13:00', to: '18:00', get text() { return T('in de namiddag', 'in the afternoon', "dans l'après-midi"); }, get short() { return T('deze namiddag', 'this afternoon', 'cet après-midi'); } }
};
function whenOf(h) { return h.when || (h.anytime ? 'any' : 'time'); }
function remindAt(h) { const w = whenOf(h); return w === 'time' ? h.time : PART[w] ? PART[w].from : null; } // uur van het seintje
function lateAt(h) { const w = whenOf(h); return w === 'time' ? h.time : PART[w] ? PART[w].to : null; }      // vanaf wanneer "nog te doen"
function sortKey(h) { return remindAt(h) || '99'; }
function sortedHabits() { return [...habits].sort((a, b) => sortKey(a).localeCompare(sortKey(b))); }
function whenText(h) { const w = whenOf(h); return w === 'time' ? hourText(h.time) : PART[w] ? PART[w].text : T('in de loop van de dag', 'any time of day', 'au cours de la journée'); }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function hourText(t) { const [h, m] = t.split(':').map(Number), mm = String(m).padStart(2, '0'); return LANG === 'en' ? `${h}:${mm}` : LANG === 'fr' ? `${h}h${m ? mm : ''}` : m ? `${h}u${mm}` : `${h} uur`; }
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
  if (days.length === 7) return T('elke dag', 'every day', 'tous les jours');
  const s = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  if (s.length === 5 && !s.includes(0) && !s.includes(6)) return T('weekdagen', 'weekdays', 'en semaine');
  if (s.length === 2 && s.includes(0) && s.includes(6)) return T('in het weekend', 'at the weekend', 'le week-end');
  return s.map(d => SHORT[d]).join(', ');
}
function niceDate(k) { return new Date(k + 'T12:00').toLocaleDateString(LOC(), { day: 'numeric', month: 'short', year: k.slice(0, 4) === String(new Date().getFullYear()) ? undefined : 'numeric' }); }
function planText(h) {
  let t = whenOf(h) === 'time' ? `${daysText(h.days)} ${T('om', 'at', 'à')} ${hourText(h.time)}` : `${daysText(h.days)}, ${whenText(h)}`;
  if (h.start > dayKey()) t += ` · ${T('vanaf', 'from', 'à partir du')} ${niceDate(h.start)}`;
  if (h.endType === 'until' && h.until) t += ` · ${T('tot', 'until', "jusqu'au")} ${niceDate(h.until)}`;
  if (h.endType === 'count' && h.count) {
    const done = Math.min(h.count, occurrence(h, addDays(new Date(), -1)) );
    const left = Math.max(0, h.count - done);
    t += ` · ${T(`${h.count} keer (nog ${left})`, `${h.count} times (${left} left)`, `${h.count} fois (encore ${left})`)}`;
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
document.querySelectorAll('nav button').forEach(b => b.onclick = () => { if (b.dataset.tab === 'today' && tab === 'today') dayOff = 0; tab = b.dataset.tab; render(true); });
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
  head(T('Welkom bij Elke Dag', 'Welcome to Elke Dag', 'Bienvenue dans Elke Dag'), T('Kleine gezonde gewoontes, elke dag opnieuw.', 'Small healthy habits, every day again.', 'De petites habitudes saines, chaque jour.'));
  $('#ring').hidden = true;
  main.innerHTML = `<div class="card stack"><div style="font-size:40px">👋</div>
    <div><b>${T('Hoe heet je?', "What's your name?", 'Comment tu t’appelles ?')}</b><div class="small">${T('Dan weet de app wie hij een seintje geeft.', 'So the app knows who to remind.', 'Ainsi l’app sait à qui envoyer un rappel.')}</div></div>
    <input type="text" id="nameIn" autocomplete="given-name" placeholder="${T('Je voornaam', 'Your first name', 'Ton prénom')}">
    <button class="btn" id="nameOk">${T('Aan de slag', "Let's go", 'C’est parti')}</button></div>`;
  const go = () => { const v = $('#nameIn').value.trim(); if (!v) { $('#nameIn').focus(); return; } NAME = v; store.set('name', v); tab = 'today'; render(true); };
  $('#nameOk').onclick = go;
  $('#nameIn').onkeydown = e => { if (e.key === 'Enter') go(); };
}

// ---------- vandaag ----------
function groet(d) { const h = d.getHours(); return (h < 6 ? T('Goeienacht', 'Good night', 'Bonne nuit') : h < 12 ? T('Goeiemorgen', 'Good morning', 'Bonjour') : h < 18 ? T('Goeiemiddag', 'Good afternoon', 'Bon après-midi') : T('Goeienavond', 'Good evening', 'Bonsoir')) + ` ${NAME}`; }
const openNotes = new Set(); // notities die opengeklapt zijn
let dayOff = 0; // 0 = vandaag, -1 = gisteren, 1 = morgen ...
function viewDate() { return addDays(new Date(), dayOff); }
function dayTitle(d) {
  if (dayOff === 0) return groet(new Date());
  if (dayOff === -1) return T('Gisteren', 'Yesterday', 'Hier');
  if (dayOff === 1) return T('Morgen', 'Tomorrow', 'Demain');
  if (dayOff === 2) return T('Overmorgen', 'Day after tomorrow', 'Après-demain');
  const w = DAYS[d.getDay()]; return w.charAt(0).toUpperCase() + w.slice(1);
}
function goDay(n) { dayOff = n; renderToday(); window.scrollTo(0, 0); }
function renderToday() {
  const vd = viewDate(), k = dayKey(vd), done = log[k] || {}, hm = nowHM();
  const isToday = dayOff === 0, future = dayOff > 0;
  const list = sortedHabits().filter(h => scheduled(h, vd) || done[h.id]), n = list.filter(h => done[h.id]).length;
  head(dayTitle(vd), vd.toLocaleDateString(LOC(), { weekday: 'long', day: 'numeric', month: 'long' }));
  const r = 34, c = 2 * Math.PI * r, frac = list.length ? n / list.length : 0;
  $('#ring').innerHTML = `<svg viewBox="0 0 84 84"><circle cx="42" cy="42" r="${r}" stroke="rgba(255,255,255,.2)" stroke-width="8" fill="none"/>
    <circle cx="42" cy="42" r="${r}" stroke="#fff" stroke-width="8" fill="none" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - frac)}" style="transition:stroke-dashoffset .6s"/></svg><b>${n}/${list.length}</b>`;

  let html = `<div class="daynav">
    <button id="dPrev" aria-label="${T('Vorige dag', 'Previous day', 'Jour précédent')}">‹</button>
    <button id="dToday" class="${isToday ? 'on' : ''}">${isToday ? T('Vandaag', 'Today', "Aujourd'hui") : T('↩ Naar vandaag', '↩ Back to today', "↩ Revenir à aujourd'hui")}</button>
    <button id="dNext" aria-label="${T('Volgende dag', 'Next day', 'Jour suivant')}">›</button></div>`;
  if (future) html += `<div class="card small" style="text-align:center">${T('Dit staat gepland. Afvinken kan vanaf die dag zelf.', 'This is planned. You can tick it off on the day itself.', 'C’est prévu. Tu pourras cocher le jour même.')}</div>`;
  if (!future && list.length && n === list.length) html += `<div class="card celebrate"><b>${isToday ? T('Alles gedaan vandaag!', 'All done today!', "Tout fait aujourd'hui !") : T('Alles gedaan die dag!', 'All done that day!', 'Tout fait ce jour-là !')} 🎉</b><span class="small">${T('Goed bezig', 'Well done', 'Bravo')}, ${esc(NAME)}.${isToday ? ' ' + T('Morgen opnieuw.', 'Again tomorrow.', 'On remet ça demain.') : ''}</span></div>`;
  if (isToday && !PREVIEW && !store.get('bannerDone', false)) html += `<div class="banner" id="rb"><div class="e">⏰</div><div><b>${T('Krijg een seintje op het juiste uur', 'Get a reminder at the right time', 'Reçois un rappel au bon moment')}</b><div class="small">${T('Tik hier om de herinneringen in je agenda te zetten.', 'Tap here to add the reminders to your calendar.', 'Touche ici pour ajouter les rappels à ton agenda.')}</div></div></div>`;
  if (!list.length && habits.length) html += `<div class="card empty"><div class="big">☕</div>${isToday ? T('Vandaag staat er niets gepland.', 'Nothing planned for today.', "Rien de prévu aujourd'hui.") : T('Op deze dag staat er niets gepland.', 'Nothing planned for this day.', 'Rien de prévu ce jour-là.')}<br>${T('Een rustdag', 'A rest day', 'Un jour de repos')}, ${esc(NAME)}.</div>`;
  else if (!list.length) html += `<div class="card empty"><div class="big">🌱</div>${T('Nog geen gewoontes.<br>Begin klein: voeg er één toe bij <b>Gewoontes</b>.', 'No habits yet.<br>Start small: add one under <b>Habits</b>.', 'Pas encore d’habitudes.<br>Commence petit : ajoute-en une dans <b>Habitudes</b>.')}</div>`;
  for (const h of list) {
    const d = done[h.id], late = !d && !future && !!lateAt(h) && (dayOff < 0 || lateAt(h) <= hm), s = isToday ? streak(log, h.id) : 0;
    html += `<div class="card habit ${d ? 'done' : ''} ${future ? 'future' : ''}" data-id="${h.id}" style="--hc:${col(h)}">
      <div class="icon">${h.icon}</div>
      <div class="info"><div class="name">${esc(h.name)}</div>
        <div class="meta">${whenText(h)}
          ${d ? `<span class="pill">${T('gedaan', 'done', 'fait')}${d.dur ? ` · ⏱ ${d.dur} min` : ''}</span>` : late ? `<span class="pill late">${dayOff < 0 ? T('niet gedaan', 'not done', 'pas fait') : T('nog te doen', 'still to do', 'à faire')}</span>` : ''}
          ${d && d.note ? `<button class="pill notepill ${openNotes.has(k + h.id) ? 'on' : ''}" aria-label="${T('Toon wat je gedaan hebt', 'Show what you did', 'Voir ce que tu as fait')}">📝</button>` : ''}
          ${s >= 2 ? `<span class="pill fire">🔥 ${s} ${T('dagen', 'days', 'jours')}</span>` : ''}</div>
        ${d ? (d.note ? (openNotes.has(k + h.id) ? `<div class="noteopen"><div class="note">${esc(d.note)}</div><button class="addnote editnote">${T('✎ Aanpassen', '✎ Edit', '✎ Modifier')}</button></div>` : '') : `<button class="addnote editnote">${T('+ Wat heb je gedaan?', '+ What did you do?', '+ Qu’as-tu fait ?')}</button>`) : ''}</div>
      ${h.timer && !d && dayOff === 0 ? `<button class="cam tmr" aria-label="${T('Start timer', 'Start timer', 'Lancer le minuteur')}">⏱</button>` : ''}
      ${future ? '' : d && d.photo ? `<img class="thumb" data-photo="${d.photo}" data-cap="${esc(h.name)}" alt="${T('foto', 'photo', 'photo')}">` : `<button class="cam" aria-label="${T('Foto toevoegen', 'Add photo', 'Ajouter une photo')}">${CAM}</button>`}
      ${future ? '' : `<button class="check" aria-label="${d ? T('Niet gedaan', 'Not done', 'Pas fait') : T('Afvinken', 'Tick off', 'Cocher')}">${CHECK}</button>`}
    </div>`;
  }
  main.innerHTML = html;
  $('#dPrev').onclick = () => goDay(dayOff - 1);
  $('#dNext').onclick = () => goDay(dayOff + 1);
  $('#dToday').onclick = () => goDay(0);
  main.querySelectorAll('.habit').forEach(el => {
    const id = el.dataset.id;
    const ck = el.querySelector('.check'); if (ck) ck.onclick = () => toggle(id, el);
    const pb = el.querySelector('.cam:not(.tmr)'); if (pb) pb.onclick = () => pickPhoto(id);
    const tb = el.querySelector('.tmr'); if (tb) tb.onclick = ev => { ev.stopPropagation(); openTimer(id); };
    const np = el.querySelector('.notepill');
    if (np) np.onclick = ev => { ev.stopPropagation(); openNotes.has(k + id) ? openNotes.delete(k + id) : openNotes.add(k + id); render(); };
    const en = el.querySelector('.editnote');
    if (en) en.onclick = ev => { ev.stopPropagation(); editNote(el, k, id); };
    const ea = el.querySelector('.editat');
    if (ea) ea.onclick = ev => {
      ev.stopPropagation();
      const inp = document.createElement('input');
      inp.type = 'time'; inp.value = log[k][id].at; inp.className = 'attime'; inp.setAttribute('aria-label', T('Hoe laat gedaan', 'Time done', 'Heure'));
      ea.replaceWith(inp); inp.focus();
      const fin = () => { if (inp.value) { log[k][id].at = inp.value; save(); } render(); };
      inp.onchange = fin; inp.onblur = fin;
    };
  });
  const rb = $('#rb'); if (rb) rb.onclick = () => { store.set('bannerDone', true); tab = 'habits'; render(true); };
  loadThumbs();
}
// vegen naar links/rechts = volgende/vorige dag
(() => {
  let x0 = null, y0 = 0;
  main.addEventListener('touchstart', e => { if (tab !== 'today') return; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  main.addEventListener('touchend', e => {
    if (x0 === null || tab !== 'today') return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) goDay(dayOff + (dx < 0 ? 1 : -1));
  }, { passive: true });
})();
// ---------- timer ----------
// Kies de duur, start, en als de tijd om is: geluid, trilling en de gewoonte wordt afgevinkt.
// We rekenen met een eindtijdstip, zodat de timer klopt ook als het scherm even uit ging.
let timer = null; // { id, end, total, paused, left, tick, lock }
function openTimer(id) {
  const h = habits.find(x => x.id === id); if (!h) return;
  const last = store.get('timerMin_' + id, 3);
  const ov = document.createElement('div'); ov.id = 'timerOv'; ov.className = 'timerov';
  ov.innerHTML = `<div class="tbox" style="--hc:${col(h)}">
    <div class="small" style="text-align:center">${h.icon} ${esc(h.name)}</div>
    <div class="tpick"><b>${T('Hoe lang wil je het doen?', 'How long do you want to do it?', 'Combien de temps veux-tu le faire ?')}</b>
      <div class="chips tmins">${[1, 2, 3, 5, 10, 15, 20].map(m => `<button class="chip ${m === last ? 'on' : ''}" data-m="${m}">${m}</button>`).join('')}</div>
      <div class="row" style="align-items:center"><input type="number" inputmode="numeric" min="1" max="180" id="tmCustom" value="${last}" aria-label="${T('Aantal minuten', 'Number of minutes', 'Nombre de minutes')}"><span style="flex:0 0 auto">${T('minuten', 'minutes', 'minutes')}</span></div>
      <button class="btn" id="tmStart">▶ ${T('Start', 'Start', 'Démarrer')}</button></div>
    <div class="trun" hidden>
      <div class="tring"><svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="88" stroke="var(--line)" stroke-width="12" fill="none"/>
        <circle id="tmArc" cx="100" cy="100" r="88" stroke="var(--hc)" stroke-width="12" fill="none" stroke-linecap="round" stroke-dasharray="553" stroke-dashoffset="0" transform="rotate(-90 100 100)"/></svg>
        <b id="tmLeft">3:00</b></div>
      <div class="row"><button class="btn ghost" id="tmPause">⏸ ${T('Pauze', 'Pause', 'Pause')}</button><button class="btn ghost" id="tmStop">✕ ${T('Stop', 'Stop', 'Arrêter')}</button></div>
      <p class="small" style="text-align:center;margin:0">${T('Laat de app open staan en zet je iPhone niet op stil, dan hoor je de gong.', "Keep the app open and don't put your iPhone on silent, so you'll hear the gong.", 'Laisse l’app ouverte et ne mets pas ton iPhone en silencieux pour entendre le gong.')}</p></div>
    <button class="addnote" id="tmClose" style="align-self:center">${T('Sluiten', 'Close', 'Fermer')}</button></div>`;
  document.body.appendChild(ov);
  ov.querySelectorAll('.tmins .chip').forEach(b => b.onclick = () => { ov.querySelectorAll('.tmins .chip').forEach(x => x.classList.toggle('on', x === b)); $('#tmCustom').value = b.dataset.m; });
  $('#tmStart').onclick = () => { const m = Math.max(1, Math.min(180, parseInt($('#tmCustom').value, 10) || 3)); store.set('timerMin_' + id, m); startTimer(id, m, false); };
  $('#tmClose').onclick = closeTimer;
  $('#tmStop').onclick = closeTimer;
  $('#tmPause').onclick = () => {
    if (!timer) return;
    if (timer.paused) { timer.end = Date.now() + timer.left; timer.paused = false; $('#tmPause').textContent = '⏸ ' + T('Pauze', 'Pause', 'Pause'); if (timer.music) startMusic(); }
    else { timer.left = timer.end - Date.now(); timer.paused = true; $('#tmPause').textContent = '▶ ' + T('Verder', 'Resume', 'Reprendre'); stopMusic(); }
  };
}
// ---------- klank: gong aan het einde en rustige muziek tijdens de timer (alles zelf opgewekt, geen bestanden) ----------
let audioCtx = null, master = null, music = null;
function ac() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = audioCtx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4;
    master = audioCtx.createGain(); master.gain.value = 1; master.connect(comp); comp.connect(audioCtx.destination);
  }
  audioCtx.resume?.(); return audioCtx;
}
// één klankschaal-slag: grondtoon + boventonen die traag uitsterven
function bowl(t, f = 196, vol = 0.9, len = 6) {
  const c = ac();
  [[1, 1], [2.76, 0.45], [5.4, 0.22], [8.9, 0.1]].forEach(([m, v], i) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = f * m; o.detune.value = (i % 2 ? 4 : -4);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * v, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len / (1 + i * 0.6));
    o.connect(g); g.connect(master); o.start(t); o.stop(t + len);
  });
}
function gong() {
  try { const c = ac(), t = c.currentTime + 0.05; bowl(t, 174.6, 1, 14); } catch { } // één slag die lang nagalmt
  if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 600]);
}
const beep = gong;
// rustige muziek: zachte akkoorden die langzaam wisselen, met af en toe een belletje
function startMusic() {
  try {
    stopMusic();
    const c = ac(), out = c.createGain(); out.gain.value = 0.0001; out.connect(master);
    out.gain.exponentialRampToValueAtTime(0.35, c.currentTime + 3);
    const chords = [[220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7], [164.8, 196, 246.9]];
    const bells = [440, 493.9, 587.3, 659.3, 784];
    const voices = [0, 1, 2].map(i => {
      const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o2.type = 'triangle'; o2.detune.value = 7; g.gain.value = 0.12;
      o.connect(g); o2.connect(g); g.connect(out); o.start(); o2.start(); return { o, o2, g };
    });
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.08; lg.gain.value = 0.05; lfo.connect(lg); voices.forEach(v => lg.connect(v.g.gain)); lfo.start();
    let n = 0;
    const step = () => {
      const ch = chords[n++ % chords.length], t = c.currentTime;
      voices.forEach((v, i) => { v.o.frequency.setTargetAtTime(ch[i], t, 1.5); v.o2.frequency.setTargetAtTime(ch[i] / 2, t, 1.5); });
      if (Math.random() < 0.7) { const f = bells[Math.floor(Math.random() * bells.length)]; const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t + 1); g.gain.exponentialRampToValueAtTime(0.08, t + 1.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 5); o.connect(g); g.connect(out); o.start(t + 1); o.stop(t + 5.2); }
    };
    step();
    music = { out, voices, lfo, iv: setInterval(step, 8000) };
  } catch { }
}
function stopMusic() {
  if (!music) return;
  const m = music; music = null; clearInterval(m.iv);
  try { const t = audioCtx.currentTime; m.out.gain.cancelScheduledValues(t); m.out.gain.setValueAtTime(Math.max(0.0001, m.out.gain.value), t); m.out.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    setTimeout(() => { m.voices.forEach(v => { v.o.stop(); v.o2.stop(); }); m.lfo.stop(); m.out.disconnect(); }, 1700); } catch { }
}
async function startTimer(id, m, withMusic) {
  try { ac(); } catch { } // geluid "ontgrendelen" bij de tik
  if (withMusic) startMusic();
  const ov = $('#timerOv'); ov.querySelector('.tpick').hidden = true; ov.querySelector('.trun').hidden = false; $('#tmClose').hidden = true;
  timer = { id, total: m * 60000, end: Date.now() + m * 60000, paused: false, left: 0, min: m, music: withMusic };
  try { timer.lock = await navigator.wakeLock?.request('screen'); } catch { }
  const tick = () => {
    if (!timer) return;
    const left = timer.paused ? timer.left : Math.max(0, timer.end - Date.now());
    const sec = Math.ceil(left / 1000);
    $('#tmLeft').textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    $('#tmArc').setAttribute('stroke-dashoffset', String(553 * (1 - left / timer.total)));
    if (!timer.paused && left <= 0) return finishTimer();
    timer.tick = requestAnimationFrame(tick);
  };
  tick();
}
function finishTimer() {
  const { id, min } = timer; stopTimerOnly();
  beep();
  const k = dayKey(); log[k] = log[k] || {};
  log[k][id] = { ...(log[k][id] || {}), at: (log[k][id] && log[k][id].at) || nowHM(), dur: min };
  save(); demoLog.cache = null;
  const ov = $('#timerOv');
  if (ov) {
    ov.querySelector('.trun').innerHTML = `<div style="text-align:center;font-size:56px">🎉</div><b style="text-align:center;font-size:20px">${T(`Klaar! ${min} minuten gedaan.`, `Done! ${min} minutes completed.`, `Terminé ! ${min} minutes faites.`)}</b><div class="small" style="text-align:center">${T('Afgevinkt voor vandaag.', 'Ticked off for today.', "Coché pour aujourd'hui.")}</div>`;
    $('#tmClose').hidden = false; $('#tmClose').textContent = T('Sluiten', 'Close', 'Fermer');
  }
  dayOff = 0; render();
}
function stopTimerOnly() { stopMusic(); if (!timer) return; cancelAnimationFrame(timer.tick); try { timer.lock?.release(); } catch { } timer = null; }
function closeTimer() { stopTimerOnly(); $('#timerOv')?.remove(); render(); }

function editNote(el, k, id) {
  const box = document.createElement('div'); box.className = 'notebox';
  box.innerHTML = `<textarea rows="3" placeholder="${T('bv. 30 keer curls, 3 x 10 push-ups…', 'e.g. 30 curls, 3 x 10 push-ups…', 'ex. 30 curls, 3 x 10 pompes…')}" aria-label="${T('Wat heb je gedaan?', 'What did you do?', 'Qu’as-tu fait ?')}"></textarea><button class="btn" style="padding:10px">${T('Bewaar', 'Save', 'Enregistrer')}</button>`;
  const ta = box.querySelector('textarea'); ta.value = log[k][id].note || '';
  (el.querySelector('.noteopen') || el.querySelector('.editnote')).replaceWith(box); ta.focus();
  const fin = () => { const v = ta.value.trim(); if (v) log[k][id].note = v; else delete log[k][id].note; save(); render(); };
  box.querySelector('button').onclick = ev => { ev.stopPropagation(); fin(); };
  ta.onclick = ev => ev.stopPropagation();
}
function doneAt(h) { return dayOff === 0 ? nowHM() : (h && remindAt(h)) || '12:00'; }
async function toggle(id, el) {
  const k = dayKey(viewDate()); log[k] = log[k] || {};
  if (log[k][id]) { if (log[k][id].photo) await photoDel(log[k][id].photo); delete log[k][id]; }
  else { log[k][id] = { at: doneAt(habits.find(x => x.id === id)) }; if (navigator.vibrate) navigator.vibrate(30); }
  save(); demoLog.cache = null;
  el.classList.toggle('done', !!log[k][id]); el.querySelector('.check').classList.add('pop');
  const nowDone = !!log[k][id];
  setTimeout(() => { render(); if (nowDone && tab === 'today') { const c = main.querySelector(`.habit[data-id="${id}"]`); if (c && c.querySelector('.addnote')) editNote(c, k, id); } }, 380);
}
let photoTarget = null;
function pickPhoto(id) { photoTarget = id; $('#photoInput').value = ''; $('#photoInput').click(); }
$('#photoInput').onchange = async e => {
  const f = e.target.files[0]; if (!f || !photoTarget) return;
  const k = dayKey(viewDate()), key = k + '_' + photoTarget;
  await photoPut(key, await shrink(f));
  log[k] = log[k] || {};
  log[k][photoTarget] = log[k][photoTarget] || { at: doneAt(habits.find(x => x.id === photoTarget)) };
  log[k][photoTarget].photo = key;
  save(); render();
};
async function loadThumbs() {
  for (const img of main.querySelectorAll('img[data-photo]')) {
    const src = await photoGet(img.dataset.photo);
    if (src) { img.src = src; (img.closest('figure, .habit, .prow') || img).addEventListener('click', ev => { if (ev.target.closest('.check, .editat, .editnote, .notebox, .notepill, .noteopen, input')) return; if (ev.target === img || img.closest('figure')) openViewer(src, img.dataset.cap); }); }
  }
}
function openViewer(src, cap) { $('#viewer img').src = src; $('#viewerCap').textContent = cap || ''; $('#viewer').style.display = 'flex'; }
$('#viewer').onclick = () => $('#viewer').style.display = 'none';

// ---------- overzicht en analyse ----------
function renderOverview() {
  const lg = L(), today = addDays(new Date(), 0);
  const days = Object.keys(log).filter(k => Object.keys(log[k]).length).length;
  head(T('Overzicht', 'Overview', 'Aperçu'), demo ? T('Met voorbeeldgegevens', 'With sample data', 'Avec des données d’exemple') : T('Hoe gaat het met je gewoontes?', 'How are your habits going?', 'Où en sont tes habitudes ?'));
  let html = '';
  if (!habits.length) { main.innerHTML = `<div class="card empty"><div class="big">📊</div>${T('Voeg eerst een gewoonte toe.', 'Add a habit first.', 'Ajoute d’abord une habitude.')}</div>`; return; }
  if (demo) html += `<div class="demo"><div style="flex:1">${T('Dit zijn <b>voorbeeldgegevens</b>, zodat je ziet hoe het overzicht eruitziet.', 'This is <b>sample data</b>, so you can see what the overview looks like.', 'Ce sont des <b>données d’exemple</b>, pour voir à quoi ressemble l’aperçu.')}</div><button id="demoBtn">${T('Toon mijn echte', 'Show my own', 'Voir les miennes')}</button></div>`;

  // tegels
  const wk = rangeRate(lg, addDays(today, -6), 7), prev = rangeRate(lg, addDays(today, -13), 7);
  const diff = Math.round((wk - prev) * 100);
  const bestNow = Math.max(0, ...habits.map(h => streak(lg, h.id)));
  html += `<div class="tiles">
    <div class="tile"><div class="v">${Math.round(wk * 100)}%</div><div class="l">${T('gedaan deze week', 'done this week', 'fait cette semaine')}</div>${prev || wk ? `<div class="d ${diff >= 0 ? 'up' : 'down'}">${diff >= 0 ? '▲' : '▼'} ${Math.abs(diff)}% ${T('t.o.v. vorige', 'vs last week', 'vs semaine passée')}</div>` : ''}</div>
    <div class="tile"><div class="v">🔥${bestNow}</div><div class="l">${T('dagen op rij, langste lopende reeks', 'days in a row, longest current streak', 'jours d’affilée, plus longue série en cours')}</div></div>
    <div class="tile"><div class="v">${totalDone(lg)}</div><div class="l">${T('keer afgevinkt in totaal', 'times ticked off in total', 'fois cochées au total')}</div></div></div>`;

  // staafgrafiek 14 dagen
  const W = 320, H = 130, pad = 18, bw = (W - 8) / 14;
  let bars = '';
  for (let i = 0; i < 14; i++) {
    const d = addDays(today, i - 13), r = dayRate(lg, d) ?? 0, bh = Math.max(3, r * (H - pad - 10)), x = 4 + i * bw;
    bars += `<g class="daybar" data-off="${i - 13}" role="button" aria-label="${T('Toon', 'Show', 'Voir')} ${d.toLocaleDateString(LOC(), { weekday: 'long', day: 'numeric', month: 'long' })}"><rect x="${x}" y="0" width="${bw}" height="${H}" fill="transparent"/>
      <rect x="${x + 3}" y="${H - pad - bh}" width="${bw - 6}" height="${bh}" rx="4" fill="${sel.bar === i - 13 ? 'var(--gold)' : i === 13 ? 'var(--brand-2)' : 'color-mix(in srgb,var(--brand-2) 55%,var(--line))'}"/>
      <text x="${x + bw / 2}" y="${H - 4}" text-anchor="middle">${DAYS[d.getDay()].slice(0, 2)}</text></g>`;
  }
  const grid = [0, .5, 1].map(f => `<line x1="0" x2="${W}" y1="${H - pad - f * (H - pad - 10)}" y2="${H - pad - f * (H - pad - 10)}" stroke="var(--line)" stroke-dasharray="${f ? '3 3' : ''}"/>`).join('');
  html += `<div class="card chart"><div class="legend"><b>${T('Laatste 2 weken', 'Last 2 weeks', '2 dernières semaines')}</b><span class="small">${T('tik op een dag', 'tap a day', 'touche un jour')}</span></div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${T('Percentage gedaan per dag, laatste 14 dagen', 'Percentage done per day, last 14 days', 'Pourcentage fait par jour, 14 derniers jours')}">${grid}${bars}</svg>${sel.bar !== null ? dayPanel(lg, sel.bar) : ''}</div>`;

  // inzichten

  html += `<div class="h2">${T('Wat valt op', 'What stands out', 'Ce qui ressort')}</div><div class="card">${insights(lg, today).map(i => `<div class="insight"><div class="e">${i[0]}</div><div><b>${i[1]}</b><span class="small">${i[2]}</span></div></div>`).join('')}</div>`;

  // per gewoonte
  html += `<div class="h2">${T('Per gewoonte · 30 dagen', 'Per habit · 30 days', 'Par habitude · 30 jours')}</div>`;
  for (const h of sortedHabits()) {
    const r = rangeRate(lg, addDays(today, -29), 30, h.id);
    let dots = ''; for (let i = 29; i >= 0; i--) { const dd = addDays(today, -i); dots += `<i class="${isDone(lg, dd, h.id) ? 'on' : scheduled(h, dd) ? '' : 'off'}"></i>`; }
    html += `<div class="card" style="--hc:${col(h)}"><div class="hrow"><div class="icon">${h.icon}</div>
      <div style="flex:1;min-width:0"><b>${esc(h.name)}</b><div class="small">🔥 ${streak(lg, h.id)} ${T('op rij', 'in a row', 'd’affilée')} · record ${bestStreak(lg, h.id)}</div></div>
      <div class="pct">${Math.round(r * 100)}%</div></div><div class="dots">${dots}</div></div>`;
  }

  // heatmap 12 weken
  const start = addDays(today, -(7 * 11) - ((today.getDay() + 6) % 7));
  let cells = '';
  for (let i = 0; i < 84; i++) {
    const d = addDays(start, i);
    if (d > today) { cells += '<i style="background:transparent"></i>'; continue; }
    const r = dayRate(lg, d) ?? 0;
    const off = Math.round((d - today) / 864e5);
    cells += `<i class="dayc" data-off="${off}" title="${dayKey(d)}" style="${sel.heat === off ? 'outline:2px solid var(--gold);outline-offset:1px;' : ''}background:${r ? `color-mix(in srgb,var(--brand-2) ${Math.round(25 + r * 75)}%,var(--line))` : 'var(--line)'}"></i>`;
  }
  html += `<div class="h2">${T('Laatste 12 weken', 'Last 12 weeks', '12 dernières semaines')}</div><div class="card"><div class="heatwrap"><div class="heatdays">${[SHORT[1], '', SHORT[3], '', SHORT[5], '', SHORT[0]].map(x => `<span>${x}</span>`).join('')}</div>
    <div class="heat" style="flex:1">${cells}</div></div><div class="small" style="margin-top:8px">${T('Hoe donkerder, hoe meer je die dag gedaan hebt. Tik op een vakje.', 'The darker, the more you did that day. Tap a square.', 'Plus c’est foncé, plus tu en as fait ce jour-là. Touche une case.')}</div>${sel.heat !== null ? dayPanel(lg, sel.heat) : ''}</div>`;

  main.innerHTML = html;
  main.querySelectorAll('.daybar, .dayc').forEach(el => el.onclick = () => {
    const key = el.classList.contains('daybar') ? 'bar' : 'heat', off = Number(el.dataset.off);
    sel[key] = sel[key] === off ? null : off; renderOverview();
  });
  main.querySelectorAll('.panel-go').forEach(b => b.onclick = () => { dayOff = Number(b.dataset.off); tab = 'today'; render(true); });
  loadThumbs();
  const b = $('#demoBtn'); if (b) b.onclick = () => { demo = !demo; demoLog.cache = null; render(true); };
}
const sel = { bar: null, heat: null }; // aangetikte dag in het overzicht
// klein paneel met de resultaten van één dag, onder de grafiek
function dayPanel(lg, off) {
  const d = addDays(new Date(), off), k = dayKey(d), done = lg[k] || {};
  const list = sortedHabits().filter(h => scheduled(h, d) || done[h.id]);
  const rows = list.map(h => { const e = done[h.id]; return `<div class="prow" style="--hc:${col(h)}"><span class="pmark ${e ? 'ok' : ''}">${e ? '✓' : '–'}</span>
      <div style="flex:1;min-width:0"><b>${h.icon} ${esc(h.name)}</b>${e && e.dur ? `<div class="small">⏱ ${e.dur} min</div>` : ''}${e && e.note ? `<div class="small" style="white-space:pre-wrap">📝 ${esc(e.note)}</div>` : ''}</div>
      ${e && e.photo && !demo ? `<img class="pthumb" data-photo="${e.photo}" data-cap="${esc(h.name)}" alt="">` : ''}</div>`; }).join('');
  const n = list.filter(h => done[h.id]).length;
  return `<div class="panel"><div class="legend" style="margin:0 0 6px"><b>${(t => t.charAt(0).toUpperCase() + t.slice(1))(d.toLocaleDateString(LOC(), { weekday: 'long', day: 'numeric', month: 'long' }))}</b><span class="small">${list.length ? `${n} ${T('van', 'of', 'sur')} ${list.length}` : T('niets gepland', 'nothing planned', 'rien de prévu')}</span></div>
    ${rows || `<div class="small">${T('Op deze dag stond er niets gepland.', 'Nothing was planned on this day.', 'Rien n’était prévu ce jour-là.')}</div>`}
    ${demo ? '' : `<button class="addnote panel-go" data-off="${off}">${T('Open deze dag ›', 'Open this day ›', 'Ouvrir ce jour ›')}</button>`}</div>`;
}
function insights(lg, today) {
  const out = [];
  // beste dag van de week
  const per = Array.from({ length: 7 }, () => [0, 0]);
  for (let i = 0; i < 56; i++) { const d = addDays(today, -i), r = dayRate(lg, d); if (r !== null && Object.keys(lg).some(k => k <= dayKey(d))) { per[d.getDay()][0] += r; per[d.getDay()][1]++; } }
  const avg = per.map(([s, n]) => n ? s / n : -1);
  const best = avg.indexOf(Math.max(...avg)), worst = avg.indexOf(Math.min(...avg.filter(x => x >= 0)));
  if (totalDone(lg) >= 5 && best !== worst) { const pw = Math.round(avg[worst] * 100);
    out.push(['📅', T(`Op ${DAYS[best]} doe je het best`, `${DAYS[best]} is your best day`, `Le ${DAYS[best]}, c’est ton meilleur jour`),
      T(`Op ${DAYS[worst]} lukt het het minst vaak (${pw}%). Misschien daar een extra seintje?`, `${DAYS[worst]} works out least often (${pw}%). Maybe an extra reminder there?`, `Le ${DAYS[worst]}, ça marche le moins souvent (${pw} %). Peut-être un rappel en plus ?`)]); }
  // stiptheid
  let off = [], h0 = null;
  for (const [k, v] of Object.entries(lg)) for (const [id, e] of Object.entries(v)) { const h = habits.find(x => x.id === id); if (h && e.at && whenOf(h) === 'time') off.push(mins(e.at) - mins(h.time)); }
  if (off.length >= 3) {
    const m = Math.round(off.reduce((a, b) => a + b, 0) / off.length);
    out.push(['⏱️', m <= 5 && m >= -5 ? T('Je bent heel stipt', "You're very punctual", 'Tu es très ponctuel') : m > 0 ? T(`Gemiddeld ${m} minuten na het geplande uur`, `On average ${m} minutes after the planned time`, `En moyenne ${m} minutes après l’heure prévue`) : T(`Gemiddeld ${-m} minuten vóór het geplande uur`, `On average ${-m} minutes before the planned time`, `En moyenne ${-m} minutes avant l’heure prévue`),
      m > 30 ? T('Misschien past een later uur beter bij je dag.', 'Maybe a later time suits your day better.', 'Une heure plus tardive conviendrait peut-être mieux.') : T('Je seintje komt op een goed moment.', 'Your reminder comes at a good moment.', 'Ton rappel arrive au bon moment.')]);
  }
  // sterkste en zwakste gewoonte
  if (habits.length > 1) {
    const rs = habits.map(h => [h, rangeRate(lg, addDays(today, -29), 30, h.id)]).sort((a, b) => b[1] - a[1]);
    const p0 = Math.round(rs[0][1] * 100), p1 = Math.round(rs.at(-1)[1] * 100), n0 = `${rs[0][0].icon} ${rs[0][0].name}`, n1 = rs.at(-1)[0].name;
    out.push(['🏆', T(`${n0} gaat het best`, `${n0} is going best`, `${n0} marche le mieux`), T(`${p0}% van de geplande dagen. ${n1} zit op ${p1}%.`, `${p0}% of the planned days. ${n1} is at ${p1}%.`, `${p0} % des jours prévus. ${n1} est à ${p1} %.`)]);
  }
  // trend
  const a = rangeRate(lg, addDays(today, -13), 14), b = rangeRate(lg, addDays(today, -27), 14);
  if (b > 0) { const pa = Math.round(a * 100), pb = Math.round(b * 100);
    out.push([a >= b ? '📈' : '📉', a >= b ? T('Je gaat vooruit', "You're improving", 'Tu progresses') : T('Iets minder dan eerder', 'A bit less than before', 'Un peu moins qu’avant'), T(`De laatste 2 weken ${pa}%, de 2 weken daarvoor ${pb}%.`, `Last 2 weeks ${pa}%, the 2 weeks before ${pb}%.`, `Les 2 dernières semaines ${pa} %, les 2 précédentes ${pb} %.`)]); }
  if (!out.length) out.push(['🌱', T('Goed begonnen', 'Good start', 'Bien commencé'), T('Vink een paar dagen af, dan zie je hier wat opvalt: je beste dag, of je op tijd bent en of je vooruitgaat.', "Tick off a few days and you'll see what stands out here: your best day, whether you're on time and whether you're improving.", 'Coche quelques jours et tu verras ici ce qui ressort : ton meilleur jour, si tu es à l’heure et si tu progresses.')]);
  return out;
}

// ---------- foto's ----------
function renderPhotos() {
  const items = [];
  for (const k of Object.keys(log).sort().reverse()) for (const [id, v] of Object.entries(log[k])) if (v.photo) { const h = habits.find(x => x.id === id); items.push({ k, v, h }); }
  const pl = items.length === 1;
  head(T("Foto's", 'Photos', 'Photos'), items.length ? T(`${items.length} foto${pl ? '' : "'s"} van je gewoontes`, `${items.length} photo${pl ? '' : 's'} of your habits`, `${items.length} photo${pl ? '' : 's'} de tes habitudes`) : T('Je fotodagboek', 'Your photo diary', 'Ton journal photo'));
  if (!items.length) { main.innerHTML = `<div class="card empty"><div class="big">📸</div>${T("Nog geen foto's.<br>Tik op het fototoestel naast een gewoonte bij <b>Vandaag</b>.", 'No photos yet.<br>Tap the camera next to a habit under <b>Today</b>.', "Pas encore de photos.<br>Touche l’appareil photo à côté d’une habitude dans <b>Aujourd'hui</b>.")}</div>`; return; }
  const byMonth = {};
  for (const it of items) (byMonth[it.k.slice(0, 7)] = byMonth[it.k.slice(0, 7)] || []).push(it);
  main.innerHTML = Object.entries(byMonth).map(([m, its]) => `<div class="h2">${new Date(m + '-15').toLocaleDateString(LOC(), { month: 'long', year: 'numeric' })}</div>
    <div class="gallery">${its.map(it => { const d = new Date(it.k + 'T12:00'); const cap = `${it.h ? it.h.name : ''}${it.v.note ? ': ' + it.v.note : ''} · ${d.toLocaleDateString(LOC(), { weekday: 'long', day: 'numeric', month: 'long' })}`; return `<figure><img data-photo="${it.v.photo}" data-cap="${esc(cap)}" alt=""><figcaption>${it.h ? it.h.icon : ''} ${d.getDate()}/${d.getMonth() + 1}</figcaption></figure>`; }).join('')}</div>`).join('');
  loadThumbs();
}

// ---------- gewoontes beheren ----------
let openId = null;
function editor(h) {
  return `<div class="stack">
    <div><label for="n-${h.id}">${T('Wat', 'What', 'Quoi')}</label><input type="text" id="n-${h.id}" class="hn" value="${esc(h.name)}"></div>
    <div class="row"><div><label>${T('Wanneer', 'When', 'Quand')}</label><div class="seg">${[['time', T('Vast uur', 'Set time', 'Heure fixe')], ['am', T('Voormiddag', 'Morning', 'Matin')], ['pm', T('Namiddag', 'Afternoon', 'Après-midi')], ['any', T('Hele dag', 'All day', 'Toute la journée')]].map(([v, t]) => `<button class="${whenOf(h) === v ? 'on' : ''}" data-w="${v}">${t}</button>`).join('')}</div>
      ${whenOf(h) === 'time' ? `<input type="time" id="t-${h.id}" class="ht" value="${h.time}" aria-label="${T('Hoe laat', 'What time', 'À quelle heure')}" style="margin-top:8px">` : ''}</div>
      ${h.id !== 'new' ? '<div style="flex:0 0 auto"><button class="btn danger del">' + T('Wis', 'Delete', 'Supprimer') + '</button></div>' : ''}</div>
    ${planEditor(h, 'g')}
    <label class="anyt"><input type="checkbox" class="htimer" ${h.timer ? 'checked' : ''}> ⏱ ${T('Met timer (kies de duur op het moment zelf)', 'With timer (choose the length when you start)', 'Avec minuteur (choisis la durée sur le moment)')}</label>
    <div><label>${T('Kleur', 'Colour', 'Couleur')}</label><div class="swatches">${COLORS.map(c => `<button class="sw ${h.color === c ? 'on' : ''}" data-c="${c}" style="--c:var(--c-${c})" aria-label="${c}"></button>`).join('')}</div></div>
    <div><label>${T('Icoon', 'Icon', 'Icône')}</label><div class="icons">${ICONS.map(i => `<button class="ic ${h.icon === i ? 'on' : ''}" data-i="${i}">${i}</button>`).join('')}</div></div></div>`;
}
function planEditor(h, p) {
  return `    <div><label>${T('Op welke dagen', 'Which days', 'Quels jours')}</label><div class="chips">${ALL_DAYS.map(d => `<button class="chip ${h.days.includes(d) ? 'on' : ''}" data-d="${d}" aria-pressed="${h.days.includes(d)}">${SHORT[d]}</button>`).join('')}</div>
      <div class="quick"><button data-q="all">${T('Elke dag', 'Every day', 'Tous les jours')}</button><button data-q="week">${T('Weekdagen', 'Weekdays', 'Semaine')}</button><button data-q="weekend">${T('Weekend', 'Weekend', 'Week-end')}</button></div></div>
    <div class="row"><div><label for="s-${p}${h.id}">${T('Vanaf', 'From', 'À partir du')}</label><input type="date" id="s-${p}${h.id}" class="hs" value="${h.start}"></div>
      <div><label for="e-${p}${h.id}">${T('Hoe lang', 'How long', 'Durée')}</label><select id="e-${p}${h.id}" class="he">
        <option value="never" ${h.endType === 'never' ? 'selected' : ''}>${T('Altijd', 'Always', 'Toujours')}</option>
        <option value="until" ${h.endType === 'until' ? 'selected' : ''}>${T('Tot een datum', 'Until a date', "Jusqu'à une date")}</option>
        <option value="count" ${h.endType === 'count' ? 'selected' : ''}>${T('Aantal keer', 'Number of times', 'Nombre de fois')}</option></select></div></div>
    ${h.endType === 'until' ? `<div><label for="u-${p}${h.id}">${T('Tot en met', 'Up to and including', "Jusqu'au")}</label><input type="date" id="u-${p}${h.id}" class="hu" value="${h.until || ''}" min="${h.start}"></div>` : ''}
    ${h.endType === 'count' ? `<div><label for="c-${p}${h.id}">${T('Hoeveel keer in totaal', 'How many times in total', 'Combien de fois au total')}</label><input type="number" inputmode="numeric" min="1" max="999" id="c-${p}${h.id}" class="hc" value="${h.count || ''}" placeholder="${T('bv. 30', 'e.g. 30', 'ex. 30')}"></div>` : ''}`;
}
let draft = null;
function renderHabits() {
  head(T('Gewoontes', 'Habits', 'Habitudes'), T('Begin klein. Eén of twee is genoeg.', 'Start small. One or two is enough.', 'Commence petit. Une ou deux suffisent.'));
  draft = draft || { id: 'new', name: '', time: '12:00', days: [...ALL_DAYS], start: dayKey(), endType: 'never', color: COLORS[habits.length % COLORS.length], icon: ICONS[(habits.length + 1) % ICONS.length] };
  let html = sortedHabits().map(h => `<div class="card ${openId === h.id ? 'open' : ''}" data-id="${h.id}" style="--hc:${col(h)}">
      <div class="edit-head"><div class="icon">${h.icon}</div><div class="name">${esc(h.name)}<div class="small">${finished(h) ? '✓ ' + T('afgelopen', 'finished', 'terminé') + ' · ' : ''}${planText(h)}</div></div>
      <svg class="chev" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></div>
      ${openId === h.id ? `<div class="edit-body">${editor(h)}</div>` : ''}</div>`).join('');
  html += `<div class="h2">${T('Nieuwe gewoonte', 'New habit', 'Nouvelle habitude')}</div><div class="card" data-id="new">${editor(draft).replace('<div class="stack">', '<div class="stack">')}
    <button class="btn" id="add" style="margin-top:14px">${T('Toevoegen', 'Add', 'Ajouter')}</button></div>`;
  html += `<div class="h2">${T('Jouw naam', 'Your name', 'Ton nom')}</div><div class="card"><input type="text" id="nameEdit" value="${esc(NAME)}" aria-label="${T('Jouw naam', 'Your name', 'Ton nom')}"></div>`;
  if (PREVIEW) html += `<div class="card"><b>Herinneringen en reservekopie</b>
      <p class="small" style="margin-bottom:0">Dit is de voorbeeldversie. Herinneringen in je agenda, meldingen en een reservekopie werken pas in de echte app op je beginscherm.</p></div>`;
  else html += `<div class="h2">${T('Herinneringen', 'Reminders', 'Rappels')}</div><div class="card stack">
      <p class="small" style="margin:0">${T('Kies per gewoonte op welke dagen en hoe lang, en zet ze dan in de agenda van je telefoon. Die stuurt je op het juiste uur een berichtje, ook als deze app dicht is.', "Choose the days and how long for each habit, then add it to your phone's calendar. It will send you a message at the right time, even when this app is closed.", 'Choisis pour chaque habitude les jours et la durée, puis ajoute-la à l’agenda de ton téléphone. Il t’enverra un message au bon moment, même si l’app est fermée.')}</p>
    </div>
    ${sortedHabits().map(h => `<div class="card stack" data-plan="${h.id}" style="--hc:${col(h)}">
      <div class="hrow"><div class="icon">${h.icon}</div><div style="flex:1;min-width:0"><b>${esc(h.name)}</b><div class="small">${finished(h) ? '✓ ' + T('afgelopen', 'finished', 'terminé') + ' · ' : ''}${planText(h)}</div></div></div>
      ${planEditor(h, 'r')}
      ${!remindAt(h) ? `<p class="small" style="margin:0">${T('Hele dag, dus geen herinnering in je agenda. Wil je toch een seintje? Kies dan een uur, de voormiddag of de namiddag.', 'All day, so no reminder in your calendar. Want one anyway? Choose a time, the morning or the afternoon.', 'Toute la journée, donc pas de rappel dans ton agenda. Tu en veux un quand même ? Choisis une heure, le matin ou l’après-midi.')}</p>` : `<button class="btn ics1" data-id="${h.id}" ${finished(h) ? 'disabled style="opacity:.5"' : ''}>📆 ${T('In mijn agenda zetten', 'Add to my calendar', 'Ajouter à mon agenda')}</button>`}</div>`).join('')}
    <div class="card stack">
      <button class="btn ghost" id="notif">${notifActive() ? '🔕 ' + T('Meldingen in de app uitzetten', 'Turn off in-app notifications', 'Désactiver les notifications') : '🔔 ' + T('Meldingen in de app aanzetten', 'Turn on in-app notifications', 'Activer les notifications')}</button>
      <p class="small" id="notifState" style="margin:0"></p></div>
    <div class="h2">${T('Reservekopie', 'Backup', 'Sauvegarde')}</div><div class="card stack">
      <p class="small" style="margin:0">${T("Alles staat enkel op deze telefoon. Bewaar af en toe een kopie (zonder foto's).", 'Everything is only on this phone. Save a copy now and then (without photos).', 'Tout est uniquement sur ce téléphone. Fais une copie de temps en temps (sans photos).')}</p>
      <button class="btn ghost" id="export">💾 ${T('Kopie bewaren', 'Save copy', 'Enregistrer une copie')}</button>
      <button class="btn ghost" id="import">📂 ${T('Kopie terugzetten', 'Restore copy', 'Restaurer une copie')}</button>
      <input type="file" id="importFile" accept="application/json" hidden></div>
    <p class="small" style="text-align:center;margin:4px 0 0">Elke Dag · ${T('versie', 'version', 'version')} ${VERSION}</p>`;
  main.innerHTML = html;

  main.querySelectorAll('.card[data-id]').forEach(el => {
    const id = el.dataset.id, h = id === 'new' ? draft : habits.find(x => x.id === id);
    const hd = el.querySelector('.edit-head'); if (hd) hd.onclick = () => { openId = openId === id ? null : id; render(); };
    const hn = el.querySelector('.hn'); if (!hn) return;
    hn.oninput = e => { h.name = e.target.value; };
    hn.onchange = e => { h.name = e.target.value.trim() || h.name; if (id !== 'new') { save(); render(); } };
    el.querySelectorAll('.seg button').forEach(b => b.onclick = () => { h.when = b.dataset.w; delete h.anytime; if (id !== 'new') save(); render(); });
    const ht = el.querySelector('.ht'); if (ht) ht.onchange = e => { if (e.target.value) { h.time = e.target.value; if (id !== 'new') { save(); render(); } } };
    bindPlan(el, h, id);
    el.querySelector('.htimer').onchange = e => { h.timer = e.target.checked; if (id !== 'new') save(); render(); };
    el.querySelectorAll('.sw').forEach(b => b.onclick = () => { h.color = b.dataset.c; if (id !== 'new') save(); render(); });
    el.querySelectorAll('.ic').forEach(b => b.onclick = () => { h.icon = b.dataset.i; if (id !== 'new') save(); render(); });
    const del = el.querySelector('.del');
    if (del) del.onclick = () => {
      if (del.dataset.sure) { habits = habits.filter(x => x !== h); openId = null; save(); render(); return; }
      del.dataset.sure = '1'; del.textContent = T('Zeker wissen?', 'Really delete?', 'Vraiment supprimer ?');
      setTimeout(() => { delete del.dataset.sure; del.textContent = T('Wis', 'Delete', 'Supprimer'); }, 3000);
    };
  });
  main.querySelectorAll('.card[data-plan]').forEach(el => { const h = habits.find(x => x.id === el.dataset.plan); bindPlan(el, h, h.id); });
  $('#nameEdit').onchange = e => { const v = e.target.value.trim(); if (v) { NAME = v; store.set('name', v); } };
  $('#add').onclick = () => {
    const name = draft.name.trim(); if (!name) { $('#n-new').focus(); return; }
    habits.push({ ...draft, id: uid(), name, created: dayKey() }); draft = null; demoLog.cache = null; save(); render();
  };
  if (!PREVIEW) bindTools();
}

function bindPlan(el, h, id) {
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
}

function bindTools() {
  main.querySelectorAll('.ics1').forEach(b => b.onclick = () => downloadIcs([habits.find(x => x.id === b.dataset.id)]));
  $('#notif').onclick = askNotif;
  $('#notifState').textContent = notifStateText();
  $('#export').onclick = () => download('elkedag-kopie-' + dayKey() + '.json', JSON.stringify({ name: NAME, habits, log }, null, 1), 'application/json');
  $('#import').onclick = () => $('#importFile').click();
  $('#importFile').onchange = async e => {
    try {
      const d = JSON.parse(await e.target.files[0].text());
      if (!Array.isArray(d.habits)) throw 0;
      habits = d.habits; log = d.log || {}; if (d.name) { NAME = d.name; store.set('name', NAME); } save(); tab = 'today'; render(true);
    } catch { $('#notifState').textContent = T('Dat kopiebestand kon ik niet lezen.', "Couldn't read that backup file.", 'Impossible de lire ce fichier de sauvegarde.'); }
  };
}
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// Agenda-bestand (.ics): elke gewoonte als terugkerende afspraak (gekozen dagen, start en einde) van 5 min met een melding op het uur zelf.
function downloadIcs(list = habits) {
  if (!list.length) return;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Elke Dag//NL', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  const BY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  for (const h of list) {
    if (!remindAt(h)) continue;
    const w = whenOf(h);
    // eerste geplande dag vanaf vandaag (geen afspraken in het verleden)
    let first = addDays(new Date(Math.max(new Date(h.start + 'T12:00'), addDays(new Date(), 0))), 0);
    for (let i = 0; i < 7 && !h.days.includes(first.getDay()); i++) first = addDays(first, 1);
    const fk = dayKey(first);
    let rule = h.days.length === 7 ? 'FREQ=DAILY' : 'FREQ=WEEKLY;BYDAY=' + [...h.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(d => BY[d]).join(',');
    if (h.endType === 'until' && h.until) { if (h.until < fk) continue; rule += `;UNTIL=${h.until.replace(/-/g, '')}T235959`; }
    if (h.endType === 'count' && h.count) { const left = h.count - occurrence(h, addDays(first, -1)); if (left <= 0) continue; rule += `;COUNT=${left}`; }
    const d = fk.replace(/-/g, '');
    const [hh, mm] = remindAt(h).split(':');
    const endMin = w === 'time' ? Number(hh) * 60 + Number(mm) + 5 : mins(PART[w].to);
    const end = String(Math.floor(endMin / 60) % 24).padStart(2, '0') + String(endMin % 60).padStart(2, '0');
    const text = w === 'time' ? T(`Hé ${NAME}, het is ${hourText(h.time)}: ${h.name}`, `Hey ${NAME}, it's ${hourText(h.time)}: ${h.name}`, `Hé ${NAME}, il est ${hourText(h.time)} : ${h.name}`) : `${T('Hé', 'Hey', 'Hé')} ${NAME}, ${PART[w].short}: ${h.name}`;
    lines.push('BEGIN:VEVENT', `UID:elkedag-${h.id}@elkedag`, `DTSTAMP:${stamp}`,
      `DTSTART:${d}T${hh}${mm}00`, `DTEND:${d}T${end}00`, 'RRULE:' + rule,
      `SUMMARY:${icsEsc(h.icon + ' ' + h.name)}`, `DESCRIPTION:${icsEsc(text + T('. Vink het af in Elke Dag.', '. Tick it off in Elke Dag.', '. Coche-la dans Elke Dag.'))}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(text)}`, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  download(list.length === 1 ? `elkedag-${list[0].name.replace(/[^\w-]+/g, '-').toLowerCase()}.ics` : 'elkedag-herinneringen.ics', lines.join('\r\n'), 'text/calendar');
}
function icsEsc(s) { return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }

// ---------- meldingen terwijl de app open is ----------
function notifActive() { return 'Notification' in window && Notification.permission === 'granted' && store.get('notifOn', true); }
function notifStateText() {
  if (!('Notification' in window)) return T('Meldingen in de app werken hier niet. Gebruik de agenda-herinneringen hierboven.', "In-app notifications don't work here. Use the calendar reminders above.", 'Les notifications ne fonctionnent pas ici. Utilise les rappels d’agenda ci-dessus.');
  if (Notification.permission === 'denied') return T('Meldingen zijn geweigerd. Je kan dit aanpassen in Instellingen › Meldingen › Elke Dag.', 'Notifications were blocked. You can change this in Settings › Notifications › Elke Dag.', 'Les notifications sont refusées. Tu peux changer ça dans Réglages › Notifications › Elke Dag.');
  if (notifActive()) return T('Meldingen staan aan (werkt wanneer de app open is).', 'Notifications are on (works while the app is open).', 'Les notifications sont activées (quand l’app est ouverte).');
  if (Notification.permission === 'granted') return T('Meldingen staan uit.', 'Notifications are off.', 'Les notifications sont désactivées.');
  return '';
}
async function askNotif() {
  if (!('Notification' in window)) { $('#notifState').textContent = notifStateText(); return; }
  if (notifActive()) { store.set('notifOn', false); render(); return; }
  store.set('notifOn', true);
  const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (p === 'granted') notify(T('Top! 👍', 'Great! 👍', 'Super ! 👍'), T(`Zo krijg je een seintje, ${NAME}.`, `This is how you'll get a reminder, ${NAME}.`, `C’est comme ça que tu recevras un rappel, ${NAME}.`));
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
    if (remindAt(h) && scheduled(h, addDays(new Date(), 0)) && remindAt(h) <= hm && !log[k]?.[h.id] && !notified[k].includes(h.id)) {
      notified[k].push(h.id);
      if (notifActive()) notify(`${T('Hé', 'Hey', 'Hé')} ${NAME}! ⏰`, whenOf(h) === 'time' ? T(`Het is ${hourText(h.time)}: ${h.name}.`, `It's ${hourText(h.time)}: ${h.name}.`, `Il est ${hourText(h.time)} : ${h.name}.`) : `${PART[whenOf(h)].short.charAt(0).toUpperCase() + PART[whenOf(h)].short.slice(1)}: ${h.name}.`);
    }
  }
  for (const d of Object.keys(notified)) if (d < k) delete notified[d];
  save();
}

// ---------- openingsscherm (± 4 seconden, tik om over te slaan) ----------
(function splash() {
  const el = $('#splash'); if (!el) return;
  const Q = T(['Kleine stappen, elke dag. Dat is het hele geheim.', 'Je hoeft niet perfect te zijn. Gewoon bezig blijven.', 'Eén minuut is beter dan geen minuut.',
    'Wat je vandaag doet, voel je morgen.', 'Gewoontes bouw je niet in een dag. Wel elke dag.', 'Begin waar je bent. Doe wat je kan.', 'Je lichaam bedankt je later.'],
    ['Small steps, every day. That is the whole secret.', "You don't have to be perfect. Just keep going.", 'One minute is better than no minute.',
    "What you do today, you'll feel tomorrow.", "Habits aren't built in a day. But they are built every day.", 'Start where you are. Do what you can.', 'Your body will thank you later.'],
    ['De petits pas, chaque jour. C’est tout le secret.', 'Pas besoin d’être parfait. Continue, tout simplement.', 'Une minute vaut mieux que pas de minute.',
    'Ce que tu fais aujourd’hui, tu le sens demain.', 'Une habitude ne se construit pas en un jour. Mais chaque jour.', 'Commence là où tu es. Fais ce que tu peux.', 'Ton corps te remerciera plus tard.']);
  $('#splashQ').textContent = Q[Math.floor(Math.random() * Q.length)];
  const t = new Date().getHours();
  $('#splashG').textContent = NAME ? `${t < 12 ? T('Goeiemorgen', 'Good morning', 'Bonjour') : t < 18 ? T('Goeiemiddag', 'Good afternoon', 'Bon après-midi') : T('Goeienavond', 'Good evening', 'Bonsoir')}, ${NAME}` : '';
  const fast = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let gone = false;
  const hide = () => { if (gone) return; gone = true; el.classList.add('out'); setTimeout(() => el.remove(), 650); };
  el.addEventListener('click', hide);
  setTimeout(hide, fast ? 1200 : 4000);
})();

// ---------- start ----------
if (!PREVIEW && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => { });

// Nieuwe versie online? Dan verschijnt bovenaan een balk; één tik haalt ze binnen. Je gegevens blijven staan.
async function checkUpdate() {
  if (PREVIEW) return;
  try {
    const v = (await (await fetch('version.json?t=' + Date.now(), { cache: 'no-store' })).json()).version;
    if (v > VERSION && !$('#upd')) {
      const b = document.createElement('button');
      b.id = 'upd'; b.className = 'updbar'; b.textContent = updText();
      b.onclick = async () => {
        b.textContent = T('Even geduld…', 'One moment…', 'Un instant…');
        try { const reg = await navigator.serviceWorker?.getRegistration(); await reg?.update(); } catch { }
        try { for (const k of await caches.keys()) await caches.delete(k); } catch { }
        location.reload();
      };
      document.body.appendChild(b);
    }
  } catch { }
}
checkUpdate();
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(); });
// taalknoppen bovenaan
(() => {
  const box = $('#langs'); if (!box) return;
  box.innerHTML = Object.keys(LANGS).map(l => `<button data-l="${l}" aria-label="${{ nl: 'Nederlands', en: 'English', fr: 'Français' }[l]}">${l.toUpperCase()}</button>`).join('');
  box.querySelectorAll('button').forEach(b => b.onclick = () => { if (b.dataset.l === LANG) return; setLang(b.dataset.l); render(); });
})();
setLang(LANG);
render(true);
checkReminders();
setInterval(() => { checkReminders(); if (tab === 'today' && !document.activeElement?.matches('input, textarea')) renderToday(); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkReminders(); if (tab === 'today') render(); } });
