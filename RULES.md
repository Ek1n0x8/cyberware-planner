# Règles du charcudoc (Cyberpunk 2077 v2.5 + Phantom Liberty)

Ce document résume les règles qui déterminent un build de cyberware, telles qu'on peut les lire
dans les fichiers du jeu. Chaque règle indique sa source :

- `scripts/…` = `tools/redmod/scripts/…` (code du jeu, lisible) — fichier, fonction et ligne ;
- `tweaks/…` = `tools/redmod/tweaks/base/gameplay/static_data/database/…` (données) — fichier et record ;
- `courbe set/colonne` = courbe extraite des archives par WolvenKit (voir `extract/lib/curves.mjs`).

Niveau de confiance :

- ✅ **lu** : écrit tel quel dans le code ou les données ;
- 🟡 **déduit** : non écrit en toutes lettres (le calcul est fait par le moteur du jeu, en C++, invisible),
  mais déduit des données et **recoupé** avec un texte du jeu ;
- ❓ **non trouvé** : à vérifier en jeu.

---

## 1. Comment le jeu combine les modificateurs de stats

Toute stat (armure, capacité, dégâts…) est la combinaison de modificateurs de trois types.

| Règle | Confiance | Source |
|---|---|---|
| **Valeur = (somme des `Additive`) × (produit des `Multiplier`) × (somme des `AdditiveMultiplier`)** | ✅ structure lue | `scripts/cyberpunk/managers/rpgManager.script`, `RPGManager.CalculateStatModifiers`, l. 34-63 |
| Valeurs de départ : additifs à 0, multiplicateurs à 1, additifs-multiplicateurs à **1** (donc un `AdditiveMultiplier` de 0,1 = +10 %) | 🟡 | Recoupé : « Cyberbricoleuse » (+0,1 en `AdditiveMultiplier` via `CyberwareStatModifierBoost`) est décrite « +10 % aux modificateurs » (`tweaks/new_perks/tech_new_perks.tweak`, `Tech_Central_Milestone_2`) ; « Edgerunner » donne bien −0,5 % de santé par point (voir §3) |
| Un `CombinedStatModifier` vaut `value × stat de référence` (`opSymbol = "*"`), `value / stat` (`"inv"` = `value × 1/stat`), ou `stat × (1 − x)` (`"*(1-x)"`) | 🟡 | Symboles lus dans les tweaks ; « inv » recoupé par le calcul Edgerunner (§3) |
| `refObject` : `Self`/absent = l'objet qui porte le modificateur, `Player` = le joueur, `Root` = l'implant qui contient la pièce | ✅ | `RPGManager.GetRefObjectID` (natif) ; usages dans `tweaks/items/cyberware/base_values.tweak` (`CyberwareStatsShardStatic`) |
| Un `Multiplier` de 0 annule une stat (ex. `Quality.Common` met `RandomCurveInput` à 0) | ✅ | `tweaks/items/quality/quality.tweak` |
| Les stats marquées `EquipOnPlayer` (ex. `Armor`) d'un objet équipé s'ajoutent au joueur | ✅ (flag lu) / 🟡 (effet) | `tweaks/stats/base_values.tweak`, record `Armor` |

> Pour le site : un petit moteur de stats qui applique cette formule, en résolvant les stats de
> référence sur le bon objet (implant ou joueur). Les modificateurs bruts sont déjà dans `cyberware.json`.

---

## 2. Capacité de cyberware (« cyber-capacité »)

### Capacité maximale (stat `Humanity`)

| Source | Valeur | Confiance | Source |
|---|---|---|---|
| Base | **21** | ✅ | `tweaks/characters/player/player_base_stats.tweak` l. 1830 |
| Niveau du personnage | **+3 par niveau** | ✅ | idem l. 1835 |
| Compétence Tech (`TechnicalAbilitySkill`) | **+5** à partir du niveau 10, **+15** à partir du niveau 30 (courbe « Constant ») | ✅ | `tweaks/characters/player/player_proficiency_passives.tweak` (`tech_ability_skill_to_humanity`) ; courbe `technical_ability_skill_passives/tech_ability_skill_to_humanity` = (0→0, 10→5, 30→15) |
| Perk « Dépassement des limites » (`Tech_Central_Perk_2_2`) | **+4 par attribut ≥ 9** (max +20) | ✅ | `tweaks/new_perks/tech_new_perks.tweak` l. 378-499 |
| Éclats de capacité (consommables, permanents) | +2 / +3 / +4 / +6 selon la rareté | ✅ | `scripts/cyberpunk/player/player.script` l. 5552-5571 (tags `CWshard_Tier2…5`) ; `tweaks/items/consumables/skillbooks.tweak` (`CWCapacityPermaReward_*`) |
| Compresseur de chrome (`CapacityBooster…`, emplacement Système d'exploitation) | **+40 à +70** selon le palier | ✅ | `tweaks/items/cyberware/system_replacement/capacity_booster.tweak` ; courbe `cyberware_curves/capacity_booster_to_humanity` |
| Maximum absolu de la stat | 450 | ✅ | `tweaks/stats/cyberware_stats.tweak`, record `Humanity` (`max = 450`) |

Repère utilisé par l'interface pour la longueur de la jauge (pas une limite de jeu) :
`max(courbe power_level_to_humanity) + 20 + 50 + 54 + 15 + 70 + 40` —
`scripts/cyberpunk/UI/fullscreen/ripperdoc/ripperdoc.script`, `GetMaxCapacityPossible`, l. 1662-1673.

### Capacité utilisée (stat `HumanityAllocated`)

| Règle | Confiance | Source |
|---|---|---|
| Chaque implant a **un coût fixe** donné par sa variante (`Variants.HumanityXXCost`), **le même pour tous les paliers** | ✅ | `tweaks/items/cyberware/variants/variants.tweak` ; données : `capacityCost` dans `cyberware.json` |
| Perk « Cyberbricoleuse » niveau 2 (`Tech_Central_Milestone_2`) : **−20 %** sur les implants dont la variante est « …TinkererVariant » (squelette et système tégumentaire uniquement). Ex. 35 → 28 | ✅ | `variants.tweak` (`Humanity35CostTinkererVariant` : 35 − 7 × `CyberwareTinkererStat`) ; `tech_new_perks.tweak` l. 292-319 ; texte du perk niveau 2 |
| Capacité libre = `Humanity − HumanityAllocated` (+ bonus Edgerunner, §3) | ✅ | `player_base_stats.tweak` l. 1842-1854 (`HumanityAvailable`) |
| Pour installer un implant, il faut une capacité libre ≥ son coût | ✅ | `ripperdoc.script` `GetCapacityHoverEventData` l. 2081-2101 ; `player.script` `GetItemCapacityRequirement` l. 3483-3501 |
| En remplaçant un implant, la variation = coût du nouveau − coût de l'ancien | ✅ | `ripperdoc.script` l. 2086-2094 |

### Dépassement de capacité

| Règle | Confiance | Source |
|---|---|---|
| **Sans** le perk « Edgerunner » : impossible de dépasser (zone de la jauge verrouillée, état `Unsafe_Locked`) | ✅ | `scripts/cyberpunk/UI/fullscreen/ripperdoc/ripperdocMeterCapacity.script`, `GetState` l. 342-349 |
| Si la capacité devient négative (ex. après une remise à zéro des perks), le jeu **retire automatiquement** des implants : d'abord ceux des zones autres que jambes/visage/mains/bras/système d'exploitation, puis les jambes | ✅ | `player.script`, `OnRetrofixOverallocatedCyberwareEvent` l. 3798-3851 |
| Impossible de revendre un perk de capacité si la capacité libre ne suffit plus | ✅ | `scripts/cyberpunk/systems/playerDevelopmentSystem.script`, `CanSellNewPerk` l. 3942-3980 |

---

## 3. Perk « Edgerunner » (`Tech_Master_Perk_3`)

| Règle | Confiance | Source |
|---|---|---|
| **+50** de capacité libre au-delà du maximum (zone « surcharge ») | ✅ | `tech_new_perks.tweak` l. 2357-2371 |
| Santé max × (1 − `EdgerunnerHealthReduction`) | ✅ | idem l. 2386-2392 |
| `EdgerunnerHealthReduction = 0,5 × (1 / HumanityOverallocationPossible) × 0,5 × HumanityOverallocated` → avec 50 points possibles : **−0,5 % de santé max par point dépassé** (−25 % à +50) | 🟡 | idem l. 2372-2385 ; recoupé avec le texte du perk (« −0,5 % de santé max par point ») |
| Effet « Fureur » en combat (chance par point dépassé) : hors calcul de build | ✅ | idem l. 2394+ ; texte du perk |

---

## 4. Paliers de qualité

| Règle | Confiance | Source |
|---|---|---|
| 11 paliers : Commun, Commun+, Inhabituel, Inhabituel+, Rare, Rare+, Épique, Épique+, Légendaire, Légendaire+, Légendaire++ | ✅ | `tweaks/items/quality/quality.tweak` |
| Stat `Quality` : 0 (Commun) à 4 (Légendaire) ; stat `IsItemPlus` : 0, 1 (« + ») ou 2 (« ++ ») | ✅ | idem (`*QualityModifier`, `PlusModifier`, `PlusPlusModifier`) |
| Les stats d'un implant varient avec le palier via des modificateurs `valeur × Quality` et `valeur × IsItemPlus`. Ex. Modificateur de douleur Épique : armure 28 + 20×3 + 20×0 = **88** | ✅ | ex. `tweaks/items/cyberware/integumentary_system/integumentary_system_advanced.tweak` l. 4906+ |
| Les effets (OnEquip) sont redéfinis palier par palier (ex. −6 % → −7 % de dégâts subis) | ✅ | idem |
| Améliorer un implant = passer au record `nextUpgradeItem` (coût : `CyberwareBaseUpgradeCosts` × `upgradeCostMult`) | ✅ | `tweaks/items/cyberware/base_values.tweak` |
| Le coût en capacité **ne change pas** avec le palier | ✅ | vérifié sur les 129 familles par `node extract/verify-rules.mjs`. Seule exception : « Militech Paraline » (`AdvancedBaseLowEnergyDeck`), un regroupement de cyberdecks non vendus en boutique, où un palier coûte 20 au lieu de 14 |

---

## 5. Stats secondaires (pièce `StatsShard`)

Chaque implant 2.x a une pièce interne qui porte des stats secondaires.

| Règle | Confiance | Source |
|---|---|---|
| Stats « statiques » = `valeur × StaticModifierMultiplier`, où ce multiplicateur dépend du palier : 2 / 2 / 2,2 / 2,4 / 2,6 (Quality 0 → 4) | ✅ | `tweaks/items/cyberware/variants/modifiers.tweak` (`CyberwareStaticStatModifier`) ; `base_values.tweak` (`CyberwareStatsShardStatic`) ; courbe `cyberware_curves/quality_to_static_modifier_multiplier` |
| Les modificateurs « …Toggle » ne s'activent qu'avec le perk « Mise à jour des pilotes » (`Tech_Central_Perk_2_1`) : multiplicateur × `DriverUpdatePerkFlag` | ✅ | `modifiers.tweak` (`CyberwareStatModifierToggle`) ; commentaire de la stat : « Adds one more secondary modifier to all cyberwares » (`tweaks/stats/flags_values.tweak`) |
| Les modificateurs « …QualityToggle » sont multipliés par `QualityRequirementMetFlag` = Quality de l'implant ; c'est une stat-drapeau, donc probablement 0 en Commun et 1 au-delà | 🟡 | `modifiers.tweak` (`CyberwareStatModifierQualityToggle`) ; `base_values.tweak` ; type `StatFlag` (`flags_values.tweak`) — **à vérifier en jeu** |
| « Boost » : +10 % (Cyberbricoleuse niv. 1) et +10 % (Pro du chrome niv. 1) sur toutes les stats secondaires (`SecondaryModifiersAdditiveMultiplier`) | ✅ | `modifiers.tweak` (`CyberwareStatModifierBoost`) ; `tech_new_perks.tweak` l. 263-290 et 939-967 |
| Les stats « …ModifierHelper » sont converties en vraies stats (ex. `ItemArmorModifierHelper` → `ItemArmor` → `Armor`, `CarryCapacityModifierHelper` → `CarryCapacity`) | ✅ | `tweaks/items/cyberware/variants/modifier_groups.tweak` (`TransferCyberwareModifiersToItem`) ; `Items.ItemArmorToArmor` |

---

## 6. Squelette : slots et versions « renforcées »

| Règle | Confiance | Source |
|---|---|---|
| 3e slot du squelette : perk « Pro du chrome » (`Tech_Central_Milestone_3`) niveau 3 | ✅ | `tweaks/items/cyberware/cyberware_equipment_areas.tweak` |
| Avec ce perk au niveau 3, chaque implant du squelette est remplacé par sa version `sideUpgradeItem` (les records « …2 », aux stats améliorées) ; sans le perk, la version normale | ✅ | `scripts/core/gameplay/effectors/custom/powerUpCyberwareEffector.script`, `PowerUpCyberwareInSlot` l. 32-64 ; texte du perk niveau 3 |
| « Pro du chrome » niveau 2 : +40 d'armure | ✅ | `tech_new_perks.tweak` l. 968-996 |
| 2e slot des mains : perk « Ambidextre » (`Tech_Central_Perk_3_2`) | ✅ | `cyberware_equipment_areas.tweak` |
| 2e slot du visage : débloqué par une quête (fait `cw_mask_slot_unlocked`), caché tant qu'il est verrouillé | ✅ | idem |

Données : `sideVariant` dans chaque palier de `cyberware.json` ; `slots.json`.

**Doublons** : un même implant ne peut pas être installé dans deux emplacements (règle du jeu, constatée en jeu par l'utilisateur) ; le choisir dans un autre emplacement le déplace.

---

## 7. Armure et réduction des dégâts

| Règle | Confiance | Source |
|---|---|---|
| Armure du joueur = somme de l'armure des implants (+ perks, + compétence Tech) × (1 + `ArmorMultBonus`) | ✅ (modificateurs) / 🟡 (somme via `EquipOnPlayer`) | `player_base_stats.tweak` l. 58-68 ; `player_proficiency_passives.tweak` (`tech_ability_skill_to_armor`) |
| Dégâts reçus × **1 / (1 + armure × k × `ArmorEffectivenessMultiplier`)** ; un coup réduit fait au minimum 1 dégât | ✅ | `scripts/cyberpunk/damage/damageSystem.script` l. 2641-2693 ; même formule pour l'affichage : `ripperdoc.script`, `UpdateArmorBar` l. 1686-1696 |
| `ArmorEffectivenessMultiplier` dépend du « niveau de puissance » : 1 (≤ 9), 0,69 (12-17), 0,35 (20-25), 0,24 (≥ 28), linéaire entre ces points | ✅ | `player_base_stats.tweak` l. 70-75 ; courbe `player_armorEffectiveness/player_powerLevelToArmorEffectivenessMultiplier` |
| `k` (« effective health per armor point ») est donné par le moteur (`GetArmorEffectivenessValue`). Les constantes candidates sont 0,003 (Histoire, Facile) et 0,004 (Difficile, Très difficile) | ❓ | `scripts/core/systems/statsDataSystem.script` l. 28 (fonction native) ; `tweaks/…/static_data/rpg_constants.tweak` (`Constants.DamageSystem`) — **à vérifier en jeu** |
| « Niveau de puissance » du joueur = courbe `player_levelToPowerLevel(niveau)` | ✅ (lien) / ❓ (valeurs) | `player_base_stats.tweak` l. 14-19 ; **courbe non trouvée dans les archives extraites** |
| Repère « armure max pour ce niveau » affiché par la jauge : courbe `cyberware_curves/max_armor_for_level` (75 au niv. 1 → 1500 au niv. 50) | ✅ | `ripperdoc.script` l. 1692-1693 |
| Santé de base selon le niveau de puissance : 100 → 345 (niv. 50) → 395 (niv. 60) | ✅ | `player_base_stats.tweak` l. 21-26 ; courbe `player_powerLevelToDefensiveStats/player_powerLevelToHealth` |

---

## 8. Bonus liés aux attributs (« Sensible à… »)

| Règle | Confiance | Source |
|---|---|---|
| Beaucoup d'implants ont un bonus proportionnel à un attribut du joueur (ex. Modificateur de douleur : −0,1 % de dégâts subis par point de Sang-froid) | ✅ | `tweaks/items/cyberware/attunements/attunements.tweak` ; package `Attunements.*` dans `onEquip` |
| `AttunementHelper` sert **uniquement à l'affichage** (« Total actuel : … ») ; l'effet réel est dans les stats du package `Attunements.*` | ✅ | `tweaks/stats/cyberware_stats.tweak` (commentaire de `AttunementHelper`) |
| Certains bonus sont « texte seulement » (ex. `Attunements.ReflexesArmsDamageTextOnly`) : l'effet réel est un modificateur de l'implant lui-même (ex. lames Mantis : DPS × (1 + 0,005 × Réflexes)) | ✅ | `tweaks/items/cyberware/arms/arms_cyberware_advanced.tweak` l. 47-67 |

---

## 9. Bras (lames Mantis, bras de gorille, monocâble, lance-projectiles)

| Règle | Confiance | Source |
|---|---|---|
| Ce sont des **armes** : leurs dégâts viennent de groupes de stats (`statModifierGroups`) | ✅ | `tweaks/items/cyberware/arms/mantis_blades.tweak` l. 143-146 |
| DPS de base (ex. lames Mantis : **70**) × courbe de qualité 1 / 1,3 / 1,85 / 2,57 / 3,4 (Quality 0 → 4) | ✅ | `mantis_blades.tweak` (`MantisBlades_Damage_Stats`) ; `tweaks/items/weapons/melee/bases/base_melee.tweak` l. 66-71 ; courbe `quality_curves/quality_to_dps_multiplier_new` |
| Bonus « + » : `DPS` en `AdditiveMultiplier` × `ItemPlusDPS` | ✅ | `base_melee.tweak` l. 73-99 |
| Dégâts par coup = DPS × (1 / `AttacksPerSecondBase`) × multiplicateurs (ex. ×0,977 pour les lames Mantis) × (1 + 1 % × `BonusDamagePerHit`) | ✅ | `base_melee.tweak` l. 259-278 ; `mantis_blades.tweak` l. 483-486 |

Les modificateurs de ces groupes sont maintenant exportés (`statModifierGroups` dans chaque palier). Le calcul complet
des dégâts se fera avec le moteur de stats du site (§1).

---

## 10. Prix et améliorations

| Règle | Confiance | Source |
|---|---|---|
| Prix d'achat = (Σ additifs : prix de base 1000) × Π multiplicateurs : qualité (`price_curves/quality_to_price_mult`) × « + » (`plus_to_price_multiplier`) × cyberware 0,4 × coût en capacité (`cyberware_curves/*_humanity_to_price_mult`), arrondi. Ex. : Éditeur de douleur Niveau 4 = 71 820 €$ | ✅ (facteurs et règle de combinaison §1) / ❓ (arrondi exact du code natif `CalculateBuyPrice`) | `items/prices/*.tweak` ; `Items.Cyberware.buyPrice` |
| Remise de réputation : prix × (1 − 1 % × `street_cred_to_vendor_discount`(réputation)), courbe en escalier de 0 % (réputation 1) à 15 % (réputation 50) | ✅ (non appliquée sur le site : la réputation ne change pas le build, le site montre le prix de base) | `player_level_up_curve.curveset` ; `BuyPrice_StreetCred_Discount` |
| Amélioration au palier suivant (via `nextUpgradeItem`) : floor(`upgradeCostMult` × `Items.CyberwareBaseUpgradeCosts.<palier visé>`) composants ; variante `_CoreCW` pour les paliers « + » des implants `isCoreCW` | ✅ | `rpgManager.script` (`GetCyberwareUpgradeCost`) |
| Type de composant = qualité du palier visé sans « + » (`Items.CommonMaterial1` … `Items.LegendaryMaterial1`) ; aucune somme en eddies (`moneyRequired` n'est jamais rempli) | ✅ | `rpgManager.script` (`GetCraftingMaterialRecord`) |

---

## 11. Mise à jour des pilotes et choix des stats

| Règle | Confiance | Source |
|---|---|---|
| Mise à jour des pilotes : ajoute la stat « Toggle » de chaque implant (déjà calculée) | ✅ | `DriverUpdatePerkFlag`, `modifiers.tweak` (`*Toggle`) |
| Choix des stats à l'amélioration (perk « Connaissance des puces », `Tech_Inbetween_Right_2`, sauf système d'exploitation) : option 1 = stats actuelles ; option 2 (et option 3 si le palier visé est au moins Niveau 3) = pièce `Items.CyberwareStatsShard<qualité>` tirée au hasard | ✅ | `rpgManager.script` (`ShouldShowCWChoice`, `GetCyberwareUpgradeData`) ; texte du perk (LocKey#89130) |
| Qualité de la pièce aléatoire selon la valeur du palier visé : ≥ 8 Légendaire, ≥ 6 Épique, ≥ 4 Rare, ≥ 2 Peu commun, sinon Commun | ✅ | `rpgManager.script` |
| Nombre de stats de la pièce : courbes `quality_to_number_of_simple/advanced/specialized_modifiers` (Commun 1 simple ; Peu commun 2 simples ; Rare 2 avancées ; Épique et Légendaire 1 avancée + 1 spécialisée) + 1 tirage du groupe « pilotes » (`statModsLimit = 1`) ; une même stat ne sort qu'une fois (`drawBasedOnStatType`) | ✅ | `cyberware_curves.curveset` ; `variants/modifier_groups.tweak` |
| Valeur de chaque stat aléatoire : tirée entre `min` et `max` du modificateur `*Random` (tirage « contrôlé » natif), × bonus des stats secondaires (Cyberbricoleur / Pro du chrome) → affichée en plage, non comptée dans les totaux | ✅ (plages) / ❓ (valeur exacte : aléatoire) | `variants/modifiers.tweak` (`CyberwareRandomStatModifier`, `CyberwareStatModifierBoost`) |
| Groupe « pilotes » : ses entrées « Toggle » multiplient la stat par `DriverUpdatePerkFlag` (0 sans Mise à jour des pilotes) | ✅ (règle) / ❓ (effet exact du tirage non simulé) | `variants/modifiers.tweak` (`CyberwareStatModifierToggle`) |
| Fenêtre d'amélioration : fiche actuelle (cadre cyan) → flèche → options (cadre rouge, l'option choisie en doré avec coin) ; un seul bouton « Améliorer » + coût sous l'option choisie ; « Annuler » en bas à droite. Fiche : nom, palier, « Matériel cybernétique », capacité + armure, effets, bloc « Sensible à… » (titre + icône de l'attribut), stats, prix | ✅ (disposition d'après le jeu) / ❓ (icônes capacité / armure redessinées) | capture du jeu ; textes LocKey#1883, #6863, #15481 ; titre du bonus = `name` du paquet `Attunements.*` |

| Fenêtre d'amélioration, comportement : survoler une option la sélectionne et le bouton glisse dessous (0,3 s, Sinusoidal/EasyOut) ; il faut **maintenir** le clic 0,5 s (`upgrade_cyberware`) — son `ui_menu_item_crafting_start`, relâché trop tôt `…_fail`, validé `…_done` ; intro (fiches qui partent du centre, 0,3 s Quintic) et sortie (fiche choisie au centre, balayage, ≈ 2,1 s) | ✅ | `ripperdocTokenPopup.script` ; `r6/config/inputContexts.xml` ; `ripperdoc_token_popup_animations.inkanim` |
| Stats « liées au palier » (`*QualityToggle`) : actives à partir du Niveau 2 — `QualityRequirementMetFlag` = Quality de l'implant (drapeau 0/1) | ✅ (confirmé, n'est plus une hypothèse) | `items/cyberware/base_values.tweak`, `variants/modifiers.tweak` |

---

## 11 bis. Textes et icônes de l'infobulle

| Règle | Confiance | Source |
|---|---|---|
| Mots en surbrillance : couleur `TooltipText.cyberwareDescriptionHighlightColor` → `MainColors.MildOrange` (239, 162, 72), demi-gras | ✅ | `common/tooltip/tooltip_style.inkstyle`, `main_colors.inkstyle` |
| Touches dans les textes (`<Input actionName=…>`) : touches PC par défaut — Saut = Espace, MeleeAttack = clic gauche, UseCombatGadget = clic molette, IconicCyberware = E, QuickMelee = Q | ✅ | `r6/config/inputUserMappings.xml`, `inputContexts.xml` |
| Icônes : capacité = `mappin_icons#ripperdoc`, armure = `mappin_icons#armor`, prix = `atlas_cash#cash_symbol_normal`, « Sensible à… » = `UIIcon.<attribut>` (`attributes_icons#ico_ref`…) | ✅ | `cyberware_tooltip_modules.inkwidget`, `ripperdoc.inkwidget`, `ui/attributes.tweak` |
| Police : Rajdhani (`fonts/raj`), 36–42 px en 4K → ≈ 18–21 px en 1080p | ✅ | `cyberware_tooltip_modules.inkwidget` |

---

## 12. Vérification contre la base du jeu

`node extract/verify-game.mjs` relit la base compilée que le jeu charge (`r6/cache/tweakdb_ep1.bin`, lue par
`extract/lib/tweakdbBin.mjs`) et la compare, pour **chaque palier de chaque implant**, à nos données : palier,
amélioration (multiplicateur, palier suivant), nom et description (clés de texte, par palier), liste des modificateurs
de prix, modificateurs de stats (stat, type, valeur, stat de référence, courbe), effets (texte, valeurs affichées,
stats appliquées), coût en capacité, stats secondaires. Il contrôle aussi ce que le site affiche : textes dans les
12 langues, valeurs non remplies, prix manquants ou incohérents, bonus d'attribut calculables.

Résultat actuel : **1 101 paliers, 74 500 valeurs comparées, 0 différence**.

Corrections faites grâce à cette vérification :
- valeurs d'effet ajoutées à un modèle (`floatValues +=`, ex. Biomonitor : 50 et X au lieu de X seul) ;
- modificateurs « modèle + valeur » des bras (lames Mantis, bras de gorille, monocâble) ;
- multiplicateur d'amélioration par défaut (1) des tatouages ;
- noms propres à chaque palier (Berserk, Sandevistan… : 13 familles) ;
- chances de statut et bonus aux tests des bras (courbes `quality_to_debuff_application_rate_on_melee`,
  `quality_to_strong_arm_skillcheck_bonus`) ;
- paliers non obtenables retirés (en dessous du premier palier vendu, valeurs à 0 dans le jeu) ;
- cyberdecks des builds d'ennemis (`Normal_` / `Hard_` / `VHard_`, cités seulement par `progression_builds`) retirés ;
- description « !OBSOLETE » du jeu non affichée.

Limites (non vérifiables par cette base) :
- la formule de combinaison du prix et les courbes sont celles du jeu, mais le calcul final est natif (§10) ;
- 5 implants non vendus et cités nulle part dans la TweakDB sont marqués « Obtention inconnue »
  (récompense de quête dans les fichiers de quête, non analysés, ou contenu coupé) ;
- quand une valeur manque dans les données du jeu elles-mêmes, le site affiche « ? » (ex. temps de recharge du Tampon de surmenage).

---

## Ce qui reste à vérifier en jeu

1. La constante `k` de l'armure selon la difficulté (§7), et la courbe `player_levelToPowerLevel`.
2. La valeur réelle de `QualityRequirementMetFlag` pour un implant Rare ou au-delà (§5) : est-ce 1, ou la valeur de Quality ?
3. Si les niveaux d'un même perk se cumulent (ex. « Pro du chrome » niv. 3 garde-t-il les +10 % du niv. 1 ?). Le moteur le gère en natif ; les textes le laissent penser.

Une méthode simple : comparer 2 ou 3 builds du site avec l'écran du charcudoc en jeu (capacité, armure, santé).

---

## 13. Infos communautaires (hors fichiers du jeu)

Seule exception à la règle « tout vient du jeu » : la façon d'obtenir 7 implants non vendus, absente des fichiers.
Elle est relevée sur des wikis / guides (novembre 2026), affichée avec le badge « Obtention : … » (info communautaire)
et le lien de sa source (`COMMUNITY_SOURCES`, `extract/build-site-data.mjs`) :
plaque faciale (récompense Phantom Liberty), Kiroshi Mk.1 (Viktor, « The Ripperdoc »), Militech Paraline (cyberdeck de départ),
tatouages Johnny (« Chippin' In ») et Tyger Claws (« The Gig »), Inducteur (Game8, page peut-être antérieure à la 2.0),
« Burnout Buffer » (introuvable : probablement retiré du jeu).

---

## 14. Survol des jauges (RipperdocBarTooltip)

| Règle | Confiance | Source |
|---|---|---|
| Jauge de capacité : « Cyber-capacité » utilisé / max, description du jeu, « Avantages augmentant la cyber-capacité » : Edgerunner et Dépassement des limites (achetés ou non) | ✅ | `ripperdocBarTooltip.script` ; `cyberdecktooltip.inkwidget` (LocKey 88306, 92541, 92566) |
| Cadenas de surcharge : infobulle « Edgerunner » ; avec dépassement : dépassé de N, santé max réduite, chances de Fureur = dépassement × 0,1 % | ✅ (règles) / ❓ (santé : affichée en %, le jeu montre des PV — la santé max de V n'est pas calculée) | idem (92565, 92567, 92568) |
| Jauge d'armure : « Armure » total / max du niveau, description, phrase de réduction des dégâts, « Pro du chrome (Niveau 2) » ; seuls Squelette, Système tégumentaire et Jambes restent visibles | ✅ / ❓ (le % de réduction utilise `GetArmorEffectivenessValue`, constante du moteur illisible → « ? ») | `ripperdoc.script` (OnBarHover, UpdateArmorBar) ; LocKey 40290, 92542, 93545, 92569 |
