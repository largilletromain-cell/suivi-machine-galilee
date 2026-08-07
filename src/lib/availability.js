// Calcule le temps d'immobilisation "utile" d'une période, c'est-à-dire la
// portion de cette période qui tombe un jour ouvré en France dans la plage
// horaire d'ouverture configurée (Paramètres). La disponibilité théorique
// d'un mois est calculée automatiquement à partir du nombre de jours ouvrés
// de ce mois multiplié par l'amplitude horaire d'ouverture.

function pad2(n) {
  return String(n).padStart(2, "0");
}

function isoDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDays(d, n) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function parseHM(hm) {
  const [h, m] = (hm || "08:00").split(":").map(Number);
  return { h: h || 0, m: m || 0 };
}

// Dimanche de Pâques (algorithme de Meeus/Jones/Butcher).
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const holidaysCache = {};

function frenchHolidays(year) {
  if (holidaysCache[year]) return holidaysCache[year];
  const set = new Set();
  const add = (d) => set.add(isoDate(d));
  add(new Date(year, 0, 1));
  add(new Date(year, 4, 1));
  add(new Date(year, 4, 8));
  add(new Date(year, 6, 14));
  add(new Date(year, 7, 15));
  add(new Date(year, 10, 1));
  add(new Date(year, 10, 11));
  add(new Date(year, 11, 25));
  const easter = easterSunday(year);
  add(addDays(easter, 1));
  add(addDays(easter, 39));
  add(addDays(easter, 50));
  holidaysCache[year] = set;
  return set;
}

function isBusinessDay(d) {
  const day = d.getDay();
  if (day === 0 || day === 6) return false;
  return !frenchHolidays(d.getFullYear()).has(isoDate(d));
}

function toDateTime(dateStr, timeStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  let hh = 0,
    mm = 0;
  if (timeStr) {
    const [h, mi] = timeStr.split(":").map(Number);
    hh = h;
    mm = mi;
  }
  return new Date(y, m - 1, d, hh, mm, 0);
}

function businessHoursOverlap(periodStart, periodEnd, monthStart, monthEnd, openingStart, openingEnd) {
  const start = periodStart < monthStart ? monthStart : periodStart;
  const end = periodEnd > monthEnd ? monthEnd : periodEnd;
  if (end <= start) return 0;

  const { h: sh, m: sm } = parseHM(openingStart);
  const { h: eh, m: em } = parseHM(openingEnd);

  let totalMs = 0;
  let cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const lastDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  while (cursor <= lastDay) {
    if (isBusinessDay(cursor)) {
      const bizStart = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), sh, sm, 0);
      const bizEnd = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), eh, em, 0);
      const segStart = start > bizStart ? start : bizStart;
      const segEnd = end < bizEnd ? end : bizEnd;
      if (segEnd > segStart) totalMs += segEnd - segStart;
    }
    cursor = addDays(cursor, 1);
  }
  return totalMs / 3600000;
}

export function periodBusinessHoursInMonth(period, year, month, openingStart = "08:00", openingEnd = "18:00") {
  const monthStart = new Date(year, month - 1, 1, 0, 0, 0);
  const monthEnd = new Date(year, month, 0, 23, 59, 59);

  const start = toDateTime(period.date_debut, period.heure_debut || "00:00");
  if (!start) return 0;
  let end;
  if (period.date_fin) {
    end = toDateTime(period.date_fin, period.heure_fin || "23:59");
  } else if (period.heure_fin) {
    end = toDateTime(period.date_debut, period.heure_fin);
  } else {
    end = new Date();
  }
  if (!end || end <= start) return 0;

  return businessHoursOverlap(start, end, monthStart, monthEnd, openingStart, openingEnd);
}

// Disponibilité théorique d'un mois = nombre de jours ouvrés × amplitude
// horaire d'ouverture (calculée automatiquement, plus de saisie manuelle).
export function computeTheoreticalHoursForMonth(year, month, openingStart = "08:00", openingEnd = "18:00") {
  const { h: sh, m: sm } = parseHM(openingStart);
  const { h: eh, m: em } = parseHM(openingEnd);
  const dailyHours = eh + em / 60 - (sh + sm / 60);
  if (dailyHours <= 0) return 0;

  const daysInMonth = new Date(year, month, 0).getDate();
  let businessDays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    if (isBusinessDay(new Date(year, month - 1, d))) businessDays++;
  }
  return businessDays * dailyHours;
}

const CATEGORY_KEYS = [
  "corrective",
  "controle_qualite",
  "maintenance_preventive",
  "parametrage_machine",
  "panne_aleatoire",
  "autre",
];

// Les 5 CQ périodiques (mensuel, trimestriel...) sont sommés ensemble sous la
// même catégorie statistique "controle_qualite".
const CQ_EVENT_TYPES = [
  "controle_qualite",
  "cq_mensuel",
  "cq_trimestriel",
  "cq_quadrimestriel",
  "cq_semestriel",
  "cq_annuel",
];

// Durée d'une panne du Registre Pannes = heure de fin - heure de début
// (en heures), sans restriction aux jours/heures ouvrés — contrairement aux
// autres catégories, une panne est un événement ponctuel déjà borné dans le
// temps par ses propres heures de début/fin.
function panneDurationHours(p) {
  if (!p.heure_debut || !p.heure_fin) return 0;
  const [sh, sm] = p.heure_debut.split(":").map(Number);
  const [eh, em] = p.heure_fin.split(":").map(Number);
  const diffMinutes = eh * 60 + em - (sh * 60 + sm);
  return diffMinutes > 0 ? diffMinutes / 60 : 0;
}

export function computeMonthlyStats({
  months,
  workOrders,
  interventions,
  pannes = [],
  openingStart = "08:00",
  openingEnd = "18:00",
}) {
  return months.map(({ year, month }) => {
    const totals = {
      corrective: 0,
      controle_qualite: 0,
      maintenance_preventive: 0,
      parametrage_machine: 0,
      panne_aleatoire: 0,
      autre: 0,
    };

    workOrders.forEach((wo) => {
      (wo.downtime_periods || []).forEach((p) => {
        totals.corrective += periodBusinessHoursInMonth(p, year, month, openingStart, openingEnd);
      });
    });

    interventions.forEach((it) => {
      const key = CQ_EVENT_TYPES.includes(it.event_type) ? "controle_qualite" : it.event_type;
      if (CATEGORY_KEYS.includes(key)) {
        totals[key] += periodBusinessHoursInMonth(it, year, month, openingStart, openingEnd);
      }
    });

    const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
    pannes.forEach((p) => {
      if (p.date_panne && p.date_panne.startsWith(monthPrefix)) {
        totals.panne_aleatoire += panneDurationHours(p);
      }
    });

    const theoretical = computeTheoreticalHoursForMonth(year, month, openingStart, openingEnd);
    const totalDowntime = CATEGORY_KEYS.reduce((sum, k) => sum + totals[k], 0);
    const availabilityRate =
      theoretical && theoretical > 0 ? ((theoretical - totalDowntime) * 100) / theoretical : null;

    return { year, month, theoretical, totals, totalDowntime, availabilityRate };
  });
}

export { CATEGORY_KEYS };