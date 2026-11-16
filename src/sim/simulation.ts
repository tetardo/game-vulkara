import { estAutreRive, LIEUX } from "./carte";
import { annoncer, batimentConstruit, lumo, type Monde } from "./monde";
import { reglages } from "./reglages";
import { avancerMorris } from "./morris";
import { avancerRobots } from "./robots";
import { avancerMonstres } from "./monstres";
import { avancerBatiments } from "./batiments";

const T = reglages.simulation.ticksParSeconde;

function avancerTemps(monde: Monde): void {
  const J = reglages.journee;
  const total = J.dureeJour + J.dureeNuit;
  const avant = monde.temps.seconde;
  const etaitNuit = monde.temps.nuit;
  monde.temps.seconde += 1 / T;
  if (monde.temps.seconde >= total) {
    monde.temps.seconde -= total;
    monde.temps.jour += 1;
    monde.stats.joursSurvecus += 1;
  }
  monde.temps.nuit = monde.temps.seconde >= J.dureeJour;
  if (avant < J.dureeJour - 20 && monde.temps.seconde >= J.dureeJour - 20) {
    const dehors = monde.robots.filter((r) => !r.rentrerLaNuit && r.etat !== "casse").length;
    lumo(
      monde,
      dehors > 0
        ? `La nuit arrive bientôt. ${dehors} robot${dehors > 1 ? "s restent" : " reste"} dehors : ils risquent d'être cassés.`
        : "La nuit arrive bientôt. Les robots vont rentrer au camp.",
      true,
    );
  }
  if (!etaitNuit && monde.temps.nuit) {
    annoncer(monde, { type: "nuit" });
    lumo(monde, "La nuit tombe. Surveille les lueurs dans le brouillard : ce sont des monstres.", true);
  }
  if (etaitNuit && !monde.temps.nuit) {
    annoncer(monde, { type: "jour", jour: monde.temps.jour });
    lumo(monde, `Le jour se lève. Jour ${monde.temps.jour} sur Vulkara.`);
  }
}

/** Découvre les cases autour de Morris, des robots et du camp. L'autre rive reste cachée. */
function avancerBrouillard(monde: Monde): void {
  const { largeur, hauteur } = monde.carte;
  let change = false;
  const devoiler = (cx: number, cz: number, rayon: number) => {
    const r2 = rayon * rayon;
    for (let z = Math.max(0, Math.floor(cz - rayon)); z <= Math.min(hauteur - 1, Math.ceil(cz + rayon)); z += 1) {
      for (let x = Math.max(0, Math.floor(cx - rayon)); x <= Math.min(largeur - 1, Math.ceil(cx + rayon)); x += 1) {
        const i = z * largeur + x;
        if (monde.brouillard[i] === 1) continue;
        const dx = x + 0.5 - cx;
        const dz = z + 0.5 - cz;
        if (dx * dx + dz * dz > r2) continue;
        if (estAutreRive(x + 0.5, z + 0.5)) continue; // secret jusqu'à la suite !
        monde.brouillard[i] = 1;
        change = true;
      }
    }
  };
  devoiler(monde.morris.x, monde.morris.z, reglages.morris.vueBrouillard);
  for (const r of monde.robots) devoiler(r.x, r.z, reglages.robots.vueBrouillard);
  devoiler(LIEUX.camp.x, LIEUX.camp.z, reglages.camp.vueBrouillard);
  if (change) monde.versionBrouillard += 1;
}

/** Lumo guide le joueur pas à pas, au bon moment. */
function avancerTutoriel(monde: Monde): void {
  const m = monde.morris;
  switch (monde.tutoriel) {
    case "marcher":
      if (monde.tick === 2) lumo(monde, "Bonjour Morris ! Le vaisseau est en miettes, mais nous sommes vivants. Clique sur le sol pour marcher.", true);
      if (m.chemin.length > 0) {
        monde.tutoriel = "caisse";
        lumo(monde, "Regarde, la caisse mystère est tombée du vaisseau ! Clique dessus pour l'ouvrir.", true);
      }
      break;
    case "caisse":
      if (monde.robots.length > 0) monde.tutoriel = "travail";
      break;
    case "travail":
      if (monde.robots.some((r) => r.travail !== "aucun")) {
        monde.tutoriel = "potager";
        lumo(monde, "Parfait. Il faudra manger : construisons un potager. Clique sur le marteau quand tu as 8 bois.", true);
      }
      break;
    case "potager":
      if (batimentConstruit(monde, "potager")) monde.tutoriel = "planter";
      break;
    case "planter":
      if (batimentConstruit(monde, "potager")?.parcelles?.some((p) => p.legume)) {
        monde.tutoriel = "atelier";
        lumo(monde, "Bien planté ! Pour se défendre, il faudra une épée. Construis l'atelier. Pour le métal, envoie un robot démonter l'épave.", true);
      }
      break;
    case "atelier":
      if (batimentConstruit(monde, "atelier")) monde.tutoriel = "epee";
      break;
    case "epee":
      if (m.arme === "epee") {
        monde.tutoriel = "palissade";
        lumo(monde, "Maintenant, protège le camp : construis la palissade.", true);
      }
      break;
    case "palissade":
      if (batimentConstruit(monde, "palissade")) {
        monde.tutoriel = "pont";
        lumo(monde, "Le grand projet : un pont sur la rivière. Ma radio capte quelque chose de l'autre côté…", true);
      }
      break;
    case "pont":
      if (batimentConstruit(monde, "pont")) monde.tutoriel = "fini";
      break;
    case "fini":
      break;
  }
}

/** Avance la simulation d'un pas de temps fixe. */
export function avancer(monde: Monde): void {
  if (monde.fin !== "en-cours") return;
  monde.tick += 1;
  avancerTemps(monde);
  avancerMorris(monde);
  avancerRobots(monde);
  avancerMonstres(monde);
  avancerBatiments(monde);
  if (monde.tick % 5 === 1) avancerBrouillard(monde);
  avancerTutoriel(monde);
  if (monde.finDans > 0) {
    monde.finDans -= 1 / T;
    if (monde.finDans <= 0 && monde.fin === "en-cours") {
      monde.fin = "victoire";
      annoncer(monde, { type: "victoire" });
    }
  }
}

/**
 * Accumulateur à pas fixe : appelle `avancer` autant de fois que nécessaire
 * pour le temps écoulé, quelle que soit la vitesse d'affichage.
 */
export class Horloge {
  private reste = 0;
  private readonly pas: number;

  constructor(ticksParSeconde: number) {
    this.pas = 1000 / ticksParSeconde;
  }

  /** Renvoie le nombre de pas effectués. Limité pour éviter l'emballement après une pause. */
  ecouler(monde: Monde, millisecondes: number, maxPas = 10): number {
    this.reste += millisecondes;
    let pas = 0;
    while (this.reste >= this.pas && pas < maxPas) {
      avancer(monde);
      this.reste -= this.pas;
      pas += 1;
    }
    if (pas === maxPas) this.reste = 0;
    return pas;
  }
}
