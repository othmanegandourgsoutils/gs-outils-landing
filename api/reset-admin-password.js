// Réinitialise le mot de passe du (premier) compte Administrateur d'une entreprise.
// Réservé au propriétaire de l'application GS-Outillage (vérifié via app_metadata.is_owner,
// positionné uniquement par owner-login.js après validation du mot de passe propriétaire).
// Utilise la clé secrète "service_role" côté serveur — jamais exposée au navigateur.
import { createClient } from "@supabase/supabase-js";

function generateRandomPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans caractères ambigus
  let out = "";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const { companyCode } = req.body || {};
  if (!companyCode || typeof companyCode !== "string") {
    return res.status(400).json({ error: "Code entreprise manquant" });
  }

  const token = (req.headers.authorization || "").replace("Bearer ", "");
  if (!token) {
    return res.status(401).json({ error: "Session manquante" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: "Configuration Supabase non définie sur le serveur" });
  }

  try {
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Vérifie que l'appelant est bien authentifié en tant que propriétaire.
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData?.user) {
      return res.status(401).json({ error: "Session invalide" });
    }
    if (!userData.user.app_metadata?.is_owner) {
      return res.status(403).json({ error: "Réservé au propriétaire de l'application." });
    }

    const usersKey = `company:${companyCode}::outillage:users:v1`;
    const { data: row, error: readError } = await admin
      .from("app_storage")
      .select("value")
      .eq("key", usersKey)
      .eq("shared", true)
      .maybeSingle();
    if (readError) {
      return res.status(500).json({ error: readError.message });
    }

    let usersList = [];
    if (row?.value) { try { usersList = JSON.parse(row.value); } catch {} }

    const adminIdx = usersList.findIndex((u) => u.role === "admin");
    if (adminIdx < 0) {
      return res.status(404).json({ error: "Aucun compte administrateur trouvé pour cette entreprise." });
    }

    const newPassword = generateRandomPassword();
    usersList[adminIdx] = { ...usersList[adminIdx], password: newPassword, mustChangePassword: true };

    const { error: writeError } = await admin.from("app_storage").upsert(
      { key: usersKey, shared: true, value: JSON.stringify(usersList), updated_at: new Date().toISOString() },
      { onConflict: "key,shared" }
    );
    if (writeError) {
      return res.status(500).json({ error: writeError.message });
    }

    return res.status(200).json({ ok: true, adminName: usersList[adminIdx].nom, newPassword });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erreur serveur" });
  }
}
