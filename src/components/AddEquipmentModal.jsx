import { useState } from "react";
import { supabase, logActivity } from "../lib/supabaseClient";
import { useAccess } from "../lib/access";

const CATEGORY_LABELS = {
  machine: "Machine",
  logiciel: "Logiciel",
  materiel_mesure: "Matériel de mesure",
  fantome: "Fantôme",
  equipement: "Équipement",
};

const emptyForm = (centerId) => ({
  name: "",
  manufacturer: "",
  serial_number: "",
  commissioning_date: "",
  notes: "",
  category: "machine",
  system_type: "Radixact",
  center_id: centerId || "",
});

export default function AddEquipmentModal({ centers, defaultCenterId, onClose, onCreated }) {
  const { username } = useAccess();
  const [form, setForm] = useState(() => emptyForm(defaultCenterId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Le nom du matériel est obligatoire.");
      return;
    }
    if (!form.center_id) {
      setError("Choisissez un centre.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const name = form.name.trim();
      const isMachine = form.category === "machine";

      // 1) Toujours créer le sous-onglet Work Order.
      const { data: we, error: weError } = await supabase
        .from("wo_equipments")
        .insert({ center_id: form.center_id, code: name, label: name, sort_order: 0 })
        .select()
        .single();
      if (weError) throw weError;

      // 2) Machine Radixact/Varian : créer aussi le sous-onglet Registre Pannes.
      let machineId = null;
      if (isMachine) {
        const { data: m, error: mError } = await supabase
          .from("machines")
          .insert({
            center_id: form.center_id,
            code: name,
            label: name,
            machine_type: form.system_type,
            sort_order: 0,
          })
          .select()
          .single();
        if (mError) throw mError;
        machineId = m.id;
      }

      // 3) Enregistrer la fiche matériel elle-même.
      const { error: sError } = await supabase.from("systems").insert({
        center_id: form.center_id,
        name,
        category: form.category,
        system_type: isMachine ? form.system_type : null,
        manufacturer: form.manufacturer || null,
        serial_number: form.serial_number || null,
        commissioning_date: form.commissioning_date || null,
        notes: form.notes || null,
        machine_id: machineId,
        wo_equipment_id: we.id,
        sort_order: 0,
      });
      if (sError) throw sError;

      logActivity(username, `a ajouté un matériel « ${name} » (${CATEGORY_LABELS[form.category]})`);
      onCreated();
    } catch (e) {
      console.error("Erreur création matériel:", e);
      setError(`Impossible de créer ce matériel : ${e?.message || "erreur inconnue"}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(14,22,28,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)",
          borderRadius: 12,
          padding: 22,
          width: 460,
          maxWidth: "100%",
          maxHeight: "85vh",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Ajouter un équipement</h3>
          <button
            onClick={onClose}
            style={{ border: "none", background: "transparent", fontSize: "1.1rem", color: "var(--ink-soft)" }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ marginTop: 14 }}>
          <FieldLabel>Catégorie</FieldLabel>
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            style={{ width: "100%", marginBottom: 10 }}
          >
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          {form.category === "machine" && (
            <>
              <FieldLabel>Type de machine</FieldLabel>
              <select
                value={form.system_type}
                onChange={(e) => setForm({ ...form, system_type: e.target.value })}
                style={{ width: "100%", marginBottom: 10 }}
              >
                <option value="Radixact">Radixact</option>
                <option value="Varian">Varian</option>
                <option value="Scanner">Scanner</option>
              </select>
            </>
          )}

          <FieldLabel>Nom du matériel</FieldLabel>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="ex : RX4010600, TrueBeam, Farmer PTW…"
            style={{ width: "100%", marginBottom: 10 }}
            required
            autoFocus
          />

          <FieldLabel>Constructeur</FieldLabel>
          <input
            type="text"
            value={form.manufacturer}
            onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
            style={{ width: "100%", marginBottom: 10 }}
          />

          <FieldLabel>N° de série</FieldLabel>
          <input
            type="text"
            className="mono"
            value={form.serial_number}
            onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
            style={{ width: "100%", marginBottom: 10 }}
          />

          <FieldLabel>Date de mise en service</FieldLabel>
          <input
            type="date"
            value={form.commissioning_date}
            onChange={(e) => setForm({ ...form, commissioning_date: e.target.value })}
            style={{ marginBottom: 10 }}
          />

          <FieldLabel>Centre</FieldLabel>
          <select
            value={form.center_id}
            onChange={(e) => setForm({ ...form, center_id: e.target.value })}
            style={{ width: "100%", marginBottom: 10 }}
          >
            {centers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <FieldLabel>Commentaire (optionnel)</FieldLabel>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            style={{ width: "100%", marginBottom: 10, resize: "vertical" }}
          />

          {error && <p style={{ color: "var(--status-bad-ink)", fontSize: "0.8rem", margin: "0 0 10px" }}>{error}</p>}

          <button
            type="submit"
            disabled={saving}
            style={{
              width: "100%",
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "10px 0",
              fontWeight: 600,
              fontSize: "0.9rem",
            }}
          >
            {saving ? "…" : "Créer"}
          </button>
        </form>
      </div>
    </div>
  );
}

function FieldLabel({ children }) {
  return (
    <label style={{ display: "block", fontSize: "0.78rem", color: "var(--ink-soft)", marginBottom: 4 }}>
      {children}
    </label>
  );
}

export { CATEGORY_LABELS };