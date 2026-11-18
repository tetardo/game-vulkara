// Sons et musique : de vrais fichiers (packs CC0, public/sons et public/musique) ; si un fichier manque,
// le jeu garde ses petits bruits fabriqués en direct, pour ne jamais rester muet.
import { reglages } from "../sim/reglages";
import musique from "../../config/musique.json";
import configSons from "../../config/sons.json";

const BASE = import.meta.env.BASE_URL;

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

// ---------- Bruits enregistrés ----------
type NomBruit = keyof typeof configSons.bruits;
const tampons = new Map<string, AudioBuffer>();
let chargementLance = false;

/** Charge tous les bruits une seule fois (après le premier clic). Un fichier absent est simplement ignoré. */
function chargerBruits(a: AudioContext): void {
  if (chargementLance) return;
  chargementLance = true;
  const fichiers = new Set<string>([configSons.nature.jour.fichier, configSons.nature.nuit.fichier]);
  for (const b of Object.values(configSons.bruits)) for (const f of b.fichiers) fichiers.add(f);
  for (const f of fichiers) {
    fetch(`${BASE}sons/${f}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(f))))
      .then((d) => a.decodeAudioData(d))
      .then((t) => {
        tampons.set(f, t);
      })
      .catch(() => {
        // Pas grave : le petit bruit fabriqué prend le relais.
      });
  }
}

/** Joue un bruit enregistré. Renvoie false s'il n'est pas (encore) chargé : on joue alors le bruit fabriqué. */
function jouer(nom: NomBruit, force = 1): boolean {
  const a = audio();
  if (!a || !sortieBruits) return false;
  const def = configSons.bruits[nom];
  const fichier = def.fichiers[Math.floor(Math.random() * def.fichiers.length)]!;
  const tampon = tampons.get(fichier);
  if (!tampon) return false;
  const src = a.createBufferSource();
  src.buffer = tampon;
  src.playbackRate.value = 1 + (Math.random() * 2 - 1) * def.variation;
  const g = a.createGain();
  g.gain.value = def.volume * force;
  src.connect(g).connect(sortieBruits);
  src.start();
  return true;
}

// ---------- Bruits de la nature (en boucle) ----------
const nature: Partial<Record<"jour" | "nuit", GainNode>> = {};
function boucleNature(a: AudioContext, quand: "jour" | "nuit"): GainNode | null {
  const existant = nature[quand];
  if (existant) return existant;
  const tampon = tampons.get(configSons.nature[quand].fichier);
  if (!tampon || !sortieBruits) return null;
  const src = a.createBufferSource();
  src.buffer = tampon;
  src.loop = true;
  // Les fichiers mp3 ont un petit blanc au début et à la fin : on boucle sans eux.
  src.loopStart = 0.06;
  src.loopEnd = Math.max(0.1, tampon.duration - 0.06);
  const g = a.createGain();
  g.gain.value = 0;
  src.connect(g).connect(sortieBruits);
  src.start(a.currentTime, 0.06);
  nature[quand] = g;
  return g;
}

// ---------- Musique de fond ----------
// Choix d'Eliot (17/11) : le jour, plusieurs morceaux d'aventure et de mystère qui s'enchaînent tout
// seuls ; la nuit, une musique inquiétante ; dès qu'un monstre approche, une musique de combat.
// Les morceaux sont des fichiers (public/musique/), joués l'un après l'autre. Si l'un ne se lit pas,
// le jeu compose un morceau de secours en direct (config/musique.json, « secours »).
export type Moment = "jour" | "nuit" | "combat";
interface Compose {
  nom: string;
  tempo: number;
  accords: number[][];
  gamme: number[];
  melodie: string;
  notes: number;
  basse: string;
  percussions: boolean;
  volume: number;
}
interface Morceau {
  nom: string;
  fichier: string;
  volume: number;
}
const MORCEAUX: Record<Moment, Morceau[]> = { jour: musique.jour, nuit: musique.nuit, combat: musique.combat };
const SECOURS: Record<Moment, Compose> = musique.secours;

interface Piste {
  bus: GainNode;
  nom: string;
  /** Morceau composé en direct (quand le fichier n'a pas pu être lu). */
  compose?: Compose;
  debut: number;
  prochainTemps: number;
  mesure: number;
  tempsDansMesure: number;
  lecteur?: HTMLAudioElement;
}
let musiqueEnMarche = false;
let moment: Moment = "jour";
let piste: Piste | null = null;
const suivant: Record<Moment, number> = { jour: 0, nuit: 0, combat: 0 };

/** Coup de grosse caisse (sinus qui descend) ou de caisse claire (souffle aigu). */
function percussion(a: AudioContext, debut: number, grosse: boolean, sortie: AudioNode): void {
  if (grosse) {
    note(110, debut, 0.22, "sine", 0.22, 0.35, sortie);
    return;
  }
  const t = a.currentTime + debut;
  const src = a.createBufferSource();
  src.buffer = tamponBruit(a);
  src.playbackRate.value = 1.6;
  const filtre = a.createBiquadFilter();
  filtre.type = "highpass";
  filtre.frequency.value = 1500;
  const g = a.createGain();
  g.gain.setValueAtTime(0.12, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  src.connect(filtre).connect(g).connect(sortie);
  src.start(t);
}

/** Change de morceau en fondu : celui d'avant s'éteint pendant que le nouveau monte. */
function lancerPiste(): void {
  const a = audio();
  if (!a || !sortieMusique) return;
  const fondu = musique.fonduSecondes;
  const ancienne = piste;
  if (ancienne) {
    ancienne.bus.gain.cancelScheduledValues(a.currentTime);
    ancienne.bus.gain.setValueAtTime(Math.max(0.0001, ancienne.bus.gain.value), a.currentTime);
    ancienne.bus.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + fondu);
    setTimeout(() => {
      ancienne.lecteur?.pause();
      ancienne.bus.disconnect();
    }, (fondu + 1) * 1000);
  }
  const liste = MORCEAUX[moment];
  const morceau = liste[suivant[moment] % liste.length]!;
  suivant[moment] += 1;
  const bus = a.createGain();
  bus.gain.setValueAtTime(0.0001, a.currentTime);
  bus.gain.exponentialRampToValueAtTime(Math.max(0.0001, morceau.volume), a.currentTime + fondu);
  bus.connect(sortieMusique);
  const p: Piste = { bus, nom: morceau.nom, debut: a.currentTime, prochainTemps: a.currentTime + 0.1, mesure: 0, tempsDansMesure: 0 };
  const lecteur = new Audio(`${BASE}musique/${morceau.fichier}`);
  lecteur.loop = liste.length === 1;
  lecteur.addEventListener("ended", () => {
    if (piste === p) lancerPiste();
  });
  // Fichier introuvable ou illisible : le jeu compose lui-même un morceau du même moment.
  lecteur.addEventListener("error", () => {
    if (piste !== p) return;
    p.lecteur = undefined;
    p.compose = SECOURS[moment];
    p.nom = SECOURS[moment].nom;
    p.prochainTemps = a.currentTime + 0.1;
  });
  a.createMediaElementSource(lecteur).connect(bus);
  void lecteur.play().catch(() => {});
  p.lecteur = lecteur;
  piste = p;
}

function planifierMusique(): void {
  const a = ctx;
  if (!a || !musiqueEnMarche || !piste) return;
  const p = piste;
  const m = p.compose;
  if (!m) return;
  const noire = 60 / m.tempo;
  const timbre = m.melodie as OscillatorType;
  // Après une longue absence (onglet caché), on repart de maintenant au lieu de rattraper le retard.
  if (p.prochainTemps < a.currentTime) p.prochainTemps = a.currentTime + 0.05;
  // On prépare un peu d'avance pour ne jamais avoir de trou.
  while (p.prochainTemps < a.currentTime + 0.6) {
    const debut = Math.max(0, p.prochainTemps - a.currentTime);
    const accord = m.accords[p.mesure % m.accords.length]!;
    const fond = accord[0]! / 2;
    if (p.tempsDansMesure === 0) {
      // Nappe : l'accord tenu toute la mesure.
      for (const f of accord) note(f, debut, noire * 4.2, "sine", 0.03, 0, p.bus);
      if (m.basse === "tenue") note(fond, debut, noire * 4, "triangle", 0.05, 0, p.bus);
    }
    if (m.basse === "pulsee") note(fond, debut, noire * 0.6, "triangle", 0.06, 0, p.bus);
    if (m.basse === "galop") {
      note(fond, debut, noire * 0.35, "square", 0.035, 0, p.bus);
      note(fond, debut + noire / 2, noire * 0.35, "square", 0.03, 0, p.bus);
    }
    if (m.percussions) percussion(a, debut, p.tempsDansMesure % 2 === 0, p.bus);
    // Mélodie : de temps en temps une note de la gamme.
    if (Math.random() < m.notes) {
      const f = m.gamme[Math.floor(Math.random() * m.gamme.length)]!;
      note(f, debut, noire * (m.percussions ? 0.8 : 1.6), timbre, timbre === "sawtooth" ? 0.018 : 0.03, 0, p.bus);
    }
    p.prochainTemps += noire;
    p.tempsDansMesure = (p.tempsDansMesure + 1) % 4;
    if (p.tempsDansMesure === 0) p.mesure += 1;
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
    chargerBruits(a);
    lancerPiste();
    planifierMusique();
    setInterval(planifierMusique, 200);
  },
  /** Le moment de la musique : jour, nuit ou combat. Un changement passe au morceau suivant, en fondu. */
  ambiance(m: Moment): void {
    if (m === moment) return;
    moment = m;
    if (musiqueEnMarche) lancerPiste();
  },
  /** Le morceau qui joue (pour les tests). */
  morceau(): string | null {
    return piste ? `${moment}:${piste.nom}` : null;
  },
  /** Les bruits de la nature : le vent le jour, les grillons la nuit (fondu de l'un à l'autre). */
  nature(nuit: boolean): void {
    const a = ctx;
    if (!a || !musiqueEnMarche) return;
    const fondu = configSons.nature.fonduSecondes / 3;
    for (const quand of ["jour", "nuit"] as const) {
      const g = boucleNature(a, quand);
      const cible = (quand === "nuit") === nuit ? configSons.nature[quand].volume : 0;
      if (g && Math.abs(g.gain.value - cible) > 0.001) g.gain.setTargetAtTime(cible, a.currentTime, fondu);
    }
  },
  survol(): void {
    note(1760, 0, 0.04, "sine", 0.025);
  },
  clic(): void {
    note(660, 0, 0.05, "triangle", 0.08);
    note(990, 0.04, 0.07, "triangle", 0.06);
  },
  pas(): void {
    if (!jouer("pas")) pas(reglages.son.volumePas);
  },
  activer(): void {
    const a = audio();
    if (a) chargerBruits(a);
  },
  coup(): void {
    if (!jouer("coup")) note(140, 0, 0.12, "triangle", 0.18, 0.5);
  },
  /** Un monstre vaincu part en fumée. */
  vaincu(): void {
    if (!jouer("vaincu")) note(880, 0, 0.3, "sine", 0.06, 2);
  },
  /** Un cœur gagné, ou un robot qui monte de niveau. */
  soin(): void {
    if (!jouer("soin")) note(660, 0, 0.3, "sine", 0.08, 1.5);
  },
  /** Cri d'un monstre qui approche (quand la musique de combat commence). */
  monstre(): void {
    if (!jouer("monstre")) note(220, 0, 0.3, "sawtooth", 0.05, 0.6);
  },
  /** La tour de guet tire. */
  tir(): void {
    if (!jouer("tir")) note(1200, 0, 0.12, "square", 0.03, 0.4);
  },
  cloche(): void {
    if (jouer("cloche")) return;
    for (const [i, f] of [880, 1320, 880, 1320].entries()) note(f, i * 0.35, 1.2, "sine", 0.12);
  },
  construit(): void {
    jouer("construit");
    for (const [i, f] of [523, 659, 784].entries()) note(f, 0.15 + i * 0.12, 0.35, "triangle", 0.1);
  },
  robot(): void {
    if (jouer("robot")) return;
    for (const [i, f] of [900, 1200, 1500, 1100].entries()) note(f, i * 0.08, 0.08, "square", 0.04);
  },
  /** Un robot pose sa récolte au dépôt. */
  robotDepot(): void {
    jouer("robotDepot");
  },
  lumo(): void {
    note(1100, 0, 0.08, "sine", 0.05, 1.4);
  },
  ramasse(): void {
    jouer("ramasse");
    note(1400, 0, 0.12, "sine", 0.05, 1.5);
  },
  /** Le couvercle d'un coffre s'ouvre. */
  coffre(): void {
    if (!jouer("coffre")) note(300, 0, 0.2, "triangle", 0.1, 1.3);
  },
  /** Le trésor d'un coffre. */
  tresor(): void {
    jouer("tresor");
    for (const [i, f] of [523, 659, 784, 1046].entries()) note(f, i * 0.1, 0.3, "triangle", 0.08);
  },
  nuit(): void {
    note(196, 0, 1.6, "sine", 0.1, 0.8);
  },
  crash(): void {
    if (jouer("crash")) return;
    note(90, 0, 1.4, "sawtooth", 0.25, 0.3);
    note(60, 0.05, 1.8, "square", 0.12, 0.4);
  },
  victoire(): void {
    for (const [i, f] of [523, 659, 784, 1046].entries()) note(f, i * 0.18, 0.6, "triangle", 0.13);
  },
};
