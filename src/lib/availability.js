// Calcule le temps d'immobilisation "utile" d'une période, c'est-à-dire la
// portion de cette période qui tombe un jour ouvré en France entre 8h00 et
// 18h00, la seule base sur laquelle on compare au temps de disponibilité
// théorique saisi dans Paramétrage.

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
  add(new Date(year, 0, 1)); // Jour de l'an
  add(new Date(year, 4, 1)); // Fête du travail
  add(new Date(year, 4, 8)); // Victoire 1945
  add(new Date(year, 6, 14)); // Fête nationale
  add(new Date(year, 7, 15)); // Assomption
  add(new Date(year, 10, 1)); // Toussaint
  add(new Date(year, 10, 11)); // Armistice
  add(new Date(year, 11, 25)); // Noël
  const easter = easterSunday(year);
  add(addDays(easter, 1)); // Lundi de Pâques
  add(addDays(easter, 39)); // Ascension
  add(addDays(easter, 50)); // Lundi de Pentecôte
  holidaysCache[year] = set;
  return set;
}

function isBusinessDay(d) {
  const day = d.getDay(); // 0 = dimanche, 6 = samedi
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

// Heures d'une période tombant un jour ouvré entre 8h et 18h, restreintes à
// l'intervalle [monthStart, monthEnd].
function businessHoursOverlap(periodStart, periodEnd, monthStart, monthEnd) {
  const start = periodStart < monthStart ? monthStart : periodStart;
  const end = periodEnd > monthEnd ? monthEnd : periodEnd;
  if (end <= start) return 0;

  let totalMs = 0;
  let cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const lastDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  while (cursor <= lastDay) {
    if (isBusinessDay(cursor)) {
      const bizStart = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), 8, 0, 0);
      const bizEnd = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), 18, 0, 0);
      const segStart = start > bizStart ? start : bizStart;
      const segEnd = end < bizEnd ? end : bizEnd;
      if (segEnd > segStart) totalMs += segEnd - segStart;
    }
    cursor = addDays(cursor, 1);
  }
  return totalMs / 3600000;
}

// Renvoie les heures (jours ouvrés 8h-18h) d'une période { date_debut,
// heure_debut, date_fin, heure_fin } tombant dans le mois [year, month].
export function periodBusinessHoursInMonth(period, year, month) {
  const monthStart = new Date(year, month - 1, 1, 0, 0, 0);
  const monthEnd = new Date(year, month, 0, 23, 59, 59); // dernier jour du mois

  const start = toDateTime(period.date_debut, period.heure_debut || "00:00");
  if (!start) return 0;
  let end;
  if (period.date_fin) {
    end = toDateTime(period.date_fin, period.heure_fin || "23:59");
  } else if (period.heure_fin) {
    end = toDateTime(period.date_debut, period.heure_fin);
  } else {
    // Immobilisation toujours en cours : on la compte jusqu'à maintenant.
    end = new Date();
  }
  if (!end || end <= start) return 0;

  return businessHoursOverlap(start, end, monthStart, monthEnd);
}

const CATEGORY_KEYS = [
  "corrective",
  "controle_qualite",
  "maintenance_preventive",
  "parametrage_machine",
  "autre",
];

// Agrège, pour un système donné et un ensemble de work orders / interventions
// déjà chargés, les heures d'immobilisation par mois et par catégorie.
// months: liste de {year, month} à calculer.
export function computeMonthlyStats({ months, workOrders, interventions, theoreticalHours }) {
  const theoreticalByMonth = {};
  theoreticalHours.forEach((h) => {
    theoreticalByMonth[`${h.year}-${h.month}`] = Number(h.hours);
  });

  return months.map(({ year, month }) => {
    const key = `${year}-${month}`;
    const totals = { corrective: 0, controle_qualite: 0, maintenance_preventive: 0, parametrage_machine: 0, autre: 0 };

    workOrders.forEach((wo) => {
      (wo.downtime_periods || []).forEach((p) => {
        totals.corrective += periodBusinessHoursInMonth(p, year, month);
      });
    });

    interventions.forEach((it) => {
      if (CATEGORY_KEYS.includes(it.event_type)) {
        totals[it.event_type] += periodBusinessHoursInMonth(it, year, month);
      }
    });

    const theoretical = theoreticalByMonth[key] ?? null;
    const totalDowntime = CATEGORY_KEYS.reduce((sum, k) => sum + totals[k], 0);
    const availabilityRate =
      theoretical && theoretical > 0 ? ((theoretical - totalDowntime) * 100) / theoretical : null;

    return { year, month, theoretical, totals, totalDowntime, availabilityRate };
  });
}

export { CATEGORY_KEYS };