import { useState } from "react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supabase, withRetry, logActivity } from "../lib/supabaseClient";
import { useAccess } from "../lib/access";

const NAVY = rgb(39 / 255, 50 / 255, 114 / 255);
const BLUE = rgb(50 / 255, 93 / 255, 168 / 255);
const GREY = rgb(0.55, 0.55, 0.55);

const MONTHS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function sanitizeFilename(s) {
  return (s || "").replace(/[^a-zA-Z0-9._-]+/g, "_");
}

export default function QcEventReportModal({ event, eventLabel, centerId, onClose }) {
  const { username } = useAccess();
  const [files, setFiles] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  function handleFilesChosen(e) {
    setFiles((prev) => [...prev, ...Array.from(e.target.files || [])]);
    e.target.value = "";
  }

  function removeFile(idx) {
    setFiles((f) => f.filter((_, i) => i !== idx));
  }

  async function handleGenerate() {
    setError("");
    setGenerating(true);
    try {
      const centerRes = await withRetry(() => supabase.from("centers").select("name").eq("id", centerId).single());
      const centerName = centerRes.data?.name || "";

      const sysRes = await withRetry(() =>
        supabase.from("systems").select("id, name").eq("wo_equipment_id", event.equipment_id).single()
      );
      const machineName = sysRes.data?.name || "";

      let signataire = event.validated_by || "Non renseigné";
      if (event.validated_by) {
        const signerRes = await withRetry(() =>
          supabase.from("app_users").select("full_name, username").ilike("username", event.validated_by).maybeSingle()
        );
        signataire = signerRes.data?.full_name || signerRes.data?.username || event.validated_by;
      }

      const [yy, mm] = (event.date_debut || "").split("-");
      const monthLabel = mm ? `${MONTHS_FR[parseInt(mm, 10) - 1] || mm} ${yy}` : "Non renseigné";

      const bytes = await buildReport({
        centerName,
        title: eventLabel,
        machineName,
        monthLabel,
        commentaire: event.commentaire || "",
        signataire,
        files,
      });

      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const dateLabel = yy && mm ? `${yy}_${mm}` : "date_inconnue";
      a.download = `${dateLabel}_${sanitizeFilename(eventLabel)}_${sanitizeFilename(machineName)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      logActivity(username, `a généré un rapport de « ${eventLabel} » (${machineName})`);
      onClose();
    } catch (err) {
      console.error("Erreur génération rapport CQ événement:", err);
      setError("Impossible de générer le rapport. Vérifiez que les fichiers sélectionnés sont valides (PDF, JPG ou PNG).");
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
          width: 460,
          maxWidth: "100%",
          maxHeight: "85vh",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Rapport — {eventLabel}</h3>
          <button
            onClick={onClose}
            style={{ border: "none", background: "transparent", fontSize: "1.1rem", color: "var(--ink-soft)" }}
          >
            ✕
          </button>
        </div>

        <p style={{ fontSize: "0.85rem", marginTop: 14 }}>
          Sélectionnez les documents à joindre après la page de garde : PDF ou images (JPG, PNG), plusieurs
          fichiers possibles.
        </p>
        <input type="file" accept="application/pdf,image/jpeg,image/png" multiple onChange={handleFilesChosen} />
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

        {error && <p style={{ color: "var(--status-bad-ink)", fontSize: "0.8rem" }}>{error}</p>}

        <button
          onClick={handleGenerate}
          disabled={generating}
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
          {generating ? "Génération…" : "OK, générer le PDF"}
        </button>
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

async function buildReport({ centerName, title, machineName, monthLabel, commentaire, signataire, files }) {
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

  function drawSeparator(gapBefore = 10, gapAfter = 16) {
    y -= gapBefore;
    page.drawLine({ start: { x: marginX, y }, end: { x: marginX + maxWidth, y }, thickness: 0.75, color: NAVY });
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

  drawCentered(title, 16, true, NAVY, 30);
  drawSeparator();

  drawField("Machine", machineName || "Non renseignée");
  drawSeparator();

  drawField("Période", monthLabel);
  drawSeparator();

  if (commentaire) {
    drawField("Commentaire", commentaire);
    drawSeparator();
  }

  drawField("Signature", signataire, { labelColor: BLUE, valueColor: BLUE });
  page.drawText(new Date().toLocaleDateString("fr-FR"), { x: marginX, y, size: 10, font, color: GREY });

  for (const file of files) {
    try {
      const bytes = await file.arrayBuffer();
      const isJpeg = file.type === "image/jpeg" || file.type === "image/jpg";
      const isPng = file.type === "image/png";
      if (isJpeg || isPng) {
        const img = isJpeg ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
        const imgPage = doc.addPage([595.28, 841.89]);
        const availableW = 495;
        const availableH = 740;
        const scale = Math.min(availableW / img.width, availableH / img.height, 1);
        const w = img.width * scale;
        const h = img.height * scale;
        imgPage.drawImage(img, { x: (595.28 - w) / 2, y: (841.89 - h) / 2, width: w, height: h });
      } else {
        const srcDoc = await PDFDocument.load(bytes);
        const copiedPages = await doc.copyPages(srcDoc, srcDoc.getPageIndices());
        copiedPages.forEach((p) => doc.addPage(p));
      }
    } catch (err) {
      console.error(`Impossible de fusionner le fichier ${file.name}:`, err);
    }
  }

  const pages = doc.getPages();
  const total = pages.length;
  pages.forEach((p, i) => {
    const label = `Page ${i + 1} / ${total}`;
    const w = font.widthOfTextAtSize(label, 9);
    p.drawText(label, { x: 595.28 - 50 - w, y: 30, size: 9, font, color: GREY });
  });

  return doc.save();
}