# Proposition de schéma JSON (étape 1)

Échantillon réel généré depuis les fichiers du jeu : [`data/sample/cyberware_sample.json`](../data/sample/cyberware_sample.json)
(Modificateur de douleur, Bouclier de proximité, Recycleur électromagnétique).

## Principes

1. **Traçabilité** : chaque palier garde `source` (fichier `.tweak` + ligne) et `inheritance`
   (la chaîne d'héritage des records). Chaque texte garde sa clé `LocKey#…`.
2. **Ne rien inventer** : une valeur n'est calculée (`computed`) que si tous ses ingrédients
   viennent de l'implant lui-même (palier, « + »). Ce qui dépend du joueur (attributs, perks)
   ou d'une courbe pas encore extraite reste une **formule** avec `dependsOn`.
3. **Données brutes + données prêtes à l'emploi** : on garde les modificateurs bruts
   (`statModifiers`) et un résumé calculé (`computedStats`) pour le site.

## `data/cyberware.json`

```jsonc
{
  "meta": { "generatedAt": "...", "gameVersion": "2.5", "sources": { ... } },

  // Paliers de qualité (items/quality/quality.tweak)
  "qualities": {
    "Epic":     { "value": 6, "qualityStat": 3, "isItemPlus": 0 },
    "EpicPlus": { "value": 7, "qualityStat": 3, "isItemPlus": 1 },
    "LegendaryPlusPlus": { "value": 10, "qualityStat": 4, "isItemPlus": 2 }
  },

  "cyberware": [
    {
      "id": "PainReductor",                    // identifiant de famille (friendlyName)
      "name":        { "key": "LocKey#40806", "fr": "Modificateur de douleur", "en": "Pain Editor" },
      "description": { "key": "LocKey#40807", "fr": "...", "en": "..." },
      "area": "IntegumentarySystemCW",          // zone du corps -> slots.json
      "icon": "cw_skeleton_paineditor",         // référence d'icône (fichier image à l'étape 3)
      "deprecated": false,                      // objets retirés du jeu en 2.0 (exclus du site)
      "tiers": [
        {
          "record": "Items.AdvancedPainReductorEpic",   // TweakDBID
          "quality": "Epic", "qualityValue": 6, "qualityStat": 3, "isItemPlus": 0,
          "dlc": null,                                  // "EP1" si Phantom Liberty
          "capacityCost": [{ "variant": "Variants.Humanity35CostTinkererVariant",
                             "base": 35,
                             "adjustments": [{ "refStat": "CyberwareTinkererStat", "refObject": "Player", "value": -7 }] }],
          "statModifiers": [
            { "stat": "Armor", "modifierType": "Additive", "value": 28, "computed": 28 },
            { "stat": "Armor", "modifierType": "Additive", "value": 20,
              "refStat": "Quality", "refObject": "Self", "op": "*", "computed": 60 },
            { "stat": "AttunementHelper", "value": 0.1,
              "refStat": "Cool", "refObject": "Player", "op": "*", "dependsOn": "Player.Cool" }
          ],
          "computedStats": { "Armor": 88 },
          "onEquip": [                                  // effets passifs / actifs
            { "description": { "key": "LocKey#40805",
                               "fr": "-6 % à tous les dégâts subis", "en": "-6% all incoming damage",
                               "fr_rich": "<Rich ...>…</>" },   // texte avec la mise en forme du jeu
              "uiValues": { "floatValues": [6] },
              "stats": [ { "stat": "PainEditorDamageReduction", "value": 0.94 } ],
              "effectors": [ { "type": "MultiplyDamage", "params": { ... } } ] },
            { "ref": "Attunements.CoolDamageReduce",    // bonus lié à un attribut
              "name": { "fr": "Sensible au sang-froid", "en": "Cool Attuned" },
              "description": { "fr": "+0.1 % de réduction des dégâts par point d'attribut.\nTotal actuel : +{stat_0} %" } }
          ],
          "secondaryStats": { ... },        // stats aléatoires/secondaires (dépendent de courbes, voir plus bas)
          "equipPrereqs": [],
          "upgradeCostMult": 2.5,
          "nextUpgradeItem": "Items.AdvancedPainReductorEpicPlus",
          "price": [ ... ],                 // composantes du prix (multiplicateurs + courbe)
          "icon": "cw_skeleton_paineditor",
          "source": { "file": "base/.../integumentary_system_advanced.tweak", "line": 4906 },
          "inheritance": [ "Items.AdvancedPainReductorEpic", "Items.AdvancedIntegumentarySystemModule", "..." ]
        }
      ]
    }
  ]
}
```

## `data/slots.json` (à générer)

```jsonc
{
  "areas": [
    { "id": "MusculoskeletalSystemCW", "name": { "key": "LocKey#28168", "fr": "...", "en": "..." },
      "slots": [
        { "index": 0 },
        { "index": 1 },
        { "index": 2, "unlock": { "type": "perk", "perk": "Tech_Central_Milestone_3", "level": 3 }, "visibleWhenLocked": true }
      ],
      "source": { "file": ".../cyberware_equipment_areas.tweak", "line": 38 } }
  ],
  "capacity": { /* capacité de base, gains par niveau / perks / booster : à extraire + vérifier à l'étape 2 */ }
}
```

## `data/perks.json` (à générer)

Les perks qui touchent au cyberware (slots débloqués, réduction de coût, bonus de capacité,
effets sur les implants), avec nom/description FR/EN, niveaux, et les stats qu'ils modifient.

## `data/loc_fr.json` / `data/loc_en.json`

Seulement les clés réellement utilisées par les JSON ci-dessus (pas les ~200 000 du jeu),
pour garder le site léger : `{ "40806": "Modificateur de douleur", ... }`.
Les textes sont aussi recopiés directement dans `cyberware.json` (champs `fr` / `en`),
donc ces fichiers servent surtout au changement de langue de l'interface et à la vérification.

## Ajouts lors de l'extraction complète

| Champ | Sens |
|---|---|
| `tiers[].alternates` | Autres records du même palier (ex. version de butin d'un implant vendu). Le palier principal est celui vendu par un charcudoc. |
| `tiers[].sideVariant` | Version alternative du palier (`sideUpgradeItem`), ex. les implants du squelette « …2 ». Rôle exact à confirmer à l'étape 2. |
| `tiers[].vendors` | Charcudocs qui vendent ce palier + conditions d'apparition. Vide ≠ introuvable (butin, quêtes). |
| `soldByRipperdocs`, `iconic`, `dlc` | Filtres pour le site. |
| `secondaryStats.staticModifierMultiplier` | Valeur de la courbe `quality_to_static_modifier_multiplier` pour ce palier ; les stats secondaires « statiques » sont calculées avec. |
| `slots.json > areas[].hasCyberware` | `false` pour les zones sans implant 2.x (FaceCW, ArmsCWStyle). |
| `perks.json > perks[].reasons` | Pourquoi ce perk est retenu (traçable). |
| `extract-report.json` | Comptes, records écartés avec la raison, doublons, références non résolues. |

Règles de sélection des implants (dans [`extract/lib/families.mjs`](../extract/lib/families.mjs)) : zone d'équipement = zone de
cyberware, coût en capacité présent (`HumanityAllocated`), pas `deprecated`, pas une copie de quête/tutoriel/test,
pas un modèle « …Base ». Les apparences de bras du Glamdoc n'ont pas de coût en capacité : elles sont écartées.

## Points ouverts (à régler aux étapes suivantes)

| Sujet | État |
|---|---|
| **Courbes `cyberware_curves`** (stats secondaires, prix) | ✅ Extraites (WolvenKit) et utilisées pour les stats secondaires statiques et le multiplicateur de prix. Les modificateurs non additifs (bascules « Toggle », « Boost ») restent en formule jusqu'à l'étape 2. |
| **Dégâts des bras** (lames Mantis, bras de gorille…) | ✅ Les groupes de stats d'armes sont exportés (`tiers[].statModifierGroups`). Le calcul final (voir RULES.md §9) sera fait par le moteur de stats du site ; `computedStats` ne contient pas encore les dégâts réels. |
| **Textes avec touches de manette/clavier** | Certaines descriptions contiennent une balise d'icône de touche (« Appuyez sur … ») vidée dans la version texte simple ; elle reste dans `fr_rich` / `en_rich`. |
| **Coût en capacité selon le palier** | Les fichiers donnent un coût fixe par implant (ex. 35 pour le Modificateur de douleur), réduit par le perk « Tinkerer ». S'il existe une autre règle dans les scripts (ex. coût qui varie selon le palier), elle sera vérifiée à l'étape 2. |
| **Ordre d'application des modificateurs** (additif / multiplicatif) | À confirmer dans les scripts (étape 2) avant d'additionner des stats entre implants. |
| **Implants « Iconic »** | Ce sont des familles à part (ex. Recycleur électromagnétique). Il faudra choisir comment les grouper avec leur version normale. |
