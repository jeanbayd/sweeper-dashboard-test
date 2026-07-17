'use strict';

/* ============================================================
 *  AUTH / FETCH WRAPPER
 * ============================================================ */
const LS_KEY = 'sweeper_dash_api_key';

function getApiKey() { return localStorage.getItem(LS_KEY) || ''; }
function setApiKey(k) { localStorage.setItem(LS_KEY, k); }
function clearApiKey() { localStorage.removeItem(LS_KEY); }

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getApiKey(),
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Erreur HTTP ${res.status}`);
  }
  return res.json();
}

const gateEl = document.getElementById('gate');
const appEl = document.getElementById('app');
const gateInput = document.getElementById('gate-input');
const gateBtn = document.getElementById('gate-btn');
const gateError = document.getElementById('gate-error');

async function tryEnter(key) {
  if (key) setApiKey(key);
  try {
    await api('/api/sweepers');
    gateEl.classList.add('hidden');
    appEl.classList.remove('hidden');
    initApp();
  } catch (e) {
    clearApiKey();
    gateError.textContent = e.message === 'UNAUTHORIZED' ? 'Clé invalide.' : e.message;
  }
}

gateBtn.addEventListener('click', () => tryEnter(gateInput.value.trim()));
gateInput.addEventListener('keydown', e => { if (e.key === 'Enter') tryEnter(gateInput.value.trim()); });
document.getElementById('logout-btn').addEventListener('click', () => {
  clearApiKey();
  appEl.classList.add('hidden');
  gateEl.classList.remove('hidden');
});

// auto-login si clé déjà stockée
if (getApiKey()) tryEnter();

/* ============================================================
 *  HELPERS
 * ============================================================ */
const PALETTE = ['#00e5ff', '#ff2fd1', '#ffb300', '#29ffb0', '#7c8bff', '#ff6b6b'];
function accentFor(login) {
  let h = 0;
  for (let i = 0; i < login.length; i++) h = (h * 31 + login.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
function hexToRgba(hex, a) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function fmtNum(v, d = 1) { return v == null ? '—' : Number(v).toFixed(d); }
function fmtDuration(min) {
  if (min == null) return '—';
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`;
}
function relTime(iso) {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h}h`;
  const d = Math.floor(h / 24);
  return `il y a ${d}j`;
}
function fmtDT(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function sparklineSVG(values, { w = 220, h = 40, color = '#00e5ff' } = {}) {
  const vals = values.filter(v => v != null);
  if (vals.length < 2) return `<svg width="${w}" height="${h}"></svg>`;
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const step = w / (vals.length - 1);
  const pts = vals.map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / range) * (h - 6) - 3).toFixed(1)}`);
  const areaPts = `0,${h} ${pts.join(' ')} ${w},${h}`;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <polygon points="${areaPts}" fill="${hexToRgba(color, 0.12)}" />
    <polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${pts[pts.length - 1].split(',')[0]}" cy="${pts[pts.length - 1].split(',')[1]}" r="3" fill="${color}"/>
  </svg>`;
}

// Petit graphe ligne avec axe temporel, pour la vue détail.
function lineChartSVG(points, { w = 440, h = 160, color = '#00e5ff', unit = '' } = {}) {
  const vals = points.filter(p => p.v != null);
  if (vals.length < 2) return `<div class="empty-state">Pas assez de données (min. 2 sessions).</div>`;
  const min = Math.min(...vals.map(p => p.v)), max = Math.max(...vals.map(p => p.v));
  const range = (max - min) || 1;
  const padL = 34, padB = 20, padT = 10, padR = 10;
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const step = plotW / (vals.length - 1);
  const coords = vals.map((p, i) => {
    const x = padL + i * step;
    const y = padT + plotH - ((p.v - min) / range) * plotH;
    return { x, y, ...p };
  });
  const line = coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const area = `${padL},${padT + plotH} ${line} ${padL + plotW},${padT + plotH}`;
  const gridLines = [0, 0.5, 1].map(f => {
    const y = padT + plotH * f;
    const val = (max - f * range).toFixed(1);
    return `<line x1="${padL}" y1="${y}" x2="${padL + plotW}" y2="${y}" stroke="#ffffff10"/>
            <text x="0" y="${y + 3}" fill="#7d90ab" font-size="9">${val}</text>`;
  }).join('');
  const dots = coords.map(c => `<circle cx="${c.x}" cy="${c.y}" r="3" fill="${color}"><title>${fmtDT(c.label)} — ${fmtNum(c.v)}${unit}</title></circle>`).join('');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    ${gridLines}
    <polygon points="${area}" fill="${hexToRgba(color, 0.1)}"/>
    <polyline points="${line}" fill="none" stroke="${color}" stroke-width="2"/>
    ${dots}
  </svg>`;
}

// Bornes d'une journée en heure LOCALE du navigateur, à partir d'un objet Date.
function localDayBounds(d) {
  const start = new Date(d); start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 86400000);
  return { start, end };
}
// Idem à partir d'une chaîne "YYYY-MM-DD" (utilisé par le sélecteur de l'onglet "Date").
function localDayBoundsFromDateStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(start.getTime() + 86400000);
  return { start, end };
}

// Frise horizontale d'une journée : barre pleine = période active, blocs
// surlignés = arrêts >15min (avec tooltip au survol donnant l'heure exacte
// et la durée). Remplace l'ancien tableau "De / À / Durée".
function timelineSVG(rangeStartISO, rangeEndISO, idleGaps, { w = 220, h = 26, activeColor = '#29ffb0', idleColor = '#ff4d6a' } = {}) {
  const start = new Date(rangeStartISO).getTime();
  const end = new Date(rangeEndISO).getTime();
  const span = end - start;
  if (!(span > 0)) return `<div class="empty-state">Pas de plage horaire à afficher.</div>`;
  const clamp = v => Math.max(0, Math.min(w, v));
  const segs = (idleGaps || []).map(g => {
    const gs = new Date(g.from).getTime(), ge = new Date(g.to).getTime();
    if (!(ge > gs)) return null;
    const x = clamp(((gs - start) / span) * w);
    const x2 = clamp(((ge - start) / span) * w);
    if (x2 <= x) return null;
    return { x, width: Math.max(x2 - x, 1.5), from: g.from, to: g.to, durationMin: g.durationMin };
  }).filter(Boolean);
  const rects = segs.map(s => `<rect x="${s.x.toFixed(1)}" y="2" width="${s.width.toFixed(1)}" height="${h - 4}" rx="2" fill="${idleColor}" fill-opacity="0.9"><title>Arrêt ${fmtDT(s.from)} → ${fmtDT(s.to)} (${fmtDuration(s.durationMin)})</title></rect>`).join('');
  const hours = [];
  const startD = new Date(start); startD.setMinutes(0, 0, 0);
  if (startD.getTime() < start) startD.setTime(startD.getTime() + 3600000);
  for (let t = startD.getTime(); t <= end; t += 3600000) hours.push(t);
  const labelEvery = Math.max(1, Math.ceil(hours.length / 8));
  const ticks = hours.map((t, i) => {
    const x = ((t - start) / span) * w;
    const showLabel = i % labelEvery === 0;
    return `<line x1="${x.toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="${h}" stroke="#ffffff14"/>${showLabel ? `<text x="${x.toFixed(1)}" y="${h + 9}" fill="#7d90ab" font-size="8" text-anchor="middle">${String(new Date(t).getHours()).padStart(2, '0')}h</text>` : ''}`;
  }).join('');
  return `<svg class="timeline-svg" viewBox="0 0 ${w} ${h + 12}">
    <rect x="0" y="2" width="${w}" height="${h - 4}" rx="3" fill="${hexToRgba(activeColor, 0.15)}" stroke="${hexToRgba(activeColor, 0.3)}"/>
    ${ticks}
    ${rects}
  </svg>`;
}

// Bloc "résumé de journée" réutilisable : KPIs + frise + badge origine
// (📸 extraction manuelle vs 📡 pings auto). Utilisé par l'onglet "Jour" et
// l'onglet "Date" des cartes (le détail overlay a sa propre version, plus grande).
function renderDayBlockHTML(t, { timelineW = 220, timelineH = 24 } = {}) {
  if (!t || (!t.totalActions && !t.hourlyActions.length && !t.idleOver15.count)) {
    return `<div class="empty-state">Aucune donnée pour ce jour.</div>`;
  }
  const originBadge = t.origin === 'manual'
    ? `<span class="sc-origin-badge manual">📸 extraction manuelle</span>`
    : `<span class="sc-origin-badge">📡 pings auto</span>`;
  const idleLabel = t.idleOver15.count > 0
    ? `<span class="sc-idle-warn">⏸ ${t.idleOver15.count} arrêt(s) — ${fmtDuration(t.idleOver15.totalMin)}</span>`
    : `<span class="sc-idle-ok">Pas d'arrêt &gt;15min</span>`;
  const domainEnd = new Date(Math.min(new Date(t.dayEnd).getTime(), Date.now())).toISOString();
  const timeline = timelineSVG(t.dayStart, domainEnd, t.idleOver15.gaps, { w: timelineW, h: timelineH });
  return `
    <div class="sc-today-grid">
      <div><div class="sc-stat-label">Actions</div><div class="sc-stat-value">${t.totalActions}</div></div>
      <div><div class="sc-stat-label">Rythme</div><div class="sc-stat-value">${fmtNum(t.currentRatePerHour, 1)}/h</div></div>
      <div><div class="sc-stat-label">Étiquettes</div><div class="sc-stat-value">${t.totalImpressions}</div></div>
    </div>
    <div class="timeline-wrap">${timeline}</div>
    <div class="sc-today-idle">${idleLabel} ${originBadge}</div>
  `;
}

// Bloc "Historique" réutilisable (cumul depuis le premier jour connu + mini sparkline/jour).
function renderHistoryBlockHTML(hist, color) {
  if (!hist || !hist.daysTracked) {
    return `<div class="empty-state">Pas encore de données historisées.</div>`;
  }
  const spark = sparklineSVG(hist.dailySeries.map(d => d.actions), { color, w: 220, h: 34 });
  return `
    <div class="sc-hist-grid">
      <div><div class="sc-stat-label">Jours suivis</div><div class="sc-stat-value">${hist.daysTracked}</div></div>
      <div><div class="sc-stat-label">Actions totales</div><div class="sc-stat-value">${hist.totalActions}</div></div>
      <div><div class="sc-stat-label">Arrêts cumulés</div><div class="sc-stat-value">${fmtDuration(hist.totalIdleMin)}</div></div>
    </div>
    <div class="sc-spark">${spark}</div>
  `;
}

// Bar chart pour la répartition horaire des actions ("today.hourlyActions").
// `hourlyActions` : [{ hour: "YYYY-MM-DDTHH", actions: N }, ...] (heure UTC en clé).
// `fillGaps` : si true, complète toutes les heures entre la 1ère et la dernière
// avec 0 (utile pour le grand graphe détail ; pas nécessaire pour la mini-version carte).
function hourBarChartSVG(hourlyActions, { w = 220, h = 46, color = '#29ffb0', fillGaps = false, showLabels = false } = {}) {
  if (!hourlyActions || !hourlyActions.length) {
    return `<svg width="${w}" height="${h}"></svg>`;
  }
  let data = hourlyActions.map(p => ({ ...p, localHour: new Date(p.hour + ':00:00Z').getHours() }));
  if (fillGaps) {
    const sorted = hourlyActions.map(p => p.hour).sort();
    const start = new Date(sorted[0] + ':00:00Z');
    const end = new Date(sorted[sorted.length - 1] + ':00:00Z');
    const byHour = new Map(hourlyActions.map(p => [p.hour, p.actions]));
    data = [];
    for (let t = new Date(start); t <= end; t = new Date(t.getTime() + 3600000)) {
      const key = t.toISOString().slice(0, 13);
      data.push({ hour: key, actions: byHour.get(key) || 0, localHour: t.getHours() });
    }
  }
  const max = Math.max(...data.map(d => d.actions), 1);
  const padB = showLabels ? 16 : 0;
  const plotH = h - padB;
  const barW = w / data.length;
  const bars = data.map((d, i) => {
    const barH = Math.max((d.actions / max) * (plotH - 4), d.actions > 0 ? 2 : 0);
    const x = i * barW;
    const y = plotH - barH;
    const label = showLabels ? `<text x="${(x + barW / 2).toFixed(1)}" y="${h - 3}" fill="#7d90ab" font-size="8" text-anchor="middle">${String(d.localHour).padStart(2, '0')}h</text>` : '';
    return `<rect x="${(x + barW * 0.15).toFixed(1)}" y="${y.toFixed(1)}" width="${(barW * 0.7).toFixed(1)}" height="${barH.toFixed(1)}" rx="2" fill="${color}">
      <title>${String(d.localHour).padStart(2, '0')}h — ${d.actions} action(s)</title>
    </rect>${label}`;
  }).join('');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bars}</svg>`;
}

// Courbe (au lieu d'histogramme) de l'évolution du rythme actions/h dans la journée.
// Chaque point = actions comptées dans le créneau d'1h (donc directement le "rythme"
// de ce créneau) — mêmes données que hourBarChartSVG, juste en courbe pour mieux
// suivre la tendance d'une heure à l'autre.
function hourLineChartSVG(hourlyActions, { w = 900, h = 180, color = '#29ffb0' } = {}) {
  if (!hourlyActions || !hourlyActions.length) {
    return `<div class="empty-state">Pas encore de données aujourd'hui.</div>`;
  }
  const sorted = hourlyActions.map(p => p.hour).sort();
  const start = new Date(sorted[0] + ':00:00Z');
  const end = new Date(sorted[sorted.length - 1] + ':00:00Z');
  const byHour = new Map(hourlyActions.map(p => [p.hour, p.actions]));
  const data = [];
  for (let t = new Date(start); t <= end; t = new Date(t.getTime() + 3600000)) {
    const key = t.toISOString().slice(0, 13);
    data.push({ hour: key, actions: byHour.get(key) || 0, localHour: t.getHours() });
  }

  const padL = 34, padB = 20, padT = 10, padR = 10;
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const max = Math.max(...data.map(d => d.actions), 1);

  if (data.length < 2) {
    const d = data[0];
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <circle cx="${padL}" cy="${(padT + plotH / 2).toFixed(1)}" r="4" fill="${color}">
        <title>${String(d.localHour).padStart(2, '0')}h — ${d.actions} action(s)/h</title>
      </circle>
    </svg>`;
  }

  const step = plotW / (data.length - 1);
  const coords = data.map((d, i) => ({
    x: padL + i * step,
    y: padT + plotH - (d.actions / max) * plotH,
    ...d,
  }));
  const line = coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const area = `${padL},${padT + plotH} ${line} ${padL + plotW},${padT + plotH}`;
  const gridLines = [0, 0.5, 1].map(f => {
    const y = padT + plotH * f;
    const val = Math.round(max - f * max);
    return `<line x1="${padL}" y1="${y}" x2="${padL + plotW}" y2="${y}" stroke="#ffffff10"/>
            <text x="0" y="${y + 3}" fill="#7d90ab" font-size="9">${val}</text>`;
  }).join('');
  const labelEvery = Math.max(1, Math.ceil(data.length / 12));
  const xLabels = coords.map((c, i) => i % labelEvery === 0
    ? `<text x="${c.x.toFixed(1)}" y="${h - 4}" fill="#7d90ab" font-size="8" text-anchor="middle">${String(c.localHour).padStart(2, '0')}h</text>`
    : '').join('');
  const dots = coords.map(c => `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3" fill="${color}">
    <title>${String(c.localHour).padStart(2, '0')}h — ${c.actions} action(s)/h</title>
  </circle>`).join('');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    ${gridLines}
    <polygon points="${area}" fill="${hexToRgba(color, 0.1)}"/>
    <polyline points="${line}" fill="none" stroke="${color}" stroke-width="2"/>
    ${dots}
    ${xLabels}
  </svg>`;
}

// Courbe multi-sweepers superposées (actions/h par créneau d'1h), pour comparer
// plusieurs AA visuellement sur une même fenêtre de temps plutôt que ligne à ligne
// dans le tableau. `series` : [{ login, color, hourlyActions: [{hour, actions}] }]
function multiLineChartSVG(series, { w = 900, h = 240 } = {}) {
  const withData = series.filter(s => s.hourlyActions && s.hourlyActions.length);
  if (!withData.length) {
    return `<div class="empty-state">Aucune donnée d'activité horaire (pings FCR Lite) sur cette période.</div>`;
  }
  const allHours = Array.from(new Set(withData.flatMap(s => s.hourlyActions.map(p => p.hour)))).sort();
  if (allHours.length < 2) {
    return `<div class="empty-state">Pas assez de créneaux pour tracer une courbe (min. 2 heures de données).</div>`;
  }
  const start = new Date(allHours[0] + ':00:00Z');
  const end = new Date(allHours[allHours.length - 1] + ':00:00Z');
  const hours = [];
  for (let t = new Date(start); t <= end; t = new Date(t.getTime() + 3600000)) {
    hours.push(t.toISOString().slice(0, 13));
  }

  const padL = 34, padB = 20, padT = 10, padR = 10;
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const step = plotW / (hours.length - 1);
  const max = Math.max(...withData.flatMap(s => s.hourlyActions.map(p => p.actions)), 1);

  const gridLines = [0, 0.5, 1].map(f => {
    const y = padT + plotH * f;
    const val = Math.round(max - f * max);
    return `<line x1="${padL}" y1="${y}" x2="${padL + plotW}" y2="${y}" stroke="#ffffff10"/>
            <text x="0" y="${y + 3}" fill="#7d90ab" font-size="9">${val}</text>`;
  }).join('');
  const labelEvery = Math.max(1, Math.ceil(hours.length / 12));
  const xLabels = hours.map((hh, i) => {
    if (i % labelEvery !== 0) return '';
    const localHour = new Date(hh + ':00:00Z').getHours();
    const x = padL + i * step;
    return `<text x="${x.toFixed(1)}" y="${h - 4}" fill="#7d90ab" font-size="8" text-anchor="middle">${String(localHour).padStart(2, '0')}h</text>`;
  }).join('');

  const lines = withData.map(s => {
    const byHour = new Map(s.hourlyActions.map(p => [p.hour, p.actions]));
    const coords = hours.map((hh, i) => {
      const v = byHour.get(hh) || 0;
      return { x: padL + i * step, y: padT + plotH - (v / max) * plotH, v, hh };
    });
    const line = coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
    const dots = coords.map(c => `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="2.5" fill="${s.color}">
      <title>${escapeHtml(s.login)} — ${String(new Date(c.hh + ':00:00Z').getHours()).padStart(2, '0')}h : ${c.v} action(s)</title>
    </circle>`).join('');
    return `<polyline points="${line}" fill="none" stroke="${s.color}" stroke-width="2"/>${dots}`;
  }).join('');

  const legend = withData.map(s => `<span class="legend-item"><span class="legend-dot" style="background:${s.color}"></span>${escapeHtml(s.login)}</span>`).join('');

  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      ${gridLines}
      ${lines}
      ${xLabels}
    </svg>
    <div class="chart-legend">${legend}</div>`;
}

/* ============================================================
 *  TABS
 * ============================================================ */
function initTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`view-${btn.dataset.tab}`).classList.add('active');
    });
  });
}

function tickClock() {
  const el = document.getElementById('live-clock');
  el.textContent = new Date().toLocaleString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/* ============================================================
 *  DASHBOARD (cartes profil)
 * ============================================================ */
let dashboardData = [];

async function loadDashboard() {
  const grid = document.getElementById('cards-grid');
  grid.innerHTML = '<div class="empty-state">Chargement…</div>';
  try {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const params = new URLSearchParams({ todayStart: todayStart.toISOString() });
    dashboardData = await api(`/api/sweepers?${params}`);
    renderCards(dashboardData);
  } catch (e) {
    grid.innerHTML = `<div class="empty-state">Erreur : ${escapeHtml(e.message)}</div>`;
  }
}

function renderCards(list) {
  const grid = document.getElementById('cards-grid');
  if (!list.length) {
    grid.innerHTML = '<div class="empty-state">Aucun sweeper suivi pour l\'instant. Lance une analyse depuis un des scripts Tampermonkey pour peupler le dashboard.</div>';
    return;
  }
  grid.innerHTML = list.map(s => {
    const color = accentFor(s.login);
    const t = s.today || {};
    const idle = t.idleOver15 || { count: 0, totalMin: 0 };
    return `
      <div class="sweeper-card" style="--accent:${color}; --accent-dim:${hexToRgba(color, 0.35)}" data-login="${escapeHtml(s.login)}">
        <div class="sc-top">
          <div class="sc-login">${escapeHtml(s.login)}</div>
        </div>
        <div class="sc-lastseen">Vu ${relTime(s.lastSeen)}</div>
        <div class="sc-quickstats">
          <div><div class="sc-stat-label">Actions (jour)</div><div class="sc-stat-value">${t.totalActions ?? 0}</div></div>
          <div><div class="sc-stat-label">Rythme</div><div class="sc-stat-value">${fmtNum(t.currentRatePerHour, 1)}/h</div></div>
          <div><div class="sc-stat-label">Arrêt total</div><div class="sc-stat-value">${fmtDuration(idle.totalMin)}</div></div>
          <div><div class="sc-stat-label">Nb arrêts</div><div class="sc-stat-value">${idle.count}</div></div>
        </div>
      </div>`;
  }).join('');

  grid.querySelectorAll('.sweeper-card').forEach(card => {
    card.addEventListener('click', () => openDetail(card.dataset.login));
  });
}

document.getElementById('search-sweeper').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  renderCards(dashboardData.filter(s => s.login.toLowerCase().includes(q)));
});
document.getElementById('refresh-dashboard').addEventListener('click', loadDashboard);

/* ============================================================
 *  DETAIL SWEEPER (3 onglets : Aujourd'hui / Globale / Date)
 * ============================================================ */
const detailOverlay = document.getElementById('view-detail');
const detailContent = document.getElementById('detail-content');
let currentDetailLogin = null;
const detailDaysCache = {}; // login -> [jours connus]
let detailSelectedDate = null;

async function openDetail(login) {
  currentDetailLogin = login;
  detailSelectedDate = null;
  detailOverlay.classList.add('active');
  detailContent.innerHTML = '<div class="empty-state">Chargement…</div>';
  try {
    const data = await api(`/api/sweepers/${encodeURIComponent(login)}`);
    renderDetailShell(data.sweeper);
    await loadDetailTab('today');
  } catch (e) {
    detailContent.innerHTML = `<div class="empty-state">Erreur : ${escapeHtml(e.message)}</div>`;
  }
}
document.getElementById('detail-close').addEventListener('click', () => detailOverlay.classList.remove('active'));
detailOverlay.addEventListener('click', (e) => { if (e.target === detailOverlay) detailOverlay.classList.remove('active'); });

function renderDetailShell(sweeper) {
  const color = accentFor(sweeper.login);
  detailContent.innerHTML = `
    <div class="detail-header">
      <div class="detail-login" style="color:${color}; text-shadow:0 0 12px ${hexToRgba(color, 0.4)}">${escapeHtml(sweeper.login)}</div>
    </div>
    <div class="detail-meta">Suivi depuis ${fmtDT(sweeper.first_seen)} · dernière activité ${relTime(sweeper.last_seen)}</div>
    <div class="detail-tabs">
      <button class="detail-tab-btn active" data-tab="today">📅 Aujourd'hui</button>
      <button class="detail-tab-btn" data-tab="global">📈 Globale</button>
      <button class="detail-tab-btn" data-tab="date">🗓️ Date</button>
    </div>
    <div id="detail-date-picker" class="detail-date-picker hidden">
      <select class="detail-date-select"></select>
    </div>
    <div id="detail-tabbody" class="detail-tabbody"><div class="empty-state">Chargement…</div></div>
  `;
  detailContent.querySelectorAll('.detail-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('active')) return;
      detailContent.querySelectorAll('.detail-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadDetailTab(btn.dataset.tab);
    });
  });
}

// Ligne 1 : actions cumulées / rythme / nombre+temps d'arrêt.
function renderDetailKpiRow(t) {
  const idle = t.idleOver15 || { count: 0, totalMin: 0 };
  return `
    <div class="today-kpis kpis-3">
      <div class="chart-box"><h3>Actions cumulées</h3><div class="kpi-value">${t.totalActions ?? 0}</div></div>
      <div class="chart-box"><h3>Rythme</h3><div class="kpi-value">${fmtNum(t.currentRatePerHour, 1)}<span class="kpi-unit">/h</span></div></div>
      <div class="chart-box"><h3>Arrêts &gt;15min</h3><div class="kpi-value">${idle.count}<span class="kpi-unit"> (${fmtDuration(idle.totalMin)})</span></div></div>
    </div>`;
}
// Ligne 2 : évolution du nombre d'actions par heure.
function renderDetailHourlyChart(t, color) {
  const chart = hourLineChartSVG(t.hourlyActions, { w: 900, h: 180, color });
  return `<div class="chart-box" style="margin-top:14px;"><h3>Actions/h — évolution</h3>${chart}</div>`;
}

async function loadDetailTab(tabName) {
  const login = currentDetailLogin;
  const datePicker = document.getElementById('detail-date-picker');

  if (tabName === 'date') {
    datePicker.classList.remove('hidden');
    if (!detailDaysCache[login]) {
      try { detailDaysCache[login] = await api(`/api/sweepers/${encodeURIComponent(login)}/days`); }
      catch (e) { detailDaysCache[login] = []; }
    }
    const days = detailDaysCache[login];
    const select = datePicker.querySelector('.detail-date-select');
    const body = document.getElementById('detail-tabbody');
    if (!days.length) {
      select.innerHTML = '';
      body.innerHTML = '<div class="empty-state">Aucun jour connu pour l\'instant.</div>';
      return;
    }
    if (!detailSelectedDate || !days.includes(detailSelectedDate)) detailSelectedDate = days[0];
    select.innerHTML = days.map(d => `<option value="${d}" ${d === detailSelectedDate ? 'selected' : ''}>${d}</option>`).join('');
    select.onchange = () => { detailSelectedDate = select.value; loadDetailDate(login, detailSelectedDate); };
    await loadDetailDate(login, detailSelectedDate);
    return;
  }

  datePicker.classList.add('hidden');
  const body = document.getElementById('detail-tabbody');
  body.innerHTML = '<div class="empty-state">Chargement…</div>';
  try {
    let dayStart, dayEnd;
    if (tabName === 'today') {
      const d = new Date(); d.setHours(0, 0, 0, 0);
      dayStart = d.toISOString();
      dayEnd = new Date(d.getTime() + 86400000).toISOString();
    } else { // 'global' : pas de borne réelle -> large fenêtre couvrant tout l'historique connu
      dayStart = '1970-01-01T00:00:00.000Z';
      dayEnd = new Date(Date.now() + 86400000).toISOString();
    }
    const params = new URLSearchParams({ dayStart, dayEnd });
    const t = await api(`/api/sweepers/${encodeURIComponent(login)}/day?${params}`);
    const color = accentFor(login);
    body.innerHTML = renderDetailKpiRow(t) + renderDetailHourlyChart(t, color);
  } catch (e) {
    body.innerHTML = `<div class="empty-state">Erreur : ${escapeHtml(e.message)}</div>`;
  }
}

async function loadDetailDate(login, dateStr) {
  const body = document.getElementById('detail-tabbody');
  body.innerHTML = '<div class="empty-state">Chargement…</div>';
  try {
    const { start, end } = localDayBoundsFromDateStr(dateStr);
    const params = new URLSearchParams({ dayStart: start.toISOString(), dayEnd: end.toISOString() });
    const t = await api(`/api/sweepers/${encodeURIComponent(login)}/day?${params}`);
    const color = accentFor(login);
    body.innerHTML = renderDetailKpiRow(t) + renderDetailHourlyChart(t, color);
  } catch (e) {
    body.innerHTML = `<div class="empty-state">Erreur : ${escapeHtml(e.message)}</div>`;
  }
}

/* ============================================================
 *  EQUIPE
 * ============================================================ */
function defaultTeamRange() {
  const now = new Date();
  const start = new Date(now); start.setHours(6, 0, 0, 0);
  const toLocalInput = (d) => {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  document.getElementById('team-start').value = toLocalInput(start);
  document.getElementById('team-end').value = toLocalInput(now);
}

async function loadTeam() {
  const start = document.getElementById('team-start').value;
  const end = document.getElementById('team-end').value;
  const box = document.getElementById('team-content');
  box.innerHTML = '<div class="empty-state">Chargement…</div>';
  try {
    const params = new URLSearchParams();
    if (start) params.set('start', new Date(start).toISOString());
    if (end) params.set('end', new Date(end).toISOString());
    const data = await api(`/api/team?${params.toString()}`);
    renderTeam(data);
  } catch (e) {
    box.innerHTML = `<div class="empty-state">Erreur : ${escapeHtml(e.message)}</div>`;
  }
}

function deltaBadge(v, ref, higherIsBetter) {
  if (v == null || ref == null) return '';
  const diff = v - ref;
  if (Math.abs(diff) < 0.001) return '';
  const good = higherIsBetter ? diff > 0 : diff < 0;
  const cls = good ? 'up' : 'down';
  const arrow = diff > 0 ? '▲' : '▼';
  return `<span class="sc-delta ${cls}">${arrow}</span>`;
}

function renderTeam(data) {
  const box = document.getElementById('team-content');
  if (!data.rows.length) {
    box.innerHTML = '<div class="empty-state">Aucune session dans cette période.</div>';
    return;
  }
  const rows = data.rows.slice().sort((a, b) => a.login.localeCompare(b.login)).map(r => `
    <tr>
      <td style="color:${accentFor(r.login)}">${escapeHtml(r.login)}</td>
      <td class="num">${r.total_actions ?? '—'}${deltaBadge(r.total_actions, data.medianActions, true)}</td>
      <td class="num">${fmtNum(r.actions_per_hour, 2)}${deltaBadge(r.actions_per_hour, data.medianRate, true)}</td>
      <td class="num">${fmtNum(r.median_interval_min, 1)} min${deltaBadge(r.median_interval_min, data.medianInterval, false)}</td>
      <td class="num">${fmtDuration(r.gaps_total_min)}${deltaBadge(r.gaps_total_min, data.medianGapsTotal, false)}</td>
      <td class="num">${r.distinct_stations ?? '—'}${deltaBadge(r.distinct_stations, data.medianStations, true)}</td>
    </tr>`).join('');

  const colorSeries = (data.hourlySeries || []).map(s => ({ ...s, color: accentFor(s.login) }));
  const comparisonChart = multiLineChartSVG(colorSeries, { w: 900, h: 240 });

  box.innerHTML = `
    <div class="team-note">${data.count} sweeper(s) sur la période. Les badges ▲/▼ situent chaque AA par rapport à la médiane de l'équipe (vert = plus favorable, rouge = moins favorable).</div>
    <div class="chart-box" style="margin-bottom:14px;"><h3>Comparaison actions/h — plusieurs sweepers</h3>${comparisonChart}</div>
    <table class="team-table">
      <thead>
        <tr><th>AA</th><th>Actions</th><th>Actions/h</th><th>Intervalle médian</th><th>Total arrêts</th><th>Stations distinctes</th></tr>
      </thead>
      <tbody>
        ${rows}
        <tr class="team-benchmark">
          <td>Médiane équipe</td>
          <td class="num">${fmtNum(data.medianActions, 1)}</td>
          <td class="num">${fmtNum(data.medianRate, 2)}</td>
          <td class="num">${fmtNum(data.medianInterval, 1)} min</td>
          <td class="num">${fmtDuration(Math.round(data.medianGapsTotal || 0))}</td>
          <td class="num">${fmtNum(data.medianStations, 1)}</td>
        </tr>
      </tbody>
    </table>`;
}

document.getElementById('team-load').addEventListener('click', loadTeam);

/* ============================================================
 *  CLASSEMENT
 * ============================================================ */
let rankingSortKey = 'score';
let rankingData = [];

function scoreLabel() {
  return 'Score (actions − pénalité arrêts)';
}

async function loadRanking() {
  const dateInput = document.getElementById('ranking-date');
  const dateStr = dateInput.value || (() => {
    const { start } = localDayBounds(new Date());
    const pad = n => String(n).padStart(2, '0');
    return `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
  })();
  dateInput.value = dateStr;
  const box = document.getElementById('ranking-content');
  box.innerHTML = '<div class="empty-state">Chargement…</div>';
  try {
    const { start, end } = localDayBoundsFromDateStr(dateStr);
    const params = new URLSearchParams({ dayStart: start.toISOString(), dayEnd: end.toISOString() });
    rankingData = await api(`/api/ranking?${params}`);
    renderRanking();
  } catch (e) {
    box.innerHTML = `<div class="empty-state">Erreur : ${escapeHtml(e.message)}</div>`;
  }
}

function renderRanking() {
  const box = document.getElementById('ranking-content');
  if (!rankingData.length) {
    box.innerHTML = '<div class="empty-state">Aucune activité ce jour-là.</div>';
    return;
  }
  const sorted = rankingData.slice().sort((a, b) => (b[rankingSortKey] ?? -Infinity) - (a[rankingSortKey] ?? -Infinity));
  const medal = i => i === 0 ? 'rank-medal-1' : i === 1 ? 'rank-medal-2' : i === 2 ? 'rank-medal-3' : '';
  const medalIcon = i => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
  const rows = sorted.map((r, i) => `
    <tr>
      <td class="rank-cell ${medal(i)}">${medalIcon(i)}</td>
      <td style="color:${accentFor(r.login)}">${escapeHtml(r.login)}</td>
      <td class="num rank-score">${fmtNum(r.score, 1)}</td>
      <td class="num">${r.totalActions ?? '—'}</td>
      <td class="num">${fmtNum(r.currentRatePerHour, 1)}</td>
      <td class="num">${fmtDuration(r.idleMin)} ${r.idleCount ? `(${r.idleCount})` : ''}</td>
      <td>${r.origin === 'manual' ? '📸' : '📡'}</td>
    </tr>`).join('');
  const th = (key, label) => `<th class="sortable-th ${rankingSortKey === key ? 'sorted' : ''}" data-sort="${key}">${label}</th>`;
  box.innerHTML = `
    <div class="team-note">${scoreLabel()} — clique un en-tête pour trier autrement. 📸 = extraction manuelle, 📡 = pings auto.</div>
    <table class="rank-table team-table">
      <thead><tr>
        <th></th><th>AA</th>
        ${th('score', 'Score')}${th('totalActions', 'Actions')}${th('currentRatePerHour', 'Rythme /h')}${th('idleMin', 'Arrêts')}
        <th>Source</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  box.querySelectorAll('.sortable-th').forEach(th2 => {
    th2.addEventListener('click', () => { rankingSortKey = th2.dataset.sort; renderRanking(); });
  });
}

document.getElementById('ranking-load').addEventListener('click', loadRanking);
document.getElementById('ranking-today').addEventListener('click', () => {
  document.getElementById('ranking-date').value = '';
  loadRanking();
});

/* ============================================================
 *  INIT
 * ============================================================ */
function initApp() {
  initTabs();
  tickClock();
  setInterval(tickClock, 1000);
  defaultTeamRange();
  loadDashboard();
  setInterval(loadDashboard, 60000); // auto-refresh léger
}
