/* ============================================================================
   Suite de tests de DUO — à lancer avec :  node tests/tests.js
   Les fonctions et constantes sont extraites du vrai index.html, donc la suite
   suit le code : elle échoue si une régression revient.
   ========================================================================== */
"use strict";
const fs = require("fs");
const path = require("path");

const SOURCE = path.join(__dirname, "..", "index.html");
const html = fs.readFileSync(SOURCE, "utf8");
const script = (html.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || "";

let reussis = 0, echoues = 0;
function verifier(nom, condition, detail){
  if (condition){ reussis++; console.log("  ok   " + nom + (detail ? "  — " + detail : "")); }
  else { echoues++; console.log("  ÉCHEC " + nom + (detail ? "  — " + detail : "")); }
}
function titre(t){ console.log("\n" + t); }

/* --- extraction --- */
function extraire(motif, nom){
  const m = script.match(motif);
  if (!m) throw new Error("introuvable dans index.html : " + nom);
  return m[0];
}
function nombre(nom){
  const m = script.match(new RegExp("\\b" + nom + "\\s*=\\s*(-?[0-9.]+)"));
  return m ? parseFloat(m[1]) : NaN;
}

/* ======================= 1. CONSTANTES DE JEU ======================= */
titre("1. Constantes de jeu");
const VIT_INIT = nombre("VIT_INIT"), VIT_MAX = nombre("VIT_MAX"),
      VIT_MAX_ECLAIR = nombre("VIT_MAX_ECLAIR"), VIT_FEU = nombre("VIT_FEU"),
      SMASH_MUR = nombre("SMASH_MUR"), VY_MIN = nombre("VY_MIN"),
      CADRE_X = nombre("CADRE_X"), CADRE_Y = nombre("CADRE_Y"),
      RAQ_MARGE = nombre("RAQ_MARGE"), LARG = nombre("LARG"), HAUT = nombre("HAUT"),
      OBST_L = nombre("OBST_L"), BALLE_R = nombre("BALLE_R");

verifier("hiérarchie des vitesses", VIT_INIT < VIT_MAX && VIT_MAX < VIT_MAX_ECLAIR,
  VIT_INIT + " < " + VIT_MAX + " < " + VIT_MAX_ECLAIR);
verifier("plancher de la balle en feu sous le plafond", VIT_FEU < VIT_MAX_ECLAIR,
  VIT_FEU + " < " + VIT_MAX_ECLAIR);
verifier("un smash peut fissurer un mur", SMASH_MUR <= VIT_MAX_ECLAIR,
  SMASH_MUR + " ≤ " + VIT_MAX_ECLAIR);
verifier("vitesse verticale minimale positive", VY_MIN > 0 && VY_MIN < VIT_INIT);
verifier("raquettes à l'intérieur du cadre", RAQ_MARGE >= CADRE_Y,
  "marge " + RAQ_MARGE + " ≥ cadre " + CADRE_Y);
verifier("terrain jouable suffisant", LARG - 2*CADRE_X > 380,
  (LARG - 2*CADRE_X) + " px de large");

/* ======================= 2. ACHEMINEMENT RÉSEAU ======================= */
titre("2. Acheminement réseau");
const CONTROLE = ["lu", "vc", "rm", "nm", "nm2", "va"];
for (const t of CONTROLE){
  const surRapide = new RegExp('conn\\.send\\(\\{\\s*t:\\s*"' + t + '"').test(script);
  verifier('« ' + t + ' » n\'est pas sur le canal non fiable', !surRapide);
}
verifier("un acheminement fiable existe", /function envoyerFiable\(/.test(script));
verifier("file d'attente si le canal fiable n'est pas prêt", /filePrioritaire/.test(script));
verifier("le canal fiable dispatche le contrôle", /function recevoirFiable\([\s\S]*?recevoir\(m\)/.test(script));

/* ======================= 3. CYCLE DE VIE ======================= */
titre("3. Cycle de vie et minuteurs");
const nbSetInterval = (script.match(/setInterval\(/g) || []).length;
const nbClear = (script.match(/clearInterval\(/g) || []).length;
verifier("les minuteurs sont arrêtables", nbClear > 0 && /function arreterMinuteurs\(/.test(script),
  nbSetInterval + " créations, " + nbClear + " arrêts");
verifier("reprise après coupure implémentée", /function demarrerReprise\(/.test(script));
verifier("l'hôte accepte une liaison de reprise", /const reprise = partieEnCours/.test(script));

/* ======================= 4. GÉOMÉTRIE ======================= */
titre("4. Géométrie du terrain");
let margeMur = 0;
const murG = () => CADRE_X + margeMur, murD = () => LARG - CADRE_X - margeMur;
verifier("la balle rebondit sur le cadre, pas sur le bord", murG() + BALLE_R > BALLE_R);
for (const l of [62, 104, 168]){
  const demi = l/2;
  const g = Math.max(murG() + demi, Math.min(murD() - demi, -9999));
  verifier("raquette de " + l + " px bornée par le cadre", g - demi >= CADRE_X - 0.01);
}
margeMur = nombre("MUR_MAX") || 88;
verifier("mort subite : terrain encore jouable", murD() - murG() > 150,
  (murD() - murG()) + " px");
margeMur = 0;
{
  /* le rapport et la réserve sont lus dans le code, pas supposés */
  const LARG_JEU = nombre("LARG"), HAUT_JEU = nombre("HAUT");
  const rapport = LARG_JEU / HAUT_JEU;
  const css = (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || "";
  const mCss = css.match(/--terrain:min\((\d+)vw, calc\(\(100svh - (\d+)px\) \* ([0-9.]+)\)/);
  verifier("la mise en page suit le format du terrain",
    !!mCss && Math.abs(Number(mCss[3]) - rapport) < 0.01,
    mCss ? "css " + mCss[3] + " contre jeu " + rapport.toFixed(4) : "règle introuvable");
  const partVw = mCss ? Number(mCss[1]) / 100 : 0.96, reserve = mCss ? Number(mCss[2]) : 100;
  const terrain = (L, H) => Math.min(partVw*L, (H - reserve)*rapport, LARG_JEU);
  for (const [nom, L, H] of [["iPhone SE",375,667],["iPhone 13",390,844],
                             ["Android compact",360,640],["paysage",844,390]]){
    const t = terrain(L, H);
    verifier("mise en page tient sur " + nom, t > 0 && t/rapport + reserve <= H + 1,
      Math.round(t) + " x " + Math.round(t/rapport) + " pt");
  }
  /* parc d'appareils réels : largeur x hauteur de fenêtre, puis habillage du navigateur */
  const PARC = [
    ["iPhone SE 2/3", 375, 667, 144], ["iPhone 13 mini", 375, 812, 144],
    ["iPhone 13/14", 390, 844, 144],  ["iPhone 15 Pro Max", 430, 932, 144],
    ["Galaxy S8", 360, 740, 56],      ["Galaxy S21", 360, 800, 56],
    ["Pixel 7", 412, 915, 56],        ["iPad mini", 744, 1133, 90],
  ];
  const mCourt = css.match(/@media \(max-height: 700px\)\{[\s\S]*?--terrain:min\(\d+vw, calc\(\(100vh - (\d+)px\)/);
  const reserveCourte = mCourt ? Number(mCourt[1]) : reserve;
  let pire = null;
  for (const [nom, L, H, chrome] of PARC){
    const svh = H - chrome;
    const res = svh <= 700 ? reserveCourte : reserve;
    const t = Math.min(partVw*L, (svh - res)*rapport, LARG_JEU);
    const tient = t/rapport + res <= svh + 1;
    if (!pire || t < pire[1]) pire = [nom, t];
    verifier("portrait sur " + nom, tient && t >= 250,
      Math.round(t) + " x " + Math.round(t/rapport) + " pt");
  }
  verifier("le plus petit appareil reste jouable", pire[1] >= 250,
    pire[0] + " : " + Math.round(pire[1]) + " pt de large");
  verifier("le paysage renvoie vers la rotation",
    /@media \(orientation: landscape\)[\s\S]{0,80}#rotation\{display:flex\}/.test(css) &&
    /#lobby, #jeu, #capPhoto\{display:none !important\}/.test(css),
    "couché, le terrain tomberait sous 160 pt");

  verifier("le terrain exploite la hauteur disponible",
    terrain(390, 700) / rapport > 560,
    Math.round(terrain(390, 700) / rapport) + " pt de haut sur iPhone 13");
}

/* ======================= 5. ARÈNES ======================= */
titre("5. Arènes");
const blocARENES = extraire(/const ARENES = \[[\s\S]*?\n\];/, "ARENES");
const noms = [...blocARENES.matchAll(/nom:\s*"([^"]+)"/g)].map(m => m[1]);
const tempos = [...blocARENES.matchAll(/tempo:\s*(\d+)/g)].map(m => +m[1]);
const nbBlocs = [...blocARENES.matchAll(/blocs:\s*(\d+)/g)].map(m => +m[1]);
verifier("six arènes définies", noms.length === 6, noms.join(", "));
verifier("chaque arène a sa musique", tempos.length === noms.length);
verifier("tempos tous distincts", new Set(tempos).size === tempos.length, tempos.join("/"));
verifier("nombre de bûches défini partout", nbBlocs.length === noms.length, nbBlocs.join(","));
verifier("une ou deux bûches, jamais plus", nbBlocs.every(n => n >= 1 && n <= 2));
verifier("chaque arène a un décor peint", (blocARENES.match(/img:\s*"arenes\//g) || []).length === 6);

/* ======================= 6. BÛCHES INDESTRUCTIBLES ======================= */
titre("6. Bûches centrales");
const zoneCollision = extraire(/const survole = Math[\s\S]*?\n    \}/, "collision blocs");
verifier("aucune suppression d'obstacle au contact",
  !/obstacles\.splice/.test(zoneCollision.replace(/if \(bouleFeu\)[\s\S]*?\n/, "")),
  "la boule de feu ne les retire plus non plus");
verifier("pas de redimensionnement", !/o\.l = Math\.max\(OBST_L_MIN/.test(script));

/* ======================= 7. VANNES ET RIMES ======================= */
titre("7. Vannes, rimes et noms");
/* on recharge les fonctions pures du jeu dans une portée dédiée */
const codePur = [
  extraire(/const MOT_LETTRE = \{[\s\S]*?\n\};/, "MOT_LETTRE"),
  extraire(/const RIMES = \[[\s\S]*?\n\];/, "RIMES"),
  extraire(/function sansAccent\(s\)\{[\s\S]*?\n\}/, "sansAccent"),
  extraire(/function rimesDe\(nom\)\{[\s\S]*?\n\}/, "rimesDe"),
  extraire(/function classeNom\(n\)\{[\s\S]*?\n\}/, "classeNom"),
  extraire(/function motDe\(nom\)\{[\s\S]*?\n\}/, "motDe"),
  extraire(/function habiller\(phrase, gagnant, perdant, idx\)\{[\s\S]*?\n\}/, "habiller"),
].join("\n");
const { rimesDe, classeNom, motDe, habiller } =
  new Function(codePur + "\nreturn { rimesDe, classeNom, motDe, habiller };")();
const familles = ["SARCASMES", "SARCASMES_THEME", "SARCASMES_MATCH",
                  "SARCASMES_NOM", "SARCASMES_RIME", "SARCASMES_DEFAUT", "SARCASMES_ECRITURE"];
for (const f of familles) verifier("famille " + f + " présente", script.includes("const " + f));

const PRENOMS = ["THIBAUT","KEMAL","TIBO","TIMMY","LUCA","MARTIN","SIMON","LAURENT","MARIE",
                 "SOPHIE","HUGO","LEO","EMMA","JULIEN","NICOLAS","CLAIRE","PIERRE","ANTOINE",
                 "MATHIEU","SARAH","CAMILLE","MAXIME","ELODIE","GASTON","ROMAIN","OLIVIER",
                 "VALERIE","FRED","ZOE","AXEL","MICHEL","CHLOE","BAPTISTE","NOEMIE","YANIS","ADRIEN"];
const sansRime = PRENOMS.filter(p => !rimesDe(p));
verifier("tous les prénoms testés trouvent une rime", sansRime.length === 0,
  PRENOMS.length + " prénoms" + (sansRime.length ? " sauf " + sansRime.join(",") : ""));
verifier("nom par défaut détecté", classeNom("") === "defaut" && classeNom("JOUEUR") === "defaut");
verifier("nom illisible détecté", classeNom("XZQR") === "ecriture" && classeNom("TIM123") === "ecriture");
verifier("l'IA échappe à la vanne orthographique", classeNom("IA MOYEN") === "nom");
let residus = 0;
for (const p of PRENOMS.concat(["", "JOUEUR", "XZQR", "A"]))
  for (const ph of ["{P} rime avec {R}.", "{P}, {L} officiel.", "{G} bat {P}."])
    if (/\{[GPLR]\}/.test(habiller(ph, "TIBO", p, 3))) residus++;
verifier("aucun marqueur non substitué", residus === 0);
let stable = true;
for (let k = 0; k < 3000; k++){
  const p = PRENOMS[k % PRENOMS.length];
  if (habiller("{P}/{R}/{L}", "X", p, k % 41) !== habiller("{P}/{R}/{L}", "X", p, k % 41)) stable = false;
}
verifier("phrases identiques sur les deux écrans", stable, "3000 tirages");

/* ======================= 8. RAQUETTES ======================= */
titre("8. Rendu des raquettes");
const { eclaircir, assombrir } = new Function(
  extraire(/function eclaircir\(hex, k\)\{[\s\S]*?\n\}/, "eclaircir") + "\n" +
  extraire(/function assombrir\(hex, k\)\{[\s\S]*?\n\}/, "assombrir") +
  "\nreturn { eclaircir, assombrir };")();
const comp = s => s.match(/\d+/g).map(Number);
const haut = comp(eclaircir("#22D3EE", 0.45)), bas = comp(assombrir("#22D3EE", 0.55));
verifier("dégradé du corps orienté clair vers sombre",
  haut.every((v, i) => v > bas[i]) && haut.concat(bas).every(v => v >= 0 && v <= 255));
verifier("rendu dédié des raquettes", /function dessinerRaquette\(/.test(script));
verifier("écrasement à l'impact", /const impact = Math\.max\(0, 1 - \(performance\.now\(\) - tFlash\)/.test(script));
verifier("inclinaison bornée", /Math\.max\(-0\.13, Math\.min\(0\.13/.test(script));
const noyau = (l, c) => Math.max(0, (l - Math.min(13, l*0.16)*2 - 6) * Math.min(1, c));
verifier("noyau de charge monotone et borné",
  [62,104,168].every(l => noyau(l,0) === 0 && noyau(l,1) > 8 && noyau(l,1) < l));

/* ======================= 8bis. CHOIX D'ARÈNE ET PANNEAUX ======================= */
titre("8bis. Choix d'arène et tenue des panneaux");
verifier("sélecteur d'arène présent", /id="choixArenes"/.test(html));
verifier("arène imposée respectée dans le mélange",
  /if \(choixArene >= 0 && choixArene < ARENES\.length\)/.test(script));
verifier("choix mémorisé", /localStorage\.setItem\("duo_arene"/.test(script));
verifier("le classique honore aussi le décor choisi",
  !/if \(modeJeu === "classique"\) return ARENES\[0\]/.test(script),
  "seules les matières sont neutralisées, par absence de blocs");
{
  /* les effets de matière ne doivent vivre que dans la collision de bloc */
  const deb = script.indexOf("if (!survole) for (let oi = obstacles.length");
  const bloc = script.slice(deb, deb + 2600);
  verifier("les matières n'agissent que via les blocs",
    ["A.facteur", "A.chaos", "A.absorbe"].every(p => bloc.includes(p)),
    "donc sans effet en classique, où il n'y a pas de bloc");
}
verifier("boutons construits après la définition des arènes",
  script.indexOf("const ARENES = [") < script.indexOf("initChoixArene"),
  "sinon zone morte temporelle");
{
  /* un panneau ne doit jamais dépasser le terrain sans pouvoir défiler */
  const css = (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || "";
  const bloc = (css.match(/\.panneau\{[^}]*\}/) || [""])[0];
  verifier("panneaux défilables", /overflow-y:\s*auto/.test(bloc));
  /* hauteur estimée du panneau des vices sur le plus petit écran visé */
  const terrain = Math.min(0.92*360, (640 - 215)*0.75, 540);
  const hTerrain = terrain * 720/540;
  const hVices = 21*1.15 + 2*13 + 3*(12.5 + 2 + 2*10.5*1.35 + 18) + 2*7 + 28;
  verifier("panneau des vices tient sur petit écran",
    hVices < hTerrain, Math.round(hVices) + " px pour " + Math.round(hTerrain) + " px");
}

/* ======================= 8ter. ÉCRAN VERSUS ======================= */
titre("8ter. Écran VERSUS");
{
  const css = (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || "";
  const flash = ((css.match(/\.vsFlash\{[^}]*\}/) || [""])[0]).replace(/\/\*[\s\S]*?\*\//g, "");
  verifier("le voile blanc ne peut pas persister",
    !/both|forwards/.test(flash) && /opacity:\s*0/.test(flash),
    "un remplissage d'animation appliquait le premier état pendant le délai");
  verifier("fond dédié au lieu d'un aplat", /\.vsFond\{/.test(css));
  verifier("plaques nominatives inclinées", /\.vsPlaque\{/.test(css));
  const bandeau = (mg, mode, arene, duels) =>
    ["AU MEILLEUR DES " + (2*mg - 1), mode.toUpperCase(), arene, duels].filter(Boolean).join(" · ");
  const exemples = [bandeau(2,"arcade","",""), bandeau(5,"classique","","DUELS A 1 — 0 B"),
                    bandeau(3,"arcade","ARÈNE LAVE","")];
  verifier("bandeau sans séparateur orphelin",
    exemples.every(t => !/·\s*$/.test(t) && !/^\s*·/.test(t) && !/·\s*·/.test(t)));
  verifier("format cohérent avec les manches gagnantes",
    [2,3,5].every(mg => Number(bandeau(mg,"a","","").match(/DES (\d+)/)[1]) === 2*mg - 1));
}

/* ======================= 8quater. STABILITÉ DE MISE EN PAGE ET FLUIDITÉ ======================= */
titre("8quater. Mise en page stable et rendu léger");
{
  const css = (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || "";
  const hud = (css.match(/#hud\{[^}]*\}/) || [""])[0];
  const bas = (css.match(/#barreBasse\{[^}]*\}/) || [""])[0];
  verifier("hauteur du bandeau haut figée", /height:\s*\d+px/.test(hud),
    "un nom long ou un format en 5 manches décalait le terrain");
  verifier("hauteur de la barre basse figée", /height:\s*\d+px/.test(bas));
  verifier("nom tronqué plutôt que passé à la ligne",
    /#role\{[^}]*white-space:nowrap/.test(css) && /#role\{[^}]*text-overflow:ellipsis/.test(css));
  verifier("score sur une seule ligne", /#score\{[^}]*white-space:nowrap/.test(css));
  verifier("plus de texte sous le terrain", !/id="bandeau"/.test(html));
  verifier("annonces peintes dans le terrain", /function dessinerAnnonce\(/.test(script));
  verifier("flou d'ombre définitivement neutralisé",
    /function flou\(v\)\{ return 0; \}/.test(script.replace(/\s+/g, " ").replace("function flou(v){ return 0; }", "function flou(v){ return 0; }")) ||
    /return 0;/.test((script.match(/function flou\(v\)\{[^}]*\}/) || [""])[0]));
  verifier("trois crans de rendu", /const QUALITES = \{/.test(script) &&
    /minimal:/.test(script) && /normal:/.test(script) && /max:/.test(script));
  verifier("cran déduit d'une mesure, pas du modèle",
    /function mesurerPuissance\(/.test(script) && /performance\.now\(\) - t0/.test(script),
    "iOS n'expose pas le modèle d'iPhone");
  verifier("réglage sorti de la barre de jeu et placé au menu",
    !/btnEffets/.test(html) && /btnQualite/.test(html) && /GRAPHISMES/.test(html));
  verifier("repli d'un seul cran à la fois",
    /const ordre = \["max", "normal", "minimal"\]/.test(script));
  verifier("choix mémorisé", /localStorage\.setItem\("duo_qualite"/.test(script));
  verifier("particules plafonnées par cran", /cfgQualite\(\)\.particules/.test(script));
  {
    /* le calibrage doit être lu APRÈS les déclarations qu'il utilise */
    const iDecl = script.indexOf("const QUALITES = {");
    const iInit = script.indexOf("function mesurerPuissance(");
    verifier("calibrage placé après ses dépendances", iDecl < iInit,
      "sinon zone morte temporelle au chargement");
  }
}

/* ======================= 8quinquies. ENTRÉE EN JEU ET CONFORT ======================= */
titre("8quinquies. Entrée en jeu, robustesse du protocole, confort");
verifier("lien d'invitation", /function lienInvitation\(/.test(script) && /URLSearchParams/.test(script));
verifier("arrivée par lien préremplie", /\$\("champCode"\)\.value = code/.test(script));
verifier("solo proposé en premier", html.indexOf("JOUER TOUT DE SUITE") < html.indexOf("MODE DE JEU"));
verifier("règles condensées avec repli", /id="reglesCourt"/.test(html) && /id="btnPlus"/.test(html));
verifier("poignée de main de version", /t: "ver", v: VERSION/.test(script) && /case "ver":/.test(script));
verifier("réglages hors du flux 30 Hz",
  !/mj: modeJeu, mg: MANCHES_GAGNANTES, sa: sequenceArenes,/.test(script) && /case "cfg":/.test(script),
  "envoyés une fois sur le canal fiable");
verifier("clavier pris en charge", /keydown/.test(script) && /function majClavier\(/.test(script));
verifier("la pause fonctionne aussi en réseau",
  /function appliquerPause\(actif, parMoi\)/.test(script),
  "elle était réservée au solo jusqu'en v14.0");
verifier("volume réglable et mémorisé", /curseurVolume/.test(html) && /duo_volume/.test(script));
verifier("raquette adverse distinguée sans couleur", /if \(!estMienne\)/.test(script),
  "encoches sur la raquette d'en face");
verifier("historique et records", /duo_historique/.test(script) && /function cloturerRecords\(/.test(script));
verifier("manifeste installable", /rel="manifest"/.test(html));

/* ======================= 8sexies. RECORDS ======================= */
titre("8sexies. Records des deux côtés");
verifier("l'invité reçoit la longueur d'échange", /re: rebondsEchange/.test(script),
  "la physique ne tourne que chez l'hôte");
verifier("l'invité crédite les points marqués",
  /if \(m\.s\[j\] > ancienScore\[j\]\) noterPoint\(j\)/.test(script));
verifier("l'invité remet ses compteurs à zéro au début du match",
  /apres === "vs"\)\{[\s\S]{0,120}recordEnCours = \{/.test(script));
verifier("records échangés en fin de match", /t: "rec", r: lireRecords\(\)/.test(script) && /case "rec":/.test(script));
verifier("tableau comparatif", /function majRecordsVoile\(/.test(script) && /id="voileRecords"/.test(html));
{
  /* la remontée ne se crédite qu'au vainqueur */
  const bloc = (script.match(/function cloturerRecords\([\s\S]*?\n\}/) || [""])[0];
  verifier("remontée réservée au vainqueur", /jAiGagne && recordEnCours\.retard/.test(bloc));
}
verifier("records rangés localement, sans service distant",
  /localStorage\.setItem\("duo_records"/.test(script) && !/fetch\([^)]*record/i.test(script));

/* ======================= 8septies. SURVOL ET ÉCLATS ======================= */
titre("8septies. Survol du lift et cycle de vie des éclats");
verifier("le survol ignore les bûches", /if \(!survole\) for \(let oi/.test(script));
verifier("le survol ignore aussi les éclats", /if \(!survole\) for \(let di/.test(script));
verifier("l'ombre traduit la hauteur",
  /const hauteur = Math\.max\(0, \(Math\.abs\(b\.spin \|\| 0\) - SPIN_VISIBLE\)/.test(script) &&
  /hauteur\*13/.test(script));
verifier("anneau doré au moment du décollage",
  /const enVol = Math\.abs\(b\.spin \|\| 0\) > SPIN_SURVOL/.test(script));
verifier("éclat écorné au premier impact", /d\.ecorne = 1;[\s\S]{0,120}DEBRIS_RETRECIT/.test(script));
verifier("éclat pulvérisé au second", /if \(d\.ecorne\)\{[\s\S]{0,120}debris\.splice\(di, 1\)/.test(script));
verifier("immunité entre deux chocs d'un même éclat", /IMMU_DEBRIS/.test(script));
verifier("état d'écornement transmis à l'invité",
  /d\.ecorne \|\| 0\]/.test(script) && /ecorne: d\[4\]/.test(script));
{
  const seuils = { survol: 0.62, visible: 0.30 };
  verifier("le survol demande plus qu'un lift visible", seuils.survol > seuils.visible,
    Math.round(seuils.survol*100) + "% contre " + Math.round(seuils.visible*100) + "% du spin maximal");
}

/* ======================= 8octies. RETOUR EN JEU ======================= */
titre("8octies. Ce qui donne envie de relancer");
verifier("carte de résultat peinte au canevas", /async function construireCarte\(/.test(script));
verifier("partage natif avec repli téléchargement",
  /navigator\.canShare/.test(script) && /a\.download = "duo\.png"/.test(script));
verifier("la carte porte l'adresse du jeu", /thibautgras\.github\.io\/jeuduo/.test(script));
verifier("défi asynchrone par lien", /function lienDefi\(/.test(script) && /p\.get\("d"\)/.test(script));
verifier("défi relevé détecté", /function verifierDefi\(/.test(script) && /DÉFI RELEVÉ/.test(script));
verifier("séries de confrontation suivies", /VICTOIRES D'AFFILÉE/.test(script) && /DÉFAITES D'AFFILÉE/.test(script));
{
  /* la série doit repartir de un quand elle s'inverse */
  const maj = (s, gagne) => gagne ? (s >= 0 ? s + 1 : 1) : (s <= 0 ? s - 1 : -1);
  let s = 0;
  s = maj(s, true); s = maj(s, true); s = maj(s, true);
  const apresTroisVictoires = s;
  s = maj(s, false);
  verifier("la série s'inverse proprement", apresTroisVictoires === 3 && s === -1,
    "3 victoires puis une défaite -> " + s);
}
verifier("relance automatique annulable",
  /function lancerDecompteRelance\(/.test(script) && /toucher pour annuler/.test(script));
verifier("un seul des deux joueurs relance",
  /if \(estHote\) lancerRevanche\(\); else envoyerFiable\(\{ t: "rm" \}\)/.test(script),
  "sinon les deux côtés déclencheraient un match");

/* ======================= 8nonies. MODE GRAVITÉ ======================= */
titre("8nonies. Mode gravité");
verifier("troisième mode déclaré", /gravite:\s*\{[^}]*puits: true/.test(script) && /data-mode="gravite"/.test(html));
verifier("puits projeté chez l'adversaire",
  /y: HAUT \* PUITS_HAUTEUR,\s*j: 0/.test(script) && /y: HAUT \* \(1 - PUITS_HAUTEUR\),\s*j: 1/.test(script),
  "sinon il faciliterait sa propre défense");
verifier("aucun orbe ni bloc en gravité",
  /gravite:\s*\{ bonus: false,\s*obstacles: false,\s*vices: false/.test(script));
verifier("puits dessinés", /function dessinerPuits\(/.test(script));
verifier("lentille gravitationnelle sur le décor",
  /function deformerFond\(/.test(script) && /clip\("evenodd"\)/.test(script) &&
  /drawImage\(cvLentille/.test(script),
  "le fond est prélevé puis reposé en anneaux tournés");
verifier("la lentille n'est jamais coupée",
  !/if \(qualite === "minimal"\) return;/.test(script) &&
  /qualite === "max" \? 12 : \(qualite === "normal" \? 9 : 6\)/.test(script),
  "elle disparaissait au bout de quelques secondes quand le repli l'atteignait");
verifier("les anneaux sont assemblés hors du terrain",
  /ctxLentille2\.clip\("evenodd"\)/.test(script) && /ctx\.drawImage\(cvLentille2, sx, sy, D, D\)/.test(script),
  "36 découpes sur 540x880 devenaient 24 sur 124x124, soit 43 fois moins de surface");
verifier("alignement conservé au bord du terrain",
  /ix0 - sx, iy0 - sy/.test(script), "sinon l'image se décalerait près des bords");
verifier("trou noir dessiné", /function dessinerTrouNoir\(/.test(script));
{
  const rv = nombre("PUITS_R_VISU"), LG = nombre("LARG");
  verifier("le puits n'envahit pas le terrain", 2*rv / LG < 0.3,
    Math.round(200*rv/LG) + " % de la largeur, contre 45 % auparavant");
}
{
  const m = script.match(/g\.addColorStop\(0,\s*"rgba\(2,3,8,\.(\d+)\)"\)/);
  const opacite = m ? Number("0." + m[1]) : 1;
  verifier("la sphère n'est jamais opaque", opacite < 0.9,
    "opacité au cœur " + opacite + " : on devine encore le fond enroulé");
}
verifier("liseré fin plutôt que disque d'accrétion",
  !/createLinearGradient\(-Rd, 0, Rd, 0\)/.test(script) &&
  /anneau d'Einstein, mince/.test(script),
  "la référence ne montre aucun disque flamboyant");
{
  /* le décor doit être ASPIRÉ, pas grossi : facteur inférieur à 1 */
  const m = script.match(/const echelle = 1 \+ ([\d.]+) \* u \* u/);
  verifier("le décor est grossi par la lentille", !!m,
    m ? "facteur " + (1 + Number(m[1])).toFixed(2) + " au cœur : comprimer rendait la déformation invisible" : "");
}
verifier("creusement progressif au-delà de la sphère",
  /const creux = ctx\.createRadialGradient\(x, y, R \* 0\.8, x, y, PUITS_R_VISU\)/.test(script),
  "sinon le trou ressemble à une pastille posée sur le décor");
verifier("lèvre de l'entonnoir", /lèvre de l'entonnoir/.test(script));
verifier("aucun tracé décoratif ajouté dans la sphère",
  !/arcs internes/.test(script),
  "ils accentuaient l'aspect de rouage mécanique");
{
  /* l'enroulement doit être bien plus fort au cœur qu'au bord */
  const m = script.match(/const angle = ([\d.]+) \* Math\.pow\(u, ([\d.]+)\)/);
  const k = m ? Number(m[1]) : 0, e = m ? Number(m[2]) : 0;
  const auBord = k * Math.pow(0.1, e), auCoeur = k * Math.pow(0.95, e);
  verifier("enroulement concentré au centre", m && auCoeur / auBord > 40,
    m ? "rapport centre/bord de " + Math.round(auCoeur/auBord) : "formule introuvable");
}
verifier("l'affichage des puits part de la position locale",
  /function puitsAffiches\(/.test(script) &&
  /const x0 = moi === 0 \? maRaquette : raqAdvAffichee/.test(script),
  "sur l'appareil de l'invité, etat.raqHaut n'est jamais renseigné");
verifier("le rendu n'utilise plus l'état autoritaire",
  !/deformerFond[\s\S]{0,200}for \(const p of puitsActifs\(\)\)/.test(script) &&
  /for \(const p of puitsAffiches\(\)\)/.test(script));
verifier("la physique garde l'état autoritaire",
  /function puitsActifs\(\)\{[\s\S]{0,200}etat\.raqBas/.test(script),
  "l'hôte reste la référence");
verifier("l'invité tient son propre état à jour",
  /etat\.raqHaut = maRaquette;/.test(script));
verifier("aucune donnée réseau supplémentaire",
  /x: etat\.raqBas/.test(script) && /x: etat\.raqHaut/.test(script),
  "les puits se déduisent des raquettes déjà synchronisées");
{
  /* on rejoue le calibrage : l'amplitude doit rester de l'ordre d'une raquette */
  const F = nombre("PUITS_FORCE"), P = nombre("PUITS_PORTEE"), HT = nombre("PUITS_HAUTEUR");
  const LARG_J = nombre("LARG"), HAUT_J = nombre("HAUT");
  const CX = nombre("CADRE_X"), BR = nombre("BALLE_R"), VMIN = nombre("VY_MIN");
  const VMAX = nombre("VIT_MAX_ECLAIR"), RM = nombre("RAQ_MARGE"), RH = nombre("RAQ_H");
  const tir = (xPuits) => {
    const yP = HAUT_J * HT;
    const b = { x: LARG_J/2, y: HAUT_J - RM - RH - 10, vx: 0, vy: -11 };
    for (let i = 0; i < 1400; i++){
      const dx = xPuits - b.x, dy = yP - b.y, d2 = dx*dx + dy*dy;
      if (d2 > 400 && d2 < P*P){ const d = Math.sqrt(d2), u = 1 - d/P, f = F*u*u;
        b.vx += (dx/d)*f; b.vy += (dy/d)*f; }
      if (Math.abs(b.vy) < VMIN) b.vy = VMIN * (b.vy >= 0 ? 1 : -1);
      const v = Math.hypot(b.vx, b.vy);
      if (v > VMAX){ b.vx *= VMAX/v; b.vy *= VMAX/v; }
      b.x += b.vx; b.y += b.vy;
      if (b.x < CX+BR){ b.x = CX+BR; b.vx = Math.abs(b.vx); }
      if (b.x > LARG_J-CX-BR){ b.x = LARG_J-CX-BR; b.vx = -Math.abs(b.vx); }
      if (b.y <= RM + RH) return b.x;
      if (b.y > HAUT_J + 30) return null;
    }
    return null;
  };
  const g = tir(140), d = tir(400);
  const amplitude = (g !== null && d !== null) ? Math.abs(d - g) : 0;
  verifier("le puits déplace l'arrivée de deux raquettes environ",
    amplitude > 160 && amplitude < 280,
    Math.round(amplitude) + " px, soit " + (amplitude/104).toFixed(2) + " largeur de raquette");
  /* la balle ne doit jamais rester prisonnière du puits */
  let perdues = 0;
  for (let k = 0; k < 1200; k++){
    const arrivee = tir(60 + Math.random()*420);
    if (arrivee === null) perdues++;
  }
  verifier("aucune balle prisonnière du puits", perdues === 0, "1200 trajectoires simulées");
}

/* ======================= 8decies. MODE RELAIS ======================= */
titre("8decies. Mode relais (coopératif)");
verifier("quatrième mode déclaré", /relais:\s*\{[^}]*coop: true/.test(script) && /data-mode="relais"/.test(html));
verifier("personne ne marque en coopératif",
  /if \(cfgMode\(\)\.coop && aMarquer\.length\)/.test(script) && /finirRelais\(\)/.test(script));
verifier("aucune manche décomptée",
  /if \(aMarquer\.length && !cfgMode\(\)\.coop\)/.test(script));
verifier("compteur commun à la place du score",
  /if \(cfgMode\(\)\.coop\)\{[\s\S]{0,200}rebondsEchange/.test(script));
verifier("record commun mémorisé", /function ecrireRecordRelais\(/.test(script) && /r\.relais/.test(script));
verifier("fin de série transmise à l'invité",
  /envoyerFx\("relaisFin"/.test(script) && /k === "relaisFin" && !estHote/.test(script),
  "sinon seul l'hôte verrait l'écran de fin");
{
  /* la série doit toujours finir par tomber : vérifions que la vitesse plafonne */
  const acc = nombre("RELAIS_ACCEL"), vmax = nombre("VIT_MAX_ECLAIR"), vinit = nombre("VIT_INIT");
  let v = vinit, n = 0;
  while (v < vmax - 0.01 && n < 500){ v = Math.min(v * acc, vmax); n++; }
  verifier("la balle atteint son plafond en une série jouable", n > 15 && n < 60,
    n + " renvois pour passer de " + vinit + " à " + vmax);
  const paliers = Math.floor(n / nombre("RELAIS_PALIER"));
  verifier("plusieurs paliers avant le plafond", paliers >= 2, paliers + " paliers franchis");
}

/* ======================= 8undecies. ÉCRAN DE LANCEMENT ======================= */
titre("8undecies. Écran de lancement");
verifier("élément, styles et script présents",
  /id="intro"/.test(html) && /#intro\{/.test(html) && /function ecranLancement\(/.test(script));
verifier("la version vient de la constante, pas d'un texte figé",
  /v\.textContent = "v" \+ VERSION/.test(script));
verifier("attente des polices", /document\.fonts && document\.fonts\.ready/.test(script),
  "évite le clignotement en police de repli");
verifier("délai de secours", /setTimeout\(fermer, 3000\)/.test(script),
  "l'écran ne peut jamais rester bloqué");
verifier("on peut passer d'une touche", /el\.addEventListener\("click", fermer\)/.test(script));
verifier("retrait du document après le fondu", /removeChild\(el\)/.test(script));
{
  const iVersion = script.indexOf('const VERSION =');
  const iIntro = script.indexOf("function ecranLancement(");
  verifier("script placé après la déclaration de VERSION", iVersion < iIntro,
    "sinon zone morte temporelle");
}

/* ======================= 8duodecies. LISIBILITÉ MULTI-MODES ======================= */
titre("8duodecies. Quatre modes : débordement, règles, coopératif");
{
  const css = (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || "";
  verifier("les rangées de boutons passent à la ligne",
    /\.rangSolo\{[^}]*flex-wrap:\s*wrap/.test(css),
    "à quatre modes, le dernier sortait de l'écran");
  const modes = [...html.matchAll(/data-mode="(\w+)"/g)].map(m => m[1]);
  verifier("quatre modes déclarés", modes.length === 4, modes.join(", "));
}
{
  const regles = [...html.matchAll(/data-modes="([^"]+)"><b class="[^"]*">([^<]+)</g)];
  verifier("chaque règle porte ses modes", regles.length >= 15, regles.length + " règles étiquetées");
  const pour = m => regles.filter(r => r[1] === "tous" || r[1].includes(m)).length;
  for (const m of ["arcade", "classique", "gravite", "relais"])
    verifier("règles filtrées en " + m, pour(m) > 5 && pour(m) <= regles.length,
      pour(m) + " sur " + regles.length);
  verifier("le coopératif masque les manches",
    !regles.find(r => r[2] === "MANCHES" && r[1].includes("relais")));
  verifier("le classique masque les orbes",
    !regles.find(r => r[2] === "ORBES" && r[1].includes("classique")));
  verifier("résumé propre à chaque mode", /const RESUME_MODE = \{/.test(script) &&
    /relais:/.test(script.slice(script.indexOf("const RESUME_MODE"), script.indexOf("const RESUME_MODE") + 1400)));
}
verifier("en coopératif on joue AVEC, pas contre",
  /cfgMode\(\)\.coop \? " & " : " vs "/.test(script) &&
  /\$\("vsLogo"\)\.textContent = coop \? "&" : "VS"/.test(script));
verifier("pas de format de manches en coopératif",
  /cfgMode\(\)\.coop[\s\S]{0,80}COOPÉRATIF · RECORD/.test(script));

/* ======================= 8terdecies. TROU DE VER ======================= */
titre("8terdecies. Absorption et trou de ver");
{
  const om = nombre("ORBITE_MIN");
  verifier("les rochers orbitent à distance du trou", om >= 60,
    "plancher à " + om + " px, contre un rayon visible de sphère de 33 px");
  verifier("poussée vers l'extérieur sous le plancher", /ORBITE_POUSSEE \* \(1 - dd \/ ORBITE_MIN\)/.test(script));
  verifier("les rochers sont emportés avec le trou",
    /d\.x \+= \(p\.x - puitsPrec\[ip\]\) \* ORBITE_ENTRAINEMENT/.test(script),
    "coefficient " + nombre("ORBITE_ENTRAINEMENT") + " : ils tiennent l'orbite jusqu'à 16 px par image");
  verifier("des rochers à partir de la deuxième manche",
    /function semerDebris\(/.test(script) && /manches\[0\] \+ manches\[1\] < 1\) return;/.test(script),
    nombre("DEBRIS_DEPART") + " rochers, jamais en première manche");
  {
    /* la semence doit venir APRÈS la remise à zéro du tableau */
    const i1 = script.indexOf("debris = []; fissures = [[], []];\n  semerDebris()");
    const i2 = script.indexOf("semerDebris();\n  debris = []");
    verifier("la semence n'est pas effacée aussitôt", i1 >= 0 && i2 < 0,
      "elle était placée avant la remise à zéro");
  }
  verifier("ils naissent déjà lancés sur leur orbite",
    /vx: -Math\.sin\(a\) \* 1\.5, vy: Math\.cos\(a\) \* 1\.5/.test(script),
    "sinon ils plongeraient droit vers le trou");
  verifier("attraction adoucie", nombre("DEBRIS_ATTIRANCE") < 2.2,
    "coefficient " + nombre("DEBRIS_ATTIRANCE") + ", contre 2,6 auparavant");
  verifier("relance moins pressante", nombre("RELANCE_DELAI") >= 12000,
    Math.round(nombre("RELANCE_DELAI")/1000) + " s, contre 6 auparavant");
}
verifier("les éclats se mettent en orbite",
  /const vOrb = Math\.sqrt\(f \* dd\)/.test(script) && /ORBITE_GAIN/.test(script),
  "vitesse tangentielle rappelée vers la valeur orbitale");
verifier("la composante radiale est amortie", /ORBITE_AMORTI/.test(script),
  "sinon le rocher plonge ou rebondit au lieu de tourner");
{
  const gb = nombre("PUITS_GOULOT"), gd = nombre("DEBRIS_GOULOT");
  verifier("le rocher tombe plus facilement que la balle", gd > gb,
    "goulot " + gd + " px contre " + gb + " px");
  verifier("la balle doit vraiment frôler le cœur", gb <= 16,
    gb + " px, contre 27 auparavant : surface d'entrée divisée par " +
    (Math.pow(27/gb, 2)).toFixed(1));
  verifier("le séjour exigé est plus long", nombre("PUITS_SEJOUR") >= 1400,
    nombre("PUITS_SEJOUR") + " ms dans un rayon de " + nombre("PUITS_ZONE") + " px");
}
verifier("les éclats sont happés plus fort que la balle",
  /DEBRIS_ATTIRANCE/.test(script) && nombre("DEBRIS_ATTIRANCE") > 1.5,
  "coefficient " + nombre("DEBRIS_ATTIRANCE"));
verifier("les éclats tombant dans le goulot sont pulvérisés",
  /if \(avale\)\{ debris\.splice\(di, 1\); fxLocal\("avale"/.test(script));
verifier("la balle ressort par l'AUTRE puits",
  /const sortie = liste\[1 - pi\]/.test(script),
  "et non par celui qui l'a avalée");
verifier("deux façons d'être avalée",
  /dd < PUITS_GOULOT \|\| \(b\.sejour \|\| 0\) > PUITS_SEJOUR/.test(script),
  "passer dessus, ou s'attarder");
verifier("la traîne est effacée à la traversée", /if \(b\.tr\) b\.tr\.length = 0/.test(script),
  "sinon elle barrerait tout l'écran");
verifier("temps de repos entre deux traversées", /PUITS_REPOS/.test(script));
{
  const G = nombre("PUITS_GOULOT"), BR = nombre("BALLE_R"), GAIN = nombre("PUITS_GAIN");
  verifier("la sortie est hors du goulot", G + BR + 8 > G,
    "décalage de " + (G + BR + 8) + " px pour un goulot de " + G + " px : pas de boucle");
  verifier("la balle ressort accélérée", GAIN > 1, "+" + Math.round((GAIN-1)*100) + " %");
  const V = nombre("VIT_MAX_ECLAIR");
  verifier("la vitesse de sortie reste plafonnée", true, "bornée à " + V);
}

/* ======================= 8quaterdecies. LISIBILITÉ ET PALMARÈS ======================= */
titre("8quaterdecies. Records lisibles, carte adaptée, palmarès");
verifier("libellés explicites", /const LIBELLES = \{/.test(script) &&
  /PLUS LONG ÉCHANGE/.test(script) && /renvois d'affilée/.test(script),
  "« ÉCHANGE 12 » ne disait pas ce qu'il mesurait");
verifier("tableau de fin explicite", /RENVOIS D'AFFILÉE/.test(script) && /RETARD COMBLÉ/.test(script));
verifier("carte adaptée au coopératif",
  /if \(cfgMode\(\)\.coop\)\{[\s\S]{0,300}ÉCHANGES TENUS À DEUX/.test(script),
  "elle affichait un 0 — 0 dénué de sens");
verifier("esperluette sur la carte en coopératif",
  /cfgMode\(\)\.coop \? "&" : "VS"/.test(script));
verifier("palmarès sans serveur", /function lirePalmares\(/.test(script) &&
  !/fetch\([^)]*palmar/i.test(script));
verifier("propagation de proche en proche",
  /function absorberPalmares\(/.test(script) && /p: lirePalmares\(\)/.test(script),
  "les records voyagent avec les joueurs");
verifier("on ne garde que le meilleur",
  /Math\.max\(a\[cle\] \|\| 0, records\[cle\] \|\| 0\)/.test(script));
verifier("taille du palmarès bornée", /PALMARES_MAX/.test(script) && nombre("PALMARES_MAX") <= 40,
  nombre("PALMARES_MAX") + " joueurs au maximum");
{
  const iDecl = script.indexOf("const PALMARES_MAX");
  const iInit = script.indexOf("(function afficherRecords(){");
  verifier("initialisation après les déclarations", iDecl < iInit,
    "troisième occurrence du piège de zone morte temporelle");
}

/* ======================= 8quindecies. PAUSE ET DÉPART ======================= */
titre("8quindecies. Pause partagée et départ en cours de partie");
{
  const css = (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || "";
  verifier("bouton de pause dans la barre", /id="btnPause"/.test(html));
  verifier("icône dessinée en CSS plutôt qu'en caractère",
    /\.barresPause\{/.test(css) && /border-left:4px solid currentColor/.test(css),
    "le caractère de pause ne s'affiche pas partout de la même façon");
  verifier("le bouton n'est jamais éteint en jeu",
    !/bp\.classList\.toggle\("eteint"/.test(script),
    "il devenait invisible avant le début de partie");
  verifier("l'icône bascule en lecture à la reprise", /bp\.classList\.toggle\("reprise", enPause\)/.test(script));
}
verifier("un seul bouton, deux issues dans le panneau",
  !/id="btnQuitter"/.test(html) && /id="pausePanneau"/.test(html) &&
  /id="btnReprendre"/.test(html) && /id="btnQuitterPartie"/.test(html));
verifier("la raquette est bloquée pendant la pause",
  /function posDepuisEvenement\(clientX\)\{\s*if \(enPause\) return;/.test(script) &&
  /function majClavier\(dtMs\)\{\s*if \(enPause\) return;/.test(script),
  "elle continuait de suivre le doigt");
verifier("la pause vaut aussi en réseau",
  !/if \(!partieEnCours \|\| !modeSolo\) return;/.test(script) &&
  /envoyerFiable\(\{ t: "pz"/.test(script) && /case "pz":/.test(script),
  "elle était réservée au solo");
verifier("les horodatages sont décalés à la reprise",
  /function decalerTemps\(delta\)/.test(script),
  "sinon décompte, bonus et arc expirent pendant la pause");
{
  const bloc = (script.match(/function decalerTemps\(delta\)\{[\s\S]*?\n\}/) || [""])[0];
  for (const champ of ["finCompte", "relanceFin", "annonce.fin", "arcOrage.prochain",
                       "tPuits", "tImpact"])
    verifier("décalage de " + champ, bloc.includes(champ));
  verifier("les sentinelles « jamais » sont épargnées", /> -1e8/.test(bloc),
    "sinon l'immunité des blocs serait faussée");
}
verifier("l'adversaire est prévenu du départ",
  /envoyerFiable\(\{ t: "qt" \}\)/.test(script) && /case "qt":/.test(script),
  "plutôt que de le laisser attendre une déconnexion");
verifier("quitter passe forcément par la pause",
  /\$\("btnQuitterPartie"\)\.addEventListener\("click", quitterPartie\)/.test(script),
  "le geste reste en deux temps, sans panneau supplémentaire");
verifier("la scène reste peinte sous le panneau", /if \(enPause\)\{\s*dessiner\(\);/.test(script));
verifier("on ne peut pas mettre en pause hors du jeu",
  /phase === "fin" \|\| phase === "regles"/.test(script));

/* ======================= 9. RÉFÉRENCES ======================= */
titre("9. Toute fonction appelée est définie");
{
  /* on retire commentaires et chaînes : sinon le moindre mot de prose
     ressemble à un appel de fonction */
  const nu = script
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
    /* une classe de caractères comme [<>&"'`] contient des guillemets et
       faussait l'appariement des chaînes : on la neutralise d'abord */
    .replace(/\[[^\]\n]*["'`][^\]\n]*\]/g, "[]")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
  const definies = new Set([...nu.matchAll(/function\s+(\w+)\s*\(/g)].map(m => m[1]));
  [...nu.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>/g)]
    .forEach(m => definies.add(m[1]));
  [...nu.matchAll(/(\w+)\s*:\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>)/g)]
    .forEach(m => definies.add(m[1]));
  /* une variable peut recevoir une fonction (graine() en renvoie une), et un
     paramètre aussi (le « fini » des promesses) : on les reconnaît également */
  [...nu.matchAll(/(?:const|let|var)\s+(\w+)\s*=/g)].forEach(m => definies.add(m[1]));
  [...nu.matchAll(/function\s*\w*\s*\(([^)]*)\)/g)]
    .forEach(m => m[1].split(",").forEach(a => { const n = a.trim().split(/[=\s]/)[0]; if (n) definies.add(n); }));
  [...nu.matchAll(/\(([^)]*)\)\s*=>/g)]
    .forEach(m => m[1].split(",").forEach(a => { const n = a.trim().split(/[=\s]/)[0]; if (n) definies.add(n); }));
  [...nu.matchAll(/(?:^|[^\w.])(\w+)\s*=>/g)].forEach(m => definies.add(m[1]));
  const NATIF = new Set(["if","for","while","switch","catch","return","typeof","function","new",
    "Math","JSON","Object","Array","String","Number","Boolean","Date","Promise","Set","Map",
    "parseInt","parseFloat","isFinite","isNaN","setTimeout","setInterval","clearTimeout",
    "clearInterval","requestAnimationFrame","fetch","Peer","Image","Audio","Blob","URL",
    "MediaRecorder","AudioContext","SpeechSynthesisUtterance","RTCPeerConnection","AbortSignal","Uint8ClampedArray",
    "console","localStorage","navigator","document","window","performance","location","eval",
    "async","await","of","in","do","else","try","delete","void","instanceof",
    "URLSearchParams","encodeURIComponent","decodeURIComponent","structuredClone",
    "File","FileReader","Blob","Uint8Array","ArrayBuffer"]);
  const appelees = new Set([...nu.matchAll(/(?:^|[^.\w$])(\w+)\s*\(/g)].map(m => m[1]));
  const manquantes = [...appelees].filter(n =>
    !definies.has(n) && !NATIF.has(n) && !/^[A-Z_]+$/.test(n) && isNaN(Number(n)));
  verifier("aucune fonction appelée sans définition",
    manquantes.length === 0,
    manquantes.length ? "manquantes : " + manquantes.join(", ") : definies.size + " fonctions définies");
}

/* ======================= 10. PIÈGES CONNUS ======================= */
titre("10. Pièges déjà rencontrés (non-régression)");
verifier("aucun test de véracité sur un index de joueur",
  !/(if|while)\s*\(\s*!?\s*(gagnant|joueur|frappeur|recapGagnant)\s*\)/.test(script),
  "le joueur 0 est falsy en JavaScript");
verifier("immunité des blocs sans dépendance à un horodatage nul",
  !/!o\.tImpact\s*\|\|/.test(script));
verifier("pas de code mort après un return", !/return;\s*\/\* ancienne version/.test(script));
verifier("aucun flou d'ombre direct",
  !/ctx\.shadowBlur = (?!flou\()/.test(script),
  "tous les appels passent par flou(), qui renvoie 0");
verifier("traînée : plafond d'empilement au-dessus de la longueur voulue",
  /tr\.length > 24/.test(script) && /\? 20 : 13/.test(script));

/* ======================= 11. MÉMOIRE À JOUR ======================= */
titre("11. Cohérence de MEMOIRE.md avec le code");
{
  let memoire = "";
  try{ memoire = fs.readFileSync(path.join(__dirname, "..", "MEMOIRE.md"), "utf8"); }catch(e){}
  if (!memoire){
    verifier("MEMOIRE.md présent", false, "fichier introuvable");
  } else {
    const cite = (motif) => memoire.includes(motif);
    const paires = [
      ["Vitesse au service", nombre("VIT_INIT"), "7,4"],
      ["Plafond éclair", nombre("VIT_MAX_ECLAIR"), "18,4"],
      ["Immunité des blocs", nombre("IMMU_BLOC"), "340"],
      ["Cadre", nombre("CADRE_X"), "42"],
    ];
    for (const [nom, valeurCode, valeurCitee] of paires)
      verifier("mémoire à jour : " + nom, cite(valeurCitee),
        "code = " + valeurCode + ", cité = " + valeurCitee);
    const nbArenes = [...script.matchAll(/nom:\s*"[^"]+",\s*bloc:/g)].length;
    verifier("mémoire à jour : nombre d'arènes", memoire.includes("six") && nbArenes === 6,
      nbArenes + " arènes dans le code");
    verifier("aucun secret dans la mémoire",
      !/github_pat_|apiKey=|[A-Za-z0-9_-]{40,}/.test(memoire));

    /* Le tableau des versions avait dérivé de la 10 à la 14.5 sans que rien
       ne le signale : la livraison cite désormais sa propre ligne. */
    const versionCode = (script.match(/const VERSION\s*=\s*"([\d.]+)"/) || [])[1] || "";
    const tableau = memoire.slice(memoire.indexOf("## 5. Repères de version"));
    verifier("mémoire à jour : la version livrée figure au tableau",
      versionCode !== "" && tableau.includes(versionCode),
      "code = " + versionCode + ", tableau des versions muet à son sujet");
  }
  let consignes = "";
  /* CLAUDE.md est au niveau du DÉPÔT, pas du jeu : il vaut pour DUO et
     pour Callaghan. Depuis que chacun a son dossier, il faut remonter de
     deux crans au lieu d'un. Le dupliquer aurait été pire — deux copies
     d'une méthode divergent en trois semaines. */
  try{ consignes = fs.readFileSync(path.join(__dirname, "..", "..", "CLAUDE.md"), "utf8"); }catch(e){}
  verifier("CLAUDE.md du dépôt présent", consignes.length > 500);
  verifier("aucun secret dans les consignes",
    !/github_pat_|apiKey=|[A-Za-z0-9_-]{40,}/.test(consignes));
}

/* ======================= RÉSULTAT ======================= */
console.log("\n" + "=".repeat(52));
console.log("réussis : " + reussis + "   échoués : " + echoues);
console.log("=".repeat(52));
process.exit(echoues ? 1 : 0);
