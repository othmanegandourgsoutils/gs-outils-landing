// Renvoie les prix actuels (mensuel / annuel) pour affichage public sur la landing page.
// Lecture seule, aucune authentification requise — ce sont des informations tarifaires publiques.
// Utilise la clé secrète "service_role" côté serveur via une requête REST directe (pas de
// librairie externe requise, comme submit-complaint.js dans ce même dossier).

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
    const keys = "(outillage:global:pricePerMonth,outillage:global:priceAnnual)";
    const url = `${supabaseUrl}/rest/v1/app_storage?select=key,value&shared=eq.true&key=in.${keys}`;

    const r = await fetch(url, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      return res.status(500).json({ error: `Erreur de lecture (${r.status}) : ${errText}` });
    }

    const rows = await r.json();
    const monthlyRow = rows?.find((row) => row.key === "outillage:global:pricePerMonth");
    const annualRow = rows?.find((row) => row.key === "outillage:global:priceAnnual");

    const pricePerMonth = Number(monthlyRow?.value) || 2000;
    const priceAnnual = Number(annualRow?.value) || 24000;

    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
    return res.status(200).json({ pricePerMonth, priceAnnual });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erreur serveur" });
  }
}
