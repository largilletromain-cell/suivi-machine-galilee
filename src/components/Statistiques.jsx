import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { supabase, withRetry } from "../lib/supabaseClient";
import { SubTabs, Panel } from "./ui";
import { computeMonthlyStats, CATEGORY_KEYS } from "../lib/availability";

const MONTHS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

const EVENT_STYLES = {
  corrective: { color: "#e0292a", label: "Maintenance corrective" },
  controle_qualite: { color: "#1565e0", label: "Contrôle de qualité" },
  maintenance_preventive: { color: "#1a9c4b", label: "Maintenance préventive" },
  parametrage_machine: { color: "#8b3fd1", label: "Paramétrage machine" },
  autre: { color: "#6b7280", label: "Autre" },
};
const AVAILABLE_COLOR = "#0f9d7c";

function formatDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function monthLabel(year, month) {
  return `${MONTHS_FR[month - 1].slice(0, 3)} ${String(year).slice(2)}`;
}

export default function Statistiques({ centerId }) {
  const [machines, setMachines] = useState([]);
  const [activeMachineId, setActiveMachineId] = useState(null);
  const [theoreticalHours, setTheoreticalHours] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [interventions, setInterventions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonthKey, setSelectedMonthKey] = useState(null);

  useEffect(() => {
    loadMachines();
  }, [centerId]);

  useEffect(() => {
    if (!activeMachineId) return;
    loadData(activeMachineId);
  }, [activeMachineId]);

  async function loadMachines() {
    const res = await withRetry(() =>
      supabase.from("systems").select("*").eq("center_id", centerId).not("machine_id", "is", null).order("sort_order")
    );
    setMachines(res.data ?? []);
    if (res.data?.length && !activeMachineId) setActiveMachineId(res.data[0].id);
  }

  async function loadData(systemId) {
    setLoading(true);
    const system = machines.find((m) => m.id === systemId);
    const equipmentId = system?.wo_equipment_id;
    try {
      const [hoursRes, woRes, intRes] = await Promise.all([
        withRetry(() => supabase.from("availability_theoretical_hours").select("*").eq("system_id", systemId)),
        equipmentId
          ? withRetry(() =>
              supabase
                .from("work_orders")
                .select("*, downtime_periods(id, date_debut, heure_debut, date_fin, heure_fin)")
                .eq("equipment_id", equipmentId)
            )
          : Promise.resolve({ data: [] }),
        equipmentId
          ? withRetry(() => supabase.from("interventions").select("*").eq("equipment_id", equipmentId))
          : Promise.resolve({ data: [] }),
      ]);
      setTheoreticalHours(hoursRes.data ?? []);
      setWorkOrders(woRes.data ?? []);
      setInterventions(intRes.data ?? []);

      const months = (hoursRes.data ?? [])
        .map((h) => `${h.year}-${h.month}`)
        .sort();
      const now = new Date();
      const currentKey = `${now.getFullYear()}-${now.getMonth() + 1}`;
      setSelectedMonthKey(months.includes(currentKey) ? currentKey : months[months.length - 1] || null);
    } finally {
      setLoading(false);
    }
  }

  // Liste de tous les mois où une disponibilité théorique a été saisie,
  // triés chronologiquement.
  const allMonths = useMemo(() => {
    return theoreticalHours
      .map((h) => ({ year: h.year, month: h.month }))
      .sort((a, b) => (a.year - b.year) || (a.month - b.month));
  }, [theoreticalHours]);

  const stats = useMemo(
    () => computeMonthlyStats({ months: allMonths, workOrders, interventions, theoreticalHours }),
    [allMonths, workOrders, interventions, theoreticalHours]
  );

  const selectedStat = useMemo(() => {
    if (!selectedMonthKey) return null;
    const [y, m] = selectedMonthKey.split("-").map(Number);
    return stats.find((s) => s.year === y && s.month === m) || null;
  }, [stats, selectedMonthKey]);

  // Projection : mois présents et futurs par rapport à aujourd'hui.
  const now = new Date();
  const currentKeyNum = now.getFullYear() * 12 + now.getMonth();
  const projectionStats = stats.filter((s) => s.year * 12 + (s.month - 1) >= currentKeyNum);

  const donutData = useMemo(() => {
    if (!selectedStat) return [];
    return CATEGORY_KEYS.filter((k) => selectedStat.totals[k] > 0).map((k) => ({
      key: k,
      name: EVENT_STYLES[k].label,
      value: Number(selectedStat.totals[k].toFixed(2)),
      color: EVENT_STYLES[k].color,
    }));
  }, [selectedStat]);

  // Registre d'intervention du mois sélectionné + interventions prévues le
  // mois suivant.
  const unifiedRows = useMemo(() => {
    const fromWo = workOrders.map((wo) => ({
      id: `wo-${wo.id}`,
      eventType: "corrective",
      eventDate: wo.date_intervention,
      title: wo.wo_number ? `${wo.panne_erreur} (WO #${wo.wo_number})` : wo.panne_erreur,
      commentaire: wo.commentaires,
    }));
    const fromInterventions = interventions.map((it) => ({
      id: `it-${it.id}`,
      eventType: it.event_type,
      eventDate: it.date_debut,
      title: EVENT_STYLES[it.event_type]?.label ?? it.event_type,
      commentaire: it.commentaire,
    }));
    return [...fromWo, ...fromInterventions]
      .filter((r) => r.eventDate)
      .sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  }, [workOrders, interventions]);

  function rowsForMonth(year, month) {
    const prefix = `${year}-${String(month).padStart(2, "0")}`;
    return unifiedRows.filter((r) => r.eventDate.startsWith(prefix));
  }

  const nextMonth = useMemo(() => {
    if (!selectedMonthKey) return null;
    const [y, m] = selectedMonthKey.split("-").map(Number);
    return m === 12 ? { year: y + 1, month: 1 } : { year: y, month: m + 1 };
  }, [selectedMonthKey]);

  return (
    <div>
      <SubTabs
        items={machines.map((m) => ({ key: m.id, label: m.name }))}
        activeKey={activeMachineId}
        onChange={setActiveMachineId}
      />

      {machines.length === 0 && (
        <p style={{ color: "var(--ink-soft)", fontSize: "0.88rem" }}>
          Aucune machine avec Registre Pannes (Radixact/Varian) pour ce centre.
        </p>
      )}

      {loading ? (
        <p style={{ color: "var(--ink-soft)" }}>Chargement…</p>
      ) : allMonths.length === 0 ? (
        <Panel>
          <p style={{ color: "var(--ink-soft)", fontSize: "0.88rem", margin: 0 }}>
            Aucune disponibilité théorique n'a été saisie pour cette machine. Ajoutez-en dans{" "}
            <strong>Paramétrage → ✎ Modifier</strong> pour faire apparaître les statistiques ici.
          </p>
        </Panel>
      ) : (
        <>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: "0.78rem", color: "var(--ink-soft)", marginRight: 8 }}>
              Mois analysé
            </label>
            <select
              value={selectedMonthKey || ""}
              onChange={(e) => setSelectedMonthKey(e.target.value)}
              style={{ fontSize: "0.85rem" }}
            >
              {allMonths.map(({ year, month }) => (
                <option key={`${year}-${month}`} value={`${year}-${month}`}>
                  {MONTHS_FR[month - 1]} {year}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 18 }}>
            <Panel>
              <h3 style={{ margin: "0 0 10px", fontSize: "0.9rem" }}>
                Taux de disponibilité — {selectedStat && MONTHS_FR[selectedStat.month - 1]} {selectedStat?.year}
              </h3>
              {selectedStat?.theoretical ? (
                <div style={{ position: "relative", width: 300, height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={donutData.length ? donutData : [{ key: "vide", name: "Aucune immobilisation", value: 1, color: "#e2e6e5" }]}
                        dataKey="value"
                        nameKey="name"
                        innerRadius="62%"
                        outerRadius="88%"
                        paddingAngle={donutData.length > 1 ? 2 : 0}
                      >
                        {(donutData.length ? donutData : [{ color: "#e2e6e5" }]).map((d, i) => (
                          <Cell key={i} fill={d.color} stroke="none" />
                        ))}
                      </Pie>
                      {donutData.length > 0 && <Tooltip formatter={(v) => `${v} h`} />}
                      <Legend verticalAlign="bottom" height={24} wrapperStyle={{ fontSize: "0.72rem" }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div
                    style={{
                      position: "absolute",
                      top: "42%",
                      left: "50%",
                      transform: "translate(-50%, -50%)",
                      textAlign: "center",
                      pointerEvents: "none",
                    }}
                  >
                    <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--ink)" }}>
                      {selectedStat.availabilityRate?.toFixed(1)}%
                    </div>
                    <div style={{ fontSize: "0.68rem", color: "var(--ink-soft)" }}>disponibilité</div>
                  </div>
                </div>
              ) : (
                <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>
                  Pas de disponibilité théorique saisie pour ce mois.
                </p>
              )}
            </Panel>

            <Panel>
              <h3 style={{ margin: "0 0 10px", fontSize: "0.9rem" }}>
                Projection du taux de disponibilité (mois en cours et suivants)
              </h3>
              {projectionStats.length === 0 ? (
                <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>
                  Aucun mois présent ou futur avec disponibilité théorique renseignée.
                </p>
              ) : (
                <ResponsiveContainer width={Math.max(360, projectionStats.length * 70)} height={280}>
                  <BarChart
                    data={projectionStats.map((s) => ({
                      label: monthLabel(s.year, s.month),
                      disponible: Math.max(0, (s.theoretical || 0) - s.totalDowntime),
                      ...s.totals,
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} unit="h" />
                    <Tooltip formatter={(v) => `${Number(v).toFixed(1)} h`} />
                    <Legend wrapperStyle={{ fontSize: "0.72rem" }} />
                    <Bar dataKey="disponible" stackId="a" fill={AVAILABLE_COLOR} name="Disponible" />
                    {CATEGORY_KEYS.map((k) => (
                      <Bar key={k} dataKey={k} stackId="a" fill={EVENT_STYLES[k].color} name={EVENT_STYLES[k].label} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>
          </div>

          {selectedStat && (
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
              <Panel>
                <h3 style={{ margin: "0 0 10px", fontSize: "0.9rem" }}>
                  Registre d'intervention — {MONTHS_FR[selectedStat.month - 1]} {selectedStat.year}
                </h3>
                <MonthTable rows={rowsForMonth(selectedStat.year, selectedStat.month)} />
              </Panel>

              {nextMonth && (
                <Panel>
                  <h3 style={{ margin: "0 0 10px", fontSize: "0.9rem" }}>
                    Interventions prévues — {MONTHS_FR[nextMonth.month - 1]} {nextMonth.year}
                  </h3>
                  <MonthTable rows={rowsForMonth(nextMonth.year, nextMonth.month)} />
                </Panel>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MonthTable({ rows }) {
  if (rows.length === 0) {
    return <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>Aucun événement.</p>;
  }
  return (
    <table>
      <tbody>
        {rows.map((r) => {
          const style = EVENT_STYLES[r.eventType] ?? EVENT_STYLES.autre;
          return (
            <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
              <td style={{ padding: "6px 8px", fontSize: "0.82rem" }} className="mono">
                {formatDate(r.eventDate)}
              </td>
              <td style={{ padding: "6px 8px", fontSize: "0.82rem" }}>
                <span
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: style.color,
                    marginRight: 6,
                  }}
                />
                {r.title}
              </td>
              <td style={{ padding: "6px 8px", fontSize: "0.8rem", color: "var(--ink-soft)" }}>
                {r.commentaire || ""}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}