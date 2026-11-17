// Petits sons synthétisés (aucun fichier) : en attendant les vrais sons et les voix enregistrées.
import { reglages } from "../sim/reglages";

let ctx: AudioContext | null = null;
/** Deux réglages de volume : les bruits (sons du jeu) et la musique. */
let sortieBruits: GainNode | null = null;
let sortieMusique: GainNode | null = null;

// Préférences du joueur, gardées dans ce navigateur (ce ne sont pas des données de la partie).
const CLE = "vulkara-volumes";
const volumes = { musique: reglages.son.volumeMusiqueDefaut, bruits: reglages.son.volumeBruitsDefaut };
try {
  const lu = JSON.parse(localStorage.getItem(CLE) ?? "null") as Partial<typeof volumes> | null;
  if (lu && typeof lu.musique === "number") volumes.musique = lu.musique;
  if (lu && typeof lu.bruits === "number") volumes.bruits = lu.bruits;
} catch {
  // Stockage indisponible : on garde les volumes par défaut.
}

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      sortieBruits = ctx.createGain();
      sortieBruits.gain.value = volumes.bruits;
      sortieBruits.connect(ctx.destination);
      sortieMusique = ctx.createGain();
      sortieMusique.gain.value = volumes.musique;
      sortieMusique.connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function note(freq: number, debut: number, duree: number, type: OscillatorType, volume: number, glisse = 0, sortie?: AudioNode): void {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + debut;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glisse) o.frequency.exponentialRampToValueAtTime(freq * glisse, t + duree);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(volume, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
  o.connect(g).connect(sortie ?? sortieBruits!);
  o.start(t);
  o.stop(t + duree + 0.05);
}

let bruit: AudioBuffer | null = null;
let piedGauche = true;

/** Un court souffle de bruit qui s'éteint (fabriqué une seule fois). */
function tamponBruit(a: AudioContext): AudioBuffer {
  if (!bruit) {
    bruit = a.createBuffer(1, Math.round(a.sampleRate * 0.12), a.sampleRate);
    const d = bruit.getChannelData(0);
    for (let i = 0; i < d.length; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
  }
  return bruit;
}

/** Un pas sur l'herbe : petit souffle de bruit filtré, grave et court. */
function pas(volume: number): void {
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  const src = a.createBufferSource();
  src.buffer = tamponBruit(a);
  src.playbackRate.value = (piedGauche ? 0.9 : 1.05) + Math.random() * 0.1;
  piedGauche = !piedGauche;
  const filtre = a.createBiquadFilter();
  filtre.type = "lowpass";
  filtre.frequency.value = 700 + Math.random() * 200;
  const g = a.createGain();
  g.gain.setValueAtTime(volume, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
  src.connect(filtre).connect(g).connect(sortieBruits!);
  src.start(t);
}

// ---------- Musique de fond ----------
// Composée en direct par le jeu (aucun fichier, 0 €) : une mélodie douce sur une gamme pentatonique,
// au-dessus de quatre accords qui tournent en boucle. Elle ne se répète jamais tout à fait.
const ACCORDS = [
  [220, 277.2, 329.6], // la
  [174.6, 220, 261.6], // fa
  [261.6, 329.6, 392], // do
  [196, 246.9, 293.7], // sol
];
const GAMME = [440, 493.9, 554.4, 659.3, 740, 880];
let musiqueEnMarche = false;
let prochainTemps = 0;
let mesure = 0;
let tempsDansMesure = 0;

function planifierMusique(): void {
  const a = ctx;
  if (!a || !musiqueEnMarche) return;
  const noire = 60 / reglages.son.musiqueTempo;
  // On prépare un peu d'avance pour ne jamais avoir de trou.
  while (prochainTemps < a.currentTime + 0.6) {
    const debut = Math.max(0, prochainTemps - a.currentTime);
    const accord = ACCORDS[mesure % ACCORDS.length]!;
    if (tempsDansMesure === 0) {
      // Nappe : l'accord tenu toute la mesure.
      for (const f of accord) note(f, debut, noire * 4.2, "sine", 0.035, 0, sortieMusique!);
      note(accord[0]! / 2, debut, noire * 4, "triangle", 0.05, 0, sortieMusique!);
    }
    // Mélodie : une note sur deux environ, choisie près de la précédente.
    if (Math.random() < 0.55) {
      const f = GAMME[Math.floor(Math.random() * GAMME.length)]!;
      note(f, debut, noire * 1.6, "triangle", 0.03, 0, sortieMusique!);
    }
    prochainTemps += noire;
    tempsDansMesure = (tempsDansMesure + 1) % 4;
    if (tempsDansMesure === 0) mesure += 1;
  }
}

export const reglagesSon = {
  volumes(): { musique: number; bruits: number } {
    return { ...volumes };
  },
  regler(quoi: "musique" | "bruits", valeur: number): void {
    volumes[quoi] = Math.max(0, Math.min(1, valeur));
    const g = quoi === "musique" ? sortieMusique : sortieBruits;
    if (g && ctx) g.gain.setTargetAtTime(volumes[quoi], ctx.currentTime, 0.05);
    try {
      localStorage.setItem(CLE, JSON.stringify(volumes));
    } catch {
      // Pas grave : le réglage vaut pour cette fois.
    }
  },
};

/** Un crépitement de feu : petits claquements de bruit aigu, très courts. */
function crepitement(volume: number): void {
  const a = audio();
  if (!a) return;
  const tampon = tamponBruit(a);
  const n = 2 + Math.floor(Math.random() * 3);
  for (let k = 0; k < n; k += 1) {
    const t = a.currentTime + Math.random() * 0.25;
    const src = a.createBufferSource();
    src.buffer = tampon;
    src.playbackRate.value = 2.5 + Math.random() * 2;
    const filtre = a.createBiquadFilter();
    filtre.type = "highpass";
    filtre.frequency.value = 1800 + Math.random() * 1500;
    const g = a.createGain();
    g.gain.setValueAtTime(volume * (0.4 + Math.random() * 0.6), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    src.connect(filtre).connect(g).connect(sortieBruits!);
    src.start(t);
    src.stop(t + 0.05);
  }
}

export const sons = {
  /** Le feu de camp crépite (volume selon la distance, 0 à 1). */
  feu(proximite: number): void {
    if (proximite > 0) crepitement(reglages.son.volumeFeu * proximite);
  },
  /** Lance la musique (après un premier clic : les navigateurs l'exigent). */
  musique(): void {
    const a = audio();
    if (!a || musiqueEnMarche) return;
    musiqueEnMarche = true;
    prochainTemps = a.currentTime + 0.1;
    planifierMusique();
    setInterval(planifierMusique, 200);
  },
  survol(): void {
    note(1760, 0, 0.04, "sine", 0.025);
  },
  clic(): void {
    note(660, 0, 0.05, "triangle", 0.08);
    note(990, 0.04, 0.07, "triangle", 0.06);
  },
  pas(): void {
    pas(reglages.son.volumePas);
  },
  activer(): void {
    audio();
  },
  coup(): void {
    note(140, 0, 0.12, "triangle", 0.18, 0.5);
  },
  cloche(): void {
    for (const [i, f] of [880, 1320, 880, 1320].entries()) note(f, i * 0.35, 1.2, "sine", 0.12);
  },
  construit(): void {
    for (const [i, f] of [523, 659, 784].entries()) note(f, i * 0.12, 0.35, "triangle", 0.12);
  },
  robot(): void {
    for (const [i, f] of [900, 1200, 1500, 1100].entries()) note(f, i * 0.08, 0.08, "square", 0.04);
  },
  lumo(): void {
    note(1100, 0, 0.08, "sine", 0.05, 1.4);
  },
  ramasse(): void {
    note(1400, 0, 0.12, "sine", 0.07, 1.5);
  },
  nuit(): void {
    note(196, 0, 1.6, "sine", 0.1, 0.8);
  },
  crash(): void {
    note(90, 0, 1.4, "sawtooth", 0.25, 0.3);
    note(60, 0.05, 1.8, "square", 0.12, 0.4);
  },
  victoire(): void {
    for (const [i, f] of [523, 659, 784, 1046].entries()) note(f, i * 0.18, 0.6, "triangle", 0.13);
  },
};
