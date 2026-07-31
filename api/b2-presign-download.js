const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

// Génère une URL GET temporaire (10 min) permettant de consulter un document
// privé stocké sur Backblaze B2, sans jamais exposer les clés d'accès B2 au
// navigateur ni rendre le bucket public.
module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Méthode non autorisée" });
    return;
  }

  try {
    const { key } = req.query || {};
    if (!key || typeof key !== "string" || !key.startsWith("interventions/")) {
      res.status(400).json({ error: "Paramètre 'key' manquant ou invalide." });
      return;
    }

    const client = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.B2_ENDPOINT}`,
      credentials: {
        accessKeyId: process.env.B2_KEY_ID,
        secretAccessKey: process.env.B2_APPLICATION_KEY,
      },
    });

    const command = new GetObjectCommand({
      Bucket: process.env.B2_BUCKET_NAME,
      Key: key,
    });

    const downloadUrl = await getSignedUrl(client, command, { expiresIn: 600 });

    res.status(200).json({ downloadUrl });
  } catch (err) {
    console.error("Erreur b2-presign-download:", err);
    res.status(500).json({ error: "Impossible de générer l'URL de consultation." });
  }
};