import { useEffect, useState } from "react";
import { supabase, withRetry } from "../lib/supabaseClient";
import { IconButton, Panel } from "./ui";
import EditSystemModal from "./EditSystemModal";

const emptyForm = {
  name: "",
  system_type: "Radixact",
  serial_number: "",
  commissioning_date: "",
};

export default function Parametrage({ centerId }) {
  const [systems, setSystems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingSystem, setEditingSystem] = useState(null);

  useEffect(() => {
    load();
  }, [centerId]);

  async function load() {
    setLoading(true);
    try {
      const res = await withRetry(() =>
        supabase.from("systems").select("*").eq("center_id", centerId).order("sort_order")
      );
      setSystems(res.data ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Le nom de la machine / du logiciel est obligatoire.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const name = form.name.trim();
      const sortOrder = systems.length;

      // 1) Toujours créer le sous-onglet Work Order.
      const { data: we, error: weError } = await supabase
        .from("wo_equipments")
        .insert({ center_id: centerId, code: name, label: name, sort_order: sortOrder })
        .select()
        .single();
      if (weError) throw weError;

      // 2) Radixact / Varian : créer aussi le sous-onglet Registre Pannes.
      let machineId = null;
      if (form.system_type === "Radixact" || form.system_type === "Varian") {
        const { data: m, error: mError } = await supabase
          .from("machines")
          .insert({
            center_id: centerId,
            code: name,
            label: name,
            machine_type: form.system_type,
            sort_order: sortOrder,
          })
          .select()
          .single();
        if (mError) throw mError;
        machineId = m.id;
      }

      // 3) Enregistrer la fiche système elle-même.
      const { error: sError } = await supabase.from("systems").insert({
        center_id: centerId,
        name,
        system_type: form.system_type,
        serial_number: form.serial_number || null,
        commissioning_date: form.commissioning_date || null,
        machine_id: machineId,
        wo_equipment_id: we.id,
        sort_order: sortOrder,
      });
      if (sError) throw sError;

      setForm(emptyForm);
      await load();
    } catch (e) {
      setError("Impossible de créer ce système (nom peut-être déjà utilisé).");
    } finally {
      setSaving(false);
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
    setSystems((s) => s.filter((x) => x.id !== system.id));
  }

  return (
    <Panel>
      <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem", marginTop: 0 }}>
        Créez ici chaque machine ou logiciel à suivre. Un sous-onglet <strong>Work Order</strong> est
        créé automatiquement pour tout système. Si le type est <strong>Radixact</strong> ou{" "}
        <strong>Varian</strong>, un sous-onglet <strong>Registre Pannes</strong> est créé en plus.
        Le tableau ci-dessous est en lecture seule — cliquez sur <strong>✎ Modifier</strong> pour
        changer les informations d'un système.
      </p>

      <form
        onSubmit={handleCreate}
        style={{
          display: "grid",
          gridTemplateColumns: "1.3fr 140px 160px 150px auto",
          gap: 8,
          alignItems: "end",
          marginBottom: 18,
          paddingBottom: 18,
          borderBottom: "1px solid var(--border)",
        }}
      >
        <Field label="Nom de la machine / du logiciel">
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="ex : RX4010600 ou TrueBeam"
            required
            style={{ width: "100%", minWidth: 0 }}
          />
        </Field>
        <Field label="Type">
          <select
            value={form.system_type}
            onChange={(e) => setForm({ ...form, system_type: e.target.value })}
            style={{ width: "100%" }}
          >
            <option value="Radixact">Radixact</option>
            <option value="Varian">Varian</option>
            <option value="Autre">Autre</option>
          </select>
        </Field>
        <Field label="N° de série">
          <input
            type="text"
            className="mono"
            value={form.serial_number}
            onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
            style={{ width: "100%", minWidth: 0 }}
          />
        </Field>
        <Field label="Date de mise en service">
          <input
            type="date"
            value={form.commissioning_date}
            onChange={(e) => setForm({ ...form, commissioning_date: e.target.value })}
          />
        </Field>
        <button
          type="submit"
          disabled={saving}
          style={{
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "8px 16px",
            fontWeight: 600,
            height: 34,
          }}
        >
          {saving ? "…" : "Créer"}
        </button>
      </form>
      {error && <p style={{ color: "var(--status-bad-ink)", fontSize: "0.85rem" }}>{error}</p>}

      {loading ? (
        <p style={{ color: "var(--ink-soft)" }}>Chargement…</p>
      ) : systems.length === 0 ? (
        <p style={{ color: "var(--ink-soft)" }}>Aucun système enregistré pour le moment.</p>
      ) : (
        <table>
          <thead>
            <tr style={{ textAlign: "left", fontSize: "0.75rem", color: "var(--ink-soft)" }}>
              <th style={th}>Nom</th>
              <th style={th}>Type</th>
              <th style={th}>N° de série</th>
              <th style={th}>Mise en service</th>
              <th style={th}>Registre Pannes</th>
              <th style={th}></th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {systems.map((s) => (
              <tr key={s.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={td}>{s.name}</td>
                <td style={td}>
                  <span className="code-chip" style={chip(s.system_type)}>
                    {s.system_type}
                  </span>
                </td>
                <td style={td} className="mono">
                  {s.serial_number || "—"}
                </td>
                <td style={td}>{formatDate(s.commissioning_date)}</td>
                <td style={td}>{s.machine_id ? "Oui" : "—"}</td>
                <td style={td}>
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
                </td>
                <td style={td}>
                  <IconButton title="Supprimer" danger onClick={() => handleDelete(s)}>
                    ✕
                  </IconButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editingSystem && (
        <EditSystemModal
          system={editingSystem}
          onClose={() => setEditingSystem(null)}
          onSaved={(updated) => {
            setSystems((s) => s.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
          }}
        />
      )}
    </Panel>
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
    Autre: { bg: "var(--paper)", ink: "var(--ink-soft)" },
  };
  const c = colors[type] || colors.Autre;
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

function formatDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const th = { padding: "6px 10px" };
const td = { padding: "8px 10px", fontSize: "0.85rem", verticalAlign: "top" };