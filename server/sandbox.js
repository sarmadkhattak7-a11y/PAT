// Sandbox autopilot: moves the season clock and, on the way, does what Barak Ops would do on each date,
// so any persona can be shown at any point of the season. Steps already done by hand are skipped.
import { get, all, run, setSetting, setting, today } from './db.js';
import { isoOf } from './domain.js';
import { pilot, setKv } from './pilot.js';
import { DAY, dayOfDate, priceAt } from './domain.js';
import * as M from './market.js';

const setDay = (day) => setSetting('clock_offset', day - dayOfDate(new Date()));
const STEPS = [
  [DAY.close, () => setting('market') === 'open' && M.closeMarket()],
  [DAY.decide, () => M.fieldRows().filter((f) => f.status === 'offer').forEach((f) => M.decide(f.id, f.id === 'BRK-0150', f.id === 'BRK-0150' ? 'Accepted (sandbox)' : 'Declined (sandbox)'))],
  [DAY.refund, () => setting('market') === 'closed' && M.finalize()],
  [DAY.mint, () => { M.fieldRows().filter((f) => f.status === 'contracted' && f.signed_day == null).forEach((f) => M.sign(f.id, 'On paper with the field officer (sandbox)')); if (setting('market') === 'finalized') M.release(); }],
  // Growers who have not acted by these dates are assumed to act on time.
  [DAY.mint + 2, () => { M.fieldRows().filter((f) => f.paid_day != null && f.receipt_day == null).forEach((f) => run('UPDATE fields SET receipt_day = ? WHERE id = ?', f.paid_day + 1, f.id)); if (!pilot(today()).receipt) setKv('receipt', { yes: true }, 10); }],
  [16, () => M.fieldRows().filter((f) => f.paid_day != null && f.sown_day == null).forEach((f) => run('UPDATE fields SET sown_day = ? WHERE id = ?', 10 + (f.idx % 7), f.id))],
  [150, () => M.fieldRows().filter((f) => f.status === 'paid' && !f.delivery_day).forEach((f, i) => { for (let day = 160 + (i % 8); day <= DAY.deliverBy; day++) { const iso = isoOf(day); if (get('SELECT COUNT(*) AS n FROM fields WHERE delivery_day = ?', iso).n < 3) { run('UPDATE fields SET delivery_day = ? WHERE id = ?', iso, f.id); break; } } })],
  [165, () => M.fieldRows().filter((f) => f.status === 'paid').forEach((f) => M.recordDelivery(f.id, f.acres_contracted * 800 * (f.id === 'BRK-0147' ? 0.82 : 1), 9 + (f.idx % 9) / 10, 'Grade 1', { vehicle: 'OKA-' + (2100 + f.idx * 17), slip: 'WB-' + (40100 + f.idx), bags: Math.round(f.acres_contracted * 16) }))],
  [172, () => M.fieldRows().filter((f) => f.status === 'short').forEach((f) => M.resolveShortfall(f.id, 'refund'))],
  [186, () => !setting('sale_apr') && M.runSale('apr', priceAt(186))],
  [308, () => setting('sale_apr') && !setting('sale_sep') && M.runSale('sep', priceAt(308))],
];

export function advance(target, auto) {
  target = Math.round(Number(target));
  if (!(target >= -31 && target <= 335)) throw new M.UserError('Pick a day in the season.');
  if (auto) {
    for (const [day, fn] of STEPS) {
      if (day > target) break;
      // Every step checks state first, so re-running one that already happened does nothing.
      setDay(Math.max(day, today())); M.sync();
      try { fn(); } catch (e) { if (!(e instanceof M.UserError)) throw e; }
    }
  }
  setDay(target); M.sync();
}
