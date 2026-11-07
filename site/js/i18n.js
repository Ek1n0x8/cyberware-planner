// Textes de l'interface (les textes du jeu viennent de data/game.json).
import { EXTRA_STRINGS, LANG_NAMES } from './i18n-extra.js';

const STRINGS = {
  fr: {
    title: 'Planner de cyberware',
    subtitle: 'Cyberpunk 2077 · v2.5 + Phantom Liberty',
    tabBuild: 'Build', tabCatalog: 'Catalogue', tabAbout: 'À propos',
    character: 'Personnage', level: 'Niveau', techSkill: 'Compétence Tech',
    back: 'Retour', statsEffects: 'Stats et effets', bodyMan: 'V homme', bodyWoman: 'V femme', bodySwitch: 'Changer de silhouette (homme / femme)',
    attributes: 'Attributs', perks: 'Perks liés au cyberware', shards: 'Éclats de capacité (bonus total)',
    maskQuest: 'Quête du 2e slot du visage terminée',
    upgradeWith: 'Améliorer avec cette option', statCurrent: 'Actuel',
    statRandomShort: 'Stats tirées au hasard : tu peux choisir celles que tu vises (facultatif).', statRandomUnknown: 'Stat aléatoire',
    statNoChoicePerk: 'Sans le perk « {perk:Tech_Inbetween_Right_2} », l’implant garde ses stats en s’améliorant. Coche-le dans le panneau Personnage pour choisir des stats aléatoires.',
    statNoChoiceOS: 'Le système d’exploitation garde toujours ses stats en s’améliorant (pas de choix dans le jeu).',
    statChoice: 'Choix des stats', statOption: (n) => `Option ${n}`, statKeep: 'Garder les stats actuelles', statPick: 'Choisir cette option',
    statRandomChosen: 'Stats aléatoires choisies', statAny: '— au hasard —',
    statSimple: 'Stat simple', statAdvanced: 'Stat avancée', statSpecialized: 'Stat spécialisée', statDriver: 'Tirage « {perk:Tech_Central_Perk_2_1} »',
    statRandom1: 'Le jeu tire une pièce de stats au hasard. Choisis les stats que tu vises :',
    statRandom2: 'Le jeu propose deux pièces tirées au hasard (options 2 et 3). Choisis les stats que tu vises :',
    statRandomNote: 'Valeurs tirées au hasard par le jeu dans ces plages (bonus de {perk:Tech_Central_Milestone_2} / {perk:Tech_Central_Milestone_3} compris). Elles ne sont pas ajoutées aux totaux.',
    statChoiceHelp: 'Avec « {perk:Tech_Inbetween_Right_2} », chaque amélioration propose de garder les stats de l’implant ou de prendre des stats tirées au hasard (comme dans le jeu).',
    statRangesTitle: 'Stats aléatoires (plages)', statRangesNote: 'Valeurs tirées au hasard en jeu : non comptées dans les stats cumulées.',
    obtain: 'Obtention', communityHint: 'Info communautaire (wikis, guides) : ne vient pas des fichiers du jeu.',
    allMax: 'Maximum', resetValues: 'Réinitialiser', resetValuesHint: 'Remet les valeurs par défaut (les implants restent).', allMaxHint: 'Niveau 60, compétence Technique 60, attributs à 20, perks au max, quête du masque faite (les éclats ne changent pas).',
    resetTitle: 'Réinitialiser le build ?', resetText: 'Tous les implants et réglages seront effacés. Garde ton lien si tu veux le retrouver.', resetOk: 'Réinitialiser', cancel: 'Annuler',
    sortBy: 'Trier', sortName: 'Nom', sortPrice: 'Prix', sortCap: 'Capacité', sortArmor: 'Armure', clearFilters: 'Effacer les filtres', decrease: 'Diminuer', increase: 'Augmenter',
    optTextSize: 'Taille du texte', sizeS: 'Petit', sizeM: 'Normal', sizeL: 'Grand',
    optReduceMotion: 'Réduire les animations', optReduceMotionHint: 'Coupe les vidéos, les clignotements et les transitions.',
    loading: 'Initialisation', loadingData: 'Chargement des implants…',
    shareTitle: 'Partager le build', shareCopy: 'Copier le lien', shareDiscord: 'Discord (copier)', shareMore: 'Autres…', shareText: 'Mon build de cyberware Cyberpunk 2077',
    officialPlanner: 'Pour planifier tes attributs, compétences et perks, utilise le planificateur officiel de CD PROJEKT RED :', officialPlannerLink: 'Build Planner sur cyberpunk.net',
    unknownSource: 'Obtention inconnue', unknownSourceHint: 'Non vendu et cité nulle part dans les données du jeu : peut-être une récompense de quête, ou un implant coupé du jeu.',
    optLanguageHint: 'Les noms et descriptions des implants viennent des fichiers du jeu, dans chacune de ses langues.',
    tabOptions: 'Options', optLanguage: 'Langue', optSound: 'Son', optSoundFx: 'Sons de l’interface', optVolume: 'Volume',
    optDisplay: 'Affichage', optVideos: 'Vidéos animées du corps', optVideosHint: 'Désactive-les si le site est lent : le corps reste en image fixe.',
    noCapacity: 'Cyber-capacité insuffisante', freeReward: 'Offert (récompense de mission)',
    on: 'Activé', off: 'Désactivé', installedIn: (n) => `Installé · emplacement ${n}`,
    body: 'Silhouette',
    price: 'Prix', upgradedFrom: (q) => `Amélioration depuis ${q}`, upgradeCost: 'Coût d’amélioration', fromPrev: 'depuis le palier précédent',
    buildCost: 'Coût du build', buyTotal: 'Achat de tous les implants', upgrades: 'Améliorations possibles', upgrade: 'Améliorer',
    spentUpgrades: 'Composants dépensés en améliorations :', toMax: 'Pour tout monter au maximum :',
    priceNote: 'Prix d’achat de base chez un charcudoc (la réputation peut le baisser jusqu’à 15 % en jeu). Améliorer un implant coûte des composants, pas d’eddies.',
    capacity: 'Cyber-capacité', armor: 'Armure', overcharge: 'Surcharge (Edgerunner)',
    capDetail: 'Détail de la capacité max',
    cap_base: 'Base', cap_level: 'Niveau × 3', cap_techSkill: 'Compétence Tech', cap_perk22: '{perk:Tech_Central_Perk_2_2}',
    cap_shards: 'Éclats', cap_booster: 'Booster',
    maxArmorHint: 'Repère du jeu pour ce niveau',
    health: 'Santé max', summary: 'Stats cumulées', effects: 'Effets', noEffects: 'Aucun implant installé.',
    empty: 'Vide', locked: 'Verrouillé', install: 'Installer', remove: 'Retirer', close: 'Fermer',
    details: 'Fiche', compare: 'Comparer avec…', compareNone: '— aucun —',
    cost: 'Coût', tier: 'Palier', search: 'Rechercher…', allAreas: 'Toutes les zones', allStats: 'Toutes les stats',
    allTiers: 'Tous les paliers', soldOnly: 'Vendus par les charcudocs', iconicOnly: 'Iconiques', dlcOnly: 'Phantom Liberty',
    results: (n) => `${n} implant${n > 1 ? 's' : ''}`,
    share: 'Partager', shareCopied: 'Lien copié !', shareManual: 'Copiez ce lien :',
    reset: 'Réinitialiser', mute: 'Couper le son', unmute: 'Activer le son', lang: 'English',
    secondary: 'Stats secondaires', condDriver: 'avec « {perk:Tech_Central_Perk_2_1} »', condQuality: 'à partir du Niveau 2',
    boosted: 'version renforcée ({perk:Tech_Central_Milestone_3})', iconic: 'Iconique', dlc: 'Phantom Liberty', notSold: 'Non vendu en boutique',
    dps: 'DPS de base', capGiven: 'Capacité donnée',
    warn_overCapacity: (v) => `Capacité dépassée de ${v}. Sans le perk Edgerunner, le jeu refuse l'installation.`,
    warn_overEdgerunner: (v) => `Capacité dépassée de ${v} au-delà de la marge Edgerunner (50).`,
    warn_lockedSlot: (n) => `${n} : slot verrouillé, implant ignoré dans les calculs.`,
    warn_attrReq: (n, a, v) => `${n} : demande ${a} ${v}.`,
    warn_perkReq: (n, p) => `${n} : demande le perk « ${p} ».`,
    unverified: 'Valeur à vérifier en jeu',
    perHit: 'par point', current: 'Total actuel',
    pickTitle: (a) => `Choisir un implant · ${a}`,
    tierTable: 'Stats par palier', stat: 'Stat',
    fanNotice: 'Ceci est une création de fan non officielle, non approuvée ni soutenue par CD PROJEKT RED.',
    credits: 'Cyberpunk 2077, ses textes, icônes et sons © CD PROJEKT RED. Site gratuit, sans publicité.',
    dataFrom: 'Données extraites des fichiers du jeu',
  },
  en: {
    title: 'Cyberware Planner',
    subtitle: 'Cyberpunk 2077 · v2.5 + Phantom Liberty',
    tabBuild: 'Build', tabCatalog: 'Catalog', tabAbout: 'About',
    character: 'Character', level: 'Level', techSkill: 'Tech skill',
    back: 'Back', statsEffects: 'Stats & effects', bodyMan: 'Male V', bodyWoman: 'Female V', bodySwitch: 'Switch body (male / female)',
    attributes: 'Attributes', perks: 'Cyberware perks', shards: 'Capacity shards (total bonus)',
    maskQuest: 'Second face slot quest completed',
    upgradeWith: 'Upgrade with this option', statCurrent: 'Current',
    statRandomShort: 'Randomly rolled stats: you can pick the ones you are aiming for (optional).', statRandomUnknown: 'Random stat',
    statNoChoicePerk: 'Without the “{perk:Tech_Inbetween_Right_2}” perk, the cyberware keeps its stats when upgraded. Tick it in the Character panel to pick random stats.',
    statNoChoiceOS: 'The operating system always keeps its stats when upgraded (no choice in the game).',
    statChoice: 'Stat choice', statOption: (n) => `Option ${n}`, statKeep: 'Keep current stats', statPick: 'Pick this option',
    statRandomChosen: 'Random stats chosen', statAny: '— random —',
    statSimple: 'Simple stat', statAdvanced: 'Advanced stat', statSpecialized: 'Specialized stat', statDriver: '“{perk:Tech_Central_Perk_2_1}” roll',
    statRandom1: 'The game rolls a random stat shard. Pick the stats you are aiming for:',
    statRandom2: 'The game offers two random shards (options 2 and 3). Pick the stats you are aiming for:',
    statRandomNote: 'Values rolled at random by the game within these ranges ({perk:Tech_Central_Milestone_2} / {perk:Tech_Central_Milestone_3} bonus included). Not added to totals.',
    statChoiceHelp: 'With “{perk:Tech_Inbetween_Right_2}”, each upgrade lets you keep the cyberware’s stats or take randomly rolled stats (as in the game).',
    statRangesTitle: 'Random stats (ranges)', statRangesNote: 'Values rolled at random in game: not counted in total stats.',
    obtain: 'How to get', communityHint: 'Community info (wikis, guides): not from the game files.',
    allMax: 'Maximum', resetValues: 'Reset', resetValuesHint: 'Back to default values (cyberware stays).', allMaxHint: 'Level 60, Tech skill 60, attributes at 20, perks maxed, mask quest done (shards unchanged).',
    resetTitle: 'Reset the build?', resetText: 'All cyberware and settings will be cleared. Keep your link if you want it back.', resetOk: 'Reset', cancel: 'Cancel',
    sortBy: 'Sort', sortName: 'Name', sortPrice: 'Price', sortCap: 'Capacity', sortArmor: 'Armor', clearFilters: 'Clear filters', decrease: 'Decrease', increase: 'Increase',
    optTextSize: 'Text size', sizeS: 'Small', sizeM: 'Normal', sizeL: 'Large',
    optReduceMotion: 'Reduce animations', optReduceMotionHint: 'Turns off videos, flashing and transitions.',
    loading: 'Initializing', loadingData: 'Loading cyberware…',
    shareTitle: 'Share the build', shareCopy: 'Copy link', shareDiscord: 'Discord (copy)', shareMore: 'More…', shareText: 'My Cyberpunk 2077 cyberware build',
    officialPlanner: 'To plan your attributes, skills and perks, use CD PROJEKT RED’s official planner:', officialPlannerLink: 'Build Planner on cyberpunk.net',
    unknownSource: 'Unknown source', unknownSourceHint: 'Not sold and referenced nowhere in the game data: maybe a quest reward, or cut content.',
    optLanguageHint: 'Cyberware names and descriptions come from the game files, in each of the game’s languages.',
    tabOptions: 'Options', optLanguage: 'Language', optSound: 'Sound', optSoundFx: 'Interface sounds', optVolume: 'Volume',
    optDisplay: 'Display', optVideos: 'Animated body videos', optVideosHint: 'Turn them off if the site is slow: the body stays as a still image.',
    noCapacity: 'Not enough cyberware capacity', freeReward: 'Free (mission reward)',
    on: 'On', off: 'Off', installedIn: (n) => `Installed · slot ${n}`,
    body: 'Body type',
    price: 'Price', upgradedFrom: (q) => `Upgrade from ${q}`, upgradeCost: 'Upgrade cost', fromPrev: 'from previous tier',
    buildCost: 'Build cost', buyTotal: 'Buying all cyberware', upgrades: 'Available upgrades', upgrade: 'Upgrade',
    spentUpgrades: 'Components spent on upgrades:', toMax: 'To max everything out:',
    priceNote: 'Base ripperdoc buy price (Street Cred can lower it by up to 15% in game). Upgrading cyberware costs components, not eddies.',
    capacity: 'Cyberware Capacity', armor: 'Armor', overcharge: 'Overcharge (Edgerunner)',
    capDetail: 'Max capacity breakdown',
    cap_base: 'Base', cap_level: 'Level × 3', cap_techSkill: 'Tech skill', cap_perk22: '{perk:Tech_Central_Perk_2_2}',
    cap_shards: 'Shards', cap_booster: 'Booster',
    maxArmorHint: 'Game reference for this level',
    health: 'Max Health', summary: 'Total stats', effects: 'Effects', noEffects: 'No cyberware installed.',
    empty: 'Empty', locked: 'Locked', install: 'Install', remove: 'Remove', close: 'Close',
    details: 'Details', compare: 'Compare with…', compareNone: '— none —',
    cost: 'Cost', tier: 'Tier', search: 'Search…', allAreas: 'All areas', allStats: 'All stats',
    allTiers: 'All tiers', soldOnly: 'Sold by ripperdocs', iconicOnly: 'Iconic', dlcOnly: 'Phantom Liberty',
    results: (n) => `${n} item${n > 1 ? 's' : ''}`,
    share: 'Share', shareCopied: 'Link copied!', shareManual: 'Copy this link:',
    reset: 'Reset', mute: 'Mute', unmute: 'Unmute', lang: 'Français',
    secondary: 'Secondary stats', condDriver: 'with “{perk:Tech_Central_Perk_2_1}”', condQuality: 'from Tier 2',
    boosted: 'enhanced version ({perk:Tech_Central_Milestone_3})', iconic: 'Iconic', dlc: 'Phantom Liberty', notSold: 'Not sold in shops',
    dps: 'Base DPS', capGiven: 'Capacity granted',
    warn_overCapacity: (v) => `Capacity exceeded by ${v}. Without the Edgerunner perk, the game refuses the install.`,
    warn_overEdgerunner: (v) => `Capacity exceeded by ${v} beyond the Edgerunner margin (50).`,
    warn_lockedSlot: (n) => `${n}: locked slot, item ignored in calculations.`,
    warn_attrReq: (n, a, v) => `${n}: requires ${a} ${v}.`,
    warn_perkReq: (n, p) => `${n}: requires the “${p}” perk.`,
    unverified: 'Value to be checked in game',
    perHit: 'per point', current: 'Current total',
    pickTitle: (a) => `Choose cyberware · ${a}`,
    tierTable: 'Stats per tier', stat: 'Stat',
    fanNotice: 'This is an unofficial fan creation, not approved or endorsed by CD PROJEKT RED.',
    credits: 'Cyberpunk 2077, its texts, icons and sounds © CD PROJEKT RED. Free site, no ads.',
    dataFrom: 'Data extracted from the game files',
  },
};

Object.assign(STRINGS, EXTRA_STRINGS);
export const LANGUAGES = Object.keys(LANG_NAMES);
export { LANG_NAMES };

// Français par défaut ; la langue choisie est mémorisée
let lang = 'fr';
try { const l = localStorage.getItem('lang'); if (l && STRINGS[l]) lang = l; } catch { /* stockage indisponible */ }

// Textes du jeu des langues autres que FR / EN : site/data/lang/<langue>.json, indexés par le champ « i »
const gameTexts = {};
export async function loadLangTexts(l) {
  if (l === 'fr' || l === 'en' || gameTexts[l]) return;
  try { gameTexts[l] = await fetch(`data/lang/${l}.json`).then((r) => r.json()); } catch { gameTexts[l] = []; }
}

export const getLang = () => lang;
export function setLang(l) {
  lang = STRINGS[l] ? l : 'fr';
  try { localStorage.setItem('lang', lang); } catch { /* ignoré */ }
  document.documentElement.lang = lang;
}
export function t(key, ...args) {
  const v = STRINGS[lang][key] ?? (lang === 'fr' ? undefined : STRINGS.en[key]) ?? STRINGS.fr[key] ?? key;
  const s = typeof v === 'function' ? v(...args) : v;
  // {perk:ID} : nom officiel du perk, lu dans les fichiers du jeu (dans la langue choisie)
  return typeof s === 'string' && perkResolver ? s.replace(/\{perk:(\w+)\}/g, (_, id) => perkResolver(id)) : s;
}
let perkResolver = null;
export const setPerkNames = (f) => { perkResolver = f; };
// Accord des textes du jeu : le jeu a une variante masculine (maleVariant) pour certains textes
let male = true;
export const setMaleTexts = (v) => { male = !!v; };
// Texte du jeu { fr, en, fr_male?, en_male?, i? } ; autres langues via le fichier de la langue, sinon l'anglais
export function g(obj) {
  if (!obj) return '';
  if (lang !== 'fr' && lang !== 'en') {
    const e = obj.i !== undefined && gameTexts[lang] && gameTexts[lang][obj.i];
    if (e) return Array.isArray(e) ? (male && e[1]) || e[0] : e;
    return obj.en || obj.fr || '';
  }
  return (male && obj[`${lang}_male`]) || obj[lang] || obj.fr || obj.en || '';
}
