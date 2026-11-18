// Gemeinsame Daten + Rechenmodell für Tafel und Handy
const API = 'https://kaffee-weg.weltenbinder-server.workers.dev';

const POLLS = {
  p1: { q: 'Von 8,06 € für 1 kg Kaffee – wie viel bekommt die Bäuerin / der Bauer?', o: ['ca. 0,40 €', 'ca. 1,50 €', 'ca. 3,00 €', 'ca. 4,50 €'], right: 0 },
  p2: { q: 'Wie viel mehr würdest du pro Tasse für wirklich fairen Kaffee zahlen?', o: ['nichts', 'bis 5 ct', 'bis 20 ct', '50 ct oder mehr'] },
};

// Preisaufteilung 1 kg gemahlener Kaffee in DE (regenwald-schuetzen.org)
const PRICE = [
  { k: 'bauer', n: 'Bäuerin / Bauer', v: 0.41, o: true },
  { k: 'haendler', n: 'Zwischenhändler', v: 0.26, o: true },
  { k: 'export', n: 'Export', v: 0.29, o: true },
  { k: 'roest', n: 'Rösterei', v: 0.89, o: false },
  { k: 'steuer', n: 'Kaffeesteuer', v: 2.19, o: false },
  { k: 'verkauf', n: 'Handel / Verkauf', v: 1.39, o: false },
  { k: 'rest', n: 'Sonstiges (z. B. MwSt, Transport, Verpackung)', v: 2.63, o: false },
];

const LAND = {
  br: { n: 'Brasilien', eco: -15, info: 'Größter Produzent (≈ 39 % der Welt). Riesige Plantagen, oft Maschinen-Ernte. Rund 38 Mio. kg Pestizide pro Jahr.' },
  vn: { n: 'Vietnam', eco: -10, info: 'Nr. 2 der Welt, vor allem Robusta (für Instant- und Espresso-Mischungen). Sehr intensiver Anbau.' },
  co: { n: 'Kolumbien', eco: 0, info: 'Arabica von Kleinbauern an steilen Hängen – meist per Hand gepflückt.' },
  et: { n: 'Äthiopien', eco: 12, info: 'Ursprungsland des Kaffees. Viel Wald- und Schattenkaffee von Kleinbauern.' },
};

const fmt = (x, d = 2) => x.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const eur = x => fmt(x) + ' €';
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// Vereinfachtes Modell: Basiswerte aus der Quelle, Aufschläge (Fairtrade, Bio, Zoll-Effekt) geschätzt
function model(o) {
  const boom = 1 + o.ernte / 100 * 1.2;                 // Missernte -> Weltmarktpreis steigt
  const bauer = 0.41 * o.lohn * boom + (o.fair ? 0.30 : 0) + (o.bio ? 0.25 : 0);
  const haendler = 0.26 * boom, exp = 0.29, roest = 0.89;
  const zoll = o.roastOrigin ? 0.075 * (bauer + haendler + exp + roest) : 0; // EU-Zoll Röstkaffee 7,5 %, Rohkaffee 0 %
  const total = bauer + haendler + exp + roest + zoll + 2.19 + 1.39 + 2.63;
  const origin = bauer + haendler + exp + (o.roastOrigin ? roest : 0);
  const cup = total / 125;                               // ≈ 8 g Kaffee pro Tasse
  const fair = clamp(Math.round(bauer / 1.6 * 70 + (o.roastOrigin ? 20 : 0) + (o.fair ? 8 : 0)), 0, 100);
  const eco = clamp(Math.round(45 + LAND[o.land].eco + (o.bio ? 30 : 0) + (o.fair ? 5 : 0)), 0, 100);
  return { bauer, haendler, exp, roest, zoll, total, origin, share: origin / total, bauerShare: bauer / total, cup, fair, eco, income: bauer * (1 - o.ernte / 100) };
}
const BASE = { land: 'br', lohn: 1, fair: false, bio: false, roastOrigin: false, ernte: 0 };

async function api(path, body) {
  const r = await fetch(API + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

// Simulator-Steuerung (Tafel + Handy nutzen dasselbe HTML)
function simControls(id) {
  return `
  <div class="ctl"><span class="lab">Anbauland</span>
    <div class="seg" data-k="land">${Object.entries(LAND).map(([k, l]) => `<button data-v="${k}"${k === 'br' ? ' class="on"' : ''}>${l.n}</button>`).join('')}</div>
    <p class="landinfo mut sm"></p></div>
  <label class="ctl"><span class="lab">Lohn der Erntehelfer <b class="val" data-for="lohn">wie heute</b></span>
    <input type="range" data-k="lohn" min="1" max="4" step="0.5" value="1"></label>
  <label class="ctl"><span class="lab">Missernte durch Klimawandel <b class="val" data-for="ernte">keine</b></span>
    <input type="range" data-k="ernte" min="0" max="50" step="5" value="0"></label>
  <div class="ctl toggles">
    <button class="tg" data-k="fair">Fairtrade-Siegel</button>
    <button class="tg" data-k="bio">Bio</button>
    <button class="tg" data-k="roastOrigin">Im Anbauland rösten</button>
  </div>`;
}
function bindSim(root, onChange) {
  const o = { ...BASE };
  const upd = () => {
    root.querySelector('[data-for="lohn"]').textContent = o.lohn === 1 ? 'wie heute' : '× ' + fmt(o.lohn, o.lohn % 1 ? 1 : 0);
    root.querySelector('[data-for="ernte"]').textContent = o.ernte ? '−' + o.ernte + ' % Ernte' : 'keine';
    root.querySelector('.landinfo').textContent = LAND[o.land].info;
    onChange(o, model(o));
  };
  root.querySelectorAll('input[type=range]').forEach(i => i.addEventListener('input', () => { o[i.dataset.k] = +i.value; upd(); }));
  root.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => {
    b.parentNode.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); o.land = b.dataset.v; upd();
  }));
  root.querySelectorAll('.tg').forEach(b => b.addEventListener('click', () => { o[b.dataset.k] = !o[b.dataset.k]; b.classList.toggle('on', o[b.dataset.k]); upd(); }));
  upd();
  return o;
}
function insight(m) {
  const b = model(BASE), d = (m.cup - b.cup) * 100, x = m.bauer / b.bauer;
  if (Math.abs(d) < 0.05) return 'So ist es heute: Von jeder Tasse kommt fast nichts beim Bauern an.';
  return `Die Tasse wird nur <b>${fmt(d, 1)} ct</b> teurer – die Bäuerin bekommt aber das <b>${fmt(x, 1)}-fache</b>.`;
}
function gauge(el, v, label) {
  el.innerHTML = `<div class="g-bar"><i style="width:${v}%"></i></div><div class="g-l"><span>${label}</span><b>${v}</b></div>`;
  el.style.setProperty('--h', Math.round(v * 1.2));
}
