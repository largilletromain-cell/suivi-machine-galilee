// Envoie un fichier vers Backblaze B2 en 2 temps : on demande une URL
// d'upload signée à notre fonction Vercel (qui connaît les clés B2), puis on
// envoie le fichier directement à B2 depuis le navigateur (le fichier ne
// transite jamais par notre serveur, pas de limite de taille).
export async function uploadDocument(file) {
  const presignRes = await fetch("/api/b2-presign-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, contentType: file.type }),
  });
  if (!presignRes.ok) throw new Error("Impossible de préparer l'envoi du document.");
  const { uploadUrl, key } = await presignRes.json();

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!uploadRes.ok) throw new Error("Échec de l'envoi du document vers le stockage.");

  return { key, filename: file.name };
}

// Demande une URL de consultation temporaire (10 min) pour un document déjà
// stocké, puis l'ouvre dans un nouvel onglet.
export async function openDocument(key) {
  const res = await fetch(`/api/b2-presign-download?key=${encodeURIComponent(key)}`);
  if (!res.ok) throw new Error("Impossible de récupérer le document.");
  const { downloadUrl } = await res.json();
  window.open(downloadUrl, "_blank", "noopener,noreferrer");
}