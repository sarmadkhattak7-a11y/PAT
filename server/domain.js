// Season, pricing and crop model for Barak's Rabi 2026-27 wheat Salam.
// Ported from the design prototype (BarakSeason / BarakMarket / BarakCrop) so the working app quotes the same numbers.
// Day 0 = 1 Nov 2026. Weeks are day / 7.

export const PRICING = {
  crop: 'Wheat', season: 'Rabi 2026-27', unitKg: 40, owedMdPerAcre: 20,
  ref: 4600, support: 4200, stress: 2900, low: 4000, high: 5000,
  feeMint: 0.025, fee: 0.035, carry: 125,
  rf: 0.115, tenor: 0.5, premium: 0.249,
  wht: { filer: 0.055, nonFiler: 0.11 },
  minSep: 500, round: 50, costLow: 52000,
  guard: { maxDiscount: 0.30, minStress: -0.15 },
};

export const PR = (() => {
  const P = PRICING, h = P.rf * P.tenor + P.premium;
  const raw = (P.ref * (1 - P.fee) - P.carry) / (1 + h);
  const price = Math.floor(raw / P.round + 1e-6) * P.round;
  const netMd = (p) => p * (1 - P.fee) - P.carry;
  const cost = price * (1 + P.feeMint);
  const discount = 1 - price / P.ref, stressRet = netMd(P.stress) / cost - 1, advance = P.owedMdPerAcre * price;
  return {
    ...P, hurdle: h, raw, price, cost, kg: price / P.unitKg, kgCost: cost / P.unitKg,
    expRet: netMd(P.ref) / cost - 1, supportRet: netMd(P.support) / cost - 1, discount, stressRet, advance,
    breakeven: Math.ceil((cost + P.carry) / (1 - P.fee) / 5) * 5,
    checks: { discount: discount <= P.guard.maxDiscount, stress: stressRet >= P.guard.minStress, advance: advance >= P.costLow },
  };
})();

// Market rules
export const K = {
  RS_PAT: PR.kgCost,                 // investor pays per PAT (1 kg), mint fee included
  ACRE_KG: PR.owedMdPerAcre * 40,    // 800 kg owed per acre
  CAP: 0.2,                          // one investor may hold at most 20% of a field
  MIN: 25000,                        // minimum order
  LIMIT: 2500000, LIMIT_LOW: 500000, // season limits from suitability
  PASS: 0.8,                         // a field goes ahead at 80% paid
  SMALLER_MIN: 0.5,                  // between 50% and 80% the grower is offered a smaller contract
  HOLD_DAYS: 1,                      // a reservation is held for 24 hours
};

export const DAY = { open: -31, close: 4, decide: 5, refund: 6, mint: 9, cashBy: 9, sowBy: 19, electBy: 134, deliverBy: 180, aprSale: 182, settle: 308 };

export const PHASES = [
  { k: 'market', s: -31, e: 4, en: 'Raising funds', ur: 'سرمایہ کاری' },
  { k: 'onboard', s: 4, e: 28, en: 'Sign & pay growers', ur: 'معاہدہ و ادائیگی' },
  { k: 'grow', s: 28, e: 147, en: 'Growing', ur: 'فصل زیرِ کاشت' },
  { k: 'deliver', s: 147, e: 189, en: 'Harvest & deliver', ur: 'کٹائی و ترسیل' },
  { k: 'store', s: 189, e: 301, en: 'In storage', ur: 'ذخیرہ' },
  { k: 'settle', s: 301, e: 336, en: 'Settle', ur: 'تصفیہ' },
];

const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MON_UR = ['جنوری', 'فروری', 'مارچ', 'اپریل', 'مئی', 'جون', 'جولائی', 'اگست', 'ستمبر', 'اکتوبر', 'نومبر', 'دسمبر'];
export function dateOf(day, lang = 'en', noYear = false) {
  const d = new Date(Date.UTC(2026, 10, 1 + day)), M = lang === 'ur' ? MON_UR : MON_EN;
  return d.getUTCDate() + ' ' + M[d.getUTCMonth()] + (noYear ? '' : ' ' + d.getUTCFullYear());
}
export function isoOf(day) { return new Date(Date.UTC(2026, 10, 1 + day)).toISOString().slice(0, 10); }
export function dayOfDate(date) { return Math.round((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - Date.UTC(2026, 10, 1)) / 864e5); }
export function phaseAt(day) { return PHASES.find((p) => day >= p.s && day < p.e) || (day < -31 ? PHASES[0] : PHASES[PHASES.length - 1]); }

// Wheat price path, Rs per 40 kg, by week. Oct 2026 mandi about Rs 4,350; dips toward support at harvest; Rs 4,600 by September.
const PK = [[-5, 4320], [0, 4350], [10, 4380], [19, 4400], [23, 4200], [30, 4280], [40, 4480], [47, 4600]];
export function priceAt(day) {
  const w = day / 7;
  if (w <= PK[0][0]) return PK[0][1];
  for (let i = 1; i < PK.length; i++) if (w <= PK[i][0]) {
    const [a, pa] = PK[i - 1], [b, pb] = PK[i];
    return Math.round((pa + (pb - pa) * (w - a) / (b - a) + 25 * Math.sin(w * 1.9)) / 5) * 5;
  }
  return 4600;
}
export function mandi(day) {
  const p = priceAt(day), w = day / 7;
  return { pmex: p, sahiwal: p - 35 + Math.round(10 * Math.sin(w)), okara: p - 60 + Math.round(12 * Math.cos(w)), support: PR.support };
}

// One sale calculation for statements. April: sold at delivery, no storage. September: storage charged. Tax withheld on gross.
export function sale(pat, win, px, filer = true) {
  const md = pat / PR.unitKg, gross = md * px, fee = gross * PR.fee, storage = win === 'sep' ? md * PR.carry : 0;
  const tax = gross * (filer ? PR.wht.filer : PR.wht.nonFiler);
  return { md, gross, fee, storage, tax, net: gross - fee - storage - tax };
}
export const netPerKg = (px) => (px * (1 - PR.fee) - PR.carry) / PR.unitKg;

// ── crop model ────────────────────────────────────────────────────────────────
export const STAGES = [
  { k: 'presow', s: -99, e: 0, en: 'Before sowing', ur: 'بوائی سے پہلے' },
  { k: 'sow', s: 0, e: 3, en: 'Sowing', ur: 'بوائی' }, { k: 'emerge', s: 3, e: 5, en: 'Emergence', ur: 'اگاؤ' },
  { k: 'tiller', s: 5, e: 10, en: 'Tillering', ur: 'شاخیں' }, { k: 'joint', s: 10, e: 14, en: 'Jointing', ur: 'گانٹھ' },
  { k: 'boot', s: 14, e: 16, en: 'Booting', ur: 'گوبھ' }, { k: 'head', s: 16, e: 18, en: 'Heading', ur: 'سٹہ' },
  { k: 'fill', s: 18, e: 22, en: 'Grain fill', ur: 'دانہ بھرنا' }, { k: 'mature', s: 22, e: 99, en: 'Maturity', ur: 'پکائی' },
];
export const stageAt = (day) => STAGES.find((s) => day / 7 >= s.s && day / 7 < s.e) || STAGES[STAGES.length - 1];
const cl = (x, a, b) => Math.max(a, Math.min(b, x));
const ramp = (w, s, len) => cl((w - s) / len, 0, 1);
const R = (a, b) => { const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return x - Math.floor(x); };

// Yield per acre (maund) and vegetation indices for a field on a day. `f` carries offset/event/harvest week.
export function cropAt(f, day) {
  const w = day / 7;
  let off = f.yield_offset;
  if (f.crop_event === 'blight') off -= 14 * ramp(w, 8, 6);
  if (f.crop_event === 'irrigation') off -= 11 * ramp(w, 15, 4);
  off -= 2.5 * ramp(w, 18, 3);
  const perAc = 38 + off;
  const unc = w < 5 ? 9 : w >= 21 ? 0 : 1.5 + 7.5 * (1 - (w - 5) / 16);
  const harvested = w >= f.harvest_week;
  const ndvi = w < 4 ? null : harvested ? 0.16 : +(0.2 + 0.58 * Math.sin(Math.PI / 2 * Math.min(w, 16) / 16) - (w > 16 ? 0.035 * (w - 16) : 0) + off * 0.009).toFixed(2);
  const ndre = ndvi == null || harvested ? null : +(ndvi * 0.62 - (f.crop_event === 'blight' ? 0.02 : 0)).toFixed(2);
  const ndmi = ndvi == null || harvested ? null : +(ndvi * 0.55 - (f.crop_event === 'blight' ? 0.08 * cl((w - 8) / 5, 0, 1) : 0) - (f.crop_event === 'irrigation' && w > 15 ? 0.06 : 0)).toFixed(2);
  return { perAc, perAcLo: perAc - unc, perAcHi: perAc + unc, unc, ndvi, ndre, ndmi, harvested, cov: perAc / PR.owedMdPerAcre };
}

export function weather(day) {
  const w = day / 7, tempAt = (x) => (x <= 10 ? 26 - 0.9 * x : 17 + 1.25 * (x - 10));
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => {
    const hi = Math.round(tempAt(w + i / 7) + (w >= 19 && i >= 3 && i <= 5 ? 5 : 0) + 2 * R(w, i));
    const rain = w >= 10 && w <= 14 && (i === 2 || i === 3) ? Math.round(4 + 8 * R(i, w)) : 0;
    return { d, dIdx: i, hi, lo: hi - 12, rain, heat: hi >= 34 };
  });
}

export function advice(f, day, medianNdvi, th) {
  const w = day / 7, c = cropAt(f, day), out = [];
  if (c.harvested) return out;
  if (w < 3) out.push({ k: 'sow', pr: 2, en: ['Sow by 20 November', 'Sowing after late November loses about 1% yield per day. Recommended seed: Akbar-2019.'], ur: ['20 نومبر تک بوائی کریں', 'نومبر کے آخر کے بعد بوائی پر روزانہ تقریباً 1٪ پیداوار کم ہوتی ہے۔ تجویز کردہ بیج: اکبر-2019۔'] });
  const prev = cropAt(f, day - 14);
  const dMoist = c.ndmi != null && prev.ndmi != null ? prev.ndmi - c.ndmi : 0;
  const below = c.ndvi != null && medianNdvi != null ? medianNdvi - c.ndvi : 0;
  if (w >= 4 && w < 22 && (dMoist >= th.moist || below >= th.below)) out.push({ k: 'water', pr: 1, en: ['Irrigate within 48 hours', `Moisture index ${dMoist > 0 ? 'fell ' + dMoist.toFixed(2) + ' in 2 weeks' : 'is low'}; crop health is ${below.toFixed(2)} below the area median.`], ur: ['48 گھنٹے میں پانی دیں', 'پتوں میں نمی کم ہو رہی ہے۔ فصل علاقے کے اوسط سے کمزور ہے۔'] });
  const st = stageAt(day).k;
  if ((st === 'tiller' || st === 'joint') && w >= 8 && w <= 12 && c.ndre != null && c.ndre < 0.36) out.push({ k: 'n', pr: 2, en: ['Second nitrogen split: 1 bag urea per acre', 'Chlorophyll index (NDRE) is below the season median at jointing. Apply just before the next irrigation.'], ur: ['نائٹروجن کی دوسری قسط: 1 بوری یوریا فی ایکڑ', 'گانٹھ کے مرحلے پر کلوروفل کم ہے۔ اگلے پانی سے پہلے ڈالیں۔'] });
  const wx = weather(day);
  if (w >= 18 && w < 22 && wx.some((d) => d.heat)) out.push({ k: 'heat', pr: 1, en: ['Light evening irrigation before the heat', `Up to ${Math.max(...wx.map((d) => d.hi))}°C forecast during grain fill. Each day above 34°C can cut grain weight 2–3%.`], ur: ['گرمی سے پہلے شام کو ہلکا پانی دیں', `دانہ بھرنے کے دوران ${Math.max(...wx.map((d) => d.hi))}° تک گرمی متوقع ہے۔`] });
  if (w >= 21 && w < f.harvest_week) out.push({ k: 'harvest', pr: 2, en: ['Harvest window opening', 'Canopy is drying evenly. Book the combine and a warehouse delivery slot now.'], ur: ['کٹائی کا وقت قریب ہے', 'کمبائن اور گودام میں ترسیل کا دن ابھی بُک کریں۔'] });
  if (!out.length && w >= 4 && w < 22) out.push({ k: 'ok', pr: 3, en: ['No action needed', 'Tracking within the expected band. Next irrigation due in about 6 days.'], ur: ['کسی کارروائی کی ضرورت نہیں', 'فصل متوقع حد میں ہے۔ اگلا پانی تقریباً 6 دن میں۔'] });
  return out.sort((a, b) => a.pr - b.pr);
}

// Parcels on a 600x400 map: [cx, cy, w, h, rot]
export const GEO = [[120, 120, 70, 46, -8], [330, 90, 60, 40, 6], [470, 260, 86, 52, -4], [190, 160, 48, 34, -8], [380, 130, 62, 44, 6], [520, 320, 60, 42, -4],
  [150, 205, 56, 36, -8], [250, 300, 70, 44, 10], [300, 345, 42, 30, 10], [430, 70, 56, 36, 6], [95, 175, 40, 28, -8], [195, 340, 44, 32, 10]];
export function poly(g) {
  const [cx, cy, w, h, rot] = g, a = rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const pts = [[-w / 2, -h / 2], [w / 2, -h / 2 + 3], [w / 2 - 2, h / 2], [-w / 2 + 3, h / 2 - 2]].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
  return 'M' + pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' L') + ' Z';
}
