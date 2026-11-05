// Repère les familles d'implants du système 2.x et les records écartés (avec la raison).
//
// Règles (toutes vérifiables dans les .tweak) :
//  - un implant 2.x a un coût en capacité, donc un champ « variants » (Variants.HumanityXXCost…) ;
//    les anciens records 1.x n'en ont pas et ne sont plus utilisés ;
//  - les paliers d'une famille sont reliés par « nextUpgradeItem » ;
//  - « sideUpgradeItem » pointe vers une version alternative du même palier
//    (gardée dans le palier, champ sideVariant) ;
//  - les copies de quête / tutoriel / test (_q001, _Tutorial, Debug…) sont écartées :
//    elles dupliquent un implant normal.

const COPY_RE = /(_q\d{3}|_Q\d{3}|_Tutorial|_Regina|Test|Debug|Smoketest)/;

// Vrai si l'une des variantes de l'objet alloue de la capacité (stat HumanityAllocated).
// (Les armes ont aussi un champ « variants », sans rapport avec la capacité.)
function hasCapacityCost(db, id) {
  for (const v of db.val(id, 'variants') || []) {
    if (typeof v !== 'string') continue;
    const mods = db.val(v, 'statModifiers') || [];
    if (mods.some((m) => m && m.fields && m.fields.statType && m.fields.statType.value === 'BaseStats.HumanityAllocated')) return true;
  }
  return false;
}

export function findFamilies(db) {
  // Un implant = tout objet dont la zone d'équipement est une zone de cyberware.
  // (Les bras — lames Mantis, bras de gorille… — héritent des armes, pas d'Items.Cyberware.)
  const areas = new Set([...db.records.keys()].filter((id) => id.startsWith('EquipmentArea.') && db.isA(id, 'CyberwareArea')));
  const cw = [...db.records.keys()].filter((id) => areas.has(db.val(id, 'equipArea')) && db.val(id, 'itemType') !== undefined);
  const nexts = new Set();
  const sides = new Set();
  for (const id of cw) {
    const n = db.val(id, 'nextUpgradeItem'); if (n) nexts.add(n);
    const s = db.val(id, 'sideUpgradeItem'); if (s) sides.add(s);
  }
  // Modèles : records « …Base » parents d'autres implants (ex. AdvancedMantisBladesBase)
  const parents = new Set();
  for (const id of cw) {
    const rec = db.get(id);
    const p = db.resolveId(rec.parent, rec.package);
    if (p) parents.add(p);
  }
  const isTemplate = (id) => parents.has(id) && /Base$/.test(id);
  const excluded = [];
  const families = [];
  const claimed = new Set();
  for (const id of cw) {
    if (nexts.has(id) || sides.has(id)) continue; // pas un début de chaîne
    const reason =
      db.val(id, 'deprecated') ? 'deprecated = true' :
      isTemplate(id) ? 'modèle « …Base » (parent d’autres paliers)' :
      !hasCapacityCost(db, id) ? 'pas de coût en capacité (record 1.x)' :
      !db.val(id, 'displayName') ? 'pas de nom affiché' :
      !db.val(id, 'quality') ? 'pas de palier de qualité' :
      COPY_RE.test(id) ? 'copie de quête / tutoriel / test' : null;
    if (reason) { excluded.push({ record: id, reason }); continue; }
    const chain = [];
    let cur = id;
    while (cur && !claimed.has(cur) && db.get(cur)) {
      claimed.add(cur); chain.push(cur);
      cur = db.val(cur, 'nextUpgradeItem') || null;
    }
    families.push(chain);
  }
  // Fusionne les chaînes qui sont le même implant (même nom affiché, même zone, iconique ou non) :
  // certaines familles ont un palier isolé (ex. un Légendaire++ ajouté par Phantom Liberty).
  // Chaîne la plus longue d'abord : elle donne l'identifiant de la famille.
  families.sort((a, b) => b.length - a.length);
  const groups = new Map();
  for (const chain of families) {
    const key = [db.val(chain[0], 'displayName'), db.val(chain[0], 'equipArea'), /Iconic/.test(chain[0])].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(...chain);
  }
  return { families: [...groups.values()], excluded };
}
