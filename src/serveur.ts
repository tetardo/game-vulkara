/**
 * Échanges avec le petit serveur local (server/serve.mjs) : sauvegardes et signalements.
 * Si le serveur n'est pas là (développement sans serveur), le jeu continue sans sauvegarde.
 */
export async function chargerSauvegarde(): Promise<string | null> {
  try {
    const r = await fetch("api/sauvegarde");
    return r.status === 200 ? await r.text() : null;
  } catch {
    return null;
  }
}

export async function envoyerSauvegarde(contenu: string): Promise<boolean> {
  try {
    const r = await fetch("api/sauvegarde", { method: "POST", body: contenu });
    return r.ok;
  } catch {
    return false;
  }
}

export async function envoyerSignalement(contenu: unknown): Promise<boolean> {
  try {
    const r = await fetch("api/signalement", { method: "POST", body: JSON.stringify(contenu) });
    return r.ok;
  } catch {
    return false;
  }
}
