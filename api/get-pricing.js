// Renvoie les prix actuels (mensuel / annuel) pour affichage public sur la landing page.
// Lecture seule, aucune authentification requise — ce sont des informations tarifaires publiques.
// Utilise la clé secrète "service_role" côté serveur pour lire la table, jamais exposée au navigateur.
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: "Configuration Supabase non définie sur le serveur" });
  }

  try {
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: rows, error } = await admin
      .from("app_storage")
      .select("key, value")
      .eq("shared", true)
      .in("key", ["outillage:global:pricePerMonth", "outillage:global:priceAnnual"]);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const monthlyRow = rows?.find((r) => r.key === "outillage:global:pricePerMonth");
    const annualRow = rows?.find((r) => r.key === "outillage:global:priceAnnual");

    const pricePerMonth = Number(monthlyRow?.value) || 2000;
    const priceAnnual = Number(annualRow?.value) || 24000;

    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
    return res.status(200).json({ pricePerMonth, priceAnnual });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erreur serveur" });
  }
}