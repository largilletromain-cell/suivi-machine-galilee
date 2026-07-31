import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Génère une URL PUT temporaire (15 min) permettant au navigateur d'envoyer
// un fichier directement à Backblaze B2, sans jamais faire transiter le
// fichier par cette fonction (évite les limites de taille de Vercel) ni
// exposer les clés d'accès B2 au navigateur.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Méthode non autorisée" });
    return;
  }

  try {
    const { filename, contentType } = req.body || {};
    if (!filename) {
      res.status(400).json({ error: "filename manquant" });
      return;
    }

    const safeName = String(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `interventions/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;

    const client = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.B2_ENDPOINT}`,
      credentials: {
        accessKeyId: process.env.B2_KEY_ID,
        secretAccessKey: process.env.B2_APPLICATION_KEY,
      },
    });

    const command = new PutObjectCommand({
      Bucket: process.env.B2_BUCKET_NAME,
      Key: key,
      ContentType: contentType || "application/octet-stream",
    });

    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 900 });

    res.status(200).json({ uploadUrl, key });
  } catch (err) {
    console.error("Erreur b2-presign-upload:", err);
    res.status(500).json({ error: "Impossible de générer l'URL d'upload." });
  }
}