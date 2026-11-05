// Index « objet -> charcudocs qui le vendent », lu dans les records Vendor (vendors/*.tweak).
// L'absence d'un objet ici ne veut pas dire qu'il est introuvable (butin, quêtes, fabrication).

export function buildVendorIndex(db) {
  const index = new Map();
  for (const id of db.records.keys()) {
    if (!db.isA(id, 'Vendor')) continue;
    const stock = db.val(id, 'itemStock') || [];
    for (const raw of stock) {
      // Une entrée est soit inline, soit une référence vers un record VendorItem
      const fields = typeof raw === 'string' ? (db.resolve(raw) || {}).fields : raw && raw.fields;
      if (!fields || !fields.item) continue;
      const item = fields.item.value;
      const prereqs = fields.generationPrereqs ? fields.generationPrereqs.value : [];
      if (!index.has(item)) index.set(item, []);
      index.get(item).push({ vendor: id, prereqs: prereqs.filter((p) => typeof p === 'string') });
    }
  }
  return index;
}
