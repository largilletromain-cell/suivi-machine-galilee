import { useEffect, useState } from "react";
import { supabase, withRetry } from "../lib/supabaseClient";
import { IconButton } from "./ui";

const MONTHS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

const emptyHoursForm = () => ({
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1,
  hours: "",
});

export default function EditSystemModal({ system, centers, onClose, onSaved }) {
  const [name, setName] = useState(system.name);
  const [serialNumber, setSerialNumber] = useState(system.serial_number || "");
  const [commissioningDate, setCommissioningDate] = useState(system.commissioning_date || "");
  const [centerId, setCenterId] = useState(system.center_id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const [hoursEntries, setHoursEntries] = useState([]);
  const [loadingHours, setLoadingHours] = useState(true);
  const [hoursForm, setHoursForm] = useState(emptyHoursForm);
  const [hoursError, setHoursError] = useState("");

  useEffect(() => {
    loadHours();
  }, []);

  async function loadHours() {
    setLoadingHours(true);
    const res = await withRetry(() =>
      supabase
        .from("availability_theoretical_hours")
        .select("*")
        .eq("system_id", system.id)
        .order("year", { ascending: false })
        .order("month", { ascending: false })
    );
    setHoursEntries(res.data ?? []);
    setLoadingHours(false);
  }

  async function handleSaveGeneral(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Le nom ne peut pas être vide.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const trimmedName = name.trim();
      const centerChanged = centerId !== system.center_id;
      await withRetry(() =>
        supabase
          .from("systems")
          .update({
            name: trimmedName,
            serial_number: serialNumber || null,
            commissioning_date: commissioningDate || null,
            center_id: centerId,
          })
          .eq("id", system.id)
      );
      // Garder les sous-onglets Registre Pannes / Work Order synchronisés
      // avec le nom et le centre si l'un des deux a changé.
      if (system.machine_id) {
        await withRetry(() =>
          supabase
            .from("machines")
            .update({ code: trimmedName, label: trimmedName, center_id: centerId })
            .eq("id", system.machine_id)
        );
      }
      if (system.wo_equipment_id) {
        await withRetry(() =>
          supabase
            .from("wo_equipments")
            .update({ code: trimmedName, label: trimmedName, center_id: centerId })
            .eq("id", system.wo_equipment_id)
        );
      }
      setSaved(true);
      onSaved({
        ...system,
        name: trimmedName,
        serial_number: serialNumber || null,
        commissioning_date: commissioningDate || null,
        center_id: centerId,
        centerChanged,
      });
    } catch (e) {
      setError("Impossible d'enregistrer (nom peut-être déjà utilisé).");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddHours(e) {
    e.preventDefault();
    if (!hoursForm.hours || Number(hoursForm.hours) <= 0) {
      setHoursError("Renseignez un nombre d'heures valide.");
      return;
    }
    setHoursError("");
    try {
      await withRetry(() =>
        supabase.from("availability_theoretical_hours").upsert(
          {
            system_id: system.id,
            year: Number(hoursForm.year),
            month: Number(hoursForm.month),
            hours: Number(hoursForm.hours),
          },
          { onConflict: "system_id,year,month" }
        )
      );
      setHoursForm(emptyHoursForm());
      loadHours();
    } catch (e) {
      setHoursError("Impossible d'enregistrer ces heures.");
    }
  }

  async function handleDeleteHours(id) {
    await withRetry(() => supabase.from("availability_theoretical_hours").delete().eq("id", id));
    setHoursEntries((h) => h.filter((x) => x.id !== id));
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
        zIndex: 50,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)",
          borderRadius: 12,
          padding: 22,
          width: 620,
          maxWidth: "100%",
          maxHeight: "85vh",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Modifier « {system.name} »</h3>
          <button
            onClick={onClose}
            style={{ border: "none", background: "transparent", fontSize: "1.1rem", color: "var(--ink-soft)" }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSaveGeneral} style={{ marginTop: 16 }}>
          <FieldLabel>Nom</FieldLabel>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: "100%", marginBottom: 10 }}
          />

          <FieldLabel>Centre</FieldLabel>
          <select
            value={centerId}
            onChange={(e) => setCenterId(e.target.value)}
            style={{ width: "100%", marginBottom: 10 }}
          >
            {(centers || []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <FieldLabel>
            Type — <span style={{ fontWeight: 400 }}>{system.system_type} (fixe, non modifiable)</span>
          </FieldLabel>
          <p style={{ fontSize: "0.72rem", color: "var(--ink-soft)", margin: "0 0 10px" }}>
            Changer le type impliquerait de créer/supprimer les sous-onglets associés et l'historique
            qui va avec — supprimez et recréez le système si le type est réellement à changer.
          </p>

          <FieldLabel>N° de série</FieldLabel>
          <input
            type="text"
            className="mono"
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
            style={{ width: "100%", marginBottom: 10 }}
          />

          <FieldLabel>Date de mise en service</FieldLabel>
          <input
            type="date"
            value={commissioningDate}
            onChange={(e) => setCommissioningDate(e.target.value)}
            style={{ marginBottom: 10 }}
          />

          {error && <p style={{ color: "var(--status-bad-ink)", fontSize: "0.8rem" }}>{error}</p>}
          {saved && !error && (
            <p style={{ color: "var(--status-ok-ink)", fontSize: "0.8rem" }}>Enregistré ✓</p>
          )}

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
              fontSize: "0.85rem",
            }}
          >
            {saving ? "…" : "Enregistrer"}
          </button>
        </form>

        <h4 style={{ margin: "22px 0 6px", fontSize: "0.85rem", color: "var(--ink-soft)" }}>
          Temps de disponibilité théorique (heures / mois)
        </h4>
        <p style={{ fontSize: "0.75rem", color: "var(--ink-soft)", margin: "0 0 10px" }}>
          Utilisé pour de futurs calculs de taux de disponibilité (temps théorique comparé au temps
          d'immobilisation réel des Work Orders).
        </p>

        <form
          onSubmit={handleAddHours}
          style={{ display: "grid", gridTemplateColumns: "100px 140px 120px auto", gap: 6, marginBottom: 12 }}
        >
          <MiniField label="Année">
            <input
              type="number"
              value={hoursForm.year}
              onChange={(e) => setHoursForm({ ...hoursForm, year: e.target.value })}
              style={{ width: "100%" }}
            />
          </MiniField>
          <MiniField label="Mois">
            <select
              value={hoursForm.month}
              onChange={(e) => setHoursForm({ ...hoursForm, month: e.target.value })}
              style={{ width: "100%" }}
            >
              {MONTHS_FR.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </MiniField>
          <MiniField label="Heures">
            <input
              type="number"
              step="0.1"
              value={hoursForm.hours}
              onChange={(e) => setHoursForm({ ...hoursForm, hours: e.target.value })}
              placeholder="ex : 720"
              style={{ width: "100%" }}
            />
          </MiniField>
          <button
            type="submit"
            style={{
              alignSelf: "end",
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "6px 14px",
              fontSize: "0.8rem",
              height: 32,
            }}
          >
            + Ajouter
          </button>
        </form>
        {hoursError && <p style={{ color: "var(--status-bad-ink)", fontSize: "0.8rem" }}>{hoursError}</p>}

        {loadingHours ? (
          <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>Chargement…</p>
        ) : hoursEntries.length === 0 ? (
          <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>Aucune heure théorique enregistrée.</p>
        ) : (
          <table>
            <tbody>
              {hoursEntries.map((h) => (
                <tr key={h.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "6px 8px", fontSize: "0.85rem" }}>
                    {MONTHS_FR[h.month - 1]} {h.year}
                  </td>
                  <td style={{ padding: "6px 8px", fontSize: "0.85rem" }} className="mono">
                    {h.hours} h
                  </td>
                  <td style={{ padding: "6px 8px" }}>
                    <IconButton title="Supprimer" danger onClick={() => handleDeleteHours(h.id)}>
                      ✕
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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

function MiniField({ label, children }) {
  return (
    <label style={{ fontSize: "0.7rem", color: "var(--ink-soft)" }}>
      {label}
      <div style={{ marginTop: 3 }}>{children}</div>
    </label>
  );
}