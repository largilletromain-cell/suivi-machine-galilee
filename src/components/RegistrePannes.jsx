import { useEffect, useState } from "react";
import { supabase, withRetry } from "../lib/supabaseClient";
import { SubTabs, IconButton, Panel } from "./ui";

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function nowHHMM() {
  const d = new Date();
  return d.toTimeString().slice(0, 5);
}

function defaultForm() {
  return {
    date_panne: todayISO(),
    heure_debut: nowHHMM(),
    heure_fin: "",
    panne_type_id: "",
    commentaire: "",
  };
}

export default function RegistrePannes({ centerId }) {
  const [machines, setMachines] = useState([]);
  const [activeMachineId, setActiveMachineId] = useState(null);
  const [panneTypes, setPanneTypes] = useState([]);
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadMachines();
  }, [centerId]);

  useEffect(() => {
    if (!activeMachineId) return;
    const machine = machines.find((m) => m.id === activeMachineId);
    loadRows(activeMachineId);
    loadPanneTypes(machine?.machine_type);
  }, [activeMachineId, machines]);

  async function loadMachines() {
    const res = await withRetry(() =>
      supabase.from("machines").select("*").eq("center_id", centerId).order("sort_order")
    );
    setMachines(res.data ?? []);
    if (res.data?.length && !activeMachineId) {
      setActiveMachineId(res.data[0].id);
    }
  }

  async function loadPanneTypes(machineType) {
    let query = supabase.from("panne_types").select("*").eq("active", true).order("code");
    if (machineType) query = query.eq("machine_type", machineType);
    const res = await withRetry(() => query);
    setPanneTypes(res.data ?? []);
  }

  async function loadRows(machineId) {
    setLoading(true);
    setError("");
    try {
      const res = await withRetry(() =>
        supabase
          .from("pannes")
          .select("*, panne_types(code, description)")
          .eq("machine_id", machineId)
          .order("date_panne", { ascending: false })
          .order("heure_debut", { ascending: false })
      );
      setRows(res.data ?? []);
    } catch (e) {
      setError("Erreur de chargement du registre de pannes.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.date_panne || !form.heure_debut || !form.heure_fin) {
      setError("La date, l'heure de début et l'heure de fin sont obligatoires.");
      return;
    }
    if (!form.panne_type_id) {
      setError("L'erreur rencontrée est obligatoire.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await withRetry(() =>
        supabase.from("pannes").insert({
          machine_id: activeMachineId,
          date_panne: form.date_panne,
          heure_debut: form.heure_debut,
          heure_fin: form.heure_fin,
          panne_type_id: form.panne_type_id,
          commentaire: form.commentaire || null,
        })
      );
      setForm(defaultForm());
      await loadRows(activeMachineId);
    } catch (e) {
      setError("Impossible d'enregistrer cette panne. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  async function updateField(row, field, value) {
    await withRetry(() => supabase.from("pannes").update({ [field]: value }).eq("id", row.id));
    await loadRows(activeMachineId);
  }

  async function handleDelete(id) {
    if (!window.confirm("Supprimer cette ligne du registre de pannes ?")) return;
    await withRetry(() => supabase.from("pannes").delete().eq("id", id));
    setRows((r) => r.filter((row) => row.id !== id));
  }

  return (
    <div>
      <SubTabs
        items={machines.map((m) => ({ key: m.id, label: m.label || m.code }))}
        activeKey={activeMachineId}
        onChange={setActiveMachineId}
      />

      {machines.length === 0 && (
        <p style={{ color: "var(--ink-soft)", fontSize: "0.88rem" }}>
          Aucune machine Radixact/Varian enregistrée pour l'instant — créez-en une dans l'onglet{" "}
          <strong>Paramétrage</strong>.
        </p>
      )}

      <Panel>
        <form
          onSubmit={handleAdd}
          style={{
            display: "grid",
            gridTemplateColumns: "130px 110px 110px 1fr 1fr auto",
            gap: 8,
            alignItems: "end",
            marginBottom: 18,
            paddingBottom: 18,
            borderBottom: "1px solid var(--border)",
          }}
        >
          <Field label="Date">
            <input
              type="date"
              value={form.date_panne}
              onChange={(e) => setForm({ ...form, date_panne: e.target.value })}
              required
            />
          </Field>
          <Field label="Heure début">
            <input
              type="time"
              value={form.heure_debut}
              onChange={(e) => setForm({ ...form, heure_debut: e.target.value })}
              required
            />
          </Field>
          <Field label="Heure fin">
            <input
              type="time"
              value={form.heure_fin}
              onChange={(e) => setForm({ ...form, heure_fin: e.target.value })}
              required
            />
          </Field>
          <Field label="Erreur rencontrée">
            <select
              value={form.panne_type_id}
              onChange={(e) => setForm({ ...form, panne_type_id: e.target.value })}
              style={{ width: "100%" }}
              required
            >
              <option value="">— Sélectionner —</option>
              {panneTypes.map((pt) => (
                <option key={pt.id} value={pt.id}>
                  {pt.code ? `[${pt.code}] ` : ""}
                  {pt.description}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Commentaire">
            <input
              type="text"
              value={form.commentaire}
              onChange={(e) => setForm({ ...form, commentaire: e.target.value })}
              placeholder="Optionnel"
              style={{ width: "100%" }}
            />
          </Field>
          <button
            type="submit"
            disabled={saving || !activeMachineId}
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
            {saving ? "…" : "Ajouter"}
          </button>
        </form>

        {error && (
          <p style={{ color: "var(--status-bad-ink)", fontSize: "0.85rem" }}>{error}</p>
        )}

        {loading ? (
          <p style={{ color: "var(--ink-soft)" }}>Chargement…</p>
        ) : rows.length === 0 ? (
          <p style={{ color: "var(--ink-soft)" }}>Aucune panne enregistrée pour cette machine.</p>
        ) : (
          <table>
            <thead>
              <tr style={{ textAlign: "left", fontSize: "0.75rem", color: "var(--ink-soft)" }}>
                <th style={th}>Date</th>
                <th style={th}>Début</th>
                <th style={th}>Fin</th>
                <th style={th}>Erreur</th>
                <th style={th}>Commentaire</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={td}>
                    <input
                      type="date"
                      defaultValue={r.date_panne}
                      onBlur={(e) => e.target.value && updateField(r, "date_panne", e.target.value)}
                      style={{ width: 130 }}
                    />
                  </td>
                  <td style={{ ...td }}>
                    <input
                      type="time"
                      className="mono"
                      defaultValue={r.heure_debut?.slice(0, 5)}
                      onBlur={(e) => e.target.value && updateField(r, "heure_debut", e.target.value)}
                      style={{ width: 100 }}
                    />
                  </td>
                  <td style={{ ...td }}>
                    <input
                      type="time"
                      className="mono"
                      defaultValue={r.heure_fin?.slice(0, 5) || ""}
                      onBlur={(e) => updateField(r, "heure_fin", e.target.value || null)}
                      style={{ width: 100 }}
                    />
                  </td>
                  <td style={td}>
                    <select
                      value={r.panne_type_id || ""}
                      onChange={(e) => updateField(r, "panne_type_id", e.target.value || null)}
                      style={{ width: "100%", fontSize: "0.82rem" }}
                    >
                      <option value="">— Aucune —</option>
                      {!panneTypes.some((pt) => pt.id === r.panne_type_id) && r.panne_types && (
                        <option value={r.panne_type_id}>
                          {r.panne_types.code ? `[${r.panne_types.code}] ` : ""}
                          {r.panne_types.description}
                        </option>
                      )}
                      {panneTypes.map((pt) => (
                        <option key={pt.id} value={pt.id}>
                          {pt.code ? `[${pt.code}] ` : ""}
                          {pt.description}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={td}>
                    <input
                      type="text"
                      defaultValue={r.commentaire || ""}
                      onBlur={(e) => updateField(r, "commentaire", e.target.value || null)}
                      placeholder="Optionnel"
                      style={{ width: "100%" }}
                    />
                  </td>
                  <td style={td}>
                    <IconButton title="Supprimer" danger onClick={() => handleDelete(r.id)}>
                      ✕
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block", fontSize: "0.75rem", color: "var(--ink-soft)" }}>
      {label}
      <div style={{ marginTop: 4 }}>{children}</div>
    </label>
  );
}

const th = { padding: "6px 10px" };
const td = { padding: "8px 10px", fontSize: "0.85rem", verticalAlign: "top" };