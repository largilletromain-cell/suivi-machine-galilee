import { useEffect, useState } from "react";
import { supabase, withRetry, logActivity } from "../lib/supabaseClient";
import { IconButton, Panel } from "./ui";
import EditSystemModal from "./EditSystemModal";
import AddEquipmentModal from "./AddEquipmentModal";
import { useAccess } from "../lib/access";

const CATEGORY_LABELS = {
  machine: "Machine",
  logiciel: "Logiciel",
  materiel_mesure: "Matériel de mesure",
  fantome: "Fantôme",
  equipement: "Équipement",
};
const CATEGORY_ORDER = ["machine", "logiciel", "materiel_mesure", "fantome", "equipement"];

function formatDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function RegistreMateriel({ centerId, centers, onCentersChanged }) {
  const { readOnly, username } = useAccess();
  const [filterCenterId, setFilterCenterId] = useState(centerId || "");
  const [systems, setSystems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingSystem, setEditingSystem] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState(
    () => new Set(CATEGORY_ORDER)
  );

  useEffect(() => {
    if (!filterCenterId && centerId) setFilterCenterId(centerId);
  }, [centerId]);

  useEffect(() => {
    if (filterCenterId) load(filterCenterId);
  }, [filterCenterId]);

  async function load(cId) {
    setLoading(true);
    try {
      const res = await withRetry(() =>
        supabase.from("systems").select("*").eq("center_id", cId).order("sort_order")
      );
      setSystems(res.data ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(system) {
    const confirmMsg =
      `Supprimer « ${system.name} » ?\n\n` +
      "Cette action supprime aussi DÉFINITIVEMENT tout l'historique associé : " +
      "les pannes du Registre Pannes et/ou les Work Orders et immobilisations liés " +
      "à ce système. Cette action est irréversible.";
    if (!window.confirm(confirmMsg)) return;

    if (system.machine_id) {
      await withRetry(() => supabase.from("machines").delete().eq("id", system.machine_id));
    }
    if (system.wo_equipment_id) {
      await withRetry(() => supabase.from("wo_equipments").delete().eq("id", system.wo_equipment_id));
    }
    await withRetry(() => supabase.from("systems").delete().eq("id", system.id));
    logActivity(username, `a supprimé le matériel « ${system.name} »`);
    setSystems((s) => s.filter((x) => x.id !== system.id));
  }

  function toggleCategory(cat) {
    setExpandedCategories((s) => {
      const next = new Set(s);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  const grouped = CATEGORY_ORDER.map((cat) => ({
    key: cat,
    label: CATEGORY_LABELS[cat],
    items: systems.filter((s) => (s.category || "machine") === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Panel>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem", marginTop: 0, flex: 1 }}>
            Registre de tout le matériel suivi : machines, logiciels, matériel de mesure, fantômes,
            équipements. Un sous-onglet <strong>Work Order</strong> est créé automatiquement pour
            chaque matériel ; un sous-onglet <strong>Registre Pannes</strong> en plus si c'est une
            machine Radixact ou Varian.
          </p>
          {!readOnly && (
            <button
              onClick={() => setShowAdd(true)}
              style={{
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                borderRadius: 999,
                padding: "8px 16px",
                fontSize: "0.82rem",
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              + Ajouter un équipement
            </button>
          )}
        </div>

        <Field label="Centre affiché ci-dessous">
          <select
            value={filterCenterId}
            onChange={(e) => setFilterCenterId(e.target.value)}
            style={{ width: 240, marginBottom: 14 }}
          >
            {centers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        {loading ? (
          <p style={{ color: "var(--ink-soft)" }}>Chargement…</p>
        ) : grouped.length === 0 ? (
          <p style={{ color: "var(--ink-soft)" }}>Aucun matériel enregistré pour ce centre.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {grouped.map((group) => {
              const expanded = expandedCategories.has(group.key);
              return (
                <div key={group.key} style={{ border: "1px solid var(--border)", borderRadius: 8 }}>
                  <button
                    onClick={() => toggleCategory(group.key)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      border: "none",
                      background: "var(--accent-soft)",
                      padding: "8px 12px",
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      color: "var(--accent-strong)",
                      borderRadius: expanded ? "8px 8px 0 0" : 8,
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>
                      {expanded ? "▾" : "▸"} {group.label}
                    </span>
                    <span className="mono">
                      {group.items.length} élément{group.items.length !== 1 ? "s" : ""}
                    </span>
                  </button>
                  {expanded && (
                    <table>
                      <thead>
                        <tr style={{ textAlign: "left", fontSize: "0.72rem", color: "var(--ink-soft)" }}>
                          <th style={th}>Nom</th>
                          <th style={th}>Constructeur</th>
                          <th style={th}>N° de série</th>
                          <th style={th}>Mise en service</th>
                          {group.key === "machine" && <th style={th}>Type</th>}
                          <th style={th}></th>
                          <th style={th}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map((s) => (
                          <tr key={s.id} style={{ borderTop: "1px solid var(--border)" }}>
                            <td style={td}>{s.name}</td>
                            <td style={td}>{s.manufacturer || "—"}</td>
                            <td style={td} className="mono">
                              {s.serial_number || "—"}
                            </td>
                            <td style={td}>{formatDate(s.commissioning_date)}</td>
                            {group.key === "machine" && (
                              <td style={td}>
                                <span className="code-chip" style={chip(s.system_type)}>
                                  {s.system_type}
                                </span>
                              </td>
                            )}
                            <td style={td}>
                              {!readOnly && (
                                <button
                                  onClick={() => setEditingSystem(s)}
                                  style={{
                                    border: "1px solid var(--border)",
                                    background: "var(--surface)",
                                    borderRadius: 6,
                                    padding: "4px 10px",
                                    fontSize: "0.78rem",
                                    fontWeight: 600,
                                    color: "var(--accent-strong)",
                                  }}
                                >
                                  ✎ Modifier
                                </button>
                              )}
                            </td>
                            <td style={td}>
                              {!readOnly && (
                                <IconButton title="Supprimer" danger onClick={() => handleDelete(s)}>
                                  ✕
                                </IconButton>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {editingSystem && (
          <EditSystemModal
            system={editingSystem}
            centers={centers}
            onClose={() => setEditingSystem(null)}
            onSaved={(updated) => {
              if (updated.centerChanged) {
                setSystems((s) => s.filter((x) => x.id !== updated.id));
              } else {
                setSystems((s) => s.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
              }
            }}
          />
        )}

        {showAdd && (
          <AddEquipmentModal
            centers={centers}
            defaultCenterId={filterCenterId}
            onClose={() => setShowAdd(false)}
            onCreated={() => {
              setShowAdd(false);
              load(filterCenterId);
            }}
          />
        )}
      </Panel>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block", fontSize: "0.72rem", color: "var(--ink-soft)", minWidth: 0 }}>
      {label}
      <div style={{ marginTop: 4 }}>{children}</div>
    </label>
  );
}

function chip(type) {
  const colors = {
    Radixact: { bg: "var(--accent-soft)", ink: "var(--accent-strong)" },
    Varian: { bg: "var(--status-warn-bg)", ink: "var(--status-warn-ink)" },
  };
  const c = colors[type] || { bg: "var(--paper)", ink: "var(--ink-soft)" };
  return {
    background: c.bg,
    color: c.ink,
    borderRadius: 4,
    padding: "2px 8px",
    fontSize: "0.72rem",
    fontWeight: 600,
    whiteSpace: "nowrap",
  };
}

const th = { padding: "6px 10px" };
const td = { padding: "8px 10px", fontSize: "0.85rem", verticalAlign: "top" };