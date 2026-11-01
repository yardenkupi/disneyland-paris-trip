/* הטיול הקסום שלנו – private family trip planner for Disneyland Paris.
   Static app: data.js (generated) + live data from ThemeParks.wiki (CORS, no key). */
(() => {
'use strict';
const D = window.DLP;
const API = 'https://api.themeparks.wiki/v1';
const DEPART = Date.UTC(2027, 4, 18, 2, 40);          // 18.5.2027 05:40 Israel time
const TRIP_DAYS = ['2027-05-18','2027-05-19','2027-05-20','2027-05-21','2027-05-22','2027-05-23'];
const WD = ['א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ש׳'];
const DISNEY = [48.8695, 2.7800], PARIS = [48.8655, 2.3000];

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} }
};
const byK = new Map(D.items.map(i => [i.k, i]));
const RIDE_EMO = { P1NA07: '🌍', P1AA00: '🏝️', P1NA00: '🃏', P1DA03: '🏎️', P1RA00: '⛰️', P1NA01: '🍎', P1DA04: '🔫', P1NA03: '🚂', P1MA01: '🚂',
  P1NA05: '🐘', P1RA07: '🛝', P1MA02: '🐴', P1AA02: '🗿', P1AA01: '🌳', P1NA06: '🏰', P1NA12: '🐉', P1NA02: '🎠', P1AA03: '🧞', P1NA09: '⛵',
  P1DA06: '🐙', P1NA13: '🤥', P1NA08: '☕', P1MA04: '🚌', P1G103: '🎼', P1DA07: '🪐', P1NA10: '🧚', P1RA03: '👻', P1AA08: '🏴‍☠️', P1AA04: '🏴‍☠️',
  P1AA05: '🏖️', P1RA05: '🎯', P1DA09: '🚀', P1DA08: '🌌', P1RA06: '⛴️', P2AC01: '🦸', P2XA02: '🚙', P2XA00: '🚗', P2XA03: '🐢', P2EA00: '❄️',
  P2XA05: '🧞', P2XA06: '🏁', P2DA00: '🏮', P2XA09: '🐭', P2XA08: '🐕', P2AC02: '🕷️', P2ZA02: '🏚️', P2XA07: '🪂' };
const WALK = new Set(['P1NA12', 'P1AA03', 'P1AA05', 'P1AA00', 'P1RA07', 'P1AA08', 'P1AA01', 'P1NA06', 'P1NA00', 'P1DA06']);

/* ---------------- state ---------------- */
let live = new Map(), liveAt = 0, sched = {};
let pos = null, watchId = null;
let settings = store.get('dlp.settings', { kids: [{ label: 'הגדולה', h: null }, { label: 'הקטנה', h: null }] });
let favs = new Set(store.get('dlp.favs', []));
let plan = store.get('dlp.plan', null) || defaultPlan();
let checks = store.get('dlp.checks', null) || defaultChecks();
let custom = store.get('dlp.custom', []);
let curDay = TRIP_DAYS.includes(parisDate()) ? parisDate() : TRIP_DAYS[0];
let kind = 'ride', park = 'all', filt = new Set(), sortBy = 'rate', query = '', listTab = 'check';
let map = null, layers = {}, markers = new Map(), meMarker = null, meCircle = null, routeLayer = null;

function defaultPlan() {
  const p = {};
  for (const d of TRIP_DAYS) p[d] = (D.itinerary[d] || []).map(([t, title, k, note], i) => ({ id: d + '-' + i, t, title, k, note }));
  return p;
}
function defaultChecks() {
  const c = {};
  for (const [, items] of D.checklist) for (const [id, , done] of items) c[id] = !!done;
  return c;
}
const savePlan = () => store.set('dlp.plan', plan);
const saveChecks = () => { store.set('dlp.checks', checks); store.set('dlp.custom', custom); };

/* ---------------- helpers ---------------- */
function parisDate(d = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(d); }
const hhmm = iso => (iso || '').slice(11, 16);
const rng = (a, b) => `<bdi dir="ltr">${hhmm(a)}–${hhmm(b)}</bdi>`;
function dayLabel(ds) { const d = new Date(ds + 'T12:00:00'); return `${WD[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}`; }
function emojiOf(it) {
  if (it.type === 'food') return { character: '👑', table: '🍷', buffet: '🥗', quick: '🍔', snack: '🍦', bar: '🍹' }[it.ft] || '🍽️';
  if (it.type === 'show') return { parade: '🎉', night: '🎆', stage: '🎭', meet: '🤝' }[it.st] || '🎭';
  if (it.type === 'ride' && RIDE_EMO[it.k]) return RIDE_EMO[it.k];
  return { ride: '🎢', hotel: '🏨', hotel2: '🏩', paris: '🗼', transport: '🚆', area: '🛍️', station: '🚂' }[it.type] || '✨';
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2600); }
function sparkle(x, y) {
  for (let i = 0; i < 8; i++) {
    const s = document.createElement('span'); s.className = 'spark'; s.textContent = ['✨', '⭐', '💫'][i % 3];
    s.style.left = x + 'px'; s.style.top = y + 'px';
    s.style.setProperty('--dx', (Math.cos(i / 8 * 6.28) * 46) + 'px'); s.style.setProperty('--dy', (Math.sin(i / 8 * 6.28) * 46) + 'px');
    document.body.appendChild(s); setTimeout(() => s.remove(), 850);
  }
}
function distM(a, b) {
  const R = 6371000, t = x => x * Math.PI / 180;
  const dLa = t(b[0] - a[0]), dLo = t(b[1] - a[1]);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(t(a[0])) * Math.cos(t(b[0])) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function walkOf(it) {
  if (!pos || it.lat == null) return null;
  const m = distM([pos.lat, pos.lon], [it.lat, it.lon]);
  return { m, min: Math.max(1, Math.round(m * 1.3 / 75)) };
}
function walkTxt(it) {
  const w = walkOf(it); if (!w) return '';
  return w.m > 3000 ? `${(w.m / 1000).toFixed(1)} ק״מ` : `🚶 ${w.min} דק׳`;
}

/* ---------------- live data ---------------- */
function liveOf(k) {
  const l = live.get(k); if (!l) return null;
  const q = l.queue || {};
  return { status: l.status, w: q.STANDBY ? q.STANDBY.waitTime : null, single: q.SINGLE_RIDER ? q.SINGLE_RIDER.waitTime : null,
           pa: q.PAID_RETURN_TIME || null, shows: l.showtimes || [], hours: l.operatingHours || [], at: l.lastUpdated };
}
function waitClass(w) { return w == null ? '' : w < 15 ? 'g' : w < 40 ? 'y' : 'r'; }
function waitBadge(k) {
  const l = liveOf(k); if (!l) return '';
  if (l.status === 'REFURBISHMENT') return '<span class="wait">🔧 בשיפוץ</span>';
  if (l.status === 'DOWN') return '<span class="wait">⚠️ תקלה</span>';
  if (l.status === 'CLOSED') return '<span class="wait">סגור</span>';
  if (l.w == null) return '<span class="wait g">פתוח</span>';
  return `<span class="wait ${waitClass(l.w)}">⏱ ${l.w} דק׳</span>`;
}
async function loadLive() {
  try {
    const r = await fetch(`${API}/entity/${D.dest}/live`, { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    live = new Map(j.liveData.map(x => [x.externalId, x])); liveAt = Date.now();
    store.set('dlp.live', { at: liveAt, data: j.liveData });
  } catch (e) {
    const c = store.get('dlp.live', null);
    if (c && !live.size) { live = new Map(c.data.map(x => [x.externalId, x])); liveAt = c.at; }
  }
  updateLiveChip(); refreshView(); refreshMarkers();
}
async function loadSched() {
  for (const [code, id] of Object.entries(D.parks)) {
    try {
      const r = await fetch(`${API}/entity/${id}/schedule`);
      const j = await r.json(); sched[code] = j.schedule || [];
      store.set('dlp.sched.' + code, sched[code]);
    } catch { sched[code] = store.get('dlp.sched.' + code, []); }
  }
  renderToday();
}
function updateLiveChip() {
  const c = $('#liveChip');
  if (!liveAt) { c.textContent = '📡 אין חיבור לנתונים חיים'; return; }
  const min = Math.round((Date.now() - liveAt) / 60000);
  const open = [...live.values()].filter(x => x.entityType === 'ATTRACTION' && x.status === 'OPERATING').length;
  c.textContent = `📡 ${open ? open + ' מתקנים פתוחים' : 'הפארקים סגורים כרגע'} · עודכן ${min ? 'לפני ' + min + ' דק׳' : 'עכשיו'}`;
}

/* ---------------- countdown ---------------- */
function renderCountdown() {
  const now = Date.now(), el = $('#countdown');
  const today = parisDate();
  if (now < DEPART) {
    const d = Math.floor((DEPART - now) / 864e5), h = Math.floor((DEPART - now) % 864e5 / 36e5);
    el.textContent = d > 0 ? `✨ עוד ${d} ימים לקסם` : `✨ עוד ${h} שעות לטיסה!`;
  } else if (today <= TRIP_DAYS[TRIP_DAYS.length - 1]) {
    el.textContent = `🎉 אנחנו בטיול! יום ${Math.max(1, TRIP_DAYS.indexOf(today) + 1)}`;
  } else el.textContent = '💛 היה קסום';
}

/* ---------------- NOW view ---------------- */
function parkLine(code, name) {
  const s = (sched[code] || []).filter(x => x.date === parisDate());
  const op = s.find(x => x.type === 'OPERATING'), emt = s.find(x => x.type === 'EXTRA_HOURS');
  if (!op) return `<div class="park-hours"><b>${name}</b><span class="muted">אין נתונים להיום</span></div>`;
  return `<div class="park-hours"><b>${name}</b>${emt ? `✨ EMT ${rng(emt.openingTime, emt.closingTime)}<br>` : ''}🕘 ${rng(op.openingTime, op.closingTime)}</div>`;
}
function renderToday() {
  const today = parisDate(), inTrip = TRIP_DAYS.includes(today);
  let html = `<h2>${inTrip ? '🏰 היום בטיול: ' + dayLabel(today) : '🏰 היום בפארקים'}</h2>
    <div class="today-grid">${parkLine('DLP', 'דיסנילנד')}${parkLine('DAW', 'Adventure World')}</div>
    <p class="muted small">שעון פריז. השעות מתעדכנות חודש מראש, אז ממרץ–אפריל 2027 יופיעו גם התאריכים שלנו.</p>`;
  if (inTrip) {
    const nowT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(new Date());
    const next = (plan[today] || []).filter(p => p.t >= nowT).sort((a, b) => a.t.localeCompare(b.t)).slice(0, 3);
    html += `<h3>הבא בלו״ז</h3>` + (next.length ? next.map(planRow).join('') : '<p class="muted">אין יותר פריטים להיום 🌙</p>');
  } else {
    const ck = progress();
    html += `<div class="row gap wrap" style="margin-top:8px"><span class="b star">✅ צ׳קליסט ${ck.done}/${ck.total}</span>
      <button class="btn sm ghost" data-go="lists">לרשימות</button><button class="btn sm ghost" data-go="plan">ללו״ז</button></div>`;
  }
  $('#todayCard').innerHTML = html;
}
function kidsOk(it) {
  if (!it.h) return true;
  const hs = settings.kids.map(k => +k.h).filter(Boolean);
  return hs.length ? hs.every(h => h >= it.h) : false;
}
function renderPicks() {
  const rides = D.items.filter(i => i.type === 'ride' && i.tod >= 1 && kidsOk(i) && !WALK.has(i.k));
  const open = rides.map(i => ({ i, l: liveOf(i.k) })).filter(x => x.l && x.l.status === 'OPERATING' && x.l.w != null);
  const el = $('#picks');
  if (!open.length) { el.innerHTML = '<p class="muted">כשהפארקים פתוחים יופיעו כאן המתקנים עם התור הקצר ביותר.</p>'; return; }
  open.forEach(x => { const w = walkOf(x.i); x.score = x.l.w + (w ? w.min : 0) - (x.i.rate || 0) * 3; });
  open.sort((a, b) => a.score - b.score);
  el.innerHTML = open.slice(0, 7).map(({ i, l }) => `<div class="pick" data-k="${i.k}"><span class="em">${emojiOf(i)}</span>
    <span class="nm">${esc(i.he)}<small>${esc(i.land || '')} ${walkTxt(i)}</small></span><span class="wait ${waitClass(l.w)}">⏱ ${l.w} דק׳</span></div>`).join('');
}
function renderShowsToday() {
  const now = Date.now(), rows = [];
  for (const it of D.items.filter(i => i.type === 'show' && i.rate >= 1)) {
    const l = liveOf(it.k); if (!l) continue;
    for (const s of l.shows) { const t = Date.parse(s.startTime); if (t > now - 5 * 60000 && parisDate(new Date(t)) === parisDate()) rows.push({ it, t, s }); }
  }
  rows.sort((a, b) => a.t - b.t);
  $('#showsToday').innerHTML = rows.length ? rows.slice(0, 12).map(({ it, s }) =>
    `<div class="show-row" data-k="${it.k}"><span>${emojiOf(it)} ${esc(it.he)}</span><b>${hhmm(s.startTime)}</b></div>`).join('')
    : '<p class="muted">אין עוד מופעים היום, או שהפארקים סגורים כרגע.</p>';
}
function renderDown() {
  const bad = D.items.filter(i => i.type === 'ride').map(i => ({ i, l: liveOf(i.k) })).filter(x => x.l && (x.l.status === 'DOWN' || x.l.status === 'REFURBISHMENT'));
  $('#downList').innerHTML = bad.length ? bad.map(({ i, l }) => `<div class="show-row" data-k="${i.k}"><span>${esc(i.he)}</span><span>${l.status === 'DOWN' ? '⚠️ תקלה זמנית' : '🔧 בשיפוץ'}</span></div>`).join('')
    : '<p class="muted">הכל פועל ✨</p>';
}
const WX = c => c === 0 ? '☀️' : c <= 2 ? '🌤️' : c === 3 ? '☁️' : c <= 48 ? '🌫️' : c <= 67 ? '🌧️' : c <= 77 ? '🌨️' : c <= 82 ? '🌦️' : '⛈️';
async function loadWeather() {
  try {
    const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=48.87&longitude=2.78&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Europe%2FParis&forecast_days=7');
    const j = await r.json(), d = j.daily;
    $('#weather').innerHTML = `<div class="wx">${d.time.map((t, i) => `<div><div>${dayLabel(t)}</div><div class="ic">${WX(d.weather_code[i])}</div>
      <div><b>${Math.round(d.temperature_2m_max[i])}°</b> / ${Math.round(d.temperature_2m_min[i])}°</div><div class="muted">☔ ${d.precipitation_probability_max[i] ?? 0}%</div></div>`).join('')}</div>
      <p class="muted small">התחזית לשבוע הקרוב. מאמצע מאי 2027 יופיעו כאן ימי הטיול.</p>`;
  } catch { $('#weather').textContent = 'אין חיבור לתחזית כרגע.'; }
}

/* ---------------- PLACES view ---------------- */
const KINDS = [['ride', '🎢 מתקנים'], ['food', '🍽️ אוכל'], ['show', '🎭 מופעים'], ['hotel', '🏨 מלונות'], ['paris', '🗼 פריז ועוד']];
const FILTERS = {
  ride: [['rec', '⭐ מומלץ לנו'], ['tod', '👶 מושלם לפעוטות'], ['calm', '🙂 לא מפחיד'], ['kids', '✅ שתיהן יכולות'], ['fav', '❤️ מועדפים']],
  food: [['character', '👑 עם דמויות'], ['sit', '🍷 שולחן או בופה'], ['quick', '🍔 מהיר'], ['snack', '🍦 חטיפים'], ['book', '📅 צריך להזמין'], ['fav', '❤️ מועדפים']],
  show: [['parade', '🎉 מצעדים'], ['night', '🎆 מופעי לילה'], ['stage', '🎭 במה'], ['meet', '🤝 מפגשים'], ['fav', '❤️ מועדפים']],
  hotel: [['disney', '🏰 מלונות דיסני'], ['partner', '🏩 מלונות שותפים'], ['fav', '❤️ מועדפים']],
  paris: [['p', '🗼 פריז'], ['t', '🚆 תחבורה'], ['fav', '❤️ מועדפים']]
};
function kindMatch(it) {
  if (kind === 'hotel') return it.type === 'hotel' || it.type === 'hotel2';
  if (kind === 'paris') return ['paris', 'transport', 'area'].includes(it.type);
  return it.type === kind;
}
function passFilters(it) {
  for (const f of filt) {
    if (f === 'fav' && !favs.has(it.k)) return false;
    if (kind === 'ride') {
      if (f === 'rec' && !(it.rate >= 2)) return false;
      if (f === 'tod' && it.tod !== 2) return false;
      if (f === 'calm' && it.scary > 1) return false;
      if (f === 'kids' && !kidsOk(it)) return false;
    } else if (kind === 'food') {
      if (f === 'character' && it.ft !== 'character') return false;
      if (f === 'sit' && !['table', 'buffet', 'character'].includes(it.ft)) return false;
      if (f === 'quick' && it.ft !== 'quick') return false;
      if (f === 'snack' && !['snack', 'bar'].includes(it.ft)) return false;
      if (f === 'book' && !it.book) return false;
    } else if (kind === 'show') {
      if (['parade', 'night', 'stage', 'meet'].includes(f) && it.st !== f) return false;
    } else if (kind === 'hotel') {
      if (f === 'disney' && it.type !== 'hotel') return false;
      if (f === 'partner' && it.type !== 'hotel2') return false;
    } else if (kind === 'paris') {
      if (f === 'p' && it.type !== 'paris') return false;
      if (f === 't' && it.type === 'paris') return false;
    }
  }
  return true;
}
function badgesOf(it) {
  const b = [];
  if (it.mine) b.push('<span class="b star">⭐ שלנו</span>');
  if (it.rate >= 3) b.push('<span class="b star">✨ חובה</span>'); else if (it.rate === 2) b.push('<span class="b ok">👍 מומלץ</span>');
  if (it.type === 'ride') {
    b.push(it.h ? `<span class="b ${kidsOk(it) ? 'ok' : 'no'}">📏 ${it.h} ס״מ</span>` : '<span class="b ok">📏 בלי הגבלת גובה</span>');
    if (it.tod === 2) b.push('<span class="b ok">👶 לפעוטות</span>');
    if (it.scary >= 2) b.push(`<span class="b ${it.scary >= 3 ? 'no' : 'warn'}">😱 ${it.scary >= 3 ? 'מפחיד' : 'קצת מפחיד'}</span>`);
    if (it.dark) b.push('<span class="b">🌑 חשוך</span>');
  }
  if (it.type === 'food') {
    b.push(`<span class="b">${{ character: 'עם דמויות', table: 'מסעדת שולחן', buffet: 'בופה', quick: 'מזון מהיר', snack: 'חטיפים', bar: 'בר' }[it.ft] || ''} · ${it.price || ''}</span>`);
    if (it.book) b.push('<span class="b warn">📅 להזמין מראש</span>');
  }
  if (it.park) b.push(`<span class="b">${it.park === 'DLP' ? '🏰 דיסנילנד' : '🎬 Adventure World'}</span>`);
  return b.join('');
}
function renderPlaces() {
  $('#placeKinds').innerHTML = KINDS.map(([k, t]) => `<button data-kind="${k}" class="${k === kind ? 'on' : ''}">${t}</button>`).join('');
  const showPark = ['ride', 'food', 'show'].includes(kind);
  $('#parkSeg').hidden = !showPark;
  $('#parkSeg').innerHTML = [['all', 'הכל'], ['DLP', '🏰 דיסנילנד'], ['DAW', '🎬 Adventure World']]
    .map(([k, t]) => `<button data-park="${k}" class="${k === park ? 'on' : ''}">${t}</button>`).join('');
  $('#filterChips').innerHTML = FILTERS[kind].map(([k, t]) => `<button class="fchip ${filt.has(k) ? 'on' : ''}" data-f="${k}">${t}</button>`).join('');
  $('#sortSel').value = sortBy;
  let list = D.items.filter(i => kindMatch(i) && i.type !== 'station' && (!showPark || park === 'all' || i.park === park) && passFilters(i));
  if (query) { const q = query.toLowerCase(); list = list.filter(i => (i.he + ' ' + (i.en || '') + ' ' + (i.desc || '') + ' ' + (i.land || '')).toLowerCase().includes(q)); }
  const wv = i => { const l = liveOf(i.k); return l && l.status === 'OPERATING' && l.w != null ? l.w : 999; };
  const sorters = {
    rate: (a, b) => (b.mine ? 1 : 0) - (a.mine ? 1 : 0) || (b.rate || 0) - (a.rate || 0) || a.he.localeCompare(b.he, 'he'),
    wait: (a, b) => wv(a) - wv(b),
    dist: (a, b) => ((walkOf(a) || { m: 1e9 }).m) - ((walkOf(b) || { m: 1e9 }).m),
    name: (a, b) => a.he.localeCompare(b.he, 'he')
  };
  list.sort(sorters[sortBy] || sorters.rate);
  $('#cards').innerHTML = list.length ? list.map(cardHtml).join('') : '<div class="card"><p class="muted">אין תוצאות לסינון הזה.</p></div>';
}
function cardHtml(it) {
  const img = it.img ? `<img loading="lazy" src="${esc(it.img.src)}" alt="${esc(it.he)}">` : emojiOf(it);
  return `<article class="pc" data-k="${it.k}">
    <div class="ph">${img}${it.type === 'ride' ? waitBadge(it.k) : ''}
      <button class="fav" data-fav="${it.k}" aria-label="מועדף">${favs.has(it.k) ? '❤️' : '🤍'}</button></div>
    <div class="bd"><h3>${esc(it.he)}</h3>${it.en ? `<div class="en">${esc(it.en)}</div>` : ''}
      <div class="muted small">${esc(it.land || '')} ${walkTxt(it)}</div>
      <div class="badges">${badgesOf(it)}</div><div class="desc">${esc(it.desc || '')}</div></div></article>`;
}

/* ---------------- detail sheet ---------------- */
function openSheet(html) { $('#sheet').innerHTML = html; $('#sheetWrap').hidden = false; $('#sheet').scrollTop = 0; }
function closeSheet() { $('#sheetWrap').hidden = true; $('#sheet').innerHTML = ''; }
function liveBox(it) {
  const l = liveOf(it.k); if (!l) return '';
  const st = { OPERATING: '✅ פתוח', CLOSED: '🌙 סגור', DOWN: '⚠️ תקלה זמנית', REFURBISHMENT: '🔧 בשיפוץ' }[l.status] || l.status;
  const rows = [`<b>מצב</b><span>${st}</span>`];
  if (l.w != null) rows.push(`<b>תור רגיל</b><span>${waitBadge(it.k)}</span>`);
  if (l.single != null) rows.push(`<b>Single Rider</b><span>${l.single} דק׳</span>`);
  if (l.pa && (l.pa.price || l.pa.returnStart)) rows.push(`<b>Premier Access</b><span>${l.pa.price ? (l.pa.price.amount / 100).toFixed(0) + ' ' + (l.pa.price.currency || '€') : ''} ${l.pa.returnStart ? 'חזרה ' + hhmm(l.pa.returnStart) : ''}</span>`);
  const today = l.shows.filter(s => parisDate(new Date(Date.parse(s.startTime))) === parisDate());
  if (today.length) rows.push(`<b>היום</b><span>${today.map(s => hhmm(s.startTime)).join(' · ')}</span>`);
  if (l.hours.length) rows.push(`<b>שעות היום</b><span>${l.hours.map(h => rng(h.startTime, h.endTime)).join(' · ')}</span>`);
  return `<div class="live"><div class="kv">${rows.join('')}</div><div class="muted small" style="margin-top:6px">📡 נתון חי · ${l.at ? 'עודכן ' + new Date(l.at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : ''}</div></div>`;
}
function showItem(k) {
  const it = byK.get(k); if (!it) return;
  const parent = it.parent ? byK.get(it.parent) : null;
  const im = it.img ? `<img src="${esc(it.img.src)}" alt="${esc(it.he)}">` : `<div class="noimg">${emojiOf(it)}</div>`;
  const credit = it.img ? `<div class="cr">📷 ${esc(it.img.by || 'Wikimedia Commons')} · ${esc(it.img.lic || '')} · <a href="${esc(it.img.page)}" target="_blank" rel="noopener">מקור</a>${it.img.other ? ' · <span dir="rtl">תמונה להמחשה מפארק דיסני אחר</span>' : ''}</div>` : '';
  const kids = it.type === 'ride' ? `<div class="badges" style="margin:6px 0">${settings.kids.map(kd => {
      if (!it.h) return `<span class="b ok">✅ ${esc(kd.label)}</span>`;
      if (!kd.h) return `<span class="b">❔ ${esc(kd.label)}: צריך להזין גובה בהגדרות</span>`;
      return +kd.h >= it.h ? `<span class="b ok">✅ ${esc(kd.label)} (${kd.h} ס״מ)</span>` : `<span class="b no">❌ ${esc(kd.label)} (${kd.h} ס״מ)</span>`;
    }).join('')}${it.hn ? `<span class="b">${esc(it.hn)}</span>` : ''}</div>` : '';
  const nav = it.lat != null ? `https://www.google.com/maps/dir/?api=1&destination=${it.lat},${it.lon}&travelmode=walking` : null;
  const imgSearch = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent((it.en || it.he) + (it.type === 'paris' ? ' Paris' : ' Disneyland Paris'))}`;
  openSheet(`<div class="hd">${im}<button class="x" data-close aria-label="סגירה">✕</button></div>${credit}
    <div class="in"><h2>${emojiOf(it)} ${esc(it.he)}</h2>${it.en ? `<div class="en muted small" dir="ltr" style="text-align:right">${esc(it.en)}</div>` : ''}
    <div class="muted small">${esc(it.land || '')} ${walkTxt(it)}</div>
    <div class="badges" style="margin:8px 0">${badgesOf(it)}${it.dur ? `<span class="b">⏳ ~${it.dur} דק׳</span>` : ''}</div>
    ${kids}${liveBox(it)}
    <p style="line-height:1.6">${esc(it.desc || (parent ? parent.desc : ''))}</p>
    ${it.tip ? `<div class="tipbox">💡 ${esc(it.tip)}</div>` : ''}
    <div class="row gap wrap" style="margin-top:10px">
      <button class="btn" data-addplan="${it.k}">📅 הוספה ללו״ז</button>
      ${it.lat != null ? `<button class="btn ghost" data-showmap="${it.k}">🗺️ במפה</button>` : ''}
      ${nav ? `<a class="btn ghost" href="${nav}" target="_blank" rel="noopener">🧭 ניווט</a>` : ''}
      <a class="btn ghost" href="${imgSearch}" target="_blank" rel="noopener">🔎 עוד תמונות</a>
      <button class="btn ghost" data-fav="${it.k}">${favs.has(it.k) ? '❤️ מועדף' : '🤍 למועדפים'}</button>
    </div></div>`);
}
function planForm(entry, day, presetK) {
  const opts = D.items.filter(i => i.type !== 'station').map(i => `<option value="${esc(i.he)}"></option>`).join('');
  const k = entry ? entry.k : presetK || '';
  const place = k && byK.get(k) ? byK.get(k).he : '';
  openSheet(`<div class="in"><button class="x" data-close style="position:static;float:left">✕</button>
    <h2>${entry ? '✏️ עריכה' : '📅 הוספה ללו״ז'}</h2>
    <div class="form-row"><label>יום</label><select id="fDay">${TRIP_DAYS.map(d => `<option value="${d}" ${d === day ? 'selected' : ''}>${dayLabel(d)}</option>`).join('')}</select></div>
    <div class="form-row"><label>שעה</label><input id="fTime" type="time" value="${esc(entry ? entry.t : '10:00')}"></div>
    <div class="form-row"><label>מה</label><input id="fTitle" value="${esc(entry ? entry.title : place)}" placeholder="למשל: מצעד הנסיכות"></div>
    <div class="form-row"><label>מקום (לא חובה)</label><input id="fPlace" list="placeList" value="${esc(place)}" placeholder="חיפוש מקום…"><datalist id="placeList">${opts}</datalist></div>
    <div class="form-row"><label>הערה</label><input id="fNote" value="${esc(entry ? entry.note || '' : '')}"></div>
    <button class="btn gold" id="fSave" data-id="${entry ? entry.id : ''}" data-orig="${entry ? day : ''}">💾 שמירה</button></div>`);
}
function savePlanForm(btn) {
  const day = $('#fDay').value, t = $('#fTime').value || '00:00', title = $('#fTitle').value.trim();
  const pl = $('#fPlace').value.trim(), note = $('#fNote').value.trim();
  const it = D.items.find(i => i.he === pl);
  if (!title && !it) { toast('צריך לכתוב מה מתוכנן'); return; }
  const id = btn.dataset.id, orig = btn.dataset.orig;
  if (id && orig) plan[orig] = (plan[orig] || []).filter(p => p.id !== id);
  (plan[day] = plan[day] || []).push({ id: id || day + '-' + Date.now(), t, title: title || it.he, k: it ? it.k : '', note });
  savePlan(); closeSheet(); curDay = day; renderPlan(); renderToday(); toast('✨ נשמר בלו״ז');
}

/* ---------------- PLAN view ---------------- */
function planRow(p) {
  const it = p.k ? byK.get(p.k) : null;
  const wait = it && it.type === 'ride' ? waitBadge(it.k) : '';
  return `<div class="pl"><span class="tm">${esc(p.t)}</span><div class="tt">${esc(p.title)} ${wait}
    ${it ? `<small><a href="#" data-k="${it.k}">${emojiOf(it)} ${esc(it.he)}</a> ${walkTxt(it)}</small>` : ''}${p.note ? `<small>📝 ${esc(p.note)}</small>` : ''}</div>
    <div class="ac"><button class="icon-btn" data-edit="${p.id}" aria-label="עריכה">✏️</button><button class="icon-btn" data-del="${p.id}" aria-label="מחיקה">🗑️</button></div></div>`;
}
function renderPlan() {
  $('#days').innerHTML = TRIP_DAYS.map(d => `<button data-day="${d}" class="${d === curDay ? 'on' : ''}">${dayLabel(d)}<small>${(plan[d] || []).length} פריטים</small></button>`).join('');
  const items = (plan[curDay] || []).slice().sort((a, b) => a.t.localeCompare(b.t));
  $('#planList').innerHTML = `<h2>📅 ${dayLabel(curDay)}</h2>` + (items.length ? items.map(planRow).join('') : '<p class="muted">עוד אין כלום ביום הזה. אפשר להוסיף מכל מקום באפליקציה ✨</p>');
}
function planText() {
  return '🏰 הלו״ז שלנו – דיסנילנד פריז\n\n' + TRIP_DAYS.map(d => `*${dayLabel(d)}*\n` + (plan[d] || []).slice().sort((a, b) => a.t.localeCompare(b.t))
    .map(p => `${p.t} – ${p.title}${p.note ? ' (' + p.note + ')' : ''}`).join('\n')).join('\n\n');
}
const b64e = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64d = s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
function shareLink() {
  const url = location.origin + location.pathname + '#import=' + b64e(JSON.stringify({ v: 1, plan, checks, custom }));
  if (navigator.share) navigator.share({ title: 'הלו״ז שלנו לדיסני', text: 'הלו״ז והצ׳קליסט שלנו – פותחים ומייבאים ✨', url }).catch(() => {});
  else navigator.clipboard.writeText(url).then(() => toast('🔗 הקישור הועתק'), () => prompt('העתיקו את הקישור:', url));
}
function tryImportHash() {
  const m = location.hash.match(/#import=([\w-]+)/); if (!m) return;
  let data; try { data = JSON.parse(b64d(m[1])); } catch { return; }
  openSheet(`<div class="in"><h2>📥 קיבלתם לו״ז משותף</h2><p>לייבא את הלו״ז והצ׳קליסט מהקישור? זה יחליף את מה ששמור בטלפון הזה.</p>
    <div class="row gap"><button class="btn gold" id="doImport">כן, לייבא</button><button class="btn ghost" data-close>לא עכשיו</button></div></div>`);
  $('#doImport').onclick = () => { applyImport(data); history.replaceState(null, '', location.pathname); closeSheet(); };
}
function applyImport(data) {
  if (data.plan) { plan = data.plan; savePlan(); }
  if (data.checks) { checks = data.checks; custom = data.custom || custom; saveChecks(); }
  renderPlan(); renderToday(); renderLists(); toast('✨ יובא בהצלחה');
}

/* ---------------- LISTS view ---------------- */
function progress() {
  const ids = D.checklist.flatMap(([, items]) => items.map(i => i[0])).concat(custom.map(c => c.id));
  return { done: ids.filter(id => checks[id]).length, total: ids.length };
}
function renderLists() {
  $('#listSeg').innerHTML = [['check', '✅ צ׳קליסט'], ['tips', '💡 טיפים'], ['settings', '⚙️ הגדרות'], ['about', 'ℹ️ אודות']]
    .map(([k, t]) => `<button data-list="${k}" class="${k === listTab ? 'on' : ''}">${t}</button>`).join('');
  const body = $('#listBody');
  if (listTab === 'check') {
    const p = progress();
    body.innerHTML = `<div class="card"><h2>✅ מה כבר סגרנו</h2><div class="prog"><i style="width:${p.total ? p.done / p.total * 100 : 0}%"></i></div>
      <p class="muted small">${p.done} מתוך ${p.total} ✨</p></div>` +
      D.checklist.map(([cat, items]) => `<div class="card"><h2>${esc(cat)}</h2>${items.map(([id, label]) => ckRow(id, label)).join('')}</div>`).join('') +
      `<div class="card"><h2>📝 שלנו</h2>${custom.map(c => ckRow(c.id, c.label, true)).join('')}
        <div class="row gap" style="margin-top:8px"><input id="newCk" placeholder="להוסיף משימה…" style="flex:1;font-family:inherit;font-size:1rem;padding:.55rem;border-radius:12px;border:1px solid var(--line)"><button class="btn sm" id="addCk">➕</button></div></div>`;
  } else if (listTab === 'tips') {
    body.innerHTML = `<div class="card"><h2>💡 טיפים מהשטח</h2><p class="muted small">סיכום של עשרות סיכומי טיולים מהחודשים האחרונים בקבוצות הישראליות של דיסנילנד פריז (בלי שמות), ומהמחקר שלנו.</p>
      ${D.tips.map(([ic, t, list], i) => `<details class="tip" ${i === 0 ? 'open' : ''}><summary>${ic} ${esc(t)}</summary><ul>${list.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>`).join('')}</div>`;
  } else if (listTab === 'settings') {
    body.innerHTML = `<div class="card"><h2>👧 הבנות</h2><p class="muted small">הגבהים מאפשרים לסמן לכל מתקן מי יכולה לעלות. הכל נשמר רק בטלפון הזה.</p>
      ${settings.kids.map((k, i) => `<div class="set-row"><input data-kl="${i}" value="${esc(k.label)}" aria-label="כינוי"><input data-kh="${i}" type="number" inputmode="numeric" min="50" max="200" placeholder="גובה בס״מ" value="${k.h || ''}"></div>`).join('')}
      <button class="btn gold" id="saveKids">💾 שמירה</button></div>
      <div class="card"><h2>🧹 נתונים</h2><p class="muted small">מוחק את הלו״ז, הצ׳קליסט, המועדפים וההגדרות מהטלפון הזה.</p><button class="btn ghost danger" id="wipe">מחיקת כל הנתונים המקומיים</button></div>`;
  } else {
    const credits = D.items.filter(i => i.img).map(i => `<li>${esc(i.he)}: <a href="${esc(i.img.page)}" target="_blank" rel="noopener">${esc(i.img.by || 'Wikimedia')}</a> · ${esc(i.img.lic || '')}</li>`).join('');
    body.innerHTML = `<div class="card"><h2>ℹ️ על האפליקציה</h2>
      <p>אפליקציה משפחתית פרטית לתכנון הטיול. <b>היא לא קשורה ל-Disney</b> ולא מחליפה את האפליקציה הרשמית של Disneyland Paris. את ההזמנות עושים שם.</p>
      <ul>
        <li>📡 זמני תורים, מצב מתקנים, שעות מופעים ושעות פתיחה: <a href="https://themeparks.wiki" target="_blank" rel="noopener">ThemeParks.wiki</a>, שמקבל אותם מהמערכות של דיסני. מתעדכן כל 5 דקות.</li>
        <li>⚠️ אין סנכרון להזמנות האישיות בחשבון הדיסני (מסעדות, Premier Access), כי לדיסני אין ממשק ציבורי לזה. רושמים אותן בלו״ז.</li>
        <li>🗺️ מפה: © OpenStreetMap contributors. ☁️ מזג אוויר: Open-Meteo.</li>
        <li>📷 תמונות: Wikimedia Commons, ברישיונות חופשיים (פירוט למטה). חלקן מפארקי דיסני אחרים, להמחשה בלבד.</li>
        <li>💡 טיפים: סיכום של קבוצות פייסבוק ישראליות ושל מחקר ברשת, נכון לנובמבר 2026.</li>
      </ul><p class="muted small">גרסת נתונים: ${esc(D.built)}</p></div>
      <div class="card"><h2>📷 קרדיטים לתמונות</h2><ul class="small">${credits}</ul></div>`;
  }
}
function ckRow(id, label, isCustom) {
  return `<label class="ck ${checks[id] ? 'done' : ''}"><input type="checkbox" data-ck="${id}" ${checks[id] ? 'checked' : ''}><span>${esc(label)}</span>
    ${isCustom ? `<button class="icon-btn" data-delck="${id}" aria-label="מחיקה" style="margin-inline-start:auto">🗑️</button>` : ''}</label>`;
}

/* ---------------- MAP ---------------- */
const LAYERS = [['ride', '🎢 מתקנים'], ['food', '🍽️ אוכל'], ['show', '🎭 מופעים'], ['hotel', '🏨 מלונות'], ['paris', '🗼 פריז'], ['transport', '🚆 תחבורה']];
const layerOf = it => ({ hotel2: 'hotel', area: 'transport', station: 'transport' }[it.type] || it.type);
let layerOn = new Set(store.get('dlp.layers', ['ride', 'show', 'hotel', 'paris', 'transport']));
function markerIcon(it) {
  const l = it.type === 'ride' ? liveOf(it.k) : null;
  const mw = l && l.status === 'OPERATING' && l.w != null ? `<span class="mw ${waitClass(l.w)}">${l.w}</span>` : l && l.status !== 'OPERATING' ? '<span class="mw">✕</span>' : '';
  const big = it.mine;
  return L.divIcon({ className: '', html: `<div class="mk ${it.type} ${big ? 'mine' : ''}">${emojiOf(it)}${mw}</div>`, iconSize: big ? [40, 40] : [32, 32], iconAnchor: big ? [20, 20] : [16, 16] });
}
function popupHtml(it) {
  return `<div class="pop">${it.img ? `<img src="${esc(it.img.src)}" alt="">` : ''}<h4>${emojiOf(it)} ${esc(it.he)}</h4>
    <div>${it.type === 'ride' ? waitBadge(it.k) : ''} <span class="muted small">${walkTxt(it)}</span></div>
    <div class="row gap" style="margin-top:6px"><button class="btn sm" data-k="${it.k}">פרטים</button><button class="btn sm ghost" data-addplan="${it.k}">📅</button></div></div>`;
}
function initMap() {
  if (map || typeof L === 'undefined') return;
  map = L.map('map', { zoomControl: true, attributionControl: true }).setView(DISNEY, 16);
  const parkPts = D.items.filter(i => i.park && i.lat != null).map(i => [i.lat, i.lon]);
  if (parkPts.length) map.fitBounds(L.latLngBounds(parkPts).pad(0.05));
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);
  for (const [k] of LAYERS) { layers[k] = L.layerGroup(); if (layerOn.has(k)) layers[k].addTo(map); }
  for (const it of D.items) {
    if (it.lat == null) continue;
    const m = L.marker([it.lat, it.lon], { icon: markerIcon(it), title: it.he, zIndexOffset: it.mine ? 1000 : 0 }).bindPopup(() => popupHtml(it), { maxWidth: 240 });
    markers.set(it.k, m); layers[layerOf(it)].addLayer(m);
  }
  // Leaflet stops click propagation inside popups, so wire popup buttons directly
  map.on('popupopen', ev => {
    ev.popup.getElement().querySelectorAll('[data-k],[data-addplan]').forEach(b => b.addEventListener('click', e2 => {
      e2.preventDefault(); map.closePopup();
      b.dataset.addplan ? planForm(null, curDay, b.dataset.addplan) : showItem(b.dataset.k);
    }));
  });
  renderLayerSeg();
}
function renderLayerSeg() {
  $('#mapLayers').innerHTML = LAYERS.map(([k, t]) => `<button data-layer="${k}" class="${layerOn.has(k) ? 'on' : ''}">${t}</button>`).join('');
}
function refreshMarkers() {
  if (!map) return;
  for (const [k, m] of markers) { const it = byK.get(k); if (it.type === 'ride') m.setIcon(markerIcon(it)); }
}
function locate(fly = true) {
  if (!navigator.geolocation) { toast('אין תמיכה במיקום במכשיר הזה'); return; }
  if (watchId != null) { if (fly && pos && map) map.flyTo([pos.lat, pos.lon], 17); return; }
  let first = true;
  watchId = navigator.geolocation.watchPosition(p => {
    pos = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy };
    store.set('dlp.lastpos', pos);
    if (map) {
      if (!meMarker) {
        meMarker = L.marker([pos.lat, pos.lon], { icon: L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), zIndexOffset: 2000 }).addTo(map).bindPopup('אתם כאן ✨');
        meCircle = L.circle([pos.lat, pos.lon], { radius: pos.acc, color: '#2563eb', weight: 1, fillOpacity: .08 }).addTo(map);
      } else { meMarker.setLatLng([pos.lat, pos.lon]); meCircle.setLatLng([pos.lat, pos.lon]).setRadius(pos.acc); }
      if (first && fly) map.flyTo([pos.lat, pos.lon], distM([pos.lat, pos.lon], DISNEY) < 5000 ? 17 : 13);
    }
    if (first) { first = false; refreshView(); }
  }, e => { watchId = null; toast(e.code === 1 ? 'לא אושרה גישה למיקום' : 'לא הצלחנו לאתר מיקום'); }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
}
function showOnMap(k) {
  const it = byK.get(k); if (!it || it.lat == null) return;
  closeSheet(); go('map');
  const lk = layerOf(it); if (!layerOn.has(lk)) { layerOn.add(lk); layers[lk].addTo(map); renderLayerSeg(); }
  setTimeout(() => { map.flyTo([it.lat, it.lon], 18); markers.get(k)?.openPopup(); }, 250);
}
function showDayRoute(day) {
  go('map');
  setTimeout(() => {
    if (routeLayer) routeLayer.remove();
    routeLayer = L.layerGroup().addTo(map);
    const pts = (plan[day] || []).slice().sort((a, b) => a.t.localeCompare(b.t)).map(p => ({ p, it: byK.get(p.k) })).filter(x => x.it && x.it.lat != null);
    if (!pts.length) { toast('אין ביום הזה מקומות עם מיקום'); return; }
    pts.forEach(({ p, it }, i) => L.marker([it.lat, it.lon], { icon: L.divIcon({ className: '', html: `<div class="mk step">${i + 1}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] }), zIndexOffset: 3000 })
      .bindPopup(`<b>${esc(p.t)}</b> ${esc(p.title)}`).addTo(routeLayer));
    L.polyline(pts.map(x => [x.it.lat, x.it.lon]), { color: '#f5c451', weight: 5, opacity: .9, dashArray: '8 8' }).addTo(routeLayer);
    map.fitBounds(L.latLngBounds(pts.map(x => [x.it.lat, x.it.lon])).pad(0.25));
    $('#routeNote').innerHTML = `✨ המסלול של ${dayLabel(day)} · <a href="#" id="clearRoute">ניקוי</a>`;
  }, 250);
}

/* ---------------- navigation ---------------- */
let cur = 'now';
function go(tab) {
  cur = tab;
  $$('.view').forEach(v => v.hidden = v.dataset.view !== tab);
  $$('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  document.body.classList.toggle('compact', tab !== 'now');
  if (tab === 'map') { initMap(); setTimeout(() => map && map.invalidateSize(), 60); if (matchMedia('(pointer:coarse)').matches) locate(false); }
  refreshView();
  window.scrollTo({ top: tab === 'map' ? $('#v-map').offsetTop - 8 : 0, behavior: 'smooth' });
}
function refreshView() {
  if (cur === 'now') { renderToday(); renderPicks(); renderShowsToday(); renderDown(); }
  else if (cur === 'places') renderPlaces();
  else if (cur === 'plan') renderPlan();
  else if (cur === 'lists') renderLists();
}

/* ---------------- events ---------------- */
document.addEventListener('click', e => {
  const t = e.target.closest('button, a, [data-k], .pc, label.ck');
  if (!t) return;
  const d = t.dataset;
  if (t.closest('#tabbar') && d.tab) return go(d.tab);
  if (d.go) return go(d.go);
  if (d.close !== undefined) return closeSheet();
  if (d.fav) { e.stopPropagation(); favs.has(d.fav) ? favs.delete(d.fav) : favs.add(d.fav); store.set('dlp.favs', [...favs]);
    if (!$('#sheetWrap').hidden && t.closest('#sheet')) showItem(d.fav); refreshView(); return; }
  if (d.addplan) { e.preventDefault(); return planForm(null, curDay, d.addplan); }
  if (d.showmap) return showOnMap(d.showmap);
  if (d.kind) { kind = d.kind; filt.clear(); return renderPlaces(); }
  if (d.park) { park = d.park; return renderPlaces(); }
  if (d.f) { filt.has(d.f) ? filt.delete(d.f) : filt.add(d.f); return renderPlaces(); }
  if (d.layer) { const k = d.layer; layerOn.has(k) ? (layerOn.delete(k), layers[k].remove()) : (layerOn.add(k), layers[k].addTo(map)); store.set('dlp.layers', [...layerOn]); return renderLayerSeg(); }
  if (d.fly) { if (!map) return; if (d.fly === 'paris') return map.flyTo(PARIS, 14); const pp = D.items.filter(i => i.park && i.lat != null).map(i => [i.lat, i.lon]); return map.flyToBounds(L.latLngBounds(pp).pad(0.05)); }
  if (d.day) { curDay = d.day; return renderPlan(); }
  if (d.edit) { const p = (plan[curDay] || []).find(x => x.id === d.edit); return p && planForm(p, curDay); }
  if (d.del) { if (confirm('למחוק מהלו״ז?')) { plan[curDay] = plan[curDay].filter(x => x.id !== d.del); savePlan(); renderPlan(); } return; }
  if (d.list) { listTab = d.list; return renderLists(); }
  if (d.delck) { e.preventDefault(); custom = custom.filter(c => c.id !== d.delck); delete checks[d.delck]; saveChecks(); return renderLists(); }
  if (t.id === 'fSave') return savePlanForm(t);
  if (t.id === 'btnLocate') return locate(true);
  if (t.id === 'btnAddPlan') return planForm(null, curDay);
  if (t.id === 'btnDayMap') return showDayRoute(curDay);
  if (t.id === 'clearRoute') { e.preventDefault(); routeLayer && routeLayer.remove(); routeLayer = null; $('#routeNote').textContent = ''; return; }
  if (t.id === 'btnShare') return shareLink();
  if (t.id === 'btnCopyText') return navigator.clipboard.writeText(planText()).then(() => toast('📋 הלו״ז הועתק, אפשר להדביק בוואטסאפ'));
  if (t.id === 'btnExport') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({ v: 1, plan, checks, custom }, null, 1)], { type: 'application/json' })); a.download = 'disney-plan.json'; a.click(); return; }
  if (t.id === 'btnResetPlan') { if (confirm('לאפס את הלו״ז לברירת המחדל?')) { plan = defaultPlan(); savePlan(); renderPlan(); } return; }
  if (t.id === 'addCk') { const v = $('#newCk').value.trim(); if (v) { custom.push({ id: 'u' + Date.now(), label: v }); saveChecks(); renderLists(); } return; }
  if (t.id === 'saveKids') { settings.kids.forEach((k, i) => { k.label = $(`[data-kl="${i}"]`).value.trim() || k.label; k.h = +$(`[data-kh="${i}"]`).value || null; }); store.set('dlp.settings', settings); toast('💾 נשמר'); return; }
  if (t.id === 'wipe') { if (confirm('למחוק את כל הנתונים מהטלפון?')) { ['dlp.plan', 'dlp.checks', 'dlp.custom', 'dlp.favs', 'dlp.settings', 'dlp.layers'].forEach(store.del); location.reload(); } return; }
  if (d.k && !t.closest('.ac')) { e.preventDefault(); closeSheet(); return showItem(d.k); }
  if (t.classList.contains('pc')) return showItem(t.dataset.k);
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.ck) { checks[t.dataset.ck] = t.checked; saveChecks(); if (t.checked) { const r = t.getBoundingClientRect(); sparkle(r.left + 10, r.top + 10); } renderLists(); }
  if (t.id === 'sortSel') { sortBy = t.value; if (sortBy === 'dist' && !pos) { toast('📍 מפעילים מיקום כדי למיין לפי מרחק'); locate(false); } renderPlaces(); }
  if (t.id === 'fileImport' && t.files[0]) t.files[0].text().then(s => { try { applyImport(JSON.parse(s)); } catch { toast('הקובץ לא תקין'); } });
});
$('#q').addEventListener('input', e => { query = e.target.value.trim(); renderPlaces(); });
$('#sheetWrap').addEventListener('click', e => { if (e.target.id === 'sheetWrap') closeSheet(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

/* ---------------- boot ---------------- */
renderCountdown(); setInterval(renderCountdown, 60000);
go('now');
loadLive(); loadSched(); loadWeather();
setInterval(() => { if (!document.hidden) loadLive(); }, 5 * 60000);
setInterval(updateLiveChip, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - liveAt > 4 * 60000) loadLive(); });
tryImportHash();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
