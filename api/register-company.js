// Crée ou met à jour une entreprise dans la liste globale, exclusivement côté SERVEUR (clé secrète
// service_role). Avant cette fonction, n'importe quel visiteur pouvait réécrire directement cette
// liste depuis son navigateur (se marquer "payé", modifier/supprimer d'autres entreprises, etc.).
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

  const { code, extra, joinOnly } = req.body || {};
  if (!code || typeof code !== "string") {
    return res.status(400).json({ error: "Code entreprise manquant" });
  }

  const normalizedPhone = extra?.phone ? String(extra.phone).trim() : "";
  const normalizedEmail = extra?.email ? String(extra.email).trim().toLowerCase() : "";
  const normalizedName = extra?.name ? String(extra.name).trim().toLowerCase() : "";

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: "Configuration Supabase non définie sur le serveur" });
  }

  try {
    const admin = createClient(supabaseUrl, serviceRoleKey);

    let list = [];
    const { data: row } = await admin
      .from("app_storage")
      .select("value")
      .eq("key", "outillage:global:companies")
      .eq("shared", true)
      .maybeSingle();
    if (row?.value) { try { list = JSON.parse(row.value); } catch {} }

    const now = new Date().toISOString();
    const idx = list.findIndex((c) => c.code === code);
    let generatedPassword = null;

    if (idx < 0 && joinOnly) {
      // Tentative de rejoindre un espace avec un code qui n'existe pas : on ne crée rien.
      return res.status(404).json({ error: "Code entreprise introuvable. Vérifiez le code saisi." });
    }

    if (idx < 0) {
      // Nouvelle entreprise : téléphone et e-mail doivent être uniques dans la liste globale.
      if (normalizedPhone) {
        const phoneTaken = list.some((c) => c.code !== code && String(c.phone || "").trim() === normalizedPhone);
        if (phoneTaken) {
          return res.status(409).json({ error: "Ce numéro de téléphone est déjà associé à une autre entreprise." });
        }
      }
      if (normalizedEmail) {
        const emailTaken = list.some((c) => c.code !== code && String(c.email || "").trim().toLowerCase() === normalizedEmail);
        if (emailTaken) {
          return res.status(409).json({ error: "Cette adresse e-mail est déjà associée à une autre entreprise." });
        }
      }
      if (normalizedName) {
        const nameTaken = list.some((c) => c.code !== code && String(c.name || "").trim().toLowerCase() === normalizedName);
        if (nameTaken) {
          return res.status(409).json({ error: "Ce nom d'entreprise est déjà utilisé." });
        }
      }
    }

    if (idx >= 0) {
      list[idx].lastSeen = now;
      if (extra) list[idx] = { ...list[idx], ...extra };
    } else {
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 30);
      list.push({
        code,
        createdAt: now,
        lastSeen: now,
        paid: false,
        trialEndsAt: trialEnd.toISOString(),
        name: extra?.name || "",
        activity: extra?.activity || "",
        location: extra?.location || "",
        phone: extra?.phone || "",
        email: normalizedEmail,
      });
      generatedPassword = generateRandomPassword();
      const seededUsers = [{ id: "u1", nom: "Administrateur", password: generatedPassword, role: "admin", mustChangePassword: true }];
      await admin.from("app_storage").upsert(
        { key: `company:${code}::outillage:users:v1`, shared: true, value: JSON.stringify(seededUsers), updated_at: now },
        { onConflict: "key,shared" }
      );
    }

    const { error: writeError } = await admin.from("app_storage").upsert(
      { key: "outillage:global:companies", shared: true, value: JSON.stringify(list), updated_at: now },
      { onConflict: "key,shared" }
    );
    if (writeError) {
      return res.status(500).json({ error: writeError.message });
    }

    return res.status(200).json({ ok: true, generatedPassword });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erreur serveur" });
  }
}
