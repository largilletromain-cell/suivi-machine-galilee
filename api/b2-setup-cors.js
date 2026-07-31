import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from "@aws-sdk/client-s3";

// À visiter UNE SEULE FOIS dans le navigateur (GET simple) après avoir
// renseigné B2_ALLOWED_ORIGIN dans les variables d'environnement Vercel.
// Configure la règle CORS de l'API S3-compatible de Backblaze B2 (distincte
// de l'API "native", que le panneau web de Backblaze ne permet de régler que
// partiellement pour ce cas d'usage).
export default async function handler(req, res) {
  try {
    const origin = process.env.B2_ALLOWED_ORIGIN;
    if (!origin) {
      res.status(400).json({ error: "Variable d'environnement B2_ALLOWED_ORIGIN manquante." });
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

    await client.send(
      new PutBucketCorsCommand({
        Bucket: process.env.B2_BUCKET_NAME,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: [origin],
              AllowedMethods: ["GET", "PUT", "HEAD"],
              AllowedHeaders: ["*"],
              ExposeHeaders: ["ETag"],
              MaxAgeSeconds: 3600,
            },
          ],
        },
      })
    );

    const check = await client.send(new GetBucketCorsCommand({ Bucket: process.env.B2_BUCKET_NAME }));

    res.status(200).json({
      message: "Règle CORS (API S3-compatible) appliquée avec succès.",
      appliedRules: check.CORSRules,
    });
  } catch (err) {
    console.error("Erreur b2-setup-cors:", err);
    res.status(500).json({ error: err.message || "Impossible d'appliquer la règle CORS." });
  }
}