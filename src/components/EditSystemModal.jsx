import { useEffect, useState } from "react";
import { supabase, withRetry, logActivity } from "../lib/supabaseClient";
import { IconButton } from "./ui";
import { useAccess } from "../lib/access";

const MONTHS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

const CATEGORY_LABELS = {
  machine: "Machine",
  logiciel: "Logiciel",
  materiel_mesure: "Matériel de mesure",
  fantome: "Fantôme",
  equipement: "Équipement",
};

const emptyVersionForm = () => ({ version_date: "", version_label: "", commentaire: "" });
const emptyCalibrationForm = () => ({ calibration_date: "", commentaire: "" });

function formatDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function addMonths(iso, months) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1 + months, d);
  return date.toISOString().slice(0, 10);
}

export default function EditSystemModal({ system, centers, onClose, onSaved }) {
  const { username } = useAccess();
  const category = system.category || "machine";
  const isMachine = category === "machine";
  const isLogiciel = category === "logiciel";
  const isMesure = category === "materiel_mesure";

  const [name, setName] = useState(system.name);
  const [manufacturer, setManufacturer] = useState(system.manufacturer || "");
  const [serialNumber, setSerialNumber] = useState(system.serial_number || "");
  const [commissioningDate, setCommissioningDate] = useState(system.commissioning_date || "");
  const [decommissionDate, setDecommissionDate] = useState(system.decommission_date || "");
  const [notes, setNotes] = useState(system.notes || "");
  const [centerId, setCenterId] = useState(system.center_id);
  const [asnrDate, setAsnrDate] = useState(system.asnr_renewal_date || "");
  const [externalQcDate, setExternalQcDate] = useState(system.next_external_qc_date || "");
  const [equalEstroDate, setEqualEstroDate] = useState(system.next_equal_estro_date || "");
  const [calibrationInterval, setCalibrationInterval] = useState(system.calibration_interval_months || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const [versions, setVersions] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(true);
  const [versionForm, setVersionForm] = useState(emptyVersionForm);
  const [versionError, setVersionError] = useState("");

  const [calibrations, setCalibrations] = useState([]);
  const [loadingCalibrations, setLoadingCalibrations] = useState(true);
  const [calibrationForm, setCalibrationForm] = useState(emptyCalibrationForm);
  const [calibrationError, setCalibrationError] = useState("");

  useEffect(() => {
    if (isMachine || isLogiciel) loadVersions();
    if (isMesure) loadCalibrations();
  }, []);

  async function loadVersions() {
    setLoadingVersions(true);
    const res = await withRetry(() =>
      supabase
        .from("equipment_versions")
        .select("*")
        .eq("system_id", system.id)
        .order("version_date", { ascending: false })
    );
    setVersions(res.data ?? []);
    setLoadingVersions(false);
  }

  async function loadCalibrations() {
    setLoadingCalibrations(true);
    const res = await withRetry(() =>
      supabase
        .from("equipment_calibrations")
        .select("*")
        .eq("system_id", system.id)
        .order("calibration_date", { ascending: false })
    );
    setCalibrations(res.data ?? []);
    setLoadingCalibrations(false);
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
      const payload = {
        name: trimmedName,
        manufacturer: manufacturer || null,
        serial_number: serialNumber || null,
        commissioning_date: commissioningDate || null,
        decommission_date: decommissionDate || null,
        notes: notes || null,
        center_id: centerId,
      };
      if (isMachine) {
        payload.asnr_renewal_date = asnrDate || null;
        payload.next_external_qc_date = externalQcDate || null;
        payload.next_equal_estro_date = equalEstroDate || null;
      }
      if (isMesure) {
        payload.calibration_interval_months = calibrationInterval ? Number(calibrationInterval) : null;
      }
      await withRetry(() => supabase.from("systems").update(payload).eq("id", system.id));
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
      logActivity(username, `a modifié le matériel « ${trimmedName} »`);
      onSaved({ ...system, ...payload, centerChanged });
    } catch (e) {
      console.error("Erreur modification matériel:", e);
      setError(`Impossible d'enregistrer : ${e?.message || "erreur inconnue"}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddVersion(e) {
    e.preventDefault();
    if (!versionForm.version_date || !versionForm.version_label.trim()) {
      setVersionError("La date et le numéro de version sont obligatoires.");
      return;
    }
    setVersionError("");
    try {
      await withRetry(() =>
        supabase.from("equipment_versions").insert({
          system_id: system.id,
          version_date: versionForm.version_date,
          version_label: versionForm.version_label.trim(),
          commentaire: versionForm.commentaire || null,
        })
      );
      setVersionForm(emptyVersionForm());
      logActivity(username, `a ajouté une version de « ${system.name} » (${versionForm.version_label.trim()})`);
      loadVersions();
    } catch (e) {
      setVersionError("Impossible d'enregistrer cette version.");
    }
  }

  async function handleDeleteVersion(id) {
    await withRetry(() => supabase.from("equipment_versions").delete().eq("id", id));
    logActivity(username, `a supprimé une version de « ${system.name} »`);
    setVersions((v) => v.filter((x) => x.id !== id));
  }

  async function handleAddCalibration(e) {
    e.preventDefault();
    if (!calibrationForm.calibration_date) {
      setCalibrationError("La date d'étalonnage est obligatoire.");
      return;
    }
    setCalibrationError("");
    try {
      await withRetry(() =>
        supabase.from("equipment_calibrations").insert({
          system_id: system.id,
          calibration_date: calibrationForm.calibration_date,
          commentaire: calibrationForm.commentaire || null,
        })
      );
      setCalibrationForm(emptyCalibrationForm());
      logActivity(username, `a ajouté un étalonnage de « ${system.name} »`);
      loadCalibrations();
    } catch (e) {
      setCalibrationError("Impossible d'enregistrer cet étalonnage.");
    }
  }

  async function handleDeleteCalibration(id) {
    await withRetry(() => supabase.from("equipment_calibrations").delete().eq("id", id));
    logActivity(username, `a supprimé un étalonnage de « ${system.name} »`);
    setCalibrations((c) => c.filter((x) => x.id !== id));
  }

  const nextCalibrationDate =
    isMesure && calibrations.length > 0 && calibrationInterval
      ? addMonths(calibrations[0].calibration_date, Number(calibrationInterval))
      : null;

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
          width: 640,
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
          <FieldLabel>
            Catégorie — <span style={{ fontWeight: 400 }}>{CATEGORY_LABELS[category]} (fixe, non modifiable)</span>
          </FieldLabel>

          <FieldLabel>Nom du matériel</FieldLabel>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: "100%", marginBottom: 10 }}
          />

          <FieldLabel>Constructeur</FieldLabel>
          <input
            type="text"
            value={manufacturer}
            onChange={(e) => setManufacturer(e.target.value)}
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

          {isMachine && (
            <>
              <FieldLabel>
                Type — <span style={{ fontWeight: 400 }}>{system.system_type} (fixe, non modifiable)</span>
              </FieldLabel>
              <p style={{ fontSize: "0.72rem", color: "var(--ink-soft)", margin: "0 0 10px" }}>
                Changer le type impliquerait de créer/supprimer les sous-onglets associés et l'historique
                qui va avec — supprimez et recréez le système si le type est réellement à changer.
              </p>
            </>
          )}

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

          <FieldLabel>Date de mise au rebut (optionnel)</FieldLabel>
          <input
            type="date"
            value={decommissionDate}
            onChange={(e) => setDecommissionDate(e.target.value)}
            style={{ marginBottom: 10 }}
          />
          {decommissionDate && (
            <p style={{ fontSize: "0.72rem", color: "var(--status-bad-ink)", margin: "-6px 0 10px" }}>
              Ce matériel apparaîtra en rouge, tout en bas de sa catégorie dans le Registre du matériel.
            </p>
          )}

          {isMachine && (
            <div
              style={{
                background: "var(--paper)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 12,
                marginBottom: 10,
              }}
            >
              <div style={{ fontSize: "0.78rem", fontWeight: 600, marginBottom: 8 }}>Échéances de la machine</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <MiniField label="Renouvellement autorisation ASNR">
                  <input type="date" value={asnrDate} onChange={(e) => setAsnrDate(e.target.value)} style={{ width: "100%" }} />
                </MiniField>
                <MiniField label="Prochain contrôle qualité externe">
                  <input
                    type="date"
                    value={externalQcDate}
                    onChange={(e) => setExternalQcDate(e.target.value)}
                    style={{ width: "100%" }}
                  />
                </MiniField>
                <MiniField label="Prochain EQUAL ESTRO">
                  <input
                    type="date"
                    value={equalEstroDate}
                    onChange={(e) => setEqualEstroDate(e.target.value)}
                    style={{ width: "100%" }}
                  />
                </MiniField>
              </div>
            </div>
          )}

          {isMesure && (
            <div
              style={{
                background: "var(--paper)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 12,
                marginBottom: 10,
              }}
            >
              <MiniField label="Fréquence d'étalonnage (en mois, ex : 24 pour tous les 2 ans)">
                <input
                  type="number"
                  value={calibrationInterval}
                  onChange={(e) => setCalibrationInterval(e.target.value)}
                  style={{ width: 140 }}
                />
              </MiniField>
              {nextCalibrationDate && (
                <p style={{ fontSize: "0.78rem", margin: "8px 0 0", color: "var(--accent-strong)", fontWeight: 600 }}>
                  Prochain étalonnage : {formatDate(nextCalibrationDate)}
                </p>
              )}
            </div>
          )}

          <FieldLabel>Commentaire</FieldLabel>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            style={{ width: "100%", marginBottom: 10, resize: "vertical" }}
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

        {(isMachine || isLogiciel) && (
          <>
            <h4 style={{ margin: "22px 0 6px", fontSize: "0.85rem", color: "var(--ink-soft)" }}>
              Historique des mises à jour / versions
            </h4>
            <form
              onSubmit={handleAddVersion}
              style={{ display: "grid", gridTemplateColumns: "140px 1fr 1fr auto", gap: 6, marginBottom: 8 }}
            >
              <MiniField label="Date">
                <input
                  type="date"
                  value={versionForm.version_date}
                  onChange={(e) => setVersionForm({ ...versionForm, version_date: e.target.value })}
                  style={{ width: "100%" }}
                />
              </MiniField>
              <MiniField label="Version">
                <input
                  type="text"
                  value={versionForm.version_label}
                  onChange={(e) => setVersionForm({ ...versionForm, version_label: e.target.value })}
                  placeholder="ex : 6.2.1"
                  style={{ width: "100%" }}
                />
              </MiniField>
              <MiniField label="Commentaire">
                <input
                  type="text"
                  value={versionForm.commentaire}
                  onChange={(e) => setVersionForm({ ...versionForm, commentaire: e.target.value })}
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
            {versionError && <p style={{ color: "var(--status-bad-ink)", fontSize: "0.8rem" }}>{versionError}</p>}

            {loadingVersions ? (
              <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>Chargement…</p>
            ) : versions.length === 0 ? (
              <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>Aucune version enregistrée.</p>
            ) : (
              <table>
                <tbody>
                  {versions.map((v) => (
                    <tr key={v.id} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "6px 8px", fontSize: "0.85rem" }} className="mono">
                        {formatDate(v.version_date)}
                      </td>
                      <td style={{ padding: "6px 8px", fontSize: "0.85rem", fontWeight: 600 }}>{v.version_label}</td>
                      <td style={{ padding: "6px 8px", fontSize: "0.8rem", color: "var(--ink-soft)" }}>
                        {v.commentaire || ""}
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        <IconButton title="Supprimer" danger onClick={() => handleDeleteVersion(v.id)}>
                          ✕
                        </IconButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        {isMesure && (
          <>
            <h4 style={{ margin: "22px 0 6px", fontSize: "0.85rem", color: "var(--ink-soft)" }}>
              Historique d'étalonnage
            </h4>
            <form
              onSubmit={handleAddCalibration}
              style={{ display: "grid", gridTemplateColumns: "140px 1fr auto", gap: 6, marginBottom: 8 }}
            >
              <MiniField label="Date d'étalonnage">
                <input
                  type="date"
                  value={calibrationForm.calibration_date}
                  onChange={(e) => setCalibrationForm({ ...calibrationForm, calibration_date: e.target.value })}
                  style={{ width: "100%" }}
                />
              </MiniField>
              <MiniField label="Commentaire">
                <input
                  type="text"
                  value={calibrationForm.commentaire}
                  onChange={(e) => setCalibrationForm({ ...calibrationForm, commentaire: e.target.value })}
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
            {calibrationError && <p style={{ color: "var(--status-bad-ink)", fontSize: "0.8rem" }}>{calibrationError}</p>}

            {loadingCalibrations ? (
              <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>Chargement…</p>
            ) : calibrations.length === 0 ? (
              <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>Aucun étalonnage enregistré.</p>
            ) : (
              <table>
                <tbody>
                  {calibrations.map((c) => (
                    <tr key={c.id} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "6px 8px", fontSize: "0.85rem" }} className="mono">
                        {formatDate(c.calibration_date)}
                      </td>
                      <td style={{ padding: "6px 8px", fontSize: "0.8rem", color: "var(--ink-soft)" }}>
                        {c.commentaire || ""}
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        <IconButton title="Supprimer" danger onClick={() => handleDeleteCalibration(c.id)}>
                          ✕
                        </IconButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        {isMachine && (
          <p style={{ fontSize: "0.78rem", color: "var(--ink-soft)", marginTop: 18 }}>
            La disponibilité théorique de cette machine est désormais calculée automatiquement dans
            l'onglet Statistiques, à partir des horaires d'ouverture réglés dans l'onglet{" "}
            <strong>Paramètres</strong>.
          </p>
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