import { useState } from "react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supabase, withRetry, logActivity } from "../lib/supabaseClient";
import { useAccess } from "../lib/access";

const NAVY = rgb(39 / 255, 50 / 255, 114 / 255);
const BLUE = rgb(50 / 255, 93 / 255, 168 / 255);
const GREY = rgb(0.55, 0.55, 0.55);

function formatDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function sanitizeFilename(s) {
  return (s || "").replace(/[^a-zA-Z0-9._-]+/g, "_");
}

export default function QcReportModal({ workOrder, centerId, onClose }) {
  const { username } = useAccess();
  const [step, setStep] = useState("files"); // files -> cq
  const [files, setFiles] = useState([]);

  const [qcList, setQcList] = useState([]);
  const [loadingQc, setLoadingQc] = useState(true);
  const [selectedQc, setSelectedQc] = useState(() => new Set());
  const [machineInfo, setMachineInfo] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

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

  async function handleGenerate() {
    setError("");
    setGenerating(true);
    try {
      const centerRes = await withRetry(() => supabase.from("centers").select("name").eq("id", centerId).single());
      const centerName = centerRes.data?.name || "";

      let signataire = workOrder.validated_by || "Non renseigné";
      if (workOrder.validated_by) {
        const signerRes = await withRetry(() =>
          supabase.from("app_users").select("full_name, username").ilike("username", workOrder.validated_by).maybeSingle()
        );
        signataire = signerRes.data?.full_name || signerRes.data?.username || workOrder.validated_by;
      }

      const periods = workOrder.downtime_periods || [];
      const startKeys = periods
        .filter((p) => p.date_debut)
        .map((p) => ({ key: `${p.date_debut} ${p.heure_debut || "00:00"}`, date: p.date_debut, heure: p.heure_debut }))
        .sort((a, b) => a.key.localeCompare(b.key));
      const finishedPeriods = periods.filter((p) => p.date_fin);
      const endKeys = finishedPeriods
        .map((p) => ({ key: `${p.date_fin} ${p.heure_fin || "00:00"}`, date: p.date_fin, heure: p.heure_fin }))
        .sort((a, b) => a.key.localeCompare(b.key));

      const immobStart = startKeys.length
        ? `${formatDate(startKeys[0].date)}${startKeys[0].heure ? ` ${startKeys[0].heure.slice(0, 5)}` : ""}`
        : null;
      const immobEnd =
        periods.length > finishedPeriods.length
          ? "en cours"
          : endKeys.length
          ? `${formatDate(endKeys[endKeys.length - 1].date)}${
              endKeys[endKeys.length - 1].heure ? ` ${endKeys[endKeys.length - 1].heure.slice(0, 5)}` : ""
            }`
          : null;

      const techniciens = [...new Set(periods.map((p) => p.technicien).filter(Boolean))].join(", ");
      const periodComments = periods
        .map((p) => p.commentaire)
        .filter(Boolean)
        .join(" ; ");
      const interventionText = [workOrder.panne_erreur, periodComments].filter(Boolean).join(" — ");

      // Autres Work Orders que celui-ci a résolus (relation inverse de
      // resolved_via_wo_id), le cas échéant.
      const resolvedRes = await withRetry(() =>
        supabase.from("work_orders").select("wo_number, panne_erreur").eq("resolved_via_wo_id", workOrder.id)
      );
      const resolvedOtherWos = (resolvedRes.data ?? [])
        .map((w) => (w.wo_number ? `#${w.wo_number} — ${w.panne_erreur}` : w.panne_erreur))
        .join(" ; ");

      const bytes = await buildReport({
        centerName,
        machineName: machineInfo?.name || "",
        serialNumber: machineInfo?.serial_number || "",
        dateIntervention: formatDate(workOrder.date_intervention) || "Non renseignée",
        immobStart,
        immobEnd,
        technicien: techniciens || "Non renseigné",
        resolvedOtherWos,
        interventionText: interventionText || "—",
        selectedCq: [...selectedQc],
        signataire,
        files,
      });

      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const [yy, mm, dd] = (workOrder.date_intervention || "").split("-");
      const dateLabel = yy && mm && dd ? `${yy}_${mm}_${dd}` : "date_inconnue";
      const woLabel = sanitizeFilename(workOrder.wo_number) || "SansNumeroWO";
      a.download = `${dateLabel}_${woLabel}_Rapport_post_intervention.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      logActivity(username, `a généré un rapport de contrôles qualité post-intervention (${machineInfo?.name || ""})`);
      onClose();
    } catch (err) {
      console.error("Erreur génération rapport:", err);
      setError("Impossible de générer le rapport. Vérifiez que les fichiers sélectionnés sont bien des PDF valides.");
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
            <p style={{ fontSize: "0.85rem", marginTop: 0 }}>2. Quels contrôles qualité avez-vous réalisés ?</p>
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
            {error && <p style={{ color: "var(--status-bad-ink)", fontSize: "0.8rem" }}>{error}</p>}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                onClick={handleGenerate}
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
                {generating ? "Génération…" : "Générer le PDF"}
              </button>
              <button
                onClick={() => setStep("files")}
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
          </>
        )}
      </div>
    </div>
  );
}

function base64ToBytes(dataUri) {
  const base64 = dataUri.split(",")[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function buildReport({
  centerName,
  machineName,
  serialNumber,
  dateIntervention,
  immobStart,
  immobEnd,
  technicien,
  resolvedOtherWos,
  interventionText,
  selectedCq,
  signataire,
  files,
}) {
  const { LOGO_VITRUVIEN_PNG } = await import("../assets/logoVitruvien.js");

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logoImage = await doc.embedPng(base64ToBytes(LOGO_VITRUVIEN_PNG));

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

  function drawCentered(text, size, useBold, color, gapAfter) {
    const f = useBold ? bold : font;
    const w = f.widthOfTextAtSize(text, size);
    page.drawText(text, { x: marginX + (maxWidth - w) / 2, y, size, font: f, color });
    y -= gapAfter;
  }

  function drawSeparator(gapBefore = 10, gapAfter = 16, color = NAVY) {
    y -= gapBefore;
    page.drawLine({ start: { x: marginX, y }, end: { x: marginX + maxWidth, y }, thickness: 0.75, color });
    y -= gapAfter;
  }

  function drawField(label, value, { size = 11, lineHeight = 15, gapAfter = 14, labelColor = BLUE, valueColor = BLUE } = {}) {
    const full = `${label} : ${value}`;
    const lines = wrap(full, size, font);
    lines.forEach((line, i) => {
      if (i === 0) {
        page.drawText(`${label} : `, { x: marginX, y, size, font: bold, color: labelColor });
        const labelWidth = bold.widthOfTextAtSize(`${label} : `, size);
        const rest = line.slice(`${label} : `.length);
        page.drawText(rest, { x: marginX + labelWidth, y, size, font, color: valueColor });
      } else {
        page.drawText(line, { x: marginX, y, size, font, color: valueColor });
      }
      y -= lineHeight;
    });
    y -= gapAfter - lineHeight;
  }

  const logoSize = 84;
  page.drawImage(logoImage, { x: marginX, y: y - logoSize + 10, width: logoSize, height: logoSize });
  const centerNameSize = 20;
  const centerNameWidth = bold.widthOfTextAtSize(centerName || "", centerNameSize);
  page.drawText(centerName || "", {
    x: marginX + maxWidth - centerNameWidth,
    y: y - logoSize / 2 + 10,
    size: centerNameSize,
    font: bold,
    color: NAVY,
  });
  y -= logoSize + 24;

  drawCentered("Rapport de contrôles de qualité post-intervention", 16, true, NAVY, 30);
  drawSeparator();

  drawField("Installation", `${machineName}${serialNumber ? ` — n° série ${serialNumber}` : ""}`);
  drawSeparator();

  drawField(
    "Date d'intervention",
    `${dateIntervention}${immobStart ? ` (immobilisation du ${immobStart} au ${immobEnd || "—"})` : ""}`
  );
  drawSeparator();

  drawField("Intervenant", technicien);
  drawSeparator();

  if (resolvedOtherWos) {
    drawField("WorkOrder(s) résolu(s)", resolvedOtherWos);
    drawSeparator();
  }

  drawField("Nature de l'intervention", interventionText);
  drawSeparator();

  drawField("Contrôles effectués après l'intervention", selectedCq.length ? selectedCq.join(", ") : "Aucun renseigné");
  drawSeparator();

  drawField("Signature", signataire, { labelColor: BLUE, valueColor: BLUE });
  page.drawText(new Date().toLocaleDateString("fr-FR"), {
    x: marginX,
    y,
    size: 10,
    font,
    color: GREY,
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