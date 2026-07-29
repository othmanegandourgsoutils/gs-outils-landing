// Enregistre une réclamation/message de contact dans la base Supabase de l'application,
// pour qu'elle soit consultable depuis l'accès propriétaire de GS-Outillage.
// Utilise la clé secrète "service_role" (jamais exposée côté navigateur) pour écrire
// directement, sans dépendre des règles de sécurité (RLS) prévues pour les utilisateurs connectés.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const { name, email, subject, message } = req.body || {};
  if (!name || !email || !message) {
    return res.status(400).json({ error: "Nom, e-mail et message sont requis" });
  }
  if (!email.includes("@") || !email.includes(".")) {
    return res.status(400).json({ error: "Adresse e-mail invalide" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: "Configuration Supabase non définie sur le serveur" });
  }

  const now = new Date().toISOString();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const key = `outillage:global:complaint:${id}`;
  const value = JSON.stringify({
    name: String(name).slice(0, 200),
    email: String(email).slice(0, 200),
    subject: String(subject || "(sans sujet)").slice(0, 300),
    message: String(message).slice(0, 5000),
    createdAt: now,
    status: "nouveau",
  });

  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/app_storage`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ key, shared: true, value, updated_at: now }),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      return res.status(500).json({ error: `Erreur d'enregistrement (${r.status}) : ${errText}` });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erreur serveur" });
  }
}
