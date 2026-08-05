import { useState } from "react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supabase, withRetry, authenticateUser, logActivity } from "../lib/supabaseClient";

function formatDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function sanitizeFilename(s) {
  return (s || "rapport").replace(/[^a-zA-Z0-9._-]+/g, "_");
}

export default function QcReportModal({ workOrder, centerId, onClose }) {
  const [step, setStep] = useState("files"); // files -> cq -> signature -> generating
  const [files, setFiles] = useState([]);

  const [qcList, setQcList] = useState([]);
  const [loadingQc, setLoadingQc] = useState(true);
  const [selectedQc, setSelectedQc] = useState(() => new Set());
  const [machineInfo, setMachineInfo] = useState(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [signError, setSignError] = useState("");
  const [generating, setGenerating] = useState(false);

  function handleFilesChosen(e) {
    setFiles((prev) => [...prev, ...Array.from(e.target.files || [])]);
    e.target.value = "";
  }

  function removeFile(idx) {
    setFiles((f) => f.filter((_, i) => i !== idx));
  }

  async function goToCqStep() {
    setLoadingQc(true);
    setStep("cq");
    const sysRes = await withRetry(() =>
      supabase
        .from("systems")
        .select("id, name, serial_number")
        .eq("wo_equipment_id", workOrder.equipment_id)
        .single()
    );
    const system = sysRes.data;
    setMachineInfo(system || null);
    if (system) {
      const qcRes = await withRetry(() =>
        supabase.from("machine_qc_list").select("*").eq("system_id", system.id).order("name")
      );
      setQcList(qcRes.data ?? []);
    } else {
      setQcList([]);
    }
    setLoadingQc(false);
  }

  function toggleQc(name) {
    setSelectedQc((s) => {
      const next = new Set(s);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function handleSignAndGenerate(e) {
    e.preventDefault();
    setSignError("");
    if (!username.trim() || !password) {
      setSignError("Identifiant et mot de passe obligatoires pour signer.");
      return;
    }
    const user = await authenticateUser(username, password);
    if (!user) {
      setSignError("Identifiant ou mot de passe incorrect.");
      return;
    }
    setGenerating(true);
    try {
      const centerRes = await withRetry(() => supabase.from("centers").select("name").eq("id", centerId).single());
      const centerName = centerRes.data?.name || "";

      const periods = workOrder.downtime_periods || [];
      const startDates = periods.map((p) => p.date_debut).filter(Boolean).sort();
      const finishedPeriods = periods.filter((p) => p.date_fin);
      const endDates = finishedPeriods.map((p) => p.date_fin).sort();
      const immobStart = startDates.length ? formatDate(startDates[0]) : null;
      const immobEnd =
        periods.length > finishedPeriods.length
          ? "en cours"
          : endDates.length
          ? formatDate(endDates[endDates.length - 1])
          : null;
      const techniciens = [...new Set(periods.map((p) => p.technicien).filter(Boolean))].join(", ");
      const periodComments = periods
        .map((p) => p.commentaire)
        .filter(Boolean)
        .join(" ; ");
      const interventionText = [workOrder.panne_erreur, periodComments].filter(Boolean).join(" — ");

      const bytes = await buildReport({
        centerName,
        machineName: machineInfo?.name || "",
        serialNumber: machineInfo?.serial_number || "",
        dateIntervention: formatDate(workOrder.date_intervention) || "Non renseignée",
        immobStart,
        immobEnd,
        technicien: techniciens || "Non renseigné",
        interventionText: interventionText || "—",
        selectedCq: [...selectedQc],
        signataire: user.full_name || user.username,
        files,
      });

      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `CQ_post_intervention_${sanitizeFilename(machineInfo?.name)}_${sanitizeFilename(
        workOrder.date_intervention || ""
      )}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      logActivity(
        user.username,
        `a généré un rapport de contrôles qualité post-intervention (${machineInfo?.name || ""})`
      );
      onClose();
    } catch (err) {
      console.error("Erreur génération rapport:", err);
      setSignError("Impossible de générer le rapport. Vérifiez que les fichiers sélectionnés sont bien des PDF valides.");
      setGenerating(false);
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
          width: 480,
          maxWidth: "100%",
          maxHeight: "85vh",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Rapport de CQ post-intervention</h3>
          <button
            onClick={onClose}
            style={{ border: "none", background: "transparent", fontSize: "1.1rem", color: "var(--ink-soft)" }}
          >
            ✕
          </button>
        </div>
        <p style={{ fontSize: "0.78rem", color: "var(--ink-soft)", margin: "4px 0 16px" }}>
          {workOrder.panne_erreur}
          {workOrder.wo_number ? ` (WO #${workOrder.wo_number})` : ""}
        </p>

        {step === "files" && (
          <>
            <p style={{ fontSize: "0.85rem", marginTop: 0 }}>
              1. Sélectionnez les PDF de contrôle qualité à joindre après la page de garde (plusieurs fichiers
              possibles).
            </p>
            <input type="file" accept="application/pdf" multiple onChange={handleFilesChosen} />
            {files.length > 0 && (
              <ul style={{ margin: "10px 0", paddingLeft: 18, fontSize: "0.82rem" }}>
                {files.map((f, i) => (
                  <li key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span>📎 {f.name}</span>
                    <button
                      onClick={() => removeFile(i)}
                      style={{ border: "none", background: "transparent", color: "var(--status-bad-ink)", cursor: "pointer" }}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              onClick={goToCqStep}
              style={{
                marginTop: 12,
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "8px 16px",
                fontWeight: 600,
                fontSize: "0.85rem",
              }}
            >
              OK, suivant
            </button>
          </>
        )}

        {step === "cq" && (
          <>
            <p style={{ fontSize: "0.85rem", marginTop: 0 }}>
              2. Quels contrôles qualité avez-vous réalisés ?
            </p>
            {loadingQc ? (
              <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>Chargement…</p>
            ) : qcList.length === 0 ? (
              <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>
                Aucun CQ n'est encore défini pour cette machine. Ajoutez-en dans le Registre du matériel
                (✎ Modifier la machine) si besoin, ou continuez sans en sélectionner.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "10px 0" }}>
                {qcList.map((qc) => (
                  <label key={qc.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.85rem" }}>
                    <input type="checkbox" checked={selectedQc.has(qc.name)} onChange={() => toggleQc(qc.name)} />
                    {qc.name}
                  </label>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                onClick={() => setStep("signature")}
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
                Suivant
              </button>
              <button
                onClick={() => setStep("files")}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: "8px 16px",
                  fontSize: "0.85rem",
                }}
              >
                Retour
              </button>
            </div>
          </>
        )}

        {step === "signature" && (
          <form onSubmit={handleSignAndGenerate}>
            <p style={{ fontSize: "0.85rem", marginTop: 0 }}>
              3. Signez avec votre compte personnel pour générer le rapport.
            </p>
            <label style={{ display: "block", fontSize: "0.78rem", color: "var(--ink-soft)", marginBottom: 4 }}>
              Identifiant
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{ width: "100%", marginBottom: 10 }}
              autoFocus
            />
            <label style={{ display: "block", fontSize: "0.78rem", color: "var(--ink-soft)", marginBottom: 4 }}>
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: "100%", marginBottom: 10 }}
            />
            {signError && (
              <p style={{ color: "var(--status-bad-ink)", fontSize: "0.8rem", margin: "0 0 10px" }}>{signError}</p>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="submit"
                disabled={generating}
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
                {generating ? "Génération…" : "Signer et générer le PDF"}
              </button>
              <button
                type="button"
                onClick={() => setStep("cq")}
                disabled={generating}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: "8px 16px",
                  fontSize: "0.85rem",
                }}
              >
                Retour
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

async function buildReport({
  centerName,
  machineName,
  serialNumber,
  dateIntervention,
  immobStart,
  immobEnd,
  technicien,
  interventionText,
  selectedCq,
  signataire,
  files,
}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595.28, 841.89]);
  const marginX = 50;
  const maxWidth = 495;
  let y = 780;

  function wrap(text, size, f) {
    const words = String(text).split(" ");
    const lines = [];
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (f.widthOfTextAtSize(test, size) > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawTitle(text, size, useBold, gapAfter) {
    page.drawText(text, { x: marginX, y, size, font: useBold ? bold : font, color: rgb(0.05, 0.1, 0.15) });
    y -= gapAfter;
  }

  function drawField(label, value, { size = 11, lineHeight = 15, gapAfter = 14 } = {}) {
    const full = `${label} : ${value}`;
    const lines = wrap(full, size, font);
    lines.forEach((line, i) => {
      if (i === 0) {
        page.drawText(`${label} : `, { x: marginX, y, size, font: bold });
        const labelWidth = bold.widthOfTextAtSize(`${label} : `, size);
        const rest = line.slice(`${label} : `.length);
        page.drawText(rest, { x: marginX + labelWidth, y, size, font });
      } else {
        page.drawText(line, { x: marginX, y, size, font });
      }
      y -= lineHeight;
    });
    y -= gapAfter - lineHeight;
  }

  drawTitle(centerName || "", 14, true, 22);
  drawTitle("Rapport de contrôles de qualité post-intervention", 16, true, 34);

  drawField("Installation", `${machineName}${serialNumber ? ` — n° série ${serialNumber}` : ""}`);
  drawField(
    "Date d'intervention",
    `${dateIntervention}${immobStart ? ` (immobilisation du ${immobStart} au ${immobEnd || "—"})` : ""}`
  );
  drawField("Intervenant", technicien);
  drawField("Intervention", interventionText);
  drawField("Contrôles effectués après intervention", selectedCq.length ? selectedCq.join(", ") : "Aucun renseigné");

  y -= 20;
  page.drawLine({
    start: { x: marginX, y: y + 10 },
    end: { x: marginX + maxWidth, y: y + 10 },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  });
  y -= 10;
  drawField("Signature", signataire, { gapAfter: 0 });
  page.drawText(new Date().toLocaleDateString("fr-FR"), {
    x: marginX,
    y: y - 4,
    size: 10,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });

  for (const file of files) {
    try {
      const bytes = await file.arrayBuffer();
      const srcDoc = await PDFDocument.load(bytes);
      const copiedPages = await doc.copyPages(srcDoc, srcDoc.getPageIndices());
      copiedPages.forEach((p) => doc.addPage(p));
    } catch (err) {
      console.error(`Impossible de fusionner le fichier ${file.name}:`, err);
    }
  }

  return doc.save();
}