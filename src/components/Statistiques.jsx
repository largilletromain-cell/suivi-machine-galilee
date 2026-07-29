import { useEffect, useMemo, useRef, useState } from "react";
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

// Charte graphique Groupe PSV.
const BRAND = {
  navy: "#273272",
  magenta: "#D4005D",
  blue: "#325DA8",
  white: "#FFFFFF",
};

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
const AVAILABLE_COLOR = "#f0b429";

function formatDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function monthLabel(year, month) {
  return `${MONTHS_FR[month - 1].slice(0, 3)} ${String(year).slice(2)}`;
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export default function Statistiques({ centerId }) {
  const [machines, setMachines] = useState([]);
  const [activeMachineId, setActiveMachineId] = useState(null);
  const [theoreticalHours, setTheoreticalHours] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [interventions, setInterventions] = useState([]);
  const [pannes, setPannes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonthKey, setSelectedMonthKey] = useState(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const reportRef = useRef(null);

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
    const machineId = system?.machine_id;
    try {
      const [hoursRes, woRes, intRes, pannesRes] = await Promise.all([
        withRetry(() => supabase.from("availability_theoretical_hours").select("*").eq("system_id", systemId)),
        equipmentId
          ? withRetry(() =>
              supabase
                .from("work_orders")
                .select("*, downtime_periods(id, date_debut, heure_debut, date_fin, heure_fin, commentaire)")
                .eq("equipment_id", equipmentId)
            )
          : Promise.resolve({ data: [] }),
        equipmentId
          ? withRetry(() => supabase.from("interventions").select("*").eq("equipment_id", equipmentId))
          : Promise.resolve({ data: [] }),
        machineId
          ? withRetry(() => supabase.from("pannes").select("id, date_panne").eq("machine_id", machineId))
          : Promise.resolve({ data: [] }),
      ]);
      setTheoreticalHours(hoursRes.data ?? []);
      setWorkOrders(woRes.data ?? []);
      setInterventions(intRes.data ?? []);
      setPannes(pannesRes.data ?? []);

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

  const availableHours = useMemo(() => {
    if (!selectedStat?.theoretical) return null;
    return Math.max(0, selectedStat.theoretical - selectedStat.totalDowntime);
  }, [selectedStat]);

  // Projection : 2 derniers mois, mois en cours, 3 prochains mois — parmi
  // ceux où une disponibilité théorique a été saisie.
  const now = new Date();
  const currentKeyNum = now.getFullYear() * 12 + now.getMonth();
  const projectionWindowKeys = new Set();
  for (let offset = -2; offset <= 3; offset++) {
    projectionWindowKeys.add(currentKeyNum + offset);
  }
  const projectionStats = stats.filter((s) => projectionWindowKeys.has(s.year * 12 + (s.month - 1)));

  const donutData = useMemo(() => {
    if (!selectedStat) return [];
    const slices = [];
    if (availableHours > 0) {
      slices.push({ key: "disponible", name: "Disponible", value: Number(availableHours.toFixed(2)), color: AVAILABLE_COLOR });
    }
    CATEGORY_KEYS.filter((k) => selectedStat.totals[k] > 0).forEach((k) => {
      slices.push({
        key: k,
        name: EVENT_STYLES[k].label,
        value: Number(selectedStat.totals[k].toFixed(2)),
        color: EVENT_STYLES[k].color,
      });
    });
    return slices;
  }, [selectedStat, availableHours]);

  // Registre d'intervention du mois sélectionné + interventions prévues le
  // mois suivant.
  const unifiedRows = useMemo(() => {
    const fromWo = workOrders.map((wo) => {
      const periodComments = (wo.downtime_periods || [])
        .filter((p) => p.commentaire)
        .map((p) => p.commentaire)
        .join(" ; ");
      const commentaire = [wo.commentaires, periodComments].filter(Boolean).join(" — ");
      return {
        id: `wo-${wo.id}`,
        eventType: "corrective",
        eventDate: wo.date_intervention,
        title: wo.wo_number ? `${wo.panne_erreur} (WO #${wo.wo_number})` : wo.panne_erreur,
        commentaire,
      };
    });
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

  // Work Orders ouverts (découverts) sur la machine durant le mois sélectionné.
  const woOpenedThisMonth = useMemo(() => {
    if (!selectedStat) return [];
    const prefix = `${selectedStat.year}-${String(selectedStat.month).padStart(2, "0")}`;
    return workOrders
      .filter((wo) => wo.date_decouverte?.startsWith(prefix))
      .sort((a, b) => (a.date_decouverte || "").localeCompare(b.date_decouverte || ""));
  }, [workOrders, selectedStat]);

  // Évolution sur 12 mois glissants : nombre de WO ouverts et de pannes
  // signalées par mois.
  const trend12Months = useMemo(() => {
    const nowD = new Date();
    const monthsList = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(nowD.getFullYear(), nowD.getMonth() - i, 1);
      monthsList.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
    }
    return monthsList.map(({ year, month }) => {
      const prefix = `${year}-${String(month).padStart(2, "0")}`;
      const woCount = workOrders.filter((wo) => wo.date_decouverte?.startsWith(prefix)).length;
      const panneCount = pannes.filter((p) => p.date_panne?.startsWith(prefix)).length;
      return { label: monthLabel(year, month), wo: woCount, pannes: panneCount };
    });
  }, [workOrders, pannes]);

  const nextMonth = useMemo(() => {
    if (!selectedMonthKey) return null;
    const [y, m] = selectedMonthKey.split("-").map(Number);
    return m === 12 ? { year: y + 1, month: 1 } : { year: y, month: m + 1 };
  }, [selectedMonthKey]);

  const activeMachine = machines.find((m) => m.id === activeMachineId);

  async function handleGeneratePdf() {
    if (!reportRef.current || !selectedStat) return;
    setGeneratingPdf(true);
    try {
      const [{ default: html2canvas }, { jsPDF }, { LOGO_PSV_BASE64 }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
        import("../assets/logoPsv"),
      ]);

      const canvas = await html2canvas(reportRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
      });
      const imgData = canvas.toDataURL("image/png");

      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 12;
      const [navyR, navyG, navyB] = hexToRgb(BRAND.navy);
      const [magentaR, magentaG, magentaB] = hexToRgb(BRAND.magenta);
      const [blueR, blueG, blueB] = hexToRgb(BRAND.blue);

      // En-tête blanc (le logo a un fond blanc intégré) avec liserés de
      // couleur de la charte Groupe PSV et le logo officiel.
      const logoSize = 20;
      doc.addImage(LOGO_PSV_BASE64, "PNG", margin, 4, logoSize, logoSize);

      const textX = margin + logoSize + 6;
      doc.setTextColor(navyR, navyG, navyB);
      doc.setFontSize(8.5);
      doc.setFont(undefined, "bold");
      doc.text("GROUPE PSV — RADIOTHÉRAPIE & ONCOLOGIE", textX, 9);

      doc.setFontSize(15);
      doc.text(`Rapport de disponibilité — ${activeMachine?.name ?? ""}`, textX, 17);

      doc.setTextColor(blueR, blueG, blueB);
      doc.setFont(undefined, "normal");
      doc.setFontSize(9.5);
      doc.text(`${MONTHS_FR[selectedStat.month - 1]} ${selectedStat.year}`, pageWidth - margin, 12, { align: "right" });

      doc.setTextColor(140, 140, 140);
      doc.setFontSize(7.5);
      doc.text(
        `Généré le ${new Date().toLocaleDateString("fr-FR")} à ${new Date().toLocaleTimeString("fr-FR")}`,
        pageWidth - margin,
        18,
        { align: "right" }
      );
      doc.setTextColor(0, 0, 0);

      // Double liseré de couleur sous l'en-tête.
      doc.setFillColor(navyR, navyG, navyB);
      doc.rect(0, 26, pageWidth, 1, "F");
      doc.setFillColor(magentaR, magentaG, magentaB);
      doc.rect(0, 27, pageWidth, 1, "F");

      const y = 33;

      // Graphiques capturés en image.
      const imgWidth = pageWidth - margin * 2;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const imgY = y + 4;
      if (imgY + imgHeight > pageHeight - margin) {
        doc.addPage();
        doc.addImage(imgData, "PNG", margin, margin, imgWidth, imgHeight);
      } else {
        doc.addImage(imgData, "PNG", margin, imgY, imgWidth, imgHeight);
      }

      const fileSafeName = (activeMachine?.name ?? "machine").replace(/[^a-z0-9]+/gi, "_");
      doc.save(`rapport-disponibilite-${fileSafeName}-${selectedStat.year}-${selectedStat.month}.pdf`);
    } finally {
      setGeneratingPdf(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <SubTabs
          items={machines.map((m) => ({ key: m.id, label: m.name }))}
          activeKey={activeMachineId}
          onChange={setActiveMachineId}
        />
        {selectedStat && (
          <button
            onClick={handleGeneratePdf}
            disabled={generatingPdf}
            style={{
              border: "1px solid var(--accent)",
              background: "var(--accent)",
              color: "#fff",
              borderRadius: 999,
              padding: "8px 16px",
              fontSize: "0.82rem",
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            {generatingPdf ? "Génération…" : "📄 Générer le rapport PDF"}
          </button>
        )}
      </div>

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
          <div style={{ margin: "14px 0" }}>
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

          <div ref={reportRef} style={{ background: "#ffffff", padding: 4 }}>
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 18 }}>
              <Panel>
                <h3 style={{ margin: "0 0 10px", fontSize: "0.9rem" }}>
                  Taux de disponibilité — {selectedStat && MONTHS_FR[selectedStat.month - 1]} {selectedStat?.year}
                </h3>
                {selectedStat?.theoretical ? (
                  <div style={{ position: "relative", width: 460, height: 400 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={donutData.length ? donutData : [{ key: "vide", name: "Aucune immobilisation", value: 1, color: "#e2e6e5" }]}
                          dataKey="value"
                          nameKey="name"
                          innerRadius="55%"
                          outerRadius="80%"
                          paddingAngle={donutData.length > 1 ? 2 : 0}
                          label={
                            donutData.length
                              ? ({ value }) => `${value} h`
                              : false
                          }
                          labelLine={donutData.length > 0}
                        >
                          {(donutData.length ? donutData : [{ color: "#e2e6e5" }]).map((d, i) => (
                            <Cell key={i} fill={d.color} stroke="none" />
                          ))}
                        </Pie>
                        {donutData.length > 0 && <Tooltip formatter={(v) => `${v} h`} />}
                        <Legend
                          verticalAlign="bottom"
                          height={50}
                          wrapperStyle={{ fontSize: "0.76rem" }}
                          formatter={(value) => {
                            const item = donutData.find((d) => d.name === value);
                            return item ? `${value} — ${item.value.toFixed(1)} h` : value;
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div
                      style={{
                        position: "absolute",
                        top: "38%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                        textAlign: "center",
                        pointerEvents: "none",
                      }}
                    >
                      <div style={{ fontSize: "1.9rem", fontWeight: 700, color: "var(--ink)" }}>
                        {selectedStat.availabilityRate?.toFixed(1)}%
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "var(--ink-soft)" }}>disponibilité</div>
                      <div style={{ fontSize: "0.78rem", color: "var(--ink-soft)", marginTop: 3 }} className="mono">
                        {availableHours?.toFixed(1)} h / {selectedStat.theoretical.toFixed(1)} h
                      </div>
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
                  Projection du taux de disponibilité (2 derniers mois, mois en cours, 3 prochains mois)
                </h3>
                {projectionStats.length === 0 ? (
                  <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>
                    Aucun mois présent ou futur avec disponibilité théorique renseignée.
                  </p>
                ) : (
                  <ResponsiveContainer width={Math.max(460, projectionStats.length * 90)} height={400}>
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

              <Panel>
                <h3 style={{ margin: "0 0 10px", fontSize: "0.9rem" }}>
                  Évolution sur 12 mois glissants — WO ouverts / pannes signalées
                </h3>
                <ResponsiveContainer width={620} height={340}>
                  <BarChart data={trend12Months}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: "0.72rem" }} />
                    <Bar dataKey="wo" fill={BRAND.blue} name="WO ouverts" />
                    <Bar dataKey="pannes" fill={EVENT_STYLES.corrective.color} name="Pannes signalées" />
                  </BarChart>
                </ResponsiveContainer>
              </Panel>
            </div>

            {selectedStat && (
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
                <Panel>
                  <h3 style={{ margin: "0 0 10px", fontSize: "0.9rem" }}>
                    Work Orders ouverts — {MONTHS_FR[selectedStat.month - 1]} {selectedStat.year}
                  </h3>
                  <WoOpenedTable rows={woOpenedThisMonth} />
                </Panel>

                <Panel>
                  <h3 style={{ margin: "0 0 10px", fontSize: "0.9rem" }}>
                    Registre d'intervention — {MONTHS_FR[selectedStat.month - 1]} {selectedStat.year}
                  </h3>
                  <MonthTable rows={rowsForMonth(selectedStat.year, selectedStat.month)} taskColumnLabel="Tâches réalisées" />
                </Panel>

                {nextMonth && (
                  <Panel>
                    <h3 style={{ margin: "0 0 10px", fontSize: "0.9rem" }}>
                      Interventions prévues — {MONTHS_FR[nextMonth.month - 1]} {nextMonth.year}
                    </h3>
                    <MonthTable rows={rowsForMonth(nextMonth.year, nextMonth.month)} taskColumnLabel="Description prévue" />
                  </Panel>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MonthTable({ rows, taskColumnLabel }) {
  if (rows.length === 0) {
    return <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>Aucun événement.</p>;
  }
  return (
    <table>
      <thead>
        <tr style={{ textAlign: "left", fontSize: "0.72rem", color: "var(--ink-soft)" }}>
          <th style={{ padding: "6px 8px" }}>Date</th>
          <th style={{ padding: "6px 8px" }}>Intitulé</th>
          <th style={{ padding: "6px 8px" }}>{taskColumnLabel}</th>
        </tr>
      </thead>
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

function WoOpenedTable({ rows }) {
  if (rows.length === 0) {
    return <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>Aucun Work Order ouvert ce mois-ci.</p>;
  }
  return (
    <table>
      <thead>
        <tr style={{ textAlign: "left", fontSize: "0.72rem", color: "var(--ink-soft)" }}>
          <th style={{ padding: "6px 8px" }}>Découverte</th>
          <th style={{ padding: "6px 8px" }}>Panne / erreur</th>
          <th style={{ padding: "6px 8px" }}>#WO</th>
          <th style={{ padding: "6px 8px" }}>Statut</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((wo) => (
          <tr key={wo.id} style={{ borderTop: "1px solid var(--border)" }}>
            <td style={{ padding: "6px 8px", fontSize: "0.82rem" }} className="mono">
              {formatDate(wo.date_decouverte)}
            </td>
            <td style={{ padding: "6px 8px", fontSize: "0.82rem" }}>{wo.panne_erreur}</td>
            <td style={{ padding: "6px 8px", fontSize: "0.82rem" }} className="mono">
              {wo.wo_number || "—"}
            </td>
            <td style={{ padding: "6px 8px", fontSize: "0.8rem", color: "var(--ink-soft)" }}>
              {wo.statut === "resolu" ? "Résolu" : wo.statut === "en_surveillance" ? "En surveillance" : "Non résolu"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}