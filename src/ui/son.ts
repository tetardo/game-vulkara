// Petits sons synthétisés (aucun fichier) : en attendant les vrais sons et les voix enregistrées.
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function note(freq: number, debut: number, duree: number, type: OscillatorType, volume: number, glisse = 0): void {
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
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + duree + 0.05);
}

export const sons = {
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
