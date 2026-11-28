/* JANUS · Navicella — app. Nessuna libreria esterna. */
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
  json(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = (v, d = 2) => v == null || isNaN(v) ? '—' : v.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: 'always' });
const dec = v => v == null ? 2 : Math.abs(v) >= 1000 ? 0 : Math.abs(v) >= 100 ? 1 : Math.abs(v) >= 1 ? 2 : Math.abs(v) >= 0.01 ? 4 : 6;
const fmtV = v => nf(v, dec(v));
const pc = (v, d = 2) => v == null || isNaN(v) ? '—' : (v > 0 ? '+' : '') + nf(v, d) + '%';
const cls = v => v == null ? 'mute' : v >= 0 ? 'up' : 'down';
const dIT = (iso, o) => new Date(iso).toLocaleDateString('it-IT', o || { day: 'numeric', month: 'short', year: 'numeric' });
const hhmm = iso => new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
const ago = iso => {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return 'ora'; if (m < 60) return m + ' min fa';
  const h = Math.round(m / 60); if (h < 24) return h + ' h fa';
  return Math.round(h / 24) + ' g fa';
};

let DATA = null, TAB = 'oggi', PW = null;
const NF = { area: store.get('janus.area') || 'janus', imp: store.get('janus.imp') || 'importanti', q: '', canale: '', open: false, sel: null };
const MK = { vista: store.get('janus.vista') || 'tessere' };

/* ---------- decifratura ---------- */
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function decrypt(pack, pw) {
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(pack.salt), iterations: pack.iter, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(pack.iv) }, key, b64(pack.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}
async function load(pw) {
  let pack;
  try {
    const r = await fetch('data.enc?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('http ' + r.status);
    pack = await r.json();
    store.set('janus.pack', JSON.stringify(pack));
  } catch (e) {
    const c = store.get('janus.pack');
    if (!c) throw new Error('offline');
    pack = JSON.parse(c);
  }
  return decrypt(pack, pw);
}

/* ---------- dati derivati ---------- */
const S = sym => (DATA.serie && DATA.serie[sym]) || [];
const voci = () => DATA.mercati.flatMap(g => g.voci);
const voce = sym => voci().find(v => v.simbolo === sym);
const assets = () => DATA.asset.flatMap(c => c.voci.map(a => ({ ...a, categoria: c.categoria })));
const TAGNAME = {};
const buildTagNames = () => {
  DATA.asset.forEach(c => c.voci.forEach(a => TAGNAME[a.simbolo] = a.nome));
  DATA.blindspot.temi.forEach(t => TAGNAME[t.id] = `${t.id} · ${t.nome}`);
  DATA.blindspot.macro.forEach(m => TAGNAME[m.id] = `${m.id} · ${m.nome}`);
  TAGNAME.macro = 'Macro'; TAGNAME.geopolitica = 'Geopolitica';
};
const newsFor = tag => DATA.notizie.filter(n => n.tag.includes(tag));
const J = () => DATA.janus;
const readSet = () => new Set(store.json('janus.read', []));
const markRead = id => { const s = readSet(); if (!s.has(id)) { s.add(id); store.set('janus.read', JSON.stringify([...s].slice(-700))); } };
const AREE = { janus: 'Per i tuoi asset', mercati: 'Mercati', macro: 'Macro e banche centrali', geopolitica: 'Geopolitica → mercati', crypto: 'Crypto', tutte: 'Tutte' };
const IMPL = { molto: 'Molto importante', medio: 'Importante', poco: 'Di contorno' };
const dots = imp => `<span class="dots ${imp === 'molto' ? 'd3' : imp === 'medio' ? 'd2' : 'd1'}" title="${IMPL[imp]}"><i></i><i></i><i></i></span>`;
const rank = { molto: 0, medio: 1, poco: 2 };

/* ---------- grafici ---------- */
function spark(pts, color) {
  const p = pts.slice(-60).map(x => x[1]);
  if (p.length < 2) return '';
  const lo = Math.min(...p), hi = Math.max(...p), W = 100, H = 30;
  const d = p.map((v, i) => `${(i / (p.length - 1) * W).toFixed(1)},${(H - 2 - (v - lo) / ((hi - lo) || 1) * (H - 4)).toFixed(1)}`).join(' ');
  const c = color || (p[p.length - 1] >= p[0] ? 'var(--up)' : 'var(--down)');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline points="${d}" fill="none" style="stroke:${c}" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}
const smaArr = (pts, n) => pts.map((_, i) => i < n - 1 ? null : pts.slice(i - n + 1, i + 1).reduce((a, b) => a + b[1], 0) / n);
function chart(el, pts, o = {}) {
  const W = el.clientWidth || 640, H = el.clientHeight || 300, P = { l: 8, r: 62, t: 14, b: 24 };
  if (pts.length < 2) { el.innerHTML = '<div class="empty">Dati insufficienti per il grafico.</div>'; return; }
  const refs = (o.refs || []).filter(r => typeof r.v === 'number');
  const lines = o.lines || [];
  let vals = pts.map(p => p[1]);
  lines.forEach(l => l.v.forEach(v => v != null && vals.push(v)));
  let lo = Math.min(...vals), hi = Math.max(...vals);
  refs.forEach(r => { lo = Math.min(lo, r.v); hi = Math.max(hi, r.v); });
  const pad = (hi - lo) * .07 || 1; lo -= pad; hi += pad;
  const X = i => P.l + (W - P.l - P.r) * i / (pts.length - 1);
  const Y = v => P.t + (H - P.t - P.b) * (1 - (v - lo) / (hi - lo));
  const up = pts[pts.length - 1][1] >= pts[0][1], col = up ? 'var(--up)' : 'var(--down)';
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
  const area = path + `L${X(pts.length - 1).toFixed(1)},${H - P.b}L${P.l},${H - P.b}Z`;
  const id = 'g' + Math.random().toString(36).slice(2, 7);
  const ticks = [0, 1, 2, 3].map(k => lo + (hi - lo) * (k + .5) / 4);
  const span = (new Date(pts[pts.length - 1][0]) - new Date(pts[0][0])) / 864e5;
  const xl = [0, .25, .5, .75, 1].map(f => { const i = Math.round(f * (pts.length - 1)); return `<text class="ax" x="${Math.min(Math.max(X(i), 22), W - P.r - 14)}" y="${H - 6}" text-anchor="middle">${dIT(pts[i][0], span > 500 ? { month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' })}</text>`; }).join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${col}" stop-opacity=".22"/><stop offset="1" style="stop-color:${col}" stop-opacity="0"/></linearGradient></defs>
    ${ticks.map(t => `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(t)}" y2="${Y(t)}" style="stroke:var(--line)" stroke-width="1"/><text class="ax" x="${W - P.r + 6}" y="${Y(t) + 4}">${fmtV(t)}</text>`).join('')}
    ${xl}
    ${refs.map(r => `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(r.v)}" y2="${Y(r.v)}" style="stroke:${r.c || 'var(--warn)'}" stroke-width="1.2" stroke-dasharray="5 4"/><text x="${W - P.r - 4}" y="${Y(r.v) - 4}" text-anchor="end" font-size="11" style="fill:${r.c || 'var(--warn)'}" font-family="Inter Tight,sans-serif" font-weight="600">${esc(r.l)} ${fmtV(r.v)}</text>`).join('')}
    <path d="${area}" fill="url(#${id})"/>
    ${lines.map(l => `<path d="${l.v.map((v, i) => v == null ? '' : `${l.v.slice(0, i).some(x => x != null) ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('')}" fill="none" style="stroke:${l.c}" stroke-width="1.3"/>`).join('')}
    <path d="${path}" fill="none" style="stroke:${col}" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="${X(pts.length - 1)}" cy="${Y(pts[pts.length - 1][1])}" r="4" style="fill:${col}"/>
    <g class="cross" hidden><line y1="${P.t}" y2="${H - P.b}" style="stroke:var(--mute)" stroke-dasharray="3 3"/><circle r="4.5" style="fill:var(--panel);stroke:${col}" stroke-width="2"/></g>
  </svg><div class="tip" hidden></div>`;
  const svg = $('svg', el), cross = $('.cross', el), tip = $('.tip', el);
  const mv = e => {
    const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W;
    const i = Math.max(0, Math.min(pts.length - 1, Math.round((x - P.l) / (W - P.l - P.r) * (pts.length - 1))));
    cross.hidden = false; tip.hidden = false;
    $('line', cross).setAttribute('x1', X(i)); $('line', cross).setAttribute('x2', X(i));
    const c = $('circle', cross); c.setAttribute('cx', X(i)); c.setAttribute('cy', Y(pts[i][1]));
    tip.innerHTML = `${fmtV(pts[i][1])}<small>${dIT(pts[i][0])}</small>`;
    tip.style.left = Math.min(Math.max(X(i) / W * 100, 8), 92) + '%'; tip.style.top = (Y(pts[i][1]) / H * 100) + '%';
  };
  el.onpointermove = mv; el.onpointerdown = mv;
  el.onpointerleave = () => { cross.hidden = true; tip.hidden = true; };
}
const RANGES = { '1M': 31, '3M': 92, '6M': 183, '1A': 366, '5A': 1830, 'Tutto': 99999 };
function chartBlock(sym, opts = {}) {
  const id = 'c' + Math.random().toString(36).slice(2, 7);
  const html = `<div class="seg" id="${id}-r">${Object.keys(RANGES).map(k => `<button data-r="${k}" class="${k === '6M' ? 'on' : ''}">${k}</button>`).join('')}</div>
    <label class="small mute" style="margin-left:10px"><input type="checkbox" id="${id}-m"> medie mobili 50 e 200 giorni</label>
    <div class="chart" id="${id}" style="margin-top:10px"></div><div class="legend" id="${id}-l"></div>`;
  const draw = () => {
    const full = S(sym); if (!full.length) return;
    const k = $('#' + id + '-r .on').dataset.r, last = new Date(full[full.length - 1][0]);
    const start = full.findIndex(p => (last - new Date(p[0])) / 864e5 <= RANGES[k]);
    const pts = full.slice(Math.max(0, start));
    const lines = [];
    if ($('#' + id + '-m').checked) {
      const dailyFrom = Math.max(0, full.length - 400);
      [[50, 'var(--accent)'], [200, 'var(--warn)']].forEach(([n, c]) => {
        const sm = smaArr(full.slice(dailyFrom), n);
        const all = full.map((_, i) => i < dailyFrom ? null : sm[i - dailyFrom]);
        lines.push({ v: all.slice(Math.max(0, start)), c, n });
      });
    }
    chart($('#' + id), pts, { refs: opts.refs, lines });
    $('#' + id + '-l').innerHTML = lines.map(l => `<span><i style="background:${l.c}"></i>Media mobile ${l.n} giorni</span>`).join('') + (opts.refs || []).filter(r => typeof r.v === 'number').map(r => `<span><i style="background:${r.c || 'var(--warn)'}"></i>${esc(r.l)}</span>`).join('');
  };
  return { html, mount() { $('#' + id + '-r').onclick = e => { const b = e.target.closest('button'); if (!b) return; $$('#' + id + '-r button').forEach(x => x.classList.toggle('on', x === b)); draw(); }; $('#' + id + '-m').onchange = draw; draw(); } };
}

/* ---------- componenti ---------- */
const chipPc = v => `<span class="chip ${v == null ? '' : v >= 0 ? 'up' : 'down'} num">${pc(v)}</span>`;
function tileHTML(v) {
  const a = Math.min(Math.abs(v.var_1g || 0) / 3, 1) * 22;
  const tint = v.var_1g == null ? 'transparent' : `color-mix(in srgb, var(${v.var_1g >= 0 ? '--up' : '--down'}) ${a}%, var(--panel))`;
  return `<button class="tile" data-sym="${esc(v.simbolo)}" style="background:${tint}"><span class="t-n">${esc(v.nome)}</span><span class="t-p">${fmtV(v.ultimo)}${v.unita ? ' <small class="mute">' + esc(v.unita) + '</small>' : ''}</span><span class="t-c ${cls(v.var_1g)}">${pc(v.var_1g)}</span>${spark(S(v.simbolo))}</button>`;
}
function newsRow(n, sel) {
  const read = readSet().has(n.id), nuova = !read && n._new;
  const tags = [...n.tag.filter(t => TAGNAME[t] && t !== 'macro' && t !== 'geopolitica').slice(0, 2).map(t => `<span class="chip acc ell">${esc(TAGNAME[t])}</span>`), ...n.canali.slice(0, 1).map(c => `<span class="chip">${esc(c)}</span>`)];
  return `<button class="nrow imp-${n.imp} ${read ? 'read' : ''} ${sel ? 'sel' : ''}" data-news="${n.id}"><span class="bar"></span><span><span class="meta">${nuova ? '<i class="new-dot" title="Nuova"></i>' : ''}<b>${esc(n.fonte)}</b><span>${hhmm(n.data)}</span>${dots(n.imp)}${n.altre.length ? `<span>+${n.altre.length} fonti</span>` : ''}</span><h4>${esc(n.titolo_it)}</h4>${tags.length ? `<span class="tags">${tags.join('')}</span>` : ''}</span></button>`;
}
function dayLabel(iso) {
  const d = new Date(iso), t = new Date(); const k = x => x.toDateString();
  if (k(d) === k(t)) return 'Oggi';
  const y = new Date(t - 864e5); if (k(d) === k(y)) return 'Ieri';
  return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
}
function readerHTML(n) {
  const alt = n.altre.map(a => `<li><a href="${esc(a.link)}" target="_blank" rel="noopener noreferrer">${esc(a.fonte)}</a></li>`).join('');
  const tag = n.tag.filter(t => TAGNAME[t]).map(t => `<span class="chip acc">${esc(TAGNAME[t])}</span>`).join(' ');
  const tr = n.non_tradotta ? '<p class="credit">Questa notizia non è stata tradotta (limite di traduzioni raggiunto): il titolo è nella lingua originale.</p>' : '';
  return `<div class="src"><span class="chip">${esc(n.fonte)}</span><span>${dIT(n.data, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</span>${dots(n.imp)}<b>${IMPL[n.imp]}</b></div>
  <h2 class="rd-title">${esc(n.titolo_it)}</h2>
  ${n.narrativa ? `<div class="narr"><p class="rd-body">${esc(n.narrativa.racconto)}</p>${n.narrativa.conta ? `<h4>Perché può contare</h4><p class="rd-body">${esc(n.narrativa.conta)}</p>` : ''}${n.narrativa.osserva ? `<h4>Da seguire</h4><p class="rd-body">${esc(n.narrativa.osserva)}</p>` : ''}<p class="credit">Sintesi scritta da Claude con parole proprie${n.narrativa.base === 'articolo' ? ' dopo aver letto l’articolo' : ' a partire dal titolo e dall’anteprima della fonte, senza leggere l’articolo intero'}: può contenere errori e la parte “perché può contare” è una lettura, non un fatto.</p></div>` : ''}
  ${n.sommario_it ? `<h4 class="orig-h">${n.narrativa ? 'Anteprima della fonte' : 'Dalla fonte'}</h4><p class="rd-body quiet">${esc(n.sommario_it)}</p>` : (n.narrativa ? '' : '<p class="note">La fonte non fornisce un’anteprima del testo: l’articolo completo è sul suo sito.</p>')}
  ${tr}
  <div class="why"><b>Perché è qui</b><ul>${n.perche.map(p => `<li>${esc(p)}</li>`).join('')}</ul>${n.canali.length ? `<div style="margin-top:8px" class="note">Canale verso i mercati: ${n.canali.map(c => `<span class="chip">${esc(c)}</span>`).join(' ')}</div>` : ''}${tag ? `<div style="margin-top:8px">${tag}</div>` : ''}</div>
  ${alt ? `<div class="why"><b>Riportata anche da</b><ul>${alt}</ul></div>` : ''}
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px"><a class="btn pri" href="${esc(n.link)}" target="_blank" rel="noopener noreferrer">Leggi l’articolo completo su ${esc(n.fonte)} ↗</a><button class="btn" data-act="origtitle" data-id="${n.id}">Titolo originale</button><button class="btn" data-act="askjai" data-id="${n.id}">Chiedi a J-AI</button></div>
  <p class="credit" id="orig-${n.id}" hidden></p>
  <p class="credit">Titolo e anteprima tradotti automaticamente: possono contenere imprecisioni. Contenuto © ${esc(n.fonte)}; qui trovi solo il titolo e l’estratto messo a disposizione dalla fonte, il testo completo resta sul suo sito.</p>`;
}


/* ---------- SPIEGAZIONI DEI SENSORI + BRIEFING NARRATIVO ---------- */
const SENS_INFO = {
  T1: ['Misura quanto il prezzo di Bitcoin è sceso rispetto al suo massimo di ciclo.', 'Dopo una correzione profonda il rapporto tra rischio e rendimento di un acquisto extra è storicamente più favorevole, ma un prezzo basso non dice che il fondo sia stato toccato. È il primo dei tre ingressi per l’acquisto extra.'],
  T2: ['Confronta il valore di mercato di Bitcoin con il suo “valore realizzato”, cioè il prezzo medio a cui le monete sono state mosse l’ultima volta. Sotto 1 il mercato vale poco più di quanto è costato ai detentori.', 'Nel passato queste zone sono coincise con fasi di accumulo, ma è una correlazione, non una legge. Va quasi sempre in coppia con T1, quindi non è una conferma davvero indipendente.'],
  T3: ['Indice di paura e avidità del mercato crypto, da 0 (panico) a 100 (euforia), costruito con volatilità, volumi, social e sondaggi.', 'Sotto 20 il mercato è in paura estrema: spesso i prezzi sono già scesi molto, e il segnale vale proprio perché è l’unico dei tre che misura l’umore, non il prezzo.'],
  A7: ['Incrocio tra la media mobile a 111 giorni e il doppio della media a 350 giorni del prezzo di Bitcoin.', 'In passato l’incrocio è comparso vicino ai massimi di ciclo. Se scatta, è un avviso di possibile euforia matura; lontano dall’incrocio non dice nulla sull’immediato.'],
  P1: ['Lo stesso MVRV Z-Score di T2, ma letto dalla parte opposta: valori molto alti indicano che il mercato vale molto più di quanto sia costato ai detentori.', 'Sopra 7 è territorio da massimo di ciclo: segnala euforia, non la timing esatta dell’inversione.'],
  P2: ['Lo stesso indice Fear & Greed di T3, letto dal lato dell’avidità.', 'Sopra 90 l’euforia è diffusa: è il momento in cui storicamente conviene essere più prudenti e meno entusiasti.'],
  P3: ['Quota di Bitcoin sul valore totale del mercato crypto.', 'Quando scende sotto il 40% i capitali si sono spostati in massa sulle altre crypto: è tipico delle fasi avanzate e speculative del ciclo.'],
  P6: ['Stress di sistema: volatilità azionaria (VIX) sopra 30 e dollaro forte (DXY) sopra 106 insieme.', 'Quando scatta la liquidità globale si restringe e gli asset rischiosi, crypto comprese, tendono a soffrire in modo simultaneo.'],
  S3: ['Volume totale scambiato in 24 ore sul mercato crypto.', 'Volumi molto sopra la norma (oltre 100 miliardi di dollari) indicano panico o frenesia: sono un segnale di preallerta, non una direzione.'],
  S5: ['Funding rate dei contratti perpetui su Bitcoin: il costo che pagano i trader in leva rialzista a quelli ribassisti.', 'Sopra 0,08% la leva rialzista è eccessiva e il mercato è fragile a una correzione; vicino a zero la leva è contenuta.'],
  S6: ['Variazione dell’open interest, cioè del totale dei contratti derivati aperti, in 24 ore.', 'Un salto oltre +20% in un giorno significa che si sta aprendo molta leva in poco tempo: aumenta il rischio di liquidazioni a catena.']
};
function sensTxt(k, s) {
  const i = SENS_INFO[k]; if (!i) return '';
  const stato = s.attivo ? `<b class="down">Acceso.</b> Oggi ${esc(s.valore)}, oltre la soglia (${esc(s.soglia)}).` : `<b>Spento.</b> Oggi ${esc(s.valore)}; la soglia di attivazione è ${esc(s.soglia)}, quindi da qui non arriva alcun allarme.`;
  return `<p class="sd">${esc(i[0])}</p><p class="sd">${esc(i[1])}</p><p class="sd now">${stato}${s.ritardato ? ' Dato ritardato di circa una settimana.' : ''}</p>`;
}
function briefing() {
  const L = [], j = J(), b = j.btc, ex = j.extra || {}, cv = j.convergenza;
  const ind = (DATA.mercati.find(g => g.id === 'indici') || { voci: [] }).voci;
  const sp = ind.find(x => x.simbolo === '^GSPC'), nq = ind.find(x => x.simbolo === '^IXIC');
  const reg = n => (j.regime.indicatori || []).find(x => x.nome.startsWith(n));
  const vix = reg('VIX'), dxy = reg('Dollaro'), tn = reg('Rendimento');
  const dir = v => v == null ? '' : v > 0.15 ? 'in rialzo' : v < -0.15 ? 'in calo' : 'sostanzialmente fermo';
  let a = [];
  if (sp) a.push(`L’S&P 500 è ${dir(sp.var_1g)} nell’ultima seduta (${pc(sp.var_1g, 1)}) ma ${pc(sp.var_30g, 1)} in trenta giorni${sp.var_30g < -3 ? ': il mese resta debole' : ''}.`);
  if (nq) a.push(`Il Nasdaq, più esposto alla tecnologia, fa ${pc(nq.var_30g, 1)} nello stesso periodo.`);
  if (vix) a.push(`Il VIX, la misura della paura sulle azioni, è a ${nf(vix.valore, 1)}: ${vix.valore > 30 ? 'stress vero' : vix.valore > 20 ? 'un clima di tensione, non di panico' : 'calma'}${vix.var_30g > 20 ? `, e in trenta giorni è salito del ${nf(vix.var_30g, 0)}%` : ''}.`);
  if (dxy && tn) a.push(`Il dollaro (DXY ${nf(dxy.valore, 1)}) e il rendimento dei Treasury a dieci anni (${nf(tn.valore, 2)}%) dicono quanto costa il denaro: rendimenti alti pesano sugli asset rischiosi.`);
  if (a.length) L.push(['Azioni e macro', a.join(' ')]);
  if (b) {
    const asset = (DATA.asset || []).flatMap(g => g.voci).find(x => x.simbolo === 'BTC-USD'), ind2 = asset && asset.ind;
    let c = [`Bitcoin quota $${nf(b.prezzo, 0)}, il ${nf(Math.abs(b.drawdown_pct), 1)}% sotto il massimo di ciclo di $${nf(b.ath_ciclo, 0)} (${dIT(b.ath_data, { day: 'numeric', month: 'long', year: 'numeric' })}).`];
    if (ind2) c.push(`${ind2.vs_sma200 > 0 ? 'Resta appena sopra' : 'Sta sotto'} la media a 200 giorni (${pc(ind2.vs_sma200, 1)}) e ${ind2.vs_sma50 < 0 ? 'sotto' : 'sopra'} quella a 50 giorni; l’RSI a ${nf(ind2.rsi, 0)} indica ${ind2.rsi < 30 ? 'ipervenduto' : ind2.rsi < 45 ? 'momentum debole ma non estremo' : ind2.rsi > 70 ? 'ipercomprato' : 'una situazione neutra'}.`);
    if (ex.dominance_btc != null) c.push(`La dominance è al ${nf(ex.dominance_btc, 1)}%${ex.dominance_btc > 55 ? ': il mercato si rifugia in Bitcoin, le altcoin soffrono di più' : ''}.`);
    if (ex.funding_btc_pct != null) c.push(`Il funding dei derivati è ${nf(ex.funding_btc_pct, 4)}%: ${ex.funding_btc_pct > 0.05 ? 'leva rialzista alta' : 'leva contenuta, non c’è eccesso da smaltire'}.`);
    L.push(['Crypto', c.join(' ')]);
  }
  const t = j.segnali, att = cv.attivi || [];
  let d = [`Dei tre segnali di ingresso per un acquisto extra sono accesi ${cv.n} su 3${att.length ? ' (' + att.join(' e ') + ')' : ''}${t.T3 && !t.T3.attivo ? `; T3 resta spento perché la paura (${esc(t.T3.valore)}) non è ancora estrema` : ''}.`];
  if (cv.scatta) d.push(`La regola dei due su tre è soddisfatta, ma attenzione: ${cv.avviso ? esc(cv.avviso) : 'i segnali non sono indipendenti.'} Serve il Protocollo STOP prima di qualunque mossa.`);
  const spenti = Object.values(j.sensori).every(x => !x.attivo);
  d.push(`${spenti ? 'Nessun sensore di uscita o di euforia è acceso' : 'Qualche sensore di uscita è acceso: verificare nella Plancia'} (livello ${esc(j.ex.livello)}), e ${Object.values(j.preallerta).some(x => x.attivo) ? 'alcune preallerte sono scattate' : 'le preallerte sulla leva e sui volumi sono spente'}. ${spenti ? 'In pratica il ciclo non mostra euforia: il rischio oggi è di discesa, non di eccesso.' : ''}`);
  L.push(['Sistema JANUS', d.join(' ')]);
  const as = (typeof assets === 'function' ? assets() : []).filter(x => x.prezzo != null);
  if (as.length) {
    const scad = as.filter(x => x.scaduta), trg = as.filter(x => x.trigger && x.trigger.raggiunto && x.simbolo !== 'BTC-USD'), pe = [...as].filter(x => x.var_30g != null).sort((x, y) => x.var_30g - y.var_30g);
    let e = [];
    if (pe.length) e.push(`Nei trenta giorni il peggiore tra gli asset osservati è ${esc(pe[0].nome)} (${pc(pe[0].var_30g, 0)}), il migliore ${esc(pe[pe.length - 1].nome)} (${pc(pe[pe.length - 1].var_30g, 0)}); ${pe.filter(x => x.var_30g < 0).length} su ${pe.length} sono in calo.`);
    if (trg.length) e.push(`Hanno già toccato il proprio trigger: ${trg.map(x => esc(x.nome)).join(', ')} (una soglia raggiunta non è un ordine, serve la lettura della tesi).`);
    if (scad.length) e.push(`${scad.length} tesi sono oltre la scadenza (${scad.map(x => esc(x.nome)).join(', ')}): vanno rinnovate con motivazione o chiuse.`);
    if ((DATA.anomalie || []).length) e.push(`Mosse anomale in corso: ${DATA.anomalie.map(x => esc(x.nome)).join(', ')}.`);
    L.push(['Asset e tesi', e.join(' ')]);
  }
  const top = [...DATA.notizie].sort((x, y) => rank[x.imp] - rank[y.imp] || y.punteggio - x.punteggio).slice(0, 3);
  if (top.length) {
    const ch = (DATA.canali || []).slice(0, 3).map(c => c.canale);
    L.push(['Notizie', `Le tre che pesano di più: ${top.map(n => '«' + esc(n.titolo_it || n.titolo) + '» (' + esc(n.fonte) + ')').join('; ')}.${ch.length ? ` I canali più attivi verso i mercati sono ${ch.map(esc).join(', ')}.` : ''} Le notizie confermano o smentiscono, non generano temi: i temi nascono dai sensori.`]);
  }
  const ev = DATA.eventi[0], pf = DATA.portafoglio;
  L.push(['Da tenere d’occhio', `${ev ? `Prossimo evento: ${esc(ev.titolo)} il ${dIT(ev.data, { day: 'numeric', month: 'long' })}${ev.nota ? ' (' + esc(ev.nota) + ')' : ''}. ` : ''}${pf ? `Il Giorno Zero del portafoglio virtuale è tra ${pf.giorni_mancanti} giorni.` : ''}`]);
  return L;
}

/* ---------- OGGI ---------- */
function vOggi() {
  const an = DATA.anomalie || [], sy = DATA.sincronia, top = [...DATA.notizie].sort((a, b) => rank[a.imp] - rank[b.imp] || b.punteggio - a.punteggio || b.data.localeCompare(a.data)).slice(0, 6);
  const idx = DATA.mercati.find(g => g.id === 'indici');
  const j = J(), cv = j.convergenza;
  const stato = cv.scatta ? ['red', 'Almeno due segnali su tre sono attivi', 'Applica il Protocollo STOP prima di qualsiasi decisione.'] : null;
  return `<div class="page-h"><div><h2>Oggi</h2><p class="lead">Il quadro in due minuti: cosa si muove, cosa conta, cosa richiede attenzione.</p></div></div>
  ${stato ? `<div class="alert red"><span class="ic">⚠</span><div><b>${stato[1]}</b>${stato[2]}${cv.avviso ? ' ' + esc(cv.avviso) : ''}</div></div>` : ''}
  ${sy ? `<div class="alert"><span class="ic">⚡</span><div><b>Mercati sincronizzati</b>${esc(sy.testo)} (${sy.indici.map(esc).join(', ')})</div></div>` : ''}
  <section class="hero"><h3>Il briefing di oggi</h3><p class="quadro-short">${DATA.quadro.map(esc).join(' ')}</p>${briefing().map(([h, t]) => `<h4 class="bh">${h}</h4><p class="bp">${t}</p>`).join('')}<p class="credit">Testo composto in automatico dai dati di questa pagina (nessuna previsione): è una lettura, non una raccomandazione.</p><span class="meta">Aggiornato ${ago(DATA.generato)} · ${DATA.notizie_stat.lette} notizie lette, ${new Set(DATA.notizie.map(n => n.fonte)).size} testate nella selezione, ${DATA.notizie_stat.scartate_opinioni} opinioni scartate, ${DATA.notizie_stat.scartate_non_pertinenti} non pertinenti.</span></section>
  <div class="grid g2" style="grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);align-items:start">
    <div class="card"><h3>Mosse anomale<span class="sp mute">oltre 3 volte la normale oscillazione</span></h3>
      ${an.length ? an.map(a => `<button class="radar-row" data-sym="${esc(a.simbolo)}"><span class="nm">${esc(a.nome)}<small>${a.nota ? esc(a.nota) : `ultima seduta di ${dIT(a.data, { weekday: 'long', day: 'numeric', month: 'long' })} · intensità ${nf(Math.abs(a.z), 1)} volte la norma`}</small></span><span class="mid note">${a.janus ? '<span class="chip acc">asset JANUS</span>' : ''}</span><span class="num ${cls(a.var_1g)}">${pc(a.var_1g)}</span></button>`).join('') : '<p class="note">Nessun movimento fuori dall’ordinario nell’ultima seduta. Le soglie sono: indici 1,5%, materie prime 2,5%, crypto 7%, VIX 15%.</p>'}
    </div>
    <div class="card"><h3>Semafori JANUS<span class="sp"><button class="ghost" data-tab="janus">Plancia →</button></span></h3>
      <div style="display:grid;gap:8px">${['T1', 'T2', 'T3'].map(k => { const s = j.segnali[k]; return s ? `<div style="display:flex;justify-content:space-between;gap:8px"><span><span class="led ${s.attivo ? 'on' : ''}"></span><b>${k}</b> <span class="note">${esc(s.nome)}</span></span><span class="num">${esc(s.valore)}</span></div>` : ''; }).join('')}
      <div class="note" style="border-top:1px solid var(--line);padding-top:8px">Livello EX <b>${esc(j.ex.livello)}</b> · Segnali attivi <b>${cv.n}/3</b>${j.btc ? ` · Bitcoin a <b class="num">${pc(j.btc.distanza_soglia_pct, 1)}</b> dalla soglia T1` : ''}</div></div></div>
  </div>
  <div class="sec"><div class="sec-h">Indici<span class="sp"><button class="ghost" data-tab="mercati">Tutti i mercati →</button></span></div><div class="tiles">${idx ? idx.voci.map(tileHTML).join('') : ''}</div></div>
  <div class="sec"><div class="sec-h">Da leggere ora<span class="sp"><button class="ghost" data-tab="notizie">Tutte le notizie →</button></span></div>
    <div class="nlist">${top.map(n => newsRow(n)).join('')}</div></div>
  ${DATA.canali && DATA.canali.length ? `<div class="sec"><div class="sec-h">Cosa muove i mercati<span class="sp mute">canali di trasmissione delle notizie geopolitiche e macro</span></div><div class="chan">${DATA.canali.map(c => `<button data-canale="${esc(c.canale)}">${esc(c.canale)}<span class="c">${c.n}</span></button>`).join('')}</div></div>` : ''}
  ${DATA.eventi.length ? `<div class="sec"><div class="sec-h">Prossimi eventi</div><div class="card">${DATA.eventi.map(e => `<div style="display:flex;gap:14px"><b class="num">${dIT(e.data, { day: 'numeric', month: 'short' })}</b><span>${esc(e.titolo)} <span class="mute small">${esc(e.nota || '')}</span></span></div>`).join('')}</div></div>` : ''}`;
}

/* ---------- NOTIZIE ---------- */
function filtered() {
  let l = DATA.notizie;
  if (NF.area === 'janus') l = l.filter(n => n.janus); else if (NF.area !== 'tutte') l = l.filter(n => n.area === NF.area);
  if (NF.imp === 'importanti') l = l.filter(n => n.imp !== 'poco');
  if (NF.canale) l = l.filter(n => n.canali.includes(NF.canale));
  if (NF.q) { const q = NF.q.toLowerCase(); l = l.filter(n => (n.titolo_it + ' ' + n.titolo + ' ' + n.fonte).toLowerCase().includes(q)); }
  return [...l].sort((a, b) => dayKey(b.data).localeCompare(dayKey(a.data)) || rank[a.imp] - rank[b.imp] || b.data.localeCompare(a.data));
}
const dayKey = iso => new Date(iso).toLocaleDateString('sv');
function vNotizie() {
  const cnt = a => a === 'janus' ? DATA.notizie.filter(n => n.janus && (NF.imp === 'tutte' || n.imp !== 'poco')).length : a === 'tutte' ? DATA.notizie.filter(n => NF.imp === 'tutte' || n.imp !== 'poco').length : DATA.notizie.filter(n => n.area === a && (NF.imp === 'tutte' || n.imp !== 'poco')).length;
  const nAtt = (NF.imp === 'tutte' ? 1 : 0) + (NF.canale ? 1 : 0);
  const stato = [NF.imp === 'tutte' ? '<button class="pill on" data-clr="imp">Incluse le meno importanti ✕</button>' : '', NF.canale ? `<button class="pill on" data-clr="can">${esc(NF.canale)} ✕</button>` : ''].join('');
  return `<div class="page-h"><div><h2>Notizie</h2><p class="lead">Da agenzie, banche centrali e stampa finanziaria, tradotte. Opinioni e previsioni di parte sono scartate.</p></div></div>
  <div class="nfilters"><div class="seg area" id="fArea">${Object.keys(AREE).map(a => `<button data-a="${a}" class="${NF.area === a ? 'on' : ''}">${AREE[a]}<span class="c">${cnt(a)}</span></button>`).join('')}</div>
    <div class="line"><input class="search" id="fQ" type="search" placeholder="Cerca parola o fonte" value="${esc(NF.q)}"><button class="ftoggle ${NF.open || nAtt ? 'on' : ''}" id="fToggle" aria-expanded="${NF.open ? 'true' : 'false'}">Filtri${nAtt ? `<span class="badge">${nAtt}</span>` : ''}</button></div>
    ${!NF.open && stato.trim() ? `<div class="line" id="fState">${stato}</div>` : ''}
    ${NF.open ? `<div class="fpanel"><div class="fl">Importanza</div><div class="seg" id="fImp"><button data-i="importanti" class="${NF.imp === 'importanti' ? 'on' : ''}">Solo importanti</button><button data-i="tutte" class="${NF.imp === 'tutte' ? 'on' : ''}">Tutte</button></div>
      ${DATA.canali && DATA.canali.length ? `<div class="fl">Tema</div><div class="chan" id="fCan">${DATA.canali.map(c => `<button data-canale="${esc(c.canale)}" class="${NF.canale === c.canale ? 'on' : ''}">${esc(c.canale)}<span class="c">${c.n}</span></button>`).join('')}</div>` : ''}</div>` : ''}</div>
  <div class="nwrap"><div id="nList"></div><aside class="card reader" id="reader"></aside></div>`;
}
function fillNews() {
  const l = filtered(), box = $('#nList'); if (!box) return;
  if (!l.length) { box.innerHTML = '<div class="empty">Nessuna notizia con questi filtri. Prova “Tutte” oppure un’altra rubrica.</div>'; $('#reader').innerHTML = ''; return; }
  if (!l.some(x => x.id === NF.sel)) NF.sel = window.innerWidth > 1100 ? l[0].id : null;
  let out = '', cur = '';
  l.forEach(n => { const k = dayKey(n.data); if (k !== cur) { if (cur) out += '</div>'; cur = k; out += `<div class="day">${dayLabel(n.data)}</div><div class="nlist">`; } out += newsRow(n, NF.sel === n.id); });
  box.innerHTML = out + '</div>';
  const r = $('#reader');
  const n = l.find(x => x.id === NF.sel);
  if (n) r.innerHTML = readerHTML(n); else r.innerHTML = '<div class="reader-empty"><div><p style="font:500 20px var(--f-txt);color:var(--ink2)">Scegli una notizia</p><p class="small" style="margin-top:6px">Si apre qui, con la fonte citata e il link all’articolo originale.</p></div></div>';
}

/* ---------- MERCATI ---------- */
function vMercati() {
  return `<div class="page-h"><div><h2>Mercati</h2><p class="lead">Indici, materie prime, valute e crypto. Tocca una voce per grafico e indicatori.</p></div><div class="seg" id="mV"><button data-v="tessere" class="${MK.vista === 'tessere' ? 'on' : ''}">Mappa</button><button data-v="tabella" class="${MK.vista === 'tabella' ? 'on' : ''}">Tabella</button></div></div>
  ${DATA.mercati.map(g => `<div class="sec" style="margin-top:0;margin-bottom:22px"><div class="sec-h">${esc(g.nome)}</div>${MK.vista === 'tessere' ? `<div class="tiles">${g.voci.map(tileHTML).join('')}</div>` : `<div class="card scroll-x" style="padding:6px"><table class="tbl"><thead><tr><th>Nome</th><th>Ultimo</th><th>1 g</th><th>7 g</th><th>30 g</th><th>1 anno</th></tr></thead><tbody>${g.voci.map(v => `<tr class="click" data-sym="${esc(v.simbolo)}"><td><b>${esc(v.nome)}</b></td><td class="num">${fmtV(v.ultimo)}</td>${[v.var_1g, v.var_7g, v.var_30g, v.var_1a].map(x => `<td class="num ${cls(x)}">${pc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`}</div>`).join('')}`;
}
function indicHTML(i) {
  if (!i || !Object.keys(i).length) return '';
  const rsi = i.rsi, rs = rsi == null ? '' : rsi >= 70 ? 'ipercomprato' : rsi <= 30 ? 'ipervenduto' : 'neutro';
  return `<div class="grid g2"><div class="card"><h3>Posizione nell’ultimo anno</h3><div class="gauge"><div class="scale" style="background:linear-gradient(90deg,var(--down-soft),var(--panel2),var(--up-soft));border:1px solid var(--line)"><u style="left:${i.pos_52s ?? 50}%"></u></div><div class="lbl"><span>minimo ${fmtV(i.min_52s)}</span><span>massimo ${fmtV(i.max_52s)}</span></div></div>
  <dl class="kv" style="margin-top:10px"><dt>Dal massimo annuale</dt><dd class="${cls(i.dd_52s)}">${pc(i.dd_52s, 1)}</dd><dt>Variazione 90 giorni</dt><dd class="${cls(i.var_90g)}">${pc(i.var_90g, 1)}</dd><dt>Volatilità 30 giorni (annua)</dt><dd>${i.vol_30g != null ? nf(i.vol_30g, 0) + '%' : '—'}</dd></dl></div>
  <div class="card"><h3>Indicatori tecnici</h3><dl class="kv"><dt>RSI a 14 giorni</dt><dd>${rsi != null ? nf(rsi, 0) : '—'} <span class="mute small">${rs}</span></dd><dt>Media mobile 50 giorni</dt><dd>${i.sma50 != null ? fmtV(i.sma50) : '—'} <span class="${cls(i.vs_sma50)} small">${pc(i.vs_sma50, 1)}</span></dd><dt>Media mobile 200 giorni</dt><dd>${i.sma200 != null ? fmtV(i.sma200) : '—'} <span class="${cls(i.vs_sma200)} small">${pc(i.vs_sma200, 1)}</span></dd></dl><p class="note" style="margin-top:8px">Letture indicative: i segnali tecnici non sostituiscono le regole JANUS.</p></div></div>`;
}
function indicOf(sym) {
  const a = assets().find(x => x.simbolo === sym); if (a && a.ind) return a.ind;
  return null;
}
function openSymbol(sym) {
  const v = voce(sym) || assets().find(a => a.simbolo === sym); if (!v) return;
  const a = assets().find(x => x.simbolo === sym);
  if (a) return openAsset(sym);
  const name = v.nome, price = v.ultimo ?? v.prezzo;
  const cb = chartBlock(sym);
  openSheet(`<h2>${esc(name)}</h2><p class="mute small"><span class="mono">${esc(sym)}</span> · ultimo dato del ${dIT(v.data || DATA.generato)}</p>
  <div style="display:flex;gap:18px;align-items:baseline;flex-wrap:wrap;margin:10px 0 16px"><span class="num" style="font-size:34px;letter-spacing:-.03em">${fmtV(price)}</span>${chipPc(v.var_1g)} <span class="mute small">1 giorno</span>${chipPc(v.var_7g)} <span class="mute small">7 giorni</span>${chipPc(v.var_30g)} <span class="mute small">30 giorni</span></div>
  <div class="card">${cb.html}</div><div class="sec">${indicHTML(indicFromSerie(sym))}</div>`, cb.mount);
}
function indicFromSerie(sym) {
  const s = S(sym).map(p => p[1]); if (s.length < 60) return null;
  const last = s[s.length - 1], y = s.slice(-252), hi = Math.max(...y), lo = Math.min(...y);
  const sma = n => s.length >= n ? s.slice(-n).reduce((a, b) => a + b, 0) / n : null;
  let ag = 0, al = 0; const n = 14;
  for (let i = s.length - 120 > 0 ? s.length - 120 : 1; i < s.length; i++) { const d = s[i] - s[i - 1]; ag = (ag * (n - 1) + Math.max(d, 0)) / n; al = (al * (n - 1) + Math.max(-d, 0)) / n; }
  const rsi = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  const r = s.slice(-31).map((x, i, a) => i ? Math.log(x / a[i - 1]) : 0).slice(1), m = r.reduce((a, b) => a + b, 0) / r.length;
  const vol = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1)) * Math.sqrt(365) * 100;
  const p = (x, b) => b ? (x / b - 1) * 100 : null;
  return { rsi, sma50: sma(50), sma200: sma(200), vs_sma50: p(last, sma(50)), vs_sma200: p(last, sma(200)), max_52s: hi, min_52s: lo, pos_52s: (last - lo) / ((hi - lo) || 1) * 100, dd_52s: p(last, hi), vol_30g: vol, var_90g: p(last, s[s.length - 91]) };
}

/* ---------- ASSET ---------- */
function trigBar(t) {
  if (!t) return '<p class="note">Nessun trigger numerico definito per questo asset.</p>';
  const f = x => t.tipo === 'ratio' ? nf(x, 4) : t.tipo === 'prezzo' ? fmtV(x) : nf(x, 1) + '%';
  const d = t.distanza;
  if (t.nota) return `<div class="note"><b>${esc(t.testo)}</b></div><p class="note warn" style="margin-top:6px">Non valutabile: soglia e prezzo non sono nella stessa unità.</p>`;
  return `<div class="note"><b>${esc(t.testo)}</b></div>${t.attuale != null ? `<dl class="kv" style="margin-top:6px"><dt>Ora</dt><dd>${f(t.attuale)}</dd><dt>Soglia</dt><dd>${f(t.soglia)}</dd><dt>Distanza</dt><dd class="${t.raggiunto ? 'up' : ''}">${t.raggiunto ? 'raggiunto' : d == null ? '—' : (t.tipo === 'drawdown_ath' ? nf(Math.abs(d), 1) + ' punti' : pc(d, 1))}</dd></dl>` : '<p class="note">Dato non disponibile.</p>'}`;
}
function acardHTML(a) {
  const t = a.trigger, near = t && t.distanza != null && !t.raggiunto ? Math.max(0, Math.min(100, 100 - Math.abs(t.tipo === 'drawdown_ath' ? t.distanza * 3 : t.distanza))) : (t && t.raggiunto ? 100 : 0);
  const nn = newsFor(a.simbolo).filter(n => n.imp !== 'poco').length;
  return `<button class="acard" data-asset="${esc(a.simbolo)}"><div class="top"><div><h4>${esc(a.nome)}</h4><span class="sym">${esc(a.simbolo)} · Linea ${esc(a.linea)}</span></div><span class="chip ${a.scaduta ? 'warn' : ''}">${a.scaduta ? 'tesi scaduta' : esc(a.stato)}</span></div>
  <div>${callChip(a)}</div>
  ${a.dato_mancante ? '<p class="note">Prezzo non disponibile dalla fonte.</p>' : `<div class="px">${fmtV(a.prezzo)}</div><div class="ch"><span class="${cls(a.var_1g)}">${pc(a.var_1g)} 1g</span><span class="${cls(a.var_30g)}">${pc(a.var_30g)} 30g</span></div>${spark(S(a.simbolo))}`}
  ${t ? `<div><div class="prog"><i style="width:${near}%"></i></div><div class="small mute" style="margin-top:4px">${t.raggiunto ? 'Trigger raggiunto' : t.distanza != null ? 'Al trigger: ' + (t.tipo === 'drawdown_ath' ? nf(Math.abs(t.distanza), 1) + ' punti' : pc(t.distanza, 1)) : 'Trigger: dato assente'}</div></div>` : ''}
  <div class="small mute">${nn ? `<b class="up" style="color:var(--accent)">${nn}</b> notizie importanti` : 'Nessuna notizia importante'}</div></button>`;
}
function vAsset() {
  const all = assets(), sc = all.filter(a => a.scaduta).length, tr = all.filter(a => a.trigger && a.trigger.raggiunto).length;
  return `<div class="page-h"><div><h2>Asset</h2><p class="lead">Gli asset in osservazione, per categoria. Ogni scheda apre il suo cruscotto: prezzo, trigger, indicatori, tesi, portafoglio e notizie.</p></div></div>
  <div class="grid g4" style="margin-bottom:8px"><div class="card stat"><span class="l">Asset seguiti</span><span class="v">${all.length}</span></div><div class="card stat"><span class="l">Trigger raggiunti</span><span class="v ${tr ? 'up' : ''}">${tr}</span></div><div class="card stat"><span class="l">Tesi oltre la scadenza</span><span class="v ${sc ? 'warn' : ''}">${sc}</span><span class="s">da rinnovare o chiudere</span></div><div class="card stat"><span class="l">Posizioni aperte</span><span class="v">${DATA.portafoglio.posizioni.length}</span><span class="s">parte il ${dIT(DATA.portafoglio.giorno_zero)}</span></div></div>
  ${DATA.asset.map(c => `<div class="sec"><div class="sec-h">${esc(c.categoria)}<span class="sp mute">${esc(c.descr || '')}</span></div><div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(250px,1fr))">${c.voci.map(a => acardHTML(a)).join('')}</div></div>`).join('')}`;
}
function openAsset(sym) {
  const a = assets().find(x => x.simbolo === sym); if (!a) return;
  const cb = chartBlock(sym, { refs: a.trigger && a.trigger.tipo === 'prezzo' ? [{ v: a.trigger.soglia, l: 'Trigger', c: 'var(--accent)' }] : (a.simbolo === 'BTC-USD' && J().btc ? [{ v: J().btc.soglia_t1, l: 'T1', c: 'var(--down)' }, { v: J().btc.ath_ciclo, l: 'Massimo di ciclo', c: 'var(--warn)' }] : []) });
  const nws = newsFor(sym).sort((x, y) => rank[x.imp] - rank[y.imp] || y.data.localeCompare(x.data));
  const pos = DATA.portafoglio.posizioni.filter(p => JSON.stringify(p).includes(sym));
  openSheet(`<h2>${esc(a.nome)}</h2><p class="mute small"><span class="mono">${esc(a.simbolo)}</span> · ${esc(a.categoria)} · ${esc(a.stato)} · ${esc(a.settore)}</p>
  <div style="display:flex;gap:16px;align-items:baseline;flex-wrap:wrap;margin:10px 0 16px">${a.dato_mancante ? '<span class="note">Prezzo non disponibile dalla fonte.</span>' : `<span class="num" style="font-size:34px;letter-spacing:-.03em">${fmtV(a.prezzo)}</span>${chipPc(a.var_1g)} <span class="mute small">1g</span>${chipPc(a.var_7g)} <span class="mute small">7g</span>${chipPc(a.var_30g)} <span class="mute small">30g</span>`}${a.scaduta ? `<span class="chip warn">Tesi scaduta il ${dIT(a.scadenza)}</span>` : a.scadenza ? `<span class="chip">Scadenza tesi ${dIT(a.scadenza)}</span>` : ''}</div>
  ${decisionCard(a)}
  <div class="card sec">${cb.html}</div>
  <div class="grid g2 sec"><div class="card"><h3>Trigger di ingresso</h3>${trigBar(a.trigger)}</div>
  <div class="card"><h3>Posizione nel portafoglio</h3>${pos.length ? pos.map(p => `<pre class="mono small">${esc(JSON.stringify(p, null, 1))}</pre>`).join('') : `<p class="note">Nessuna posizione aperta. Il portafoglio virtuale da ${nf(DATA.portafoglio.capitale_iniziale_eur, 0)} euro parte il ${dIT(DATA.portafoglio.giorno_zero)} (tra ${DATA.portafoglio.giorni_mancanti} giorni).</p>`}</div></div>
  <div class="sec">${indicHTML(a.ind)}</div>
  <div class="card sec"><h3>Tesi e regole</h3><p class="thesis">${esc(a.tesi)}</p><dl class="kv l" style="margin-top:12px;grid-template-columns:130px 1fr"><dt>Catalizzatore</dt><dd>${esc(a.catalyst)}</dd><dt>Ingresso</dt><dd>${esc(a.entry)}</dd><dt>Kill condition</dt><dd>${esc(a.kill)}</dd></dl>
  ${(a.links || []).length ? `<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">${a.links.map(l => `<a class="btn" href="${esc(l[1])}" target="_blank" rel="noopener noreferrer">${esc(l[0])} su Notion ↗</a>`).join('')}</div>` : ''}
  <div style="margin-top:12px"><button class="btn" data-act="askasset" data-sym="${esc(sym)}">Chiedi a J-AI su questo asset</button></div></div>
  <div class="sec"><div class="sec-h">Notizie su ${esc(a.nome)}<span class="sp mute">${nws.length}</span></div>${nws.length ? `<div class="nlist">${nws.slice(0, 12).map(n => newsRow(n)).join('')}</div>` : '<div class="empty">Nessuna notizia selezionata su questo asset nelle ultime 72 ore.</div>'}</div>`, cb.mount);
}

/* ---------- DECISIONE JANUS + TICKET J-TRADE ---------- */
function gate() { const sem = store.get('janus.sem') || '', st = store.json('janus.stop', {}), stop = STOPS.every(s => st[s[0]]); return { sem, stop, ok: (sem === 'v' || sem === 'g') && stop }; }
function posOf(sym) { return DATA.portafoglio.posizioni.filter(p => JSON.stringify(p).includes(sym)); }
function decisione(a) {
  const t = a.trigger, kill = !!store.json('janus.kill', {})[a.simbolo], pos = posOf(a.simbolo).length > 0, j = J();
  const near = t && !t.raggiunto && t.distanza != null && Math.abs(t.distanza) <= (t.tipo === 'drawdown_ath' ? 5 : 10);
  const manual = t && /\(più/.test(t.testo);
  let r;
  if (kill) r = pos ? { c: 'ESCI', k: 'no', w: 'La kill condition è attivata: si esce al 100%. Non si negozia e non si aspetta conferma.' } : { c: 'NON ENTRARE', k: 'no', w: 'Hai segnato la kill condition come attivata: la tesi è invalidata.' };
  else if (pos && a.scaduta) r = { c: 'ESCI O DISTRIBUISCI', k: 'warn', w: 'La tesi è oltre la scadenza e c’è una posizione aperta: per le regole J-TRADE non si resta oltre la scadenza.' };
  else if (a.scaduta) r = { c: 'RINNOVA O CHIUDI', k: 'warn', w: `La tesi è scaduta il ${dIT(a.scadenza)}. Non si apre un J-TRADE su una tesi scaduta: va rinnovata con motivazione scritta, oppure archiviata.` };
  else if (pos) r = { c: 'MANTIENI E VERIFICA', k: '', w: 'Posizione aperta: controlla kill condition, scenario attivo e Position Review bisettimanale.' };
  else if (a.simbolo === 'BTC-USD') r = j.convergenza.scatta ? { c: 'ACQUISTO EXTRA DA VALUTARE', k: 'acc', w: `Segnali attivi ${j.convergenza.n}/3 (${j.convergenza.attivi.join(', ')}). Il DCA mensile prosegue; l’extra passa dal Protocollo STOP.` } : { c: 'DCA ORDINARIO', k: '', w: `Nessun acquisto extra: segnali attivi ${j.convergenza.n}/3, ne servono almeno 2.` };
  else if (a.simbolo === 'GC=F') r = { c: 'DCA ORDINARIO', k: '', w: 'Asset core: si accumula con il DCA mensile, senza trigger tattici.' };
  else if (t && t.nota) r = { c: 'ATTENDI', k: 'warn', w: 'Il trigger non è valutabile: soglia e prezzo non sono nella stessa unità. Va corretto prima di leggere qualsiasi esito.' };
  else if (!t) r = { c: 'ATTENDI', k: '', w: 'Nessun trigger misurabile definito: non c’è nulla da eseguire.' };
  else if (t.raggiunto) r = { c: 'VALUTA INGRESSO', k: 'acc', w: 'Il trigger numerico è raggiunto. Non è un ordine: apri il ticket, compila il Livello 1 e passa dai controlli.' };
  else if (near) r = { c: 'PREPARA INGRESSO', k: 'acc', w: 'Il trigger è vicino. Il Livello 1 si compila a mente fredda, prima che il mercato si muova.' };
  else r = { c: 'ATTENDI', k: '', w: 'Il trigger è lontano. Nessuna azione.' };
  const m = [];
  if (a.avviso) m.push('Attenzione ai dati: ' + a.avviso);
  if (t && t.attuale != null && !t.nota) m.push(`Trigger: ${t.testo} — ${t.raggiunto ? 'raggiunto' : t.distanza != null ? 'distanza ' + (t.tipo === 'drawdown_ath' ? nf(Math.abs(t.distanza), 1) + ' punti' : pc(t.distanza, 1)) : 'dato assente'}.`);
  if (manual && t.raggiunto) m.push('Il prezzo non basta: la regola chiede anche condizioni da verificare a mano (vedi “Ingresso”).');
  if (a.scadenza && !a.scaduta) m.push(`Scadenza tesi: ${dIT(a.scadenza)}.`);
  m.push('La kill condition non è leggibile in automatico: controllala tu: ' + a.kill);
  if (a.simbolo === 'BTC-USD') m.push(`Uscita: livello ${j.ex.livello} dei sensori di euforia.`);
  if (DATA.portafoglio.giorni_mancanti > 0) m.push(`Virtuale: il portafoglio di prova parte il ${dIT(DATA.portafoglio.giorno_zero)} (tra ${DATA.portafoglio.giorni_mancanti} giorni).`);
  r.m = m; r.kill = kill; r.pos = pos; return r;
}
function callChip(a) { const d = decisione(a); return `<span class="chip call ${d.k}">${esc(d.c.charAt(0) + d.c.slice(1).toLowerCase())}</span>`; }
function decisionCard(a) {
  const d = decisione(a), g = gate();
  return `<div class="card decide ${d.k}"><div class="dc-top"><span class="dc-l">Cosa dicono le regole JANUS</span><span class="dc-call">${esc(d.c)}</span></div>
  <p class="dc-w">${esc(d.w)}</p><ul class="dc-m">${d.m.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
  <div class="dc-g"><span class="chip ${g.sem === 'v' ? 'up' : g.sem === 'r' ? 'down' : g.sem ? 'warn' : ''}">Semaforo: ${g.sem ? SEM[g.sem][0] : 'non scelto'}</span><span class="chip ${g.stop ? 'up' : ''}">Protocollo STOP: ${g.stop ? 'completo' : 'incompleto'}</span><a class="chip" href="#janus" data-tab="janus">Vai ai controlli</a></div>
  <label class="killbox"><input type="checkbox" data-kill="${esc(a.simbolo)}" ${d.kill ? 'checked' : ''}><span><b>La kill condition è attivata</b><span>Verifica tu: ${esc(a.kill)}</span></span></label>
  <div class="dc-b"><button class="btn pri" data-act="ticket" data-s="${esc(a.simbolo)}">Apri il ticket J-TRADE</button><button class="btn" data-act="askticket" data-s="${esc(a.simbolo)}">Chiedi a J-AI il Devil’s Advocate</button></div>
  <p class="small mute">Strumento di supporto decisionale, non consulenza finanziaria. L’esito è la lettura delle regole JANUS, non un ordine: la decisione finale spetta a te.</p></div>`;
}
const TKF = [['orient', 'Orientamento', 'sel:LONG,SHORT'], ['strum', 'Strumento', 'sel:Spot,Futures,Opzioni'], ['broker', 'Broker', 't'], ['etipo', 'Tipo di ingresso', 'sel:Unica,DCA,A scala'], ['elivelli', 'Livelli di ingresso', 't'], ['econd', 'Condizione di ingresso', 't'],
  ['eprezzo', 'Prezzo medio d’ingresso previsto', 'n'], ['size', 'Dimensione in % del NAV', 'n'], ['importo', 'Importo in euro', 'n'], ['stop', 'Livello di stop', 'n'], ['scond', 'Condizione di stop (prezzo, evento o kill)', 't'],
  ['t1', 'Target 1 (livello e criterio)', 'n'], ['t2', 'Target 2 (facoltativo)', 'n'], ['prob', 'Probabilità di successo stimata, in %', 'n'], ['conv', 'Conviction Score, da 1 a 5', 'n'], ['risk', 'Rischio Score, da 1 a 5', 'n'],
  ['cat', 'Catalizzatore atteso, data e cosa deve accadere', 't'], ['kill', 'Kill condition oggettiva', 't'], ['scad', 'Scadenza della tesi', 't'], ['tqs', 'TQS con il suo intervallo di incertezza (si calcola con J-AI)', 't'],
  ['sA', 'Scenario A: la tesi si sviluppa. Azione', 't'], ['sB', 'Scenario B: correzione dentro i confini. Azione', 't'], ['sC', 'Scenario C: supporto rotto, kill non attivata. Azione', 't'], ['sD', 'Scenario D: kill attivata. Azione', 't']];
const TKREQ = ['orient', 'strum', 'broker', 'etipo', 'elivelli', 'econd', 'eprezzo', 'size', 'stop', 'scond', 't1', 'prob', 'conv', 'risk', 'cat', 'kill', 'sA', 'sB', 'sC', 'sD'];
function tkGet(sym) { return store.json('janus.tk.' + sym, {}); }
function tkVal(a, f) { const o = tkGet(a.simbolo); if (o[f] != null) return o[f];
  const pre = { kill: a.kill, scad: a.scadenza || '', orient: 'LONG', strum: 'Spot', econd: a.entry, eprezzo: a.prezzo != null ? String(Math.round(a.prezzo * 1e6) / 1e6) : '' }; return pre[f] ?? ''; }
const num = v => { const x = parseFloat(String(v).replace(',', '.')); return isNaN(x) ? null : x; };
function tkLive(a) {
  const g = gate(), d = decisione(a), v = f => tkVal(a, f), miss = [];
  TKREQ.forEach(f => { if (!String(v(f)).trim()) miss.push(TKF.find(x => x[0] === f)[1]); });
  const e = num(v('eprezzo')), s = num(v('stop')), t1 = num(v('t1')), t2 = num(v('t2')), conv = num(v('conv')), rk = num(v('risk')), sz = num(v('size')), pr = num(v('prob'));
  const long = v('orient') !== 'SHORT', rr = (tg) => e != null && s != null && tg != null && (long ? e > s : e < s) ? Math.abs(tg - e) / Math.abs(e - s) : null;
  const rr1 = rr(t1), rr2 = rr(t2), delta = conv != null && rk != null ? conv - rk : null;
  const words = String(tkGet(a.simbolo).pm || '').trim().split(/\s+/).filter(Boolean).length, needPm = conv != null && conv >= 4;
  if (needPm && words < 200) miss.push(`Pre-Mortem (${words}/200 parole)`);
  const dz = delta == null ? '' : delta >= 3 ? 'prioritario, size piena' : delta >= 1 ? 'posizione normale, scala con il MVP' : delta === 0 ? 'attendi il catalizzatore prima di entrare' : delta >= -2 ? 'entra in LAB, non in B2' : 'scarta o archivia';
  const bad = []; if (e != null && s != null && (long ? e <= s : e >= s)) bad.push('Lo stop è dal lato sbagliato rispetto all’ingresso.');
  if (pr != null && (pr < 0 || pr > 100)) bad.push('La probabilità deve stare tra 0 e 100.'); if ((conv != null && (conv < 1 || conv > 5)) || (rk != null && (rk < 1 || rk > 5))) bad.push('Conviction e Rischio vanno da 1 a 5.');
  let st;
  if (d.kill) st = ['no', 'Bloccato: kill condition attivata.']; else if (a.scaduta) st = ['no', 'Bloccato: tesi scaduta, va rinnovata prima.']; else if (g.sem === 'r') st = ['no', 'Bloccato: semaforo rosso. Nessuna operazione, nessuna eccezione.'];
  else if (!g.sem) st = ['no', 'Scegli il semaforo nella Plancia JANUS: si decide prima di guardare il prezzo.']; else if (!g.stop) st = ['no', 'Bloccato: il Protocollo STOP non è completo.'];
  else if (miss.length || bad.length) st = ['no', `Livello 1 incompleto: mancano ${miss.length} campi.`]; else st = ['ok', 'Livello 1 completo e controlli superati. Prossimo passo: Devil’s Advocate di J-AI, poi esecuzione e registrazione immediata nel REGISTRO OPS.'];
  return { st, miss, bad, rr1, rr2, delta, dz, words, needPm, anti: sz != null && sz > 5, sz, rrTxt: x => x == null ? '—' : nf(x, 1) + ' a 1' };
}
function tkPanel(a) {
  const L = tkLive(a);
  return `<div class="verdict ${L.st[0]}">${esc(L.st[1])}</div>
  <dl class="kv" style="margin-top:10px"><dt>R/R sul Target 1</dt><dd>${L.rrTxt(L.rr1)}</dd><dt>R/R sul Target 2</dt><dd>${L.rrTxt(L.rr2)}</dd><dt>Delta (Conviction − Rischio)</dt><dd>${L.delta == null ? '—' : (L.delta > 0 ? '+' : '') + L.delta + ' · ' + esc(L.dz)}</dd></dl>
  ${L.anti ? '<div class="alert red" style="margin-top:10px"><span class="ic">⚠</span><div><b>Oltre il 5% del NAV: Anti-Suicidio Operativo obbligatorio</b>Va compilato prima dell’esecuzione.</div></div>' : ''}
  ${L.needPm ? `<p class="note" style="margin-top:8px">Conviction ≥ 4: Pre-Mortem obbligatorio, almeno 200 parole, specifico. Parole scritte: <b>${L.words}</b>. J-AI ne verifica la qualità, non solo la presenza.</p>` : ''}
  ${L.bad.length ? `<p class="note down" style="margin-top:8px">${L.bad.map(esc).join(' ')}</p>` : ''}
  ${L.miss.length ? `<p class="note" style="margin-top:8px"><b>Mancano:</b> ${L.miss.map(esc).join(', ')}.</p>` : ''}
  <p class="note" style="margin-top:8px">Il Delta è un punto di partenza, non una risposta: se l’intuizione dice altro, va scritta e difesa. Il TQS e la probabilità sono stime: indica sempre il margine di errore.</p>`;
}
function ticketText(a) {
  const v = f => tkVal(a, f) || '—', o = tkGet(a.simbolo), g = gate(), L = tkLive(a);
  return `J-TRADE · Livello 1 — Pre-Trade (bozza dal cruscotto, ${new Date().toLocaleString('it-IT')})
ASSET: ${a.nome} (${a.simbolo}) · prezzo ${fmtV(a.prezzo)} del ${dIT(a.data || DATA.generato)}
LINEA: ${a.linea} · ORIENTAMENTO: ${v('orient')} · STRUMENTO: ${v('strum')} · BROKER: ${v('broker')}
BIAS CHECK: semaforo ${g.sem ? SEM[g.sem][0].toUpperCase() : 'NON SCELTO'}; Protocollo STOP ${g.stop ? 'completo' : 'INCOMPLETO'}
ANTI-SUICIDIO (>5% NAV): ${L.anti ? 'RICHIESTO' : 'non richiesto'}
ENTRY: ${v('etipo')} · livelli ${v('elivelli')} · condizione ${v('econd')} · prezzo medio ${v('eprezzo')}
SIZE: ${v('size')}% NAV · ${v('importo')} euro
STOP: ${v('stop')} · ${v('scond')}
TARGET: T1 ${v('t1')} · T2 ${v('t2')}
R/R: T1 ${L.rrTxt(L.rr1)} · T2 ${L.rrTxt(L.rr2)}
PROBABILITÀ STIMATA: ${v('prob')}% (indicare il margine di errore)
CONVICTION: ${v('conv')} · RISCHIO: ${v('risk')} · DELTA: ${L.delta == null ? '—' : L.delta} ${L.dz ? '(' + L.dz + ')' : ''}
TQS: ${v('tqs')}
CATALYST: ${v('cat')}
KILL CONDITION: ${v('kill')}
SCADENZA TESI: ${v('scad')}
PRE-MORTEM (${L.words} parole): ${o.pm || '—'}
SCENARI: A ${v('sA')} | B ${v('sB')} | C ${v('sC')} | D ${v('sD')}
Esito dei controlli del cruscotto: ${L.st[1]}`;
}
function openTicket(sym) {
  const a = assets().find(x => x.simbolo === sym); if (!a) return;
  const inp = ([f, l, ty]) => { const val = esc(tkVal(a, f)); if (ty.startsWith('sel:')) return `<label class="fld"><span>${esc(l)}</span><select data-tk="${f}">${ty.slice(4).split(',').map(o => `<option ${o === tkVal(a, f) ? 'selected' : ''}>${o}</option>`).join('')}</select></label>`;
    return `<label class="fld"><span>${esc(l)}</span><input data-tk="${f}" ${ty === 'n' ? 'inputmode="decimal"' : ''} value="${val}" autocomplete="off"></label>`; };
  openSheet(`<h2>Ticket J-TRADE · ${esc(a.nome)}</h2><p class="mute small">Livello 1 — Pre-Trade. Si compila a mente fredda. I campi si salvano solo su questo dispositivo.</p>
  <div class="decide ${decisione(a).k} card" style="margin:10px 0"><div class="dc-top"><span class="dc-l">Esito delle regole</span><span class="dc-call">${esc(decisione(a).c)}</span></div></div>
  <div class="sec"><div class="card"><div id="tkPanel">${tkPanel(a)}</div></div></div>
  <div class="tkgrid sec">${TKF.map(inp).join('')}</div>
  <label class="fld" style="margin-top:12px"><span>Pre-Mortem (obbligatorio se Conviction ≥ 4): la posizione è stata chiusa in perdita. 1) cosa è andato storto nella tesi; 2) quale segnale precoce ho ignorato; 3) quale bias; 4) cosa non rifarei</span><textarea data-tk="pm" rows="8">${esc(tkGet(sym).pm || '')}</textarea></label>
  <div class="dc-b" style="margin-top:14px"><button class="btn pri" data-act="copyticket" data-s="${esc(sym)}">Copia il ticket per J-AI</button><button class="btn" data-act="cleartk" data-s="${esc(sym)}">Azzera il ticket</button></div>
  <p class="small mute" style="margin-top:8px">Dopo il Devil’s Advocate di J-AI e l’esecuzione, registra subito l’operazione nel REGISTRO OPS e apri il Livello 3 entro 7 giorni dalla chiusura.</p>`);
}
function askTicket(a) { return `${snapshot()}\n\n${ticketText(a)}\n\nDomanda per J-AI: leggi la scheda J-RADAR e questo J-TRADE su Notion. Applica il Devil's Advocate: 3 motivi concreti per cui questa operazione può fallire, bias alert (euforia, urgenza, FOMO, frustrazione), qualità del Pre-Mortem, coerenza con il regime e con il motivo per cui esiste JANUS. Se il ticket non regge, dimmi di non operare.`; }
function decisionTable() {
  const rows = assets().map(a => ({ a, d: decisione(a) })), o = { 'ESCI': 0, 'NON ENTRARE': 1, 'ESCI O DISTRIBUISCI': 0, 'VALUTA INGRESSO': 2, 'ACQUISTO EXTRA DA VALUTARE': 2, 'PREPARA INGRESSO': 3, 'RINNOVA O CHIUDI': 4 };
  rows.sort((x, y) => (o[x.d.c] ?? 9) - (o[y.d.c] ?? 9));
  return `<div class="sec"><div class="sec-h">Cosa dicono le regole, asset per asset<span class="sp mute">lettura delle regole JANUS, non ordini</span></div><div class="card" style="padding:6px 16px">${rows.map(({ a, d }) => `<button class="radar-row" data-asset="${esc(a.simbolo)}"><span class="nm">${esc(a.nome)}<small>${esc(d.w)}</small></span><span class="mid"></span><span class="chip call ${d.k}">${esc(d.c.charAt(0) + d.c.slice(1).toLowerCase())}</span></button>`).join('')}</div></div>`;
}

/* ---------- RICERCA: J-RADAR, J-DRILL, J-HUNT ---------- */
const RS = { sub: store.get('janus.rsub') || 'radar' };
const CG = s => (DATA.mercato_cg || {})[s] || null;
const money = v => v == null ? '—' : v >= 1e9 ? '$' + nf(v / 1e9, 2) + ' mld' : v >= 1e6 ? '$' + nf(v / 1e6, 1) + ' mln' : '$' + nf(v, 0);
const daysTo = iso => Math.round((new Date(iso + 'T12:00:00') - Date.now()) / 864e5);
const isCrypto = a => /-USD$/.test(a.simbolo);
function ret(sym, n) { const s = S(sym); return s.length > n ? (s[s.length - 1][1] / s[s.length - 1 - n][1] - 1) * 100 : null; }
const mine = (k, d) => store.json(k, d);
const save = (k, o) => store.set(k, JSON.stringify(o));

/* --- J-RADAR: lettura per asset --- */
function radarLettura(a) {
  const j = J(), ind = a.ind || {}, t = a.trigger, kill = !!mine('janus.kill', {})[a.simbolo];
  const b48 = btc48(), r2 = ret(a.simbolo, 2), r7 = ret(a.simbolo, 7), b7 = ret('BTC-USD', 7);
  const rel7 = r7 != null && b7 != null && a.simbolo !== 'BTC-USD' ? r7 - b7 : null;
  const nn = newsFor(a.simbolo).filter(n => n.imp !== 'poco');
  let tipo = 'in linea con il mercato';
  if (a.simbolo === 'BTC-USD') tipo = 'è il mercato di riferimento';
  else if (b48 != null && b48 < -8) tipo = 'correlato al mercato (Bitcoin oltre −8% in 48 ore)';
  else if (rel7 != null && rel7 < -10) tipo = 'specifico dell’asset (7 giorni peggio di Bitcoin di ' + nf(Math.abs(rel7), 1) + ' punti)';
  else if (rel7 != null && rel7 > 10) tipo = 'specifico dell’asset, in positivo (7 giorni meglio di Bitcoin di ' + nf(rel7, 1) + ' punti)';
  const spec = /specifico dell’asset \(/.test(tipo), corr = /^correlato/.test(tipo);
  const near = t && !t.raggiunto && t.distanza != null && Math.abs(t.distanza) <= (t.tipo === 'drawdown_ath' ? 5 : 10);
  const ext = ind.rsi != null && (ind.rsi > 75 || ind.rsi < 25);
  let stato, dom, az, fin, why = [];
  if (kill) { stato = 'Pericolo'; dom = 'Hai segnato la kill condition come attivata.'; az = 'valuta uscita'; fin = 'immediata'; }
  else if (spec && rel7 < -10 && !a.scaduta) { stato = 'Pericolo'; dom = 'Il calo riguarda l’asset, non il mercato: verifica subito se la tesi regge.'; az = 'valuta uscita'; fin = '24-72h'; }
  else if (t && t.raggiunto && !a.scaduta) { stato = 'Opportunità'; dom = 'Il trigger di ingresso è raggiunto.'; az = 'valuta ingresso'; fin = '24-72h'; }
  else if (a.scaduta) { stato = 'Attenzione'; dom = `La tesi è scaduta il ${dIT(a.scadenza)}: va rinnovata con motivazione o archiviata.`; az = 'monitoraggio aumentato'; fin = 'settimana'; }
  else if (corr && !a.scaduta) { stato = 'Accumulo'; dom = 'Calo legato al mercato: la tesi dell’asset non è toccata. Se c’è spazio nel tetto, vale una tranche.'; az = 'niente'; fin = 'settimana'; }
  else if (near || ext) { stato = 'Attenzione'; dom = near ? 'Il trigger è vicino.' : `RSI a ${nf(ind.rsi, 0)}: mercato tirato.`; az = 'monitoraggio aumentato'; fin = '24-72h'; }
  else { stato = 'Nessuna novità'; dom = 'Nessun segnale che richieda attenzione adesso.'; az = 'niente'; fin = 'settimana'; }
  const lv = [['L1 Struttura di mercato', true], ['L2 Contesto macro', true], ['L3 Catalizzatori e calendario', !!(a.catalyst || a.scadenza)], ['L4 Flussi istituzionali', false], ['L5 Sentiment e narrativa', true], ['L6 On-chain', a.simbolo === 'BTC-USD']];
  const letti = lv.filter(x => x[1]).length;
  return { stato, dom, az, fin, conf: letti >= 5 ? 'medio' : 'basso', letti, lv, tipo, b48, r2, r7, b7, rel7, nn, kill, near };
}
function radarLivelli(a, R) {
  const j = J(), ind = a.ind || {}, ex = j.extra || {}, fg = j.segnali && j.segnali.T3, cg = CG(a.simbolo), mt = mine('janus.rm.' + a.simbolo, {});
  const row = (l, v, n) => `<dt>${esc(l)}</dt><dd>${v}${n ? `<small class="mute"> ${n}</small>` : ''}</dd>`;
  const txt = x => x == null ? '—' : x;
  const d = a.scadenza ? daysTo(a.scadenza) : null;
  return `<div class="card"><h3>Livello 1 · Struttura di mercato <span class="sp mute">dato di ${dIT(a.data || DATA.generato)}</span></h3><dl class="kv l" style="grid-template-columns:200px 1fr">
    ${row('Prezzo', fmtV(a.prezzo))}${row('Rispetto alla media a 50 giorni', ind.vs_sma50 != null ? pc(ind.vs_sma50, 1) : '—')}${row('Rispetto alla media a 200 giorni', ind.vs_sma200 != null ? pc(ind.vs_sma200, 1) : '—')}
    ${row('RSI a 14 giorni', ind.rsi != null ? nf(ind.rsi, 0) : '—', ind.rsi > 70 ? 'ipercomprato' : ind.rsi < 30 ? 'ipervenduto' : '')}${row('Posizione nel range 52 settimane', ind.pos_52s != null ? nf(ind.pos_52s, 0) + '%' : '—')}${row('Distanza dal massimo a 52 settimane', ind.dd_52s != null ? pc(ind.dd_52s, 1) : '—')}${row('Volatilità a 30 giorni (annua)', ind.vol_30g != null ? nf(ind.vol_30g, 0) + '%' : '—')}
    ${cg ? row('Volume 24 ore', money(cg.vol24), 'il confronto con la media a 30 giorni (soglia 2×) non è letto') : ''}
    ${a.simbolo === 'BTC-USD' ? row('Funding e open interest', `${ex.funding_btc_pct != null ? nf(ex.funding_btc_pct, 3) + '%' : '—'} · ${ex.oi_btc_mld != null ? '$' + nf(ex.oi_btc_mld, 1) + ' mld' : '—'}`, 'fonte OKX') : row('Funding, open interest, flussi delle balene', 'non letti', 'solo per Bitcoin')}</dl></div>
  <div class="card sec"><h3>Livello 2 · Contesto macro</h3><dl class="kv l" style="grid-template-columns:200px 1fr">
    ${j.regime.indicatori.map(x => row(x.nome, nf(x.valore, 2) + (x.unita || ''), x.var_30g != null ? pc(x.var_30g, 1) + ' in 30 giorni' : '')).join('')}
    ${row('Punteggio di regime 0-8', 'non calcolato', 'le soglie per ogni indicatore non sono nei documenti letti')}${row('Dominance Bitcoin', ex.dominance_btc != null ? nf(ex.dominance_btc, 1) + '%' : '—')}
    ${row('Livello di uscita', esc(j.ex.livello))}${row('Preallerta attivi', Object.values(j.preallerta).filter(x => x.attivo).length + ' di ' + Object.keys(j.preallerta).length + ' letti')}</dl></div>
  <div class="card sec"><h3>Livello 3 · Catalizzatori e calendario</h3><dl class="kv l" style="grid-template-columns:200px 1fr">
    ${row('Catalizzatore', esc(txt(a.catalyst)))}${row('Tipo di catalizzatore', esc(a.tipo_cat || '—'))}${row('Scadenza della tesi', a.scadenza ? `${dIT(a.scadenza)}` : '—', d == null ? '' : d < 0 ? `scaduta da ${-d} giorni` : `tra ${d} giorni`)}
    ${DATA.eventi.map(e => row(e.titolo, dIT(e.data), e.nota)).join('')}${row('Sblocchi di token, upgrade con data', 'non letti', 'da controllare a mano')}</dl></div>
  <div class="card sec"><h3>Livello 4 · Flussi istituzionali</h3><p class="note">Non letto in automatico (ETF, OTC, 13F, tesorerie aziendali). Va controllato a mano ogni settimana. Un 13F ha 30-60 giorni di ritardo: non batte un dato on-chain delle ultime 48 ore.</p></div>
  <div class="card sec"><h3>Livello 5 · Sentiment e narrativa</h3><dl class="kv l" style="grid-template-columns:200px 1fr">
    ${row('Fear & Greed', fg ? esc(fg.valore) : '—', 'ritardo tipico 1-3 giorni')}${row('Notizie importanti sull’asset', R.nn.length, 'ultime 72 ore, con fonte')}</dl>
    <div class="sec"><div class="small mute" style="margin-bottom:6px">Matrice retail / istituzioni (la compili tu, ogni settimana): ${mt.r && mt.i ? `<b>${esc(({ 'si|si': 'Distribuzione graduale', 'si|no': 'Distribuzione accelerata', 'no|si': 'Accumulo o mantenimento', 'no|no': 'Accumulo aggressivo' })[mt.r + '|' + mt.i])}</b>` : 'non compilata'}</div>
    <div class="grid g2"><label class="fld"><span>Retail entusiasta? (social +200% in 7 giorni, media generalisti, Fear & Greed sopra 70)</span><select data-rm="r" data-s="${esc(a.simbolo)}"><option value="">—</option><option value="no" ${mt.r === 'no' ? 'selected' : ''}>No, silente</option><option value="si" ${mt.r === 'si' ? 'selected' : ''}>Sì, entusiasta</option></select></label>
    <label class="fld"><span>Istituzioni dentro? (flussi ETF sostenuti, filing, tesorerie, price target)</span><select data-rm="i" data-s="${esc(a.simbolo)}"><option value="">—</option><option value="si" ${mt.i === 'si' ? 'selected' : ''}>Sì, dentro</option><option value="no" ${mt.i === 'no' ? 'selected' : ''}>No, fuori o scettiche</option></select></label></div></div></div>
  <div class="card sec"><h3>Livello 6 · On-chain</h3>${a.simbolo === 'BTC-USD' ? `<dl class="kv l" style="grid-template-columns:200px 1fr">${['T2'].map(k => j.segnali[k] ? row('MVRV Z-Score', esc(j.segnali[k].valore), j.segnali[k].ritardato ? 'ritardato di circa 7 giorni' : '') : '').join('')}</dl><p class="note">Riserve degli exchange, indirizzi attivi, indice dei minatori: da leggere a mano su Glassnode o CryptoQuant.</p>` : '<p class="note">Non letto in automatico: riserve degli exchange, MVRV, indirizzi attivi, sblocchi, concentrazione delle balene. Settimanale, a mano.</p>'}</div>`;
}
function radarText(a) {
  const R = radarLettura(a);
  return `J-RADAR · lettura del ${new Date(DATA.generato).toLocaleString('it-IT')}
ASSET: ${a.nome} (${a.simbolo})
STATO: ${R.stato}
SEGNALE DOMINANTE: ${R.dom}
AZIONE SUGGERITA: ${R.az}
FINESTRA TEMPORALE: ${R.fin}
LIVELLO DI CONFIDENZA: ${R.conf} (livelli letti in automatico: ${R.letti} su 6)
NOTE: il movimento è ${R.tipo}. Bitcoin nelle 48 ore ${pc(R.b48, 1)}; asset a 7 giorni ${pc(R.r7, 1)}, Bitcoin ${pc(R.b7, 1)}.`;
}
function openRadar(sym) {
  const a = assets().find(x => x.simbolo === sym); if (!a) return; const R = radarLettura(a);
  const td = mine('janus.td.' + sym, {}), TD = ['Il team riduce la comunicazione o ritarda senza spiegazioni', 'Un concorrente lancia un prodotto analogo con una partnership più forte', 'Il catalizzatore slitta per la seconda volta senza motivo tecnico', 'Il volume on-chain crolla mentre la narrativa è ancora attiva', 'I token di governance si concentrano in pochi wallet'];
  const ext = a.linea === 'LAB' && a.scaduta;
  openSheet(`<h2>J-RADAR · ${esc(a.nome)}</h2><p class="mute small"><span class="mono">${esc(a.simbolo)}</span> · Linea ${esc(a.linea)} · ${esc(a.stato)}</p>
  <div class="card decide ${R.stato === 'Pericolo' ? 'no' : R.stato === 'Opportunità' ? 'acc' : R.stato === 'Attenzione' ? 'warn' : ''} sec"><div class="dc-top"><span class="dc-l">Stato</span><span class="dc-call">${esc(R.stato)}</span></div><p class="dc-w"><b>${esc(R.dom)}</b></p>
  <dl class="kv l" style="grid-template-columns:190px 1fr"><dt>Azione suggerita</dt><dd>${esc(R.az)}</dd><dt>Finestra temporale</dt><dd>${esc(R.fin)}</dd><dt>Livello di confidenza</dt><dd>${esc(R.conf)} <small class="mute">(${R.letti} livelli su 6 letti in automatico; mai “alto” senza i flussi istituzionali e l’on-chain)</small></dd></dl></div>
  <div class="card sec"><h3>La domanda del J-RADAR</h3><p class="thesis">Quello che succede al prezzo riguarda la tesi o il mercato?</p><p class="note" style="margin-top:6px">Lettura: il movimento è <b>${esc(R.tipo)}</b>.${R.b48 != null ? ` Bitcoin nelle ultime 48 ore: ${pc(R.b48, 1)}.` : ''} ${R.r7 != null ? `Asset a 7 giorni: ${pc(R.r7, 1)}${R.b7 != null ? `, Bitcoin ${pc(R.b7, 1)}` : ''}.` : ''} Se riguarda il mercato, la tesi è intatta. Se riguarda la tesi, si esce. Prima di ogni stop vale lo Stop contestuale (Plancia JANUS).</p></div>
  <div class="sec">${radarLivelli(a, R)}</div>
  ${ext ? `<div class="card sec"><h3>Assessment di estensione LAB</h3><p class="note">La tesi LAB è scaduta. Si estende solo rispondendo per iscritto a tre domande: cosa è cambiato che giustifica l’attesa, qual è il nuovo trigger specifico, quando è la prossima review. Senza tutte e tre la regola è archiviare. Chi scrive la motivazione è la stessa persona che si è ancorata: il Devil’s Advocate lo fa J-AI.</p><p class="thesis" style="margin-top:8px">Se questo asset fosse proposto oggi ex novo, con i fatti di oggi, entrerebbe in LAB? Sì o no, senza giustificare.</p><div class="dc-b"><button class="btn" data-act="askext" data-s="${esc(sym)}">Chiedi l’assessment a J-AI</button></div></div>` : ''}
  <div class="card sec"><h3>Segnali di indebolimento della tesi<span class="sp mute">spunta ciò che osservi: ne basta uno per una review immediata</span></h3><div class="chk" id="tdk" data-s="${esc(sym)}">${TD.map((x, i) => `<label><input type="checkbox" data-td="${i}" ${td[i] ? 'checked' : ''}><span><b>${esc(x)}</b></span></label>`).join('')}</div></div>
  <div class="dc-b sec"><button class="btn pri" data-act="copyradar" data-s="${esc(sym)}">Copia la lettura per J-AI</button><button class="btn" data-act="askasset" data-sym="${esc(sym)}">Chiedi a J-AI su questo asset</button><button class="btn" data-act="opendrill" data-s="${esc(sym)}">Apri J-DRILL</button></div>`);
}

/* --- J-DRILL --- */
const STRATI = [['Strato 1 · La forza strutturale', 'Quale delle cinque forze JANUS spinge questo asset? Se la risposta non è immediata e precisa, l’asset non entra nel perimetro.'], ['Strato 2 · Il problema reale', 'Qualcuno paga già oggi per risolvere questo problema, senza blockchain? Chi, quanto? La tesi si spiega senza gergo?'], ['Strato 3 · La finestra temporale', 'Se nei prossimi 6 mesi non succede nulla di specifico, il prezzo sale lo stesso? Qual è il catalizzatore e ha una data? Cosa si aspetta il mercato, cosa potrebbe sorprenderlo, chi è sul palco?'], ['Strato 4 · Il filtro tecnico', 'Lo screener B2 qui sotto: tutti i criteri necessari. Se la tesi è fortissima ma lo screener fallisce, l’asset va in LAB, non in B2.'], ['Strato 5 · Il Devil’s Advocate', 'Qual è il motivo più concreto per cui la tesi è sbagliata? Chi guadagna se fallisce? Cosa deve essere vero nel mondo perché regga?']];
const SETTE = ['Come funziona tecnicamente: il meccanismo reale, non la narrativa', 'Chi guadagna se il prezzo sale e chi perde', 'Cosa succede al progetto se il token vale zero', 'Il vero concorrente, quello che erode davvero la posizione', 'Cosa dice il whitepaper che il team non ha ancora consegnato', 'Chi sono i holder più grandi e cosa hanno fatto con le loro posizioni', 'Se il catalizzatore sparisce domani, l’asset ha ancora una ragione di esistere'];
function drillScreener(a) {
  const cg = CG(a.simbolo), core = a.linea === 'A', m = mine('janus.dr.' + a.simbolo, {}), sc = m.sc || {};
  const mcMin = core ? 500e6 : 200e6, d = a.scadenza ? daysTo(a.scadenza) : null;
  const auto = [['Volume giornaliero sopra 5 milioni di dollari', cg ? cg.vol24 > 5e6 : null, cg ? money(cg.vol24) : 'dato non disponibile'], [`Capitalizzazione sopra ${core ? '500' : '200'} milioni${core ? ' (posizioni core)' : ''}`, cg ? cg.mc > mcMin : null, cg ? money(cg.mc) : 'dato non disponibile'],
    ['Catalizzatore con orizzonte inferiore a 6 mesi', d == null ? null : d >= 0 && d < 183, d == null ? 'scadenza assente' : d < 0 ? 'scadenza superata' : `scadenza tra ${d} giorni`]];
  const man = [['Listato su Binance, Coinbase o exchange UE regolamentato', 'lis'], ['Nessun hack negli ultimi 24 mesi', 'hack']];
  const ok = auto.every(x => x[1] === true) && man.every(x => sc[x[1]]);
  return `<div class="card sec"><h3>Screener B2<span class="sp mute">tutti i criteri sono necessari</span></h3><div class="chk">${auto.map(x => `<label style="cursor:default"><input type="checkbox" disabled ${x[1] ? 'checked' : ''}><span><b>${esc(x[0])}</b><span>${x[1] == null ? 'non verificabile' : x[1] ? 'superato' : 'non superato'} · ${esc(x[2])}</span></span></label>`).join('')}
  <label style="cursor:default"><input type="checkbox" disabled><span><b>Regime almeno 4 su 8</b><span>non verificabile: il punteggio di regime non è calcolato</span></span></label>
  ${man.map(x => `<label><input type="checkbox" data-sc="${x[1]}" data-s="${esc(a.simbolo)}" ${sc[x[1]] ? 'checked' : ''}><span><b>${esc(x[0])}</b><span>verifica manuale</span></span></label>`).join('')}</div>
  <div class="verdict ${ok ? 'ok' : 'no'}">${ok ? 'Criteri letti superati, ma manca il regime: non è un via libera.' : 'Lo screener non è superato o non è completo: se la tesi è forte, la destinazione è LAB, non B2.'}</div></div>`;
}
function ceilRes(a) {
  const cg = CG(a.simbolo), m = mine('janus.dr.' + a.simbolo, {}), tp = num(m.tp), peer = m.peer, pc2 = peer ? CG(peer) : null, imp = tp != null && cg ? tp * cg.supply : null;
  return imp != null ? `<div class="verdict ${imp > (pc2 ? pc2.mc : Infinity) ? 'no' : 'ok'}" style="margin-top:10px">A ${fmtV(tp)} la capitalizzazione implicita è ${money(imp)}: ${nf(imp / cg.mc, 1)} volte quella di oggi${cg.mc_ath ? `, ${nf(imp / cg.mc_ath, 1)} volte quella del suo massimo` : ''}${pc2 ? `; rispetto a ${esc(peer)} (${money(pc2.mc)} oggi, circa ${money(pc2.mc_ath)} al picco) è ${nf(imp / pc2.mc, 2)} volte` : ''}.</div><p class="note" style="margin-top:6px">Il verdetto (raggiungibile, aggressivo o implausibile) lo dai tu confrontando con i peer del settore al picco storico: se il tetto supera quello di asset consolidati senza una ragione strutturale, il target è narrativa. La capitalizzazione al picco è approssimata con l’offerta di oggi.</p>` : '<p class="note" style="margin-top:8px">Inserisci un prezzo obiettivo per vedere la capitalizzazione implicita.</p>';
}
function drillCeiling(a) {
  const cg = CG(a.simbolo), m = mine('janus.dr.' + a.simbolo, {}), tp = num(m.tp), peer = m.peer;
  if (!cg || !cg.supply) return `<div class="card sec"><h3>Tetto di capitalizzazione</h3><p class="note">Dato sulla capitalizzazione non disponibile per questo asset (solo i token quotati su CoinGecko).</p></div>`;
  const imp = tp != null ? tp * cg.supply : null, pc2 = peer ? CG(peer) : null;
  const peers = assets().filter(x => x.simbolo !== a.simbolo && CG(x.simbolo));
  return `<div class="card sec"><h3>Tetto di capitalizzazione (MC ceiling)<span class="sp mute">il target è una conseguenza matematica, non un’opinione</span></h3>
  <dl class="kv l" style="grid-template-columns:230px 1fr"><dt>Prezzo attuale</dt><dd>${fmtV(a.prezzo)}</dd><dt>Offerta circolante</dt><dd>${nf(cg.supply, 0)} token</dd><dt>Capitalizzazione attuale</dt><dd>${money(cg.mc)}${cg.rank ? ` · posizione ${cg.rank}` : ''}</dd><dt>Valutazione completamente diluita</dt><dd>${money(cg.fdv)}</dd><dt>Massimo storico</dt><dd>${fmtV(cg.ath)} del ${cg.ath_data ? dIT(cg.ath_data) : '—'} · capitalizzazione di allora circa ${money(cg.mc_ath)}</dd></dl>
  <div class="grid g2" style="margin-top:10px"><label class="fld"><span>Prezzo obiettivo ipotetico</span><input data-dr="tp" data-s="${esc(a.simbolo)}" value="${esc(m.tp || '')}" inputmode="decimal"></label>
  <label class="fld"><span>Asset di confronto</span><select data-dr="peer" data-s="${esc(a.simbolo)}"><option value="">—</option>${peers.map(p => `<option value="${esc(p.simbolo)}" ${peer === p.simbolo ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></label></div>
<div id="ceilRes">${ceilRes(a)}</div></div>`;
}
function drillText(a) {
  const m = mine('janus.dr.' + a.simbolo, {}), f = (k) => m[k] || '—', cg = CG(a.simbolo), s7 = m.s7 || {};
  return `J-DRILL · ${a.nome} (${a.simbolo}) · ${new Date().toLocaleDateString('it-IT')}
STRATO 0 — PANORAMICA
Cosa fa oggi: ${f('oggi')}
Cosa sta diventando: ${f('dive')}
Come guadagna: ${f('guad')}
Chi lo usa già oggi: ${f('usa')}
Da quanto esiste: ${f('dal')} · Concorrenti diretti: ${f('conc')} · Posizione nel mercato: ${f('pos')}
Capitalizzazione: ${cg ? money(cg.mc) : '—'} · Token: ${f('tok')}
Allineamento JANUS: ${a.tesi}
MC CEILING: prezzo ${fmtV(a.prezzo)} · offerta ${cg ? nf(cg.supply, 0) : '—'} · obiettivo ${f('tp')} · confronto ${f('peer')}
STRATI: ${STRATI.map((x, i) => x[0].split(' · ')[0] + (m.st && m.st[i] ? ' fatto' : ' DA FARE')).join(', ')}
LE 7 DOMANDE (fonte e data):
${SETTE.map((q, i) => `${i + 1}. ${q}\n   Risposta: ${(s7[i] || {}).r || '—'} | Fonte e data: ${(s7[i] || {}).f || '—'}`).join('\n')}
Destinazione proposta: ${f('dest')}`;
}
function openDrill(sym) {
  const a = assets().find(x => x.simbolo === sym); if (!a) return; const m = mine('janus.dr.' + sym, {}), st = m.st || {}, s7 = m.s7 || {};
  const t0 = [['oggi', 'Cosa fa oggi, in una frase e senza gergo'], ['dive', 'Cosa sta diventando: la traiettoria'], ['guad', 'Come guadagna: modello di ricavi reale'], ['usa', 'Chi lo usa già oggi: clienti identificabili'], ['dal', 'Da quanto esiste (anno)'], ['conc', 'Concorrenti diretti'], ['pos', 'Posizione nel mercato: leader, challenger, nicchia'], ['tok', 'A cosa serve il token nel sistema']];
  const nFonti = SETTE.filter((q, i) => (s7[i] || {}).f && String((s7[i] || {}).f).trim().length > 6).length, ombre = SETTE.length - nFonti;
  openSheet(`<h2>J-DRILL · ${esc(a.nome)}</h2><p class="mute small"><span class="mono">${esc(a.simbolo)}</span> · Linea ${esc(a.linea)} · le note si salvano solo su questo dispositivo</p>
  <p class="note sec">Prima si ragiona, poi eventualmente si verifica: il web serve a confermare, mai a scoprire. I campi sono tuoi; il cruscotto aggiunge solo i numeri che può leggere.</p>
  <div class="card sec"><h3>Strato 0 · Panoramica dell’asset</h3><div class="tkgrid">${t0.map(([k, l]) => `<label class="fld"><span>${esc(l)}</span><input data-dr="${k}" data-s="${esc(sym)}" value="${esc(m[k] || '')}" autocomplete="off"></label>`).join('')}</div>
   <dl class="kv l" style="grid-template-columns:230px 1fr;margin-top:10px"><dt>Allineamento JANUS (dalla tesi)</dt><dd>${esc(a.tesi)}</dd><dt>Settore</dt><dd>${esc(a.settore || '—')}</dd></dl></div>
  ${drillCeiling(a)}
  <div class="card sec"><h3>I sei strati<span class="sp mute">sequenza obbligatoria</span></h3><div class="chk">${STRATI.map((x, i) => `<label><input type="checkbox" data-ds="${i}" data-s="${esc(sym)}" ${st[i] ? 'checked' : ''}><span><b>${esc(x[0])}</b><span>${esc(x[1])}</span></span></label>`).join('')}</div></div>
  ${drillScreener(a)}
  <div class="card sec"><h3>Le sette domande, con fonte e data<span class="sp mute">${ombre ? `<b class="warn">${ombre} zone d’ombra</b>: senza fonte e data la risposta vale meno` : 'tutte con fonte'}</span></h3>${SETTE.map((q, i) => `<div style="margin-bottom:10px"><p class="note"><b>${i + 1}. ${esc(q)}</b></p><div class="grid g2"><label class="fld"><span>Risposta</span><input data-d7="r" data-i="${i}" data-s="${esc(sym)}" value="${esc((s7[i] || {}).r || '')}"></label><label class="fld"><span>Fonte e data (non basta “whitepaper”: serve la sezione e il periodo)</span><input data-d7="f" data-i="${i}" data-s="${esc(sym)}" value="${esc((s7[i] || {}).f || '')}"></label></div></div>`).join('')}</div>
  <label class="fld sec"><span>Destinazione proposta: B2, LAB oppure Osservatorio</span><select data-dr="dest" data-s="${esc(sym)}">${['', 'B2', 'LAB', 'Osservatorio'].map(o => `<option ${m.dest === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label>
  <div class="card sec"><h3>Kill condition e Devil’s Advocate</h3><dl class="kv l" style="grid-template-columns:190px 1fr"><dt>Kill condition attuale</dt><dd>${esc(a.kill)}</dd><dt>Catalizzatore</dt><dd>${esc(a.catalyst)}</dd></dl><p class="note" style="margin-top:8px">Il Devil’s Advocate non è uguale per tutti: un token DePIN ha rischi diversi da un ETF o da un’azione. Si chiede a J-AI, che deve produrre tre motivi concreti per cui l’asset fallisce.</p></div>
  <div class="dc-b sec"><button class="btn pri" data-act="copydrill" data-s="${esc(sym)}">Copia il J-DRILL per J-AI</button><button class="btn" data-act="openradar" data-s="${esc(sym)}">Apri J-RADAR</button></div>
  <p class="small mute">Strumento di supporto decisionale, non consulenza finanziaria.</p>`);
}

/* --- J-HUNT --- */
function primoLunedi(y, m) { const d = new Date(y, m, 1); d.setDate(1 + (8 - d.getDay()) % 7); return d; }
function prossimoHunt() { const n = new Date(); n.setHours(0, 0, 0, 0); for (let k = 0; k < 14; k++) { const d = primoLunedi(n.getFullYear(), n.getMonth() + k); if (d >= n) return { d, q: [0, 3, 6, 9].includes(d.getMonth()) }; } }
function correlationBreak() {
  const b7 = ret('BTC-USD', 7); if (b7 == null) return [];
  return assets().filter(a => isCrypto(a) && a.simbolo !== 'BTC-USD').map(a => ({ a, r7: ret(a.simbolo, 7) })).filter(x => x.r7 != null).map(x => ({ ...x, gap: x.r7 - b7 })).filter(x => Math.abs(x.gap) >= 10 || (b7 < -2 && x.r7 > 3) || (b7 > 2 && x.r7 < -3)).sort((x, y) => Math.abs(y.gap) - Math.abs(x.gap));
}
function vHunt() {
  const H = DATA.hunt; if (!H) return '<div class="empty">Dati J-HUNT non presenti nell’ultimo aggiornamento.</div>';
  const nx = prossimoHunt(), reg = (mine('janus.hunt.reg', [])), cb = correlationBreak(), fl = mine('janus.hunt.fl', {});
  const all = [...reg.map(r => ({ ...r, mio: true })), ...H.registro.slice().reverse()];
  return `<div class="grid g3"><div class="card stat"><span class="l">Prossimo Hunt strutturale</span><span class="v" style="font-size:22px">${nx.d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}</span><span class="s">primo lunedì del mese${nx.q ? ' · è anche il trimestre del calendario dei catalizzatori' : ''}</span></div>
  <div class="card stat"><span class="l">Segnali nel registro</span><span class="v">${all.length}</span><span class="s">${H.registro.filter(r => /J-DRILL/.test(r.decisione)).length} promossi · ${H.registro.filter(r => /Osservatorio/.test(r.decisione)).length} in osservatorio</span></div>
  <div class="card stat"><span class="l">Ultimo registro su Notion</span><span class="v" style="font-size:22px">${dIT(H.registro[H.registro.length - 1].data)}</span><span class="s">${-daysTo(H.registro[H.registro.length - 1].data)} giorni fa: il registro vive su Notion</span></div></div>
  <div class="sec"><div class="sec-h">Revisioni programmate</div><div class="card" style="padding:6px 16px">${H.revisioni.map(([d, t]) => { const n = daysTo(d); return `<div class="radar-row" style="cursor:default"><span class="nm">${esc(t)}<small>${dIT(d)}</small></span><span class="mid"></span><span class="chip ${n < 0 ? 'warn' : ''}">${n < 0 ? 'in ritardo di ' + (-n) + ' giorni' : 'tra ' + n + ' giorni'}</span></div>`; }).join('')}</div></div>
  <div class="sec"><div class="sec-h">Calendario dei catalizzatori<span class="sp mute">Hunt per catalizzatore, aggiornato ogni trimestre</span></div><div class="card scroll-x" style="padding:6px"><table class="tbl"><thead><tr><th>Quando</th><th>Evento</th><th>Beneficiari</th><th>Cosa fare</th></tr></thead><tbody>${H.calendario.map(([d, e, b, az]) => { const n = daysTo(d); return `<tr><td class="num">${dIT(d, { month: 'short', year: 'numeric' })}<br><small class="${n < 0 ? 'mute' : ''}">${n < 0 ? 'passato' : 'tra ' + n + ' g'}</small></td><td><b>${esc(e)}</b></td><td>${esc(b)}</td><td>${esc(az)}</td></tr>`; }).join('')}</tbody></table></div><p class="note" style="margin-top:6px">Le date sono quelle del registro Notion, spesso solo il trimestre: verifica sempre la data ufficiale.</p></div>
  <div class="sec"><div class="sec-h">Hunt per anomalia<span class="sp mute">sette tipi · cosa legge il cruscotto e cosa no</span></div><div class="grid g2">${H.anomalie.map(([n, t, st, nota]) => `<div class="card"><div style="display:flex;justify-content:space-between;gap:8px"><b>${n}. ${esc(t)}</b><span class="chip ${st === 'parziale' ? 'acc' : ''}">${st === 'parziale' ? 'letta in parte' : 'non letta'}</span></div><p class="note" style="margin-top:6px">${esc(nota)}</p>${n === 4 ? (cb.length ? `<ul class="dc-m" style="margin-top:8px">${cb.map(x => `<li><b>${esc(x.a.nome)}</b>: ${pc(x.r7, 1)} in 7 giorni contro ${pc(ret('BTC-USD', 7), 1)} di Bitcoin (scarto ${pc(x.gap, 1)}). Spiegazione banale da escludere: notizia propria o poca liquidità.</li>`).join('')}</ul>` : '<p class="note" style="margin-top:8px"><b>Oggi nessuna rottura rilevata</b> tra gli asset seguiti.</p>') : ''}</div>`).join('')}</div>
  ${DATA.anomalie.length ? `<p class="note" style="margin-top:8px">Mosse anomale dei mercati rilevate ora: ${DATA.anomalie.map(x => esc(x.nome) + ' ' + pc(x.var_1g, 1)).join('; ')}. Se riguardano un asset fuori dalla watchlist sono un segnale grezzo da registrare.</p>` : ''}</div>
  <div class="sec"><div class="sec-h">Hunt strutturale<span class="sp mute">una forza al mese</span></div><div class="grid g3">${H.forze.map(([n, q], i) => `<div class="card"><b>Forza ${i + 1} · ${esc(n)}</b><p class="note" style="margin-top:6px">${esc(q)}</p></div>`).join('')}</div></div>
  <div class="sec"><div class="sec-h">Filtro JANUS<span class="sp mute">un segnale diventa J-DRILL solo se tutte e quattro sono sì</span></div><div class="card"><div class="chk" id="flt">${H.filtro.map((q, i) => `<label><input type="checkbox" data-fl="${i}" ${fl[i] ? 'checked' : ''}><span><b>${i + 1}. ${esc(q)}</b></span></label>`).join('')}</div>
   <label class="fld" style="margin-top:10px"><span>La spiegazione più semplice per questo segnale è… (obbligatoria: se è più probabile di quella interessante, il segnale si scarta)</span><input data-fl="ban" value="${esc(fl.ban || '')}"></label>
   <div class="verdict ${H.filtro.every((q, i) => fl[i]) && (fl.ban || '').trim().length > 10 ? 'ok' : 'no'}">${H.filtro.every((q, i) => fl[i]) && (fl.ban || '').trim().length > 10 ? 'Il segnale passa: va in J-DRILL. Registralo.' : 'Se anche una risposta è no, o manca la spiegazione banale: scarta o metti in osservatorio con una data di revisione.'}</div></div></div>
  <div class="sec"><div class="sec-h">Registro segnali<span class="sp mute">${esc(H.fonte)}</span></div>
   <div class="card"><div class="grid g2"><label class="fld"><span>Nuovo segnale</span><input id="nsSeg" autocomplete="off"></label><label class="fld"><span>Asset o settore</span><input id="nsAss" autocomplete="off"></label>
   <label class="fld"><span>Modalità</span><select id="nsMod"><option value="A">A · strutturale</option><option value="B">B · anomalia</option><option value="C">C · catalizzatore</option></select></label><label class="fld"><span>Decisione</span><select id="nsDec"><option>J-DRILL</option><option>Osservatorio</option><option>Scartato</option></select></label></div><div class="dc-b"><button class="btn" data-act="addsig">Aggiungi al registro (solo su questo dispositivo)</button><button class="btn" data-act="copyreg">Copia il registro per Notion</button></div></div>
   <div class="card scroll-x sec" style="padding:6px"><table class="tbl"><thead><tr><th>Data</th><th>Segnale</th><th>Mod.</th><th>Asset</th><th>Filtro</th><th>Decisione</th><th>Note</th></tr></thead><tbody>${all.map(r => `<tr><td class="num">${dIT(r.data, { day: 'numeric', month: 'short' })}</td><td>${esc(r.segnale)}</td><td>${esc(r.modalita)}</td><td><b>${esc(r.asset)}</b>${r.mio ? ' <span class="chip">tuo</span>' : ''}</td><td>${esc(r.filtro || '—')}</td><td>${esc(r.decisione)}</td><td>${esc(r.note || '')}</td></tr>`).join('')}</tbody></table></div></div>
  <p class="small mute sec">Un segnale su dieci supera il filtro, un J-DRILL su cinque diventa una posizione: è normale. Ogni scarto è una decisione cosciente.</p>`;
}
function vRadarList() {
  const rows = assets().map(a => ({ a, R: radarLettura(a) })), o = { Pericolo: 0, Opportunità: 1, Attenzione: 2, Accumulo: 3, 'Nessuna novità': 4 };
  rows.sort((x, y) => o[x.R.stato] - o[y.R.stato]);
  const tone = s => s === 'Pericolo' ? 'no' : s === 'Opportunità' ? 'acc' : s === 'Attenzione' ? 'warn' : '';
  return `<p class="lead">Una lettura per ogni asset, sui sei livelli del J-RADAR. Risponde a una sola domanda: quello che succede al prezzo riguarda la tesi o il mercato? Ogni livello non letto in automatico è dichiarato, e per questo la confidenza non è mai “alta”.</p>
  <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr))">${rows.map(({ a, R }) => `<button class="acard" data-act="openradar" data-s="${esc(a.simbolo)}"><div class="top"><div><h4>${esc(a.nome)}</h4><span class="sym">${esc(a.simbolo)} · Linea ${esc(a.linea)}</span></div><span class="chip call ${tone(R.stato)}">${esc(R.stato)}</span></div><p class="note">${esc(R.dom)}</p><dl class="kv l" style="grid-template-columns:100px 1fr"><dt>Movimento</dt><dd>${esc(R.tipo)}</dd><dt>Azione</dt><dd>${esc(R.az)}</dd><dt>Confidenza</dt><dd>${esc(R.conf)} · ${R.letti}/6 livelli</dd></dl></button>`).join('')}</div>`;
}
function vDrillList() {
  return `<p class="lead">La scheda di ricerca di ogni asset: panoramica, tetto di capitalizzazione calcolato sui dati di mercato, i sei strati, lo screener B2 e le sette domande con fonte e data. Le risposte le scrivi tu: il cruscotto mette i numeri e segnala le zone d’ombra.</p>
  <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr))">${assets().map(a => { const m = mine('janus.dr.' + a.simbolo, {}), st = Object.values(m.st || {}).filter(Boolean).length, s7 = Object.values(m.s7 || {}).filter(x => x && x.f && x.f.trim().length > 6).length, cg = CG(a.simbolo);
    return `<button class="acard" data-act="opendrill" data-s="${esc(a.simbolo)}"><div class="top"><div><h4>${esc(a.nome)}</h4><span class="sym">${esc(a.simbolo)} · Linea ${esc(a.linea)}</span></div><span class="chip">${esc(m.dest || 'da decidere')}</span></div><dl class="kv l" style="grid-template-columns:130px 1fr"><dt>Capitalizzazione</dt><dd>${cg ? money(cg.mc) : '—'}</dd><dt>Strati completati</dt><dd>${st} di 6</dd><dt>Domande con fonte</dt><dd>${s7} di 7</dd></dl></button>`; }).join('')}</div>`;
}
function vTradeList() {
  const rows = assets().map(a => ({ a, d: decisione(a), tk: tkGet(a.simbolo) })), o = { 'ESCI': 0, 'ESCI O DISTRIBUISCI': 0, 'VALUTA INGRESSO': 1, 'ACQUISTO EXTRA DA VALUTARE': 1, 'PREPARA INGRESSO': 2, 'RINNOVA O CHIUDI': 3, 'NON ENTRARE': 4 };
  rows.sort((x, y) => (o[x.d.c] ?? 9) - (o[y.d.c] ?? 9));
  return `<p class="lead">L’ultimo anello: per ogni asset la lettura delle regole (compra, vendi, attendi) e il ticket J-TRADE da compilare prima di operare. Il cruscotto legge le regole; la decisione e il Devil’s Advocate di J-AI restano a te.</p>
  <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr))">${rows.map(({ a, d, tk }) => { const n = Object.values(tk || {}).filter(x => x && String(x).trim()).length;
    return `<button class="acard" data-act="ticket" data-s="${esc(a.simbolo)}"><div class="top"><div><h4>${esc(a.nome)}</h4><span class="sym">${esc(a.simbolo)} · Linea ${esc(a.linea)}</span></div><span class="chip call ${d.k}">${esc(d.c.charAt(0) + d.c.slice(1).toLowerCase())}</span></div><p class="note">${esc(d.w)}</p><p class="small mute" style="margin-top:6px">${n ? 'Ticket in corso: ' + n + ' campi compilati' : 'Ticket non ancora aperto'}</p></button>`; }).join('')}</div>`;
}
function vRicerca() {
  const subs = [['radar', 'J-RADAR', 'monitora'], ['drill', 'J-DRILL', 'seleziona'], ['hunt', 'J-HUNT', 'scopre'], ['trade', 'J-TRADE', 'decide']];
  return `<div class="page-h"><div><h2>Ricerca</h2><p class="lead">La catena completa: J-HUNT trova, J-DRILL valida, J-RADAR monitora, J-TRADE decide. Qui vedi cosa dicono i numeri e cosa devi ancora scrivere o verificare tu.</p></div></div>
  <div class="seg" id="rsub">${subs.map(([k, l, d]) => `<button data-rs="${k}" class="${RS.sub === k ? 'on' : ''}"><b>${l}</b><small>${d}</small></button>`).join('')}</div>
  <div class="sec">${RS.sub === 'radar' ? vRadarList() : RS.sub === 'drill' ? vDrillList() : RS.sub === 'trade' ? vTradeList() : vHunt()}</div>`;
}

/* ---------- BLIND SPOT ---------- */
function vBlind() {
  const B = DATA.blindspot;
  return `<div class="page-h"><div><h2>Blind Spot</h2><p class="lead">Temi osservati fuori dal portafoglio principale, finché non soddisfano i criteri di promozione. Qui vedi cosa si muove, quali notizie li toccano e quanto manca alla promozione.</p></div></div>
  <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr))">${B.temi.map(t => { const nn = newsFor(t.id).filter(n => n.imp !== 'poco').length;
    return `<button class="acard" data-bs="${t.id}"><div class="top"><div><span class="sym">${t.id} · Fase ${esc(t.fase)}</span><h4>${esc(t.nome)}</h4></div><span class="chip ${t.priorita === 'Alta' ? 'acc' : ''}">Priorità ${esc(t.priorita || '—').toLowerCase()}</span></div>
    <dl class="kv l" style="grid-template-columns:90px 1fr"><dt>Stato</dt><dd>${esc(t.stato)}</dd><dt>Linee</dt><dd>${esc(t.linee)}</dd><dt>Limite</dt><dd>${esc(t.size_cap)}</dd></dl>
    ${t.asset.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap">${t.asset.map(x => `<span class="chip">${esc(x.nome.split(' (')[0])} <span class="${cls(x.var_30g)} num">${pc(x.var_30g, 0)}</span></span>`).join('')}</div>` : '<p class="note">Nessun asset quotato associato: tema da osservare solo con le notizie.</p>'}
    ${t.indicatori.map(i => `<div class="note"><span class="led ${i.attivo ? 'on' : ''}"></span>${esc(i.nome)}: <b class="num">${esc(i.valore)}</b> (soglia ${esc(i.soglia)})</div>${i.nome.includes('TVL') ? '<div class="small mute">Valore da verificare con una seconda fonte: DefiLlama può sottostimare il settore.</div>' : ''}`).join('')}
    <div class="small mute">${nn ? `<b style="color:var(--accent)">${nn}</b> notizie importanti` : 'Nessuna notizia importante'}</div></button>`; }).join('')}</div>
  <div class="sec"><div class="sec-h">Temi macro osservati</div><div class="grid g3">${B.macro.map(m => `<button class="card" style="text-align:left" data-bs="${m.id}"><span class="sym mono mute small">${m.id}</span><h4 style="font:600 16px var(--f-ui);margin:2px 0 6px">${esc(m.nome)}</h4><p class="note">${esc(m.trigger || '')}</p><p class="small mute" style="margin-top:6px">${newsFor(m.id).filter(n => n.imp !== 'poco').length} notizie importanti</p></button>`).join('')}</div></div>`;
}
function promoChecks(t) {
  const parts = t.promozione.split(/\s*(?:,| e | \+ )\s*/).filter(Boolean), st = store.json('janus.promo.' + t.id, {});
  return `<div class="chk" id="promo" data-t="${t.id}">${parts.map((p, i) => `<label><input type="checkbox" data-pr="${i}" ${st[i] ? 'checked' : ''}><span><b>${esc(p.charAt(0).toUpperCase() + p.slice(1))}</b><span>Verifica manuale: spunta quando è dimostrato con una fonte.</span></span></label>`).join('')}</div><p class="note" style="margin-top:8px">Servono tutti i criteri. Nessuna promozione per entusiasmo.</p>`;
}
function openBlind(id) {
  const t = DATA.blindspot.temi.find(x => x.id === id) || DATA.blindspot.macro.find(x => x.id === id); if (!t) return;
  const nws = newsFor(id).sort((x, y) => rank[x.imp] - rank[y.imp] || y.data.localeCompare(x.data));
  openSheet(`<h2>${esc(t.id)} · ${esc(t.nome)}</h2><p class="mute small">${esc(t.stato || '')}${t.fase ? ' · Fase ' + esc(t.fase) : ''}${t.linee ? ' · Linee ' + esc(t.linee) : ''}</p>
  <div class="grid g2 sec"><div class="card"><h3>Cosa attiva il tema</h3><p class="thesis">${esc(t.trigger || '—')}</p></div><div class="card"><h3>Per passare nel portafoglio</h3>${t.promozione ? promoChecks(t) : '<p class="note">Criteri non definiti per i temi macro.</p>'}${t.size_cap ? `<p class="note" style="margin-top:8px">Limite di dimensione: <b>${esc(t.size_cap)}</b></p>` : ''}</div></div>
  ${(t.asset || []).length ? `<div class="sec"><div class="sec-h">Asset del tema</div><div class="card scroll-x" style="padding:6px"><table class="tbl"><thead><tr><th>Asset</th><th>Prezzo</th><th>1 g</th><th>30 g</th><th>90 g</th></tr></thead><tbody>${t.asset.map(x => `<tr class="click" data-sym="${esc(x.simbolo)}"><td><b>${esc(x.nome)}</b></td><td class="num">${fmtV(x.prezzo)}</td><td class="num ${cls(x.var_1g)}">${pc(x.var_1g)}</td><td class="num ${cls(x.var_30g)}">${pc(x.var_30g)}</td><td class="num ${cls(x.var_90g)}">${pc(x.var_90g)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
  <div class="sec"><div class="sec-h">Notizie del tema<span class="sp mute">${nws.length}</span></div>${nws.length ? `<div class="nlist">${nws.slice(0, 14).map(n => newsRow(n)).join('')}</div>` : '<div class="empty">Nessuna notizia selezionata nelle ultime 72 ore. Ricorda: la rete non scopre i temi, li conferma.</div>'}</div>`);
}

/* ---------- PLANCIA JANUS ---------- */
const SEM = { v: ['Verde', 'Lucido e razionale: operatività normale.'], g: ['Giallo', 'Stress moderato: Protocollo STOP obbligatorio prima di operare.'], r: ['Rosso', 'Euforia, panico o frustrazione intensa: nessuna operazione, nessuna eccezione.'] };
const STOPS = [['S', 'Stop', '60 secondi di pausa assoluta e respiro 4-7-8. Sono in stato Verde?'], ['T', 'Think', 'Perché ora? Qual è la kill condition? Quale bias sto subendo? Rispondo chiaramente a tutte e tre?'], ['O', 'Observe', 'Il regime macro è coerente? Il semaforo è Verde?'], ['P', 'Plan', 'Stop loss, target, rapporto rischio/rendimento e TQS calcolato in modo esplicito?']];
const CTX = [['Il drawdown è correlato al mercato?', 'Bitcoin è sceso oltre l’8% nelle ultime 48 ore? Se sì è un movimento di regime.'], ['La kill condition specifica è attivata?', 'Se sì: esci subito, nessuna eccezione.'], ['Il catalizzatore originale è intatto?', 'Intatto e drawdown correlato: mantieni.'], ['C’è ancora spazio nel tetto di accumulo?', 'Spazio disponibile e tesi intatta: valuta una tranche aggiuntiva.']];
function btc48() { const s = S('BTC-USD'); if (s.length < 4) return null; return (s[s.length - 1][1] / s[s.length - 3][1] - 1) * 100; }
function vJanus() {
  const j = J(), b = j.btc, cv = j.convergenza, pf = DATA.portafoglio;
  const sem = store.get('janus.sem') || '', st = store.json('janus.stop', {}), cx = store.json('janus.ctx', {});
  const lamp = k => { const s = j.segnali[k]; if (!s) return `<div class="lamp"><span class="id">${k}</span><span class="note">Dato non disponibile</span></div>`;
    return `<div class="lamp ${s.attivo ? 'on' : ''}"><span class="id">${k} · ${esc(s.fonte)}</span><span class="val">${esc(s.valore)}</span><span class="note">${esc(s.nome)}</span><span class="st ${s.attivo ? 'down' : 'up'}"><span class="led ${s.attivo ? 'on' : ''}"></span>${s.attivo ? 'Attivo' : 'Non attivo'} · soglia ${esc(s.soglia)}</span>${s.ritardato ? '<span class="small mute">Dato ritardato di circa 7 giorni dalla fonte gratuita.</span>' : ''}${sensTxt(k, s)}</div>`; };
  const sens = o => Object.entries(o).map(([k, s]) => `<div class="sn ${s.attivo ? 'on' : ''}"><div class="t"><span><span class="led ${s.attivo ? 'on' : ''}"></span>${k} · ${esc(s.nome)}</span></div><div class="v">${esc(s.valore)}</div><div class="f">soglia ${esc(s.soglia)} · ${esc(s.fonte)}${s.data ? ' · ' + esc(s.data) : ''}</div>${sensTxt(k, s)}</div>`).join('');
  const rows = assets().filter(a => a.trigger).sort((x, y) => (x.trigger.raggiunto ? -1 : 0) - (y.trigger.raggiunto ? -1 : 0) || Math.abs(x.trigger.distanza ?? 1e9) - Math.abs(y.trigger.distanza ?? 1e9));
  const scad = assets().filter(a => a.scaduta);
  const m = j.regime.indicatori, ex = j.extra;
  const allStop = STOPS.every(s => st[s[0]]);
  let verdict = '';
  if (sem === 'r') verdict = '<div class="verdict no">Semaforo rosso: nessuna operazione, nessuna eccezione.</div>';
  else if (allStop && sem) verdict = `<div class="verdict ok">Tutti i passi superati${sem === 'g' ? ' (semaforo giallo: il Protocollo STOP era obbligatorio)' : ''}. Resta la domanda invariante: questa decisione è coerente con il motivo per cui esiste JANUS?</div>`;
  else verdict = '<div class="verdict no">Se anche un solo passo fallisce, non si opera. Non esistono urgenze.</div>';
  const b48 = btc48();
  return `<div class="page-h"><div><h2>Plancia JANUS</h2><p class="lead">Tutti i segnali, i sensori e le regole del sistema in una sola schermata. Le letture sono automatiche; le decisioni restano tue.</p></div><button class="btn" data-act="askall">Chiedi a J-AI il quadro completo</button></div>
  ${cv.scatta ? `<div class="alert red"><span class="ic">⚠</span><div><b>Almeno due segnali su tre sono attivi (${cv.attivi.join(', ')})</b>Si può valutare un acquisto extra solo dopo il Protocollo STOP. ${esc(cv.avviso || '')}</div></div>` : ''}
  <div class="sec-h" style="margin-top:6px">Trigger di acquisto extra<span class="sp">servono almeno 2 segnali su 3 · attivi ora: <b>${cv.n}/3</b></span></div>
  <div class="lamps">${['T1', 'T2', 'T3'].map(lamp).join('')}</div>
  ${b ? `<div class="grid g2 sec" style="margin-top:14px"><div class="card"><h3>Bitcoin e soglia T1</h3><div class="num" style="font-size:30px;letter-spacing:-.03em">$${nf(b.prezzo, 0)}</div><div class="gauge" style="margin:12px 0 4px"><div class="scale" style="background:linear-gradient(90deg,var(--down),var(--warn) 30%,var(--up-soft))"><u style="left:${Math.max(0, Math.min(100, (b.prezzo - 40000) / (b.ath_ciclo - 40000) * 100))}%"></u></div><div class="lbl"><span>$40.000</span><span>T1 $${nf(b.soglia_t1, 0)}</span><span>massimo $${nf(b.ath_ciclo, 0)}</span></div></div>
    <dl class="kv"><dt>Dal massimo di ciclo (${dIT(b.ath_data, { day: 'numeric', month: 'short', year: 'numeric' })})</dt><dd class="${cls(b.drawdown_pct)}">${pc(b.drawdown_pct, 1)}</dd><dt>Distanza dalla soglia T1</dt><dd>${pc(b.distanza_soglia_pct, 1)}</dd><dt>Bitcoin nelle ultime 48 ore</dt><dd class="${cls(b48)}">${pc(b48, 1)}</dd></dl></div>
    <div class="card"><h3>Mercato crypto in sintesi</h3><div class="grid g2" style="gap:12px"><div class="stat"><span class="l">Dominance Bitcoin</span><span class="v">${ex.dominance_btc != null ? nf(ex.dominance_btc, 1) + '%' : '—'}</span></div><div class="stat"><span class="l">Capitalizzazione totale</span><span class="v">${ex.mcap_totale_mld != null ? '$' + nf(ex.mcap_totale_mld, 0) + ' mld' : '—'}</span></div><div class="stat"><span class="l">Volume 24 ore</span><span class="v">${ex.volume_24h_mld != null ? '$' + nf(ex.volume_24h_mld, 0) + ' mld' : '—'}</span></div><div class="stat"><span class="l">Funding Bitcoin</span><span class="v">${ex.funding_btc_pct != null ? nf(ex.funding_btc_pct, 4) + '%' : '—'}</span></div><div class="stat"><span class="l">Open interest</span><span class="v">${ex.oi_btc_mld != null ? '$' + nf(ex.oi_btc_mld, 1) + ' mld' : '—'}</span></div><div class="stat"><span class="l">Livello EX</span><span class="v">${esc(j.ex.livello)}</span><span class="s">${j.ex.sensori_attivi.length} sensori attivi</span></div></div></div></div>` : ''}
  <div class="sec"><div class="sec-h">Sensori di uscita ed euforia<span class="sp mute">${esc(j.ex.nota)}</span></div><div class="sens">${sens(j.sensori)}</div></div>
  <div class="sec"><div class="sec-h">Preallerta<span class="sp mute">S1, S2, S4, S7 non sono letti in automatico</span></div><div class="sens">${sens(j.preallerta)}</div></div>
  <div class="sec"><div class="sec-h">Regime macro<span class="sp mute">${esc(j.regime.nota)}</span></div><div class="grid g4">${m.map(x => `<div class="card stat"><span class="l">${esc(x.nome)}</span><span class="v">${nf(x.valore, 2)}${x.unita || ''}</span><span class="s ${cls(x.var_30g)}">${x.var_30g != null ? pc(x.var_30g, 1) + ' in 30 giorni' : ''}</span></div>`).join('')}</div></div>
  ${decisionTable()}
  <div class="sec"><div class="sec-h">Radar dei trigger sugli asset<span class="sp mute">dal più vicino</span></div><div class="card" style="padding:6px 16px">${rows.map(a => { const t = a.trigger; return `<button class="radar-row" data-asset="${esc(a.simbolo)}"><span class="nm">${esc(a.nome)}<small>${esc(t.testo)}</small></span><span class="mid"><div class="prog"><i style="width:${t.raggiunto ? 100 : t.distanza == null ? 0 : Math.max(2, Math.min(100, 100 - Math.abs(t.tipo === 'drawdown_ath' ? t.distanza * 3 : t.distanza)))}%"></i></div></span><span class="num ${t.raggiunto ? 'up' : ''}">${t.raggiunto ? 'raggiunto' : t.distanza == null ? '—' : (t.tipo === 'drawdown_ath' ? nf(Math.abs(t.distanza), 1) + ' pt' : pc(t.distanza, 1))}</span></button>`; }).join('')}</div></div>
  ${scad.length ? `<div class="sec"><div class="alert"><span class="ic">⌛</span><div><b>${scad.length} tesi oltre la scadenza</b>${scad.map(a => `${esc(a.nome)} (${dIT(a.scadenza, { day: 'numeric', month: 'short', year: 'numeric' })})`).join(' · ')}. Per le regole JANUS una tesi scaduta va rinnovata con motivazione oppure chiusa.</div></div></div>` : ''}
  <div class="grid g2 sec"><div class="card"><h3>Portafoglio virtuale</h3><div class="num" style="font-size:30px;letter-spacing:-.03em">€ ${nf(pf.capitale_iniziale_eur, 0)}</div><p class="note" style="margin:6px 0 10px">${esc(pf.nota)}</p><dl class="kv"><dt>Giorno Zero</dt><dd>${dIT(pf.giorno_zero)}</dd><dt>Giorni mancanti</dt><dd>${pf.giorni_mancanti}</dd><dt>Posizioni aperte</dt><dd>${pf.posizioni.length}</dd></dl></div>
  <div class="card"><h3>Dati e fonti</h3><dl class="kv"><dt>Ultimo aggiornamento</dt><dd>${ago(DATA.generato)}</dd><dt>Notizie mostrate</dt><dd>${DATA.notizie_stat.mostrate}</dd><dt>Opinioni scartate</dt><dd>${DATA.notizie_stat.scartate_opinioni}</dd><dt>Fonti con problemi</dt><dd>${DATA.errori.length}</dd></dl>${DATA.errori.length ? `<p class="note" style="margin-top:8px">${DATA.errori.map(esc).join(' · ')}</p>` : ''}<p class="note" style="margin-top:8px">Le notizie sono solo conferma: i temi nascono dai sensori, non dalle notizie.</p></div></div>
  ${DATA.analisi_jai && DATA.analisi_jai.righe.length ? `<div class="card sec"><h3>Analisi J-AI<span class="sp mute">scritta da Claude, aggiornata ${ago(DATA.analisi_jai.aggiornato)}</span></h3><div class="ai-box">${DATA.analisi_jai.righe.map(r => r.tipo === 'titolo' ? `<h4>${esc(r.testo)}</h4>` : r.tipo === 'voce' ? `<li>${esc(r.testo)}</li>` : `<p>${esc(r.testo)}</p>`).join('')}</div></div>` : '<div class="card sec"><h3>Analisi J-AI</h3><p class="note">Qui comparirà il commento scritto da Claude (briefing mattutino) quando collegherai la pagina Notion. Nel frattempo i pulsanti “Chiedi a J-AI” preparano il contesto già pronto da incollare in chat.</p></div>'}
  <div class="grid g2 sec"><div class="card"><h3>Semaforo dello stato mentale</h3><div class="sem" id="sem">${Object.entries(SEM).map(([k, v]) => `<button data-sem="${k}" class="${k} ${sem === k ? 'on' : ''}"><i></i>${v[0]}</button>`).join('')}</div><p class="note" style="margin-top:10px">${sem ? SEM[sem][1] : 'Scegli come stai adesso. Il semaforo si decide prima di guardare il prezzo.'}</p></div>
  <div class="card"><h3>Protocollo STOP<span class="sp"><button class="ghost" data-act="resetstop">Azzera</button></span></h3><div class="chk" id="stop">${STOPS.map(s => `<label><input type="checkbox" data-st="${s[0]}" ${st[s[0]] ? 'checked' : ''}><span><b>${s[0]} · ${s[1]}</b><span>${s[2]}</span></span></label>`).join('')}</div>${verdict}</div></div>
  <div class="card sec"><h3>Stop contestuale<span class="sp mute">prima di eseguire uno stop già deciso</span></h3><p class="note" style="margin-bottom:10px">Il prezzo da solo non giustifica mai uno stop: è il segnale per fare la verifica, non la conclusione.${b48 != null ? ` Bitcoin nelle ultime 48 ore: <b class="${cls(b48)} num">${pc(b48, 1)}</b>.` : ''}</p><div class="chk" id="ctx">${CTX.map((c, i) => `<label><input type="checkbox" data-cx="${i}" ${cx[i] ? 'checked' : ''}><span><b>${i + 1} · ${c[0]}</b><span>${c[1]}</span></span></label>`).join('')}</div></div>`;
}

/* ---------- J-AI: contesto da incollare in chat ---------- */
function snapshot() {
  const j = J(), L = [`Contesto JANUS al ${new Date(DATA.generato).toLocaleString('it-IT')}`];
  if (j.btc) L.push(`Bitcoin $${nf(j.btc.prezzo, 0)}, ${pc(j.btc.drawdown_pct, 1)} dal massimo di ciclo; soglia T1 $${nf(j.btc.soglia_t1, 0)} (distanza ${pc(j.btc.distanza_soglia_pct, 1)}).`);
  ['T1', 'T2', 'T3'].forEach(k => { const s = j.segnali[k]; if (s) L.push(`${k}: ${s.valore} (${s.attivo ? 'ATTIVO' : 'non attivo'}, soglia ${s.soglia}).`); });
  L.push(`Segnali attivi ${j.convergenza.n}/3. Livello EX ${j.ex.livello}.`);
  L.push('Sensori: ' + Object.entries(j.sensori).map(([k, s]) => `${k} ${s.valore}${s.attivo ? ' (ATTIVO)' : ''}`).join('; ') + '.');
  L.push('Preallerta: ' + Object.entries(j.preallerta).map(([k, s]) => `${k} ${s.valore}${s.attivo ? ' (ATTIVO)' : ''}`).join('; ') + '.');
  L.push('Macro: ' + j.regime.indicatori.map(x => `${x.nome} ${nf(x.valore, 2)}`).join('; ') + '.');
  L.push('Indici (variazione 1 giorno): ' + (DATA.mercati.find(g => g.id === 'indici')?.voci || []).map(v => `${v.nome} ${pc(v.var_1g, 1)}`).join('; ') + '.');
  if (DATA.anomalie.length) L.push('Mosse anomale: ' + DATA.anomalie.map(a => `${a.nome} ${pc(a.var_1g, 1)}`).join('; ') + '.');
  return L.join('\n');
}
async function copyText(t, msg) {
  try { await navigator.clipboard.writeText(t); toast(msg || 'Copiato: incollalo in una chat con J-AI'); }
  catch { openSheet(`<h2>Contesto per J-AI</h2><p class="note">Copia il testo qui sotto e incollalo in chat.</p><textarea style="width:100%;height:320px;margin-top:10px;padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--panel);color:var(--ink);font:13px var(--f-num)" readonly>${esc(t)}</textarea>`); }
}
function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2600); }

/* ---------- guscio ---------- */
const ICONS = {
  oggi: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
  notizie: '<path d="M5 4h11a2 2 0 0 1 2 2v13H7a2 2 0 0 1-2-2z"/><path d="M18 8h2v9a2 2 0 0 1-2 2M8 8h6M8 12h6M8 15h4"/>',
  mercati: '<path d="M4 19V5M4 19h16"/><path d="m7 15 3-4 3 2 5-6"/>',
  asset: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  ricerca: '<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/>',
  blind: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.6"/>',
  janus: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18"/><circle cx="12" cy="12" r="2.4"/>',
};
const TABS = [['oggi', 'Oggi'], ['notizie', 'Notizie'], ['mercati', 'Mercati'], ['asset', 'Asset'], ['ricerca', 'Ricerca'], ['blind', 'Blind Spot'], ['janus', 'Plancia JANUS']];
function newCount() { const r = readSet(); return DATA.notizie.filter(n => n.imp !== 'poco' && n._new && !r.has(n.id)).length; }
function renderNav() {
  const nc = newCount();
  $('#nav').innerHTML = TABS.map(([k, l]) => `<button data-tab="${k}" class="${TAB === k ? 'on' : ''}"><svg viewBox="0 0 24 24">${ICONS[k]}</svg>${l}${k === 'notizie' && nc ? `<span class="badge">${nc}</span>` : ''}</button>`).join('');
  $('#dock').innerHTML = TABS.map(([k, l]) => `<button data-tab="${k}" class="${TAB === k ? 'on' : ''}"><svg viewBox="0 0 24 24">${ICONS[k]}</svg>${k === 'janus' ? 'JANUS' : k === 'blind' ? 'Blind' : l}${k === 'notizie' && nc ? `<span class="badge">${nc}</span>` : ''}</button>`).join('');
}
const stampTxt = () => { const m = Math.round((Date.now() - new Date(DATA.generato)) / 60000); return { t: 'Dati di ' + ago(DATA.generato), old: m > 300, full: new Date(DATA.generato).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }; };
function renderStamp() { const x = stampTxt(), e = $('#stamp'); if (e) { e.textContent = x.t; e.title = 'Raccolti il ' + x.full; } const k = $('#tkStamp'); if (k) { k.innerHTML = `${x.old ? '⚠ ' : ''}${x.t}<small> · ${x.full}</small>`; k.classList.toggle('stale', x.old); } }
function renderTicker() {
  const want = ['BTC-USD', 'ETH-USD', '^GSPC', '^IXIC', 'FTSEMIB.MI', 'GC=F', 'CL=F', '^VIX', 'DX-Y.NYB', '^TNX'];
  $('#ticker').innerHTML = `<span class="tk stampchip" id="tkStamp"></span>` + want.map(s => voce(s)).filter(Boolean).map(v => `<button class="tk" data-sym="${esc(v.simbolo)}"><b>${esc(v.nome.replace(' (paura)', ''))}</b><span class="num">${fmtV(v.ultimo)}</span><span class="num ${cls(v.var_1g)}">${pc(v.var_1g, 2)}</span></button>`).join('');
  renderStamp();
}
function render() {
  const v = $('#view');
  v.innerHTML = { oggi: vOggi, notizie: vNotizie, mercati: vMercati, asset: vAsset, ricerca: vRicerca, blind: vBlind, janus: vJanus }[TAB]();
  if (TAB === 'notizie') bindNews();
  window.scrollTo(0, 0); const mn = document.querySelector('#app .main'); if (mn) mn.scrollTop = 0;
  renderNav();
}
function go(tab) { TAB = tab; store.set('janus.tab', tab); closeSheet(); try { history.replaceState(null, '', '#' + tab); } catch {} render(); }
function bindNews() {
  fillNews();
  $('#fArea').onclick = e => { const b = e.target.closest('button'); if (!b) return; NF.area = b.dataset.a; store.set('janus.area', NF.area); NF.sel = null; render(); };
  const fi = $('#fImp'); if (fi) fi.onclick = e => { const b = e.target.closest('button'); if (!b) return; NF.imp = b.dataset.i; store.set('janus.imp', NF.imp); render(); };
  $('#fToggle').onclick = () => { NF.open = !NF.open; render(); };
  const fs = $('#fState'); if (fs) fs.onclick = e => { const b = e.target.closest('[data-clr]'); if (!b) return; if (b.dataset.clr === 'imp') { NF.imp = 'importanti'; store.set('janus.imp', NF.imp); } else NF.canale = ''; render(); };
  $('#fQ').oninput = e => { NF.q = e.target.value; fillNews(); };
  const c = $('#fCan'); if (c) c.onclick = e => { const b = e.target.closest('button'); if (!b) return; NF.canale = NF.canale === b.dataset.canale ? '' : b.dataset.canale; render(); };
}
function openNews(id) {
  const n = DATA.notizie.find(x => x.id === id); if (!n) return;
  markRead(id); NF.sel = id;
  if (TAB === 'notizie' && window.innerWidth > 1100) { fillNews(); renderNav(); const r = $('#reader'); if (r) r.scrollTop = 0; return; }
  openSheet(readerHTML(n)); renderNav();
}
let lastFocus = null;
function openSheet(html, after) { lastFocus = document.activeElement; $('#sheetContent').innerHTML = html; $('#sheet').hidden = false; $('.sheet-body').scrollTop = 0; document.body.style.overflow = 'hidden'; if (after) after(); $('.close').focus(); }
function closeSheet() { $('#sheet').hidden = true; document.body.style.overflow = ''; if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch {} }

document.addEventListener('click', e => {
  const t = e.target;
  const q = s => t.closest(s);
  let el;
  if ((el = q('[data-close]'))) return closeSheet();
  if ((el = q('[data-rs]'))) { RS.sub = el.dataset.rs; store.set('janus.rsub', RS.sub); return render(); }
  if ((el = q('[data-tab]'))) return go(el.dataset.tab);
  if ((el = q('[data-news]'))) return openNews(el.dataset.news);
  if (!q('[data-act]') && (el = q('[data-asset]'))) { return openAsset(el.dataset.asset); }
  if ((el = q('[data-bs]'))) return openBlind(el.dataset.bs);
  if (!q('[data-act]') && (el = q('[data-sym]'))) return openSymbol(el.dataset.sym);
  if ((el = q('[data-canale]')) && !el.closest('#fCan')) { NF.canale = el.dataset.canale; NF.area = 'tutte'; NF.imp = 'tutte'; return go('notizie'); }
  if ((el = q('#mV button'))) { MK.vista = el.dataset.v; store.set('janus.vista', MK.vista); return render(); }
  if ((el = q('[data-sem]'))) { store.set('janus.sem', store.get('janus.sem') === el.dataset.sem ? '' : el.dataset.sem); return render(); }
  if ((el = q('[data-act]'))) {
    const a = el.dataset.act;
    if (a === 'resetstop') { store.del('janus.stop'); store.del('janus.ctx'); store.del('janus.sem'); return render(); }
    if (a === 'origtitle') { const n = DATA.notizie.find(x => x.id === el.dataset.id), p = $('#orig-' + n.id); p.hidden = !p.hidden; p.innerHTML = 'Originale: <i>' + esc(n.titolo) + '</i>' + (n.sommario ? '<br><i>' + esc(n.sommario) + '</i>' : ''); return; }
    if (a === 'askjai') { const n = DATA.notizie.find(x => x.id === el.dataset.id); return copyText(`${snapshot()}\n\nNotizia (${n.fonte}, ${dIT(n.data)}): ${n.titolo}\n${n.link}\n\nDomanda per J-AI: questa notizia cambia qualcosa per le mie tesi o per i miei trigger? Applica il Devil's Advocate e dimmi cosa non sto considerando.`); }
    if (a === 'askasset') { const x = assets().find(v => v.simbolo === el.dataset.sym); return copyText(`${snapshot()}\n\nAsset: ${x.nome} (${x.simbolo}), prezzo ${fmtV(x.prezzo)}, ${pc(x.var_30g, 1)} in 30 giorni.\nTesi: ${x.tesi}\nIngresso: ${x.entry}\nKill condition: ${x.kill}\nTrigger: ${x.trigger ? x.trigger.testo : 'nessuno'}${x.scaduta ? '\nATTENZIONE: tesi oltre la scadenza (' + x.scadenza + ').' : ''}\n\nLeggi la scheda J-RADAR e J-TRADE su Notion, poi dammi: TESI / KILL CONDITION / R/R / TQS / BIAS ALERT / DEVIL'S ADVOCATE (3 motivi concreti).`); }
    if (a === 'openradar') return openRadar(el.dataset.s);
    if (a === 'opendrill') return openDrill(el.dataset.s);
    if (a === 'copyradar') return copyText(`${snapshot()}\n\n${radarText(assets().find(x => x.simbolo === el.dataset.s))}\n\nDomanda per J-AI: leggi la scheda J-RADAR su Notion e confronta questa lettura con la tua. Dove i livelli non letti dal cruscotto cambiano il quadro? Applica il Devil's Advocate.`, 'Lettura copiata: incollala in chat con J-AI');
    if (a === 'copydrill') return copyText(drillText(assets().find(x => x.simbolo === el.dataset.s)) + "\n\nDomanda per J-AI: applica il Devil's Advocate dello Strato 5 (3 motivi concreti per cui fallisce, personalizzati per questo tipo di asset), verifica le fonti e le date delle sette domande e dimmi quali sono le zone d'ombra.", 'J-DRILL copiato: incollalo in chat con J-AI');
    if (a === 'askext') { const x = assets().find(v => v.simbolo === el.dataset.s); return copyText(`${snapshot()}\n\n${radarText(x)}\n\nASSESSMENT ESTENSIONE LAB per ${x.nome}: la tesi è scaduta il ${x.scadenza}. Leggi la scheda J-RADAR e il J-DRILL. Dimmi: ancoraggio potenziale (il nuovo trigger è diverso o è una riformulazione?), 3 motivi concreti per archiviare invece di estendere, e pormi la domanda singola: se questo asset fosse proposto oggi ex novo, entrerebbe in LAB?`, 'Copiato: incollalo in chat con J-AI'); }
    if (a === 'addsig') { const g = id => $(id).value.trim(); if (!g('#nsSeg')) return toast('Scrivi il segnale'); const r = mine('janus.hunt.reg', []); r.unshift({ data: new Date().toISOString().slice(0, 10), segnale: g('#nsSeg'), modalita: $('#nsMod').value, asset: g('#nsAss') || '—', filtro: '—', decisione: $('#nsDec').value, note: '' }); save('janus.hunt.reg', r); return render(); }
    if (a === 'copyreg') { const H = DATA.hunt, r = [...mine('janus.hunt.reg', []), ...H.registro]; return copyText('Registro segnali J-HUNT\n' + r.map(x => `${x.data} | ${x.segnale} | ${x.modalita} | ${x.asset} | ${x.filtro} | ${x.decisione} | ${x.note || ''}`).join('\n'), 'Registro copiato'); }
    if (a === 'ticket') return openTicket(el.dataset.s);
    if (a === 'copyticket') return copyText(ticketText(assets().find(x => x.simbolo === el.dataset.s)), 'Ticket copiato: incollalo in chat con J-AI');
    if (a === 'askticket') return copyText(askTicket(assets().find(x => x.simbolo === el.dataset.s)), 'Copiato: incollalo in chat con J-AI');
    if (a === 'cleartk') { store.del('janus.tk.' + el.dataset.s); return openTicket(el.dataset.s); }
    if (a === 'askall') return copyText(`${snapshot()}\n\nDomanda per J-AI: leggi il Core e il Protocollo di avvio, poi dammi il quadro complessivo di oggi, cosa richiede attenzione, cosa sto trascurando e quali tesi scadute vanno decise. Sii scettico.`);
  }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.st) { const s = store.json('janus.stop', {}); s[t.dataset.st] = t.checked; store.set('janus.stop', JSON.stringify(s)); render(); }
  if (t.dataset.pr != null && t.closest('#promo')) { const k = 'janus.promo.' + t.closest('#promo').dataset.t, o = store.json(k, {}); o[t.dataset.pr] = t.checked; store.set(k, JSON.stringify(o)); }
  if (t.dataset.rm) { const k = 'janus.rm.' + t.dataset.s, o = mine(k, {}); o[t.dataset.rm] = t.value; save(k, o); openRadar(t.dataset.s); }
  if (t.dataset.td != null && t.closest('#tdk')) { const k = 'janus.td.' + t.closest('#tdk').dataset.s, o = mine(k, {}); o[t.dataset.td] = t.checked; save(k, o); }
  if (t.dataset.ds != null) { const k = 'janus.dr.' + t.dataset.s, o = mine(k, {}); (o.st = o.st || {})[t.dataset.ds] = t.checked; save(k, o); }
  if (t.dataset.sc) { const k = 'janus.dr.' + t.dataset.s, o = mine(k, {}); (o.sc = o.sc || {})[t.dataset.sc] = t.checked; save(k, o); openDrill(t.dataset.s); }
  if (t.dataset.dr && t.tagName === 'SELECT') { const k = 'janus.dr.' + t.dataset.s, o = mine(k, {}); o[t.dataset.dr] = t.value; save(k, o); openDrill(t.dataset.s); }
  if (t.dataset.fl != null && t.type === 'checkbox') { const o = mine('janus.hunt.fl', {}); o[t.dataset.fl] = t.checked; save('janus.hunt.fl', o); render(); }
  if (t.dataset.kill) { const k = store.json('janus.kill', {}); k[t.dataset.kill] = t.checked; store.set('janus.kill', JSON.stringify(k)); const sh = !$('#sheet').hidden; render(); if (sh) openAsset(t.dataset.kill); }
  if (t.dataset.cx) { const s = store.json('janus.ctx', {}); s[t.dataset.cx] = t.checked; store.set('janus.ctx', JSON.stringify(s)); }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.dr && t.tagName === 'INPUT') { const k = 'janus.dr.' + t.dataset.s, o = mine(k, {}); o[t.dataset.dr] = t.value; save(k, o); const r = $('#ceilRes'); if (r) r.innerHTML = ceilRes(assets().find(x => x.simbolo === t.dataset.s)); return; }
  if (t.dataset.d7) { const k = 'janus.dr.' + t.dataset.s, o = mine(k, {}); o.s7 = o.s7 || {}; (o.s7[t.dataset.i] = o.s7[t.dataset.i] || {})[t.dataset.d7] = t.value; save(k, o); return; }
  if (t.dataset.fl === 'ban') { const o = mine('janus.hunt.fl', {}); o.ban = t.value; save('janus.hunt.fl', o); return; }
  if (!t.dataset.tk) return;
  const sym = t.closest('#sheet') && $('[data-act="copyticket"]') ? $('[data-act="copyticket"]').dataset.s : null; if (!sym) return;
  const o = tkGet(sym); o[t.dataset.tk] = t.value; store.set('janus.tk.' + sym, JSON.stringify(o));
  const a = assets().find(x => x.simbolo === sym); const p = $('#tkPanel'); if (p) p.innerHTML = tkPanel(a);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });
window.addEventListener('resize', () => { clearTimeout(window._rz); window._rz = setTimeout(() => { if ($('#sheet').hidden && TAB === 'notizie') fillNews(); }, 200); });

/* ---------- avvio ---------- */
function prepare(d) {
  DATA = d; buildTagNames();
  const lv = store.get('janus.last'); DATA.notizie.forEach(n => n._new = lv ? n.data > lv : false);
}
async function enter(pw, remember) {
  const d = await load(pw);
  PW = pw; if (remember) store.set('janus.pw', pw);
  prepare(d);
  $('#login').hidden = true; $('#app').hidden = false;
  renderTicker(); setInterval(renderStamp, 60000);
  const h = location.hash.replace('#', ''); TAB = TABS.some(t => t[0] === h) ? h : (store.get('janus.tab') || 'oggi');
  render();
  setTimeout(() => store.set('janus.last', new Date().toISOString()), 4000);
}
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault(); const msg = $('#loginMsg'); msg.textContent = '';
  try { await enter($('#pw').value, $('#remember').checked); }
  catch (err) { msg.textContent = err.message === 'offline' ? 'Nessun dato disponibile: serve la rete almeno una volta.' : 'Parola d’ordine errata.'; }
});
async function doRefresh() {
  try { if (navigator.serviceWorker) navigator.serviceWorker.getRegistration().then(r => r && r.update()).catch(() => {}); prepare(await load(PW)); renderTicker(); render(); toast('Dati aggiornati'); } catch { toast('Aggiornamento non riuscito'); }
}
$('#refresh').onclick = doRefresh;
/* tira verso il basso per aggiornare (la pagina scorre in un contenitore interno, quindi il gesto nativo non c'è) */
(function () {
  const m = $('#app .main'); if (!m) return;
  const ind = document.createElement('div'); ind.id = 'ptr'; ind.hidden = true; document.body.appendChild(ind);
  let y0 = null, dy = 0, busy = false;
  const stop = () => { y0 = null; dy = 0; ind.hidden = true; ind.style.transform = ''; };
  m.addEventListener('touchstart', e => { if (busy || m.scrollTop > 0 || !$('#sheet').hidden || e.touches.length !== 1) { y0 = null; return; } y0 = e.touches[0].clientY; dy = 0; }, { passive: true });
  m.addEventListener('touchmove', e => {
    if (y0 == null) return;
    if (m.scrollTop > 0) return stop();
    dy = Math.max(0, e.touches[0].clientY - y0);
    if (dy < 8) { ind.hidden = true; return; }
    const k = Math.min(dy * 0.5, 70);
    ind.hidden = false; ind.style.transform = `translate(-50%,${k}px)`; ind.textContent = dy > 110 ? '↻ Rilascia per aggiornare' : '↓ Tira per aggiornare';
    ind.classList.toggle('ready', dy > 110);
  }, { passive: true });
  m.addEventListener('touchend', async () => {
    if (y0 == null) return;
    const go = dy > 110; const d = dy; stop();
    if (go && !busy) { busy = true; ind.hidden = false; ind.style.transform = 'translate(-50%,56px)'; ind.textContent = 'Aggiorno…'; await doRefresh(); ind.hidden = true; ind.style.transform = ''; busy = false; }
  });
  m.addEventListener('touchcancel', stop);
})();
$('#logout').onclick = () => { store.del('janus.pw'); location.reload(); };
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !window._rl) { window._rl = 1; location.reload(); } });
}
const saved = store.get('janus.pw');
if (saved) enter(saved, true).catch(() => { store.del('janus.pw'); });
})();
