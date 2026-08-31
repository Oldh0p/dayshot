# ONE SHOT — Game & Product Design Document

**Version 1.0 — 31 août 2026**
*"One shot. Every day. No second chances."*

Un jeu quotidien pour Reddit (Devvit Web). Une tentative par jour. Un score. Un classement. Un rituel.

---

## Comment lire ce document

Il répond aux 50 points demandés, regroupés en 9 parties, puis se termine par la **SPEC POUR CLAUDE CODE**. Convention pour toute fonctionnalité dépendant de Reddit :

- ✅ **Officiellement supporté** (vérifié dans la doc / les repos officiels Reddit, sources en Partie VIII)
- ⚠️ **À vérifier** au moment du build (la doc bouge vite)
- 💡 **Idée produit** (rien à voir avec une feature Reddit)

| Points | Partie |
|---|---|
| 1–4 (avis critique, forces, risques, modifications) | I |
| 5–11 (boucle, tir, physique, score, Perfect, seed, modifiers) + 45 | II |
| 12, 20, 21, 22, 47 (streak, practice, progression, cosmétiques, récompenses) + 46 | III |
| 13–17, 43, 44, 48 (leaderboards, Cup, social Reddit, viral, partage, cartes) | IV |
| 18, 19, 23–28, 49 (écran résultat, onboarding, DA, mascotte, animations, audio, layout) | V |
| 29–34 (écrans, états UI, edge cases, risques) | VI |
| 35–42, 50 (à ne pas faire, MVP, V1, V2, A/B, métriques, D1/D3, CTR, décision finale) | VII |
| État de la plateforme Devvit (vérifié) | VIII |
| SPEC POUR CLAUDE CODE | IX |

---

# PARTIE I — ANALYSE CRITIQUE

## 1. Mon avis sur le concept

Le concept est fondamentalement bon, et il est bon pour une raison précise : il transpose l'insight de Wordle (**rareté quotidienne + résultat comparable + conversation partagée**) sur le terrain où Reddit est imbattable — **l'identité tribale des communautés**. Wordle n'avait pas d'équipes. Reddit EST des équipes. C'est l'angle que personne n'a encore vraiment exécuté proprement sur Devvit, et c'est celui qui peut faire de ONE SHOT autre chose qu'un énième mini-jeu.

Mais le concept, tel qu'écrit, a un défaut structurel qu'il faut regarder en face : **Wordle est un puzzle qu'on finit ; ONE SHOT est un geste qu'on rate.** Une partie de Wordle dure 3 minutes et se termine presque toujours par une victoire. ONE SHOT, tel que décrit (jauge auto-oscillante + un tap), dure 800 millisecondes de gameplay réel et peut se terminer par un 12.40 sur un mistap. Si le rituel quotidien peut être *ruiné en une frame*, la boucle d'habitude meurt de frustration, pas d'ennui. Tout mon travail ci-dessous consiste à garder la promesse brutale du « one shot » tout en éliminant les morts injustes. La tension doit venir de l'enjeu, jamais de l'interface.

Deuxième vérité inconfortable : le fantasme « chaque subreddit installe le jeu et s'affronte » se heurte à la réalité de la distribution Devvit. Les apps sont installées **par des modérateurs**, et le stockage Redis est **cloisonné par installation** (✅ vérifié, Partie VIII). Un classement mondial réparti sur 50 subreddits n'est pas la façon dont la plateforme fonctionne naturellement. La bonne architecture sociale, c'est **un subreddit-maison unique (r/OneShotGame) où tout le monde joue, et où chacun *représente* son subreddit** — l'équipe est une affiliation déclarée, pas une installation. C'est plus simple, plus robuste, et ça rend la Community Cup possible dès la V1 au lieu de la rendre dépendante de l'adoption par des mods tiers.

## 2. Ce qui est très bon (à ne surtout pas toucher)

- **Une seule tentative.** C'est l'identité du jeu. Chaque proposition qui l'affaiblit (retry payant, seconde chance) doit être refusée à vie.
- **Le même challenge pour toute la planète.** C'est ce qui crée la conversation (« le vent d'hier était criminel ») et rend le fil de commentaires du post quotidien vivant sans production de contenu.
- **Le score décimal sur 100.** Contrairement au hit/miss binaire, un 61.40 est toujours un résultat, jamais un échec total. Et 98.73 vs 98.71, c'est un classement sans ex-æquo — parfait pour un leaderboard.
- **Le percentile comme feedback principal.** « Top 8.4% » rend un joueur moyen fier. C'est l'arme anti-churn des joueurs qui ne seront jamais top 100.
- **La génération par seed déterministe.** Zéro contenu manuel, anti-triche vérifiable côté serveur, jours mémorables gratuits.
- **La règle « Fun first. Metrics follow. »** et « 5 mécaniques excellentes plutôt que 50 features ». Je m'y tiens dans tout ce document.

## 3. Ce qui risque de ne pas fonctionner

1. **Le tap sur jauge auto-oscillante.** Un tap accidentel (poche, scroll, notification) = journée détruite. Inacceptable pour un jeu dont la promesse est « un seul essai ».
2. **La session de 10–30 s… qui n'en fait que 3.** Si le joueur ouvre, tape, ferme, il n'y a pas de *moment*. Le rituel a besoin d'une montée dramatique (lecture des conditions, respiration, hold) pour que le tir soit un climax et pas un réflexe.
3. **Le premier jour d'un nouveau joueur.** Son tout premier geste, sans aucune connaissance de la physique, serait son score classé. Un 23.10 au premier essai = désinstallation mentale. C'est le plus gros risque D1 du concept.
4. **La Community Cup « moyenne des membres ».** Toute formule per-capita fait qu'un joueur faible *nuit* à son équipe (« ne joue pas, tu baisses notre moyenne » = anti-viral). Toute formule par somme fait gagner les gros subs automatiquement. Il faut des **divisions par taille de participation** (détail Partie IV).
5. **La distribution multi-subreddits comme moteur viral initial.** Dépend de mods tiers, fragmente les données (Redis par installation), et retarde le lancement. Ce doit être une phase 3, pas le plan de lancement.
6. **La triche.** Un jeu de timing web pur ne peut pas rendre la triche *impossible* (le client contrôle son input) — seulement inintéressante, détectable et sans échelle. Il faut l'assumer dans le design (Partie VI).
7. **Le nom.** « OneShot » est un jeu indépendant connu (Steam, 2016) dans la même catégorie. Risque de confusion / marque à vérifier avant tout lancement public. Alternatives en réserve : *One Shot Daily*, *Dead Center*, *One Try*. Je garde ONE SHOT comme nom de travail dans ce document.

## 4. Les modifications que je fais (et pourquoi)

| # | Décision | Remplace | Pourquoi |
|---|---|---|---|
| M1 | **Hold-to-aim, release-to-shoot.** La jauge n'oscille que pendant l'appui ; le tir part au relâchement. Un tap < 120 ms est ignoré. | Tap sur jauge auto-oscillante | Même skill (timing de précision), zéro mistap, tension incarnée (on *tient* physiquement son tir), le joueur choisit son moment. |
| M2 | **Warm-up Shot le tout premier jour** : un tir d'échauffement clairement marqué « doesn't count », puis « Now for real. One shot. » | Aucun tutoriel du tout | C'est le tutoriel *qui est le jeu* : 15 s, tout est compris, et le premier score classé est un choix éclairé. Protège la D1. Jamais répété ensuite. |
| M3 | **Practice = rejouer les conditions du jour** (après le tir officiel), pas des seeds aléatoires | Practice aléatoire | Transforme la frustration en détermination : « j'ai fait 71, je viens de faire 98 en practice → demain je le tiens ». C'est un moteur de retour, pas une soupape. |
| M4 | **Équipe = subreddit auto-déclaré dans le jeu** (« Rep your sub »), jeu hébergé dans un subreddit-maison | Installation dans chaque subreddit | Compatible avec le cloisonnement Redis par installation (✅), Cup jouable dès la V1, zéro dépendance aux mods tiers. Les installations multi-subs deviennent une phase de croissance ultérieure. |
| M5 | **Cup en ligue à divisions** (par nombre de participants hebdo) avec promotion/relégation, score d'équipe = moyenne du top 10 du jour | Duel « moyenne vs moyenne » | Un joueur de plus ne peut jamais nuire à son équipe ; un sub de 40 joueurs peut être champion de sa division ; récits « montée/descente » gratuits chaque semaine. |
| M6 | **Deux paliers de gloire : BULLSEYE (score ≥ 99, ~1–3 % des joueurs) et PERFECT (100.00, ~0,1 %)** | Un seul Perfect | Le Bullseye est le screenshot fréquent qui alimente les commentaires ; le Perfect reste l'événement légendaire. |
| M7 | **Streak = avoir tiré**, pas avoir bien tiré | (implicite) | On récompense la présence, jamais la performance — sinon anxiété et churn. |
| M8 | **Teaser du lendemain sur l'écran de résultat** (« Tomorrow: TINY TARGET 😬 ») | — | Le seed de demain est déjà connu du serveur. Coût : une ligne. Effet : la meilleure raison de revenir est affichée au moment exact où la motivation est maximale. |
| M9 | **Cible au sol (tapis de bullseye en fausse perspective) sur un plateau à hauteur variable**, distance mesurée sur l'axe du sol | Cible verticale flottante | Lisible en portrait, physique plus simple (un seul point d'atterrissage), l'écart au centre se *voit* (la balle roule à 6 px du centre), et la hauteur du plateau reste un paramètre quotidien. |
| M10 | **Jour = jour UTC unique pour toute la planète** | (non spécifié) | Un seul leaderboard cohérent, un seul moment de reset mondial, pas de fuite de solution entre fuseaux. Le compte à rebours s'affiche en heure locale. |

Tout le reste du brief est conservé tel quel.

---

# PARTIE II — LE CŒUR DU GAMEPLAY

## 5. La boucle de gameplay exacte, seconde par seconde

*Session quotidienne type d'un joueur existant (~20 s) :*

| t | Ce qui se passe | Ce que ressent le joueur |
|---|---|---|
| 0.0 s | Le post ONE SHOT apparaît dans le feed : splash avec le n° du jour, le modificateur, le compteur de tirs mondial. Tap. | « C'est l'heure. » |
| 0.5 s | La scène se révèle : Pip (la mascotte-projectile) se met en place sur le lanceur avec un petit rebond. Le décor du jour (palette + météo) s'installe. | Reconnaissance instantanée du jeu. |
| 1.5 s | **Lecture des conditions**, animées une par une : `🌬 WIND +18 →` (la flèche pulse), `DIST 640`, `⛰ HIGH PERCH`. Les particules de vent traversent l'écran dans le bon sens. | Phase de *planification* : « vent de face fort, il faut charger plus. » |
| 3–10 s | Idle. `HOLD TO AIM` respire en bas. Le joueur peut prendre son temps (regarder le vent, respirer). 🔥 streak et « 41 203 shots so far » visibles discrètement. | Montée de l'enjeu. Aucune pression de timer. |
| ~10 s | **Touch down.** La jauge (arc autour du lanceur) se met à osciller (onde triangulaire, période 1,4 s). Pip s'accroupit (squash d'anticipation). Son : montée cyclique. Le monde se désature légèrement. | Concentration totale. Le pouce tient la vie du jour. |
| ~12 s | **Release.** Micro-freeze 60 ms → détente. Pip part avec un « POP » satisfaisant, screen-shake 4 px, traînée. La caméra suit l'arc avec un léger zoom. Le vent siffle et *pousse visiblement* la trajectoire. | Le climax. 1,2–1,6 s de vol où tout se joue. |
| ~13.5 s | **Approche.** Si la projection d'atterrissage est ≤ 30 u du centre : slow-motion 0,25× pendant 250 ms + zoom sur le tapis. | « Non… non… OUI— » |
| ~13.8 s | **Impact.** Poof de poussière, Pip rebondit une fois, roule, s'arrête. Un marqueur tombe du ciel sur le point exact. Ligne pointillée jusqu'au centre : `6.4 from center`. | Verdict physique, lisible, incontestable. |
| 14–17 s | **Score count-up** 0 → 98.73 (600 ms, easing out) pendant que le serveur confirme. Puis la cascade : `TOP 4.2% TODAY` (pill), `#184 GLOBAL`, `🔥 12 DAY STREAK` (+1 avec flamme qui pop). | La récompense sociale, servie dans l'ordre émotionnel. |
| 17–20 s | CTA : `[POST MY SHOT]` (primaire) · `Practice` (secondaire). En bas : `Tomorrow: MOON GRAVITY 🌙 — new shot in 09:14:52`. | « Je partage ? Je m'entraîne ? … Demain, gravité lunaire ?! » |
| Sortie | Le joueur commente, ou ferme. S'il rouvre le post plus tard : il retombe directement sur son écran de résultat + practice. | Boucle fermée, rendez-vous pris. |

*Première visite à vie :* insérer avant tout ça l'écran `ONE SHOT — One attempt. Every day.` → `WARM-UP (doesn't count)` → tir d'échauffement complet → `That was practice. This one counts.` → boucle normale. Durée totale premier jour : ~45 s.

## 6. Le fonctionnement précis du tir

- **Input unique : press & release**, n'importe où sur l'écran (plein écran tactile = jouable au pouce, gaucher ou droitier).
- Au **touch down**, la jauge démarre à 0 et oscille en **onde triangulaire** (montée et descente linéaires — une sinusoïde ralentit aux extrêmes et fausse la lecture) : `power(t)` va de 0 → 1 → 0, période **1 400 ms**.
- Au **release**, `power` est échantillonné et le tir part immédiatement. C'est la seule décision du jeu.
- **Anti-misfire** : si la durée d'appui est < 120 ms sur le *premier* contact du tir officiel, l'input est annulé et un hint apparaît (« Hold… then release »). Ne s'applique qu'une fois (sinon exploitable pour « scanner » la jauge).
- **Pas de limite de hold.** Tenir 20 secondes est un choix légitime (on apprend le rythme de la jauge). Après 8 s, léger pulse visuel pour la vie du monde, aucune pénalité. La compétence du jeu est double : *lire les conditions* (quelle puissance vise-t-on ?) et *exécuter le timing* (relâcher au bon point du cycle).
- **Angle fixe par jour** (paramètre du seed, 38°–62°). Le joueur ne contrôle que la puissance : un seul input, mais l'optimum se déplace chaque jour — l'expertise (« avec ce vent, je relâche juste après le pic ») est réelle et se construit sur des semaines.
- La jauge est pilotée par `performance.now()` (temps réel), jamais par le compteur de frames : la vitesse d'oscillation est identique sur un iPhone 17 et un Android de 2019.

## 7. La physique simplifiée recommandée

Balistique 2D de masse ponctuelle, à pas fixe, sans moteur physique externe (~40 lignes de code, partagées client/serveur).

- **Espace logique** : 1000 unités de large × 1600 de haut (portrait), origine en bas à gauche. Tout le rendu est un scale de cet espace.
- **État** : position `(x, y)`, vitesse `(vx, vy)`.
- **Lancement** : `v0 = V_MIN + power × (V_MAX − V_MIN)`, direction = angle du jour. Le vecteur `(cos θ, sin θ)` est calculé **une fois** à l'init puis **arrondi à 6 décimales** — on évite ainsi toute divergence d'implémentation des fonctions trigonométriques entre moteurs JS ; la boucle de simulation elle-même n'utilise que `+ − × ÷`.
- **Intégration** : Euler semi-implicite, `dt = 1/120 s` fixe :
  `vx += windAx·dt ; vy += −G·dt ; x += vx·dt ; y += vy·dt`
- **Vent** : accélération horizontale constante `windAx` (jours normaux) ; les jours *Gusty*, `windAx(t) = base + amp × gustTable[...]` où `gustTable` est une table de 16 valeurs pré-générée par le PRNG du seed, interpolée linéairement — déterministe, zéro trigo à l'exécution.
- **Atterrissage** : le sol est à `y = 0`, sauf sur le plateau de la cible (`x ∈ [D − 140, D + 140]`) où il est à `y = H`. L'impact est le premier pas où la balle croise le sol effectif ; le point exact est interpolé linéairement dans le pas de temps. La face du plateau (mur vertical en `x = D − 140`, hauteur `H`) arrête la balle : impact « CLIFF » (gros écart, petit score, moment comique).
- **Métrique** : `dx = |x_impact − D|` (distance horizontale au centre du tapis). Overshoot et undershoot sont symétriques.
- **Déterminisme** : même code TypeScript importé par le client et le serveur (`/shared/sim.ts`). Mêmes inputs entiers (`holdMs`, `dayNumber`) → même trajectoire au bit près (doubles IEEE 754, opérations arithmétiques pures, ordre d'opérations identique). Le serveur reste néanmoins autoritaire (Partie VI).
- **Coût** : vol ≤ 2 s = ≤ 240 itérations. Re-simulation serveur : négligeable.

Défauts de base (recalibrés ensuite par simulation, voir TUNABLES en spec) : `G = 1700 u/s²`, `V_MIN = 900`, `V_MAX = 1900 u/s`, vent ∈ [−420, +420] u/s², `D ∈ [520, 880]`, `H ∈ [0, 420]`, rayon du tapis `R = 60`.

## 8. Le calcul du score

Le barème est un **choix produit** : il façonne la distribution des émotions. Objectifs : médiane mondiale ~72–80 (la masse se sent « pas mal »), ~25 % au-dessus de 90, ~1–3 % de Bullseye, ~0,1 % de Perfect, et une vraie granularité en haut (98.73 ≠ 98.91).

Barème en trois zones (sur `dx`, en unités logiques) :

1. **Zone Perfect** — `dx ≤ 4` : **score = 100.00**, événement PERFECT.
2. **Sur le tapis** — `4 < dx ≤ 60` : `score = 100 − 13 × ((dx − 4) / 56)^1.35`. Donne ~99.1 à dx = 12 (seuil Bullseye), ~95.4 à dx = 30, 87.0 au bord du tapis. Toute la dramaturgie du haut de tableau vit ici.
3. **Hors tapis** — `60 < dx ≤ 660` : `score = 87 × (1 − ((dx − 60) / 600)^0.75)`, plancher à 0. Un tir raté à 300 u donne encore ~44 : un chiffre, pas une humiliation.
4. **Cas spéciaux** : impact CLIFF → score de la zone 3 sur le `dx` du point d'impact (donc faible), badge d'impact « SPLAT » ; balle sortie de l'espace (x > 1000 au sol) → score 0, mention « OFF THE MAP » (les 0 doivent être drôles, jamais punitifs).

Affichage : arrondi à 2 décimales, plus la distance brute (`6.4 from center`) pour l'ancrage physique. Égalités départagées au classement par l'horodatage de soumission (premier arrivé devant). **Étalonnage** : avant le lancement, une simulation Monte-Carlo (bots avec erreur de timing gaussienne σ = 30–60 ms sur le release) valide la distribution cible et ajuste les constantes — jamais à la main en prod.

## 9. Le Perfect Shot

- **Définition** : `dx ≤ PERFECT_RADIUS` (défaut 4 u ≈ le « pixel doré » au centre du tapis). Score forcé à 100.00. Déterministe, vérifiable serveur, incontestable.
- **Rareté cible** : 0,05–0,3 % des tirs selon le jour. Elle **varie avec la difficulté du jour**, et c'est voulu : « il n'y a eu que 3 Perfects sur Tiny Target Day » fabrique de la légende. Un jour à zéro Perfect mondial est un événement, pas un bug.
- **La célébration** (à ne déclencher que là — la rareté de la mise en scène EST la récompense) :
  1. Freeze-frame 250 ms à l'impact, flash blanc 80 ms.
  2. Zoom sur le tapis, onde de choc dorée, confettis physiques (60 particules max, mobile-safe).
  3. Stinger audio dédié (le seul moment du jeu avec une fanfare).
  4. Tampon `🎯 PERFECT SHOT` qui claque sur l'écran avec un shake.
  5. Ligne de rareté : `Only 38 of 42,617 players hit a Perfect today.`
  6. Badge permanent au profil + compteur (`Perfects: 2`), et le jour est marqué à vie dans son historique.
- **Bullseye** (score ≥ 99) : version réduite — impact doré, jingle court, tampon `BULLSEYE`, pas de confettis. C'est le « bon screenshot » hebdomadaire du joueur régulier ; le Perfect reste l'affiche.
- L'écran de résultat d'un Perfect est composé pour être screenshoté : score massif, date, n° du jour, modificateur — un trophée autoportant.

## 10. Le Daily Seed

- `dayNumber = floor(unixTimeUTC / 86400)` — le n° affiché est `dayNumber − LAUNCH_DAY + 1` (le jeu s'ouvre sur « ONE SHOT #1 »).
- `seed = hash32("oneshot:" + dayNumber)` (xmur3 → **mulberry32**, PRNG 32 bits déterministe, ~10 lignes, aucune dépendance).
- Le PRNG tire dans l'ordre fixe : modificateur du jour (table pondérée) → distance `D` → hauteur `H` → vent de base → angle → table de rafales (si Gusty) → variation de palette. **L'ordre des tirages est gelé à vie** (le changer casserait la reproductibilité de l'historique).
- Client et serveur génèrent le niveau indépendamment du même `dayNumber` : rien à synchroniser, rien à stocker par niveau, et le serveur peut re-vérifier n'importe quel tir passé.
- Le seed de demain étant connu, le **teaser** (M8) et la pré-annonce des jours Extreme sont gratuits.
- La journée du leaderboard = journée UTC (M10). Un tir est rattaché au `dayNumber` **du serveur au moment de la soumission** ; si le jour a tourné entre le chargement et le tir, le client reçoit `DAY_ROLLED` et recharge le nouveau challenge (edge case, Partie VI).

## 11 & 45. Les Daily Modifiers — les dix retenus

Tous sont **des valeurs de paramètres**, pas des systèmes : un seul moteur, dix ambiances. Coût : S = trivial (paramètre), M = un peu de code/art dédié.

| # | Nom | Effet | Coût | Note |
|---|---|---|---|---|
| 1 | **Clear Skies** | Conditions de base, vent faible | S | Le « jour sans » qui fait ressortir les autres |
| 2 | **Crosswind** | Vent de face fort (−300 à −420) | S | Le classique détesté-adoré |
| 3 | **Tailwind** | Vent arrière fort (+250 à +400) | S | Piège inverse : l'overshoot |
| 4 | **Gusty** | Rafales (table seedée, ±40 % autour de la base) | S | Le jour « injuste » dont on parle |
| 5 | **Moon Gravity** | G × 0,55, arcs lents et hauts | S | Le plus beau à regarder |
| 6 | **Heavy Ball** | G × 1,5, Pip en fonte (sprite + son sourds) | M | Feeling radicalement différent |
| 7 | **Tiny Target** | R × 0,5 (tapis de 30 u) | S | Le jour des légendes |
| 8 | **Long Shot** | D × 1,35, caméra dézoomée | S | Tout le monde sous-estime |
| 9 | **High Perch** | H ∈ [300, 420], cible perchée | S | La verticalité du format portrait |
| 10 | **Golden Day** | Purement cosmétique : palette or, badge du jour doré | M | Dimanche rituel, zéro impact gameplay |

**Cadence hebdomadaire fixe** (la texture de la semaine est une feature) : lundi Clear Skies (reprise douce), mardi–jeudi un modificateur simple, **vendredi EXTREME DAY** (combo de 2, pré-annoncé la veille — le seul jour à double modificateur), samedi libre, **dimanche Golden Day**. Un seul modificateur majeur par jour partout ailleurs, comme demandé.

---

# PARTIE III — MÉTA & RÉTENTION

## 12. Le streak

- **Règle** : le streak compte les jours UTC **consécutifs avec un tir officiel**. La qualité du tir est sans importance (M7) — on célèbre la présence, jamais la performance. Un 14.20 fait monter le streak exactement comme un 99.80.
- **Affichage** : `🔥 12` en permanence dans le coin de jeu ; +1 animé sur l'écran de résultat (la flamme pop). À la perte : jamais de culpabilisation. Copy : `Streak reset. Longest: 17 🔥 — Day 1 starts now.` Le record de streak (« longest ») est conservé à vie et affiché : la perte n'efface pas l'accomplissement.
- **Streak Shield** 💡 (V1, pas MVP) : la protection unique demandée, dans sa version la plus simple viable — **1 shield maximum en stock, gagné automatiquement à chaque palier de 14 jours consécutifs, consommé automatiquement et silencieusement au premier jour manqué**. Au retour : `🛡 Your shield saved your streak.` Aucun menu, aucune décision, aucun achat, impossible d'en accumuler. Si les données montrent que ça complexifie la lecture, on le retire — le système fonctionne sans.
- **Urgence douce** : quand il reste < 4 h dans la journée UTC et que le joueur n'a pas tiré, le splash du post passe en état `⏳ 3h 41m left — 38,412 have taken their shot` (⚠️ mise à jour dynamique du splash à vérifier, sinon état affiché à l'ouverture). Jamais de notification-spam : l'urgence vit dans le produit, pas dans les DM.

## 47. Les dix récompenses de streak

Toutes cosmétiques/statutaires (règle absolue : rien qui touche au gameplay). Débloquées à vie, même si le streak casse ensuite.

| Palier | Récompense |
|---|---|
| 3 | Badge **Ember** (première flamme au profil) |
| 7 | Skin de balle **Comet** (traînée bleutée) |
| 14 | Trail **Ion** + déblocage du Streak Shield |
| 30 | Cadre de score animé **Blaze** + titre `Regular` |
| 50 | FX d'atterrissage **Shockwave** |
| 100 | Skin **Centurion** (balle dorée) + titre `Centurion` |
| 150 | Fond de scène exclusif **Afterglow** |
| 200 | Aura d'idle (Pip scintille pendant la visée) |
| 300 | Trail **Supernova** |
| 365 | Set **Eternal** (skin + cadre + titre) + nom gravé sur la page *Hall of Flame* du subreddit-maison |

## 20. Le mode Practice

- **Déblocage** : uniquement **après** le tir officiel du jour. Avant, il n'existe pas à l'écran — le premier geste de la journée est toujours le vrai (le rituel reste intact).
- **Contenu** : rejoue **les conditions exactes du jour** (M3), en illimité. C'est un mode « et si ? » : comprendre son erreur, chercher le tir parfait, se calibrer pour demain.
- **Garde-fous anti-cannibalisation** :
  - Filigrane `PRACTICE` permanent + palette légèrement désaturée + score en italique : un screenshot de practice est visuellement impossible à faire passer pour un officiel.
  - Aucun leaderboard, aucun badge, aucun streak, aucun partage intégré depuis la practice. On y garde une seule stat privée : `Practice best today: 98.2 (in 14 tries)` — le carburant du « demain je le tiens ».
  - Le Perfect en practice déclenche une mini-célébration (sinon frustration) mais pas le badge ni le compteur.
- **Ghost personnel** : en practice, la trajectoire du tir *officiel* du jour s'affiche en fantôme — on rejoue littéralement contre soi-même.
- V2 éventuelle : « Random Range » (seeds aléatoires) si les données montrent une demande. Pas avant.

## 21. La progression

Le principe : **un nouveau venu a exactement les mêmes chances de Perfect qu'un vétéran de 300 jours** — la progression est un vestiaire et un palmarès, jamais un avantage. Trois axes, tous gratuits :

1. **Le palmarès personnel** (l'historique comme progression) : page « My Shots » — calendrier des jours joués (à la GitHub), best score, moyenne 30 jours, nombre de Bullseyes/Perfects, longest streak, meilleur rang. La courbe de sa propre moyenne qui monte est LA progression du joueur skillé.
2. **Le vestiaire** (cosmétiques de streak et d'exploits, listés ci-dessus + Partie III.47) : skins de Pip, trails, FX d'impact, cadres, titres. Équipables depuis l'écran de résultat (`Locker`, V1).
3. **Le statut communautaire** : flair automatique dans le subreddit-maison (`🔥 47` ou `🎯 PERFECT ×2`) ⚠️ (API flair à vérifier) — le statut se voit dans *tous* ses commentaires du sub, pas seulement en jeu.

Rythme de déblocage pensé pour les 4 premières semaines : badge à J3, skin à J7, trail à J14, cadre + titre à J30 — il y a toujours un palier visible à ≤ 7 jours pendant le premier mois (la fenêtre où la rétention se joue).

## 22. Les cosmétiques futurs (architecture, pas roadmap)

Prévoir dès le MVP un champ `equipped: { ball, trail, impact, frame, title }` et un catalogue `cosmetics.json` (id, slot, rareté, source d'obtention). Slots : **balle** (recolor + face de Pip), **trail**, **FX d'impact**, **cadre de carte de résultat**, **titre**, plus tard **thème de scène** et **emote de résultat**. Sources : streak, exploits (Perfect, top 1 %, participation Cup), événements saisonniers, et — bien plus tard — achats (Partie VII). Contraintes : tout cosmétique est un recolor/particule léger (< 10 Ko), jamais un asset lourd ; rien n'altère la lisibilité de la jauge, du vent ou du tapis ; rien n'est équipable qui puisse masquer l'information de jeu.

## 46. Les dix événements spéciaux rares

Occasionnels, pré-annoncés, mémorables. Coût S/M comme avant.

| # | Événement | Quoi | Coût |
|---|---|---|---|
| 1 | **Perfect Storm** | L'Extreme Day ultime : 3 modificateurs, annoncé 48 h avant, badge de participation | S |
| 2 | **Midnight Shot** (31 déc) | Palette feu d'artifice, chaque impact déclenche des fusées | M |
| 3 | **Anniversary #365** | Reprise du seed du jour #1, stats « un an de ONE SHOT », badge | S |
| 4 | **10M Shots Day** | Déclenché au compteur mondial : confettis pour tous, bannière | S |
| 5 | **Eclipse Day** | Scène plongée dans le noir, cible luminescente | M |
| 6 | **Backwards Day** (1er avril) | Tir de droite à gauche, monde en miroir | M |
| 7 | **Cup Finals Week** | Dernière semaine de saison de ligue : bannières de division, doublure du récap | S |
| 8 | **Meteor Shower** | Pluie d'étoiles en fond (décoratif pur) un soir aléatoire | M |
| 9 | **Retro Day** | La scène passe en pixel-art 1-bit pour 24 h (skin global) | M |
| 10 | **Leap Day** (29 fév) | Le jour « bonus » : Golden + badge quadriennal `I was there` | S |

Aucun événement ne donne d'avantage de gameplay ; tous donnent au maximum un badge. Deux par mois grand maximum — la rareté est la valeur.

---

# PARTIE IV — SOCIAL & VIRAL

## 13. Les leaderboards

Quatre vues, une hiérarchie claire : **le quotidien d'abord**, l'historique en arrière-plan.

1. **Global Daily** (MVP) — le classement du jour. Affichage : Top 3 (podium), puis **la fenêtre du joueur** : `#182 … #183 · #184 YOU 98.73 · #185 …` — le joueur se voit toujours en contexte, jamais perdu en page 47.
2. **Subreddit Daily** (V1) — même écran filtré sur son équipe. C'est le classement où un joueur moyen peut réellement briller (`#7 in r/gaming`).
3. **Communautés** (V1) — la ligue (ci-dessous).
4. **Friends/Following** — ⚠️ il n'existe pas d'accès simple au graphe social de l'utilisateur côté Devvit à ma connaissance ; à re-vérifier, mais **hors roadmap** : le subreddit EST le cercle social pertinent sur Reddit. Ne pas construire.

**L'UX du joueur moyen** (le vrai enjeu du point 13) : la ligne de tête de son résultat n'est jamais le rang brut mais le **percentile** — `TOP 8.4% · Better than 91.6% of players today`. S'y ajoutent deux comparaisons toujours gagnables : `vs your 30-day avg: +6.2` (se battre soi-même) et le rang dans son sub (piscine plus petite). Un joueur à la médiane mondiale doit repartir avec au moins une ligne verte. Historique : conservé mais discret — un onglet `All-time` (somme des percentiles ? non : simplement *best score*, *Perfects*, *longest streak*) ; le jeu ne doit jamais donner l'impression qu'un retard de 6 mois est irrattrapable, et avec un classement centré sur le jour, il ne l'est pas.

## 14. La Community Cup 💡

Le format : une **ligue hebdomadaire à divisions**, pas des duels (M5).

- **Équipe** : à la première visite (après le premier tir officiel, pas avant — ne jamais mettre de friction avant le premier moment de jeu), le jeu propose `REP YOUR SUB` : champ libre + suggestions des équipes existantes. L'affiliation est déclarative, changeable 1 fois par mois (anti-mercenariat). Une équipe « Unaffiliated » accueille ceux qui passent.
- **Score d'équipe du jour** = **moyenne des 10 meilleurs scores de l'équipe ce jour-là** (minimum 5 participants pour marquer). Un joueur de plus ne peut mathématiquement jamais nuire ; recruter est toujours bon.
- **Semaine** (lundi → dimanche UTC) : les scores quotidiens s'additionnent → classement de division.
- **Divisions par participation** (le correctif d'équité central) : les équipes sont réparties chaque semaine selon leurs participants uniques de la semaine précédente — **Division Ember** (5–29 joueurs), **Division Blaze** (30–199), **Division Inferno** (200+). Un sub de 40 mordus ne rencontre jamais r/gaming ; il peut être *champion d'Ember*, monter, raconter sa montée.
- **Promotion / relégation** : top 2 montent, bottom 2 descendent (dans la limite des seuils de taille). Les récits « r/mechmarket monte en Blaze » s'écrivent tout seuls chaque lundi.
- **Affichage en jeu** : une ligne sur l'écran de résultat (`r/gaming is #3 in Inferno · your 98.73 counts today ✓`) — le joueur voit que SON tir a compté pour l'équipe (s'il est dans le top 10 du jour, la ligne le dit : `You're scoring for r/gaming today 🏅`).
- **Récap hebdo** : chaque lundi, le scheduler publie un post récap dans le subreddit-maison (champions, montées, descentes, stats du jour le plus dur) ✅ (submitPost par l'app + scheduler).

## 15. Les mécaniques sociales Reddit

Tout est conçu pour vivre *dans* les mécaniques natives de Reddit (posts, commentaires, flairs) plutôt qu'à côté :

- **Le post quotidien est le jeu ET le watercooler** ✅ : un custom post `ONE SHOT #247 — 🌬️ Crosswind` créé à 00:00 UTC par le scheduler dans le subreddit-maison. Les commentaires sous le post sont la conversation du jour.
- **Commentaire épinglé d'amorce** ✅ (submitComment par l'app) : l'app poste et épingle `Day #247 — Crosswind −380. Post your score below. Yesterday's hardest day in 3 weeks: only 1 Perfect.` — une question d'ouverture calibrée chaque jour par règle simple (record battu, jour dur, etc.), zéro rédaction manuelle.
- **Partage en un tap = commentaire** ✅ (`asUser: SUBMIT_COMMENT`, avec consentement explicite) : le bouton `POST MY SHOT` publie la carte-texte du joueur en commentaire du post du jour, en son nom. C'est le Wordle-share, mais *au bon endroit* : là où les autres joueurs sont déjà.
- **Flairs de statut** ⚠️ (API setUserFlair à vérifier) : streak et Perfects affichés en flair dans le subreddit-maison. Le statut suit le joueur dans toutes ses conversations.
- **Le subreddit-maison comme produit** 💡 : r/OneShotGame n'est pas un support, c'est le club — Hall of Flame (wiki des Perfects), récaps de ligue, threads de stratégie des jours Extreme. S'abonner au sub = s'abonner au jeu (le post du jour arrive dans le feed ✅ mécanique Reddit native).
- **Upvotes comme métrique sociale gratuite** : le post du jour qui performe dans r/all est le meilleur canal d'acquisition possible ; tout le design du splash (Partie V) vise ça.

## 16. Les viral loops

Trois boucles, par ordre de mise en route :

**Boucle 1 — La carte dans le feed (dès le MVP)**
Le joueur tire → poste sa carte en commentaire / la partage ailleurs → un lecteur voit un objet intrigant et auto-descriptif (`🎯 98.73 · Top 4.2% · 🔥12` + grille-cible) → tap sur le post → warm-up → premier tir → il a un score, un percentile… et un teaser pour demain. Le partage est naturel parce que le *résultat* est l'objet social (comme Wordle), pas parce qu'on récompense l'invitation.

**Boucle 2 — La fierté d'équipe (V1)**
Le joueur voit `r/coffee #4 in Ember — 2 shooters short of scoring today` → il poste dans r/coffee (de lui-même, avec un texte prêt-à-coller fourni *sur demande* : `r/coffee is 2 players short of scoring in today's ONE SHOT cup — [link]`) → des membres viennent tirer en repping r/coffee → l'équipe marque → la montée de division est célébrée dans le récap → plus de membres s'affilient. Le recrutement est intrinsèque : chaque joueur supplémentaire aide *mathématiquement* (top 10, jamais de malus).

**Boucle 3 — La rivalité désignée (V1.5)**
Chaque semaine, la ligue crée des « derbies » naturels (équipes voisines au classement). L'app met en avant UN derby (`⚔ Derby of the week: r/coffee vs r/tea — 2 pts apart`) → screenshots, trash-talk bon enfant dans les commentaires → la communauté d'en face vient défendre. Aucun spam sortant : la rivalité est *affichée*, jamais *envoyée*.

Anti-patterns explicitement bannis : « invite 5 amis », récompenses de parrainage, posts automatiques dans des subs tiers, DM de relance. La croissance passe par des objets qu'on a *envie* de montrer.

## 17 & 48. Le système de partage et trois cartes exemples

Principe : une carte **reconnaissable en 1/4 de seconde, intrigante, et qui ne spoile jamais la solution** (le % de puissance n'apparaît nulle part).

**Format A — La ligne (MVP, pour commentaires et copier-coller universel) :**
```
🎯 ONE SHOT #247 · 98.73 · Top 4.2% · 🔥 12
```

**Format B — La grille-cible (MVP, le « Wordle grid » de ONE SHOT) :** une cible 5×5 en émojis, où ⚫ marque la case d'impact réelle du joueur (droite = overshoot, gauche = undershoot — lisible, unique par joueur, spoiler-free) :
```
ONE SHOT #247 🌬️−380
🟦🟦🟥🟦🟦
🟦🟥🟨🟥🟦
🟥🟨🎯⚫🟥
🟦🟥🟨🟥🟦
🟦🟦🟥🟦🟦
98.73 · Top 4.2% · 🔥12
r/gaming · Inferno #3
```

**Format C — La carte image (V1)** ⚠️ (upload media par l'app à vérifier — permission `media` existe ✅) : 1200×630, fond nuit du jour, la trajectoire du joueur en trait lumineux, score énorme, badge du modificateur, équipe, streak. Pour le cross-post et le hors-Reddit.

Le bouton principal `POST MY SHOT` publie le Format B en commentaire (asUser ✅, consentement demandé la première fois puis mémorisé) ; un bouton `Copy` couvre tous les autres usages. Les scores de practice n'ont **aucun** bouton de partage.

## 43. Ce qui peut pousser une communauté à installer le jeu

(Phase 3 — quand le jeu aura prouvé sa rétention dans le subreddit-maison.)

- **Le pitch mod en une phrase** : « Un post par jour, généré tout seul, qui fait revenir vos membres quotidiennement et affronte les autres subs — zéro travail de modération. » Les mods veulent de l'activité récurrente sans charge : ONE SHOT est exactement ça.
- **Un mode « satellite »** 💡⚠ : l'installation dans un sub tiers crée le post quotidien localement, mais les scores rejoignent la ligue globale (nécessite de vérifier les options de données inter-installations — sinon, le satellite affiche et redirige). À ne concevoir qu'après validation plateforme.
- **La demande vient des joueurs, pas de nous** : quand ≥ 30 joueurs actifs rep le même sub, le jeu le signale à l'équipe (`r/coffee has 34 daily shooters — a mod can bring ONE SHOT home`) avec un texte de demande courtois que *les joueurs* choisissent d'envoyer à leurs mods. Nous ne contactons jamais un sub à froid.
- **Kit mod prêt-à-l'emploi** : page d'explication, FAQ modération, engagement « aucune donnée, aucun spam, désinstallable en un clic ».

## 44. Transformer les rivalités en croissance organique sans spam

Quatre règles :
1. **La rivalité est affichée dans le jeu, jamais poussée hors du jeu.** Le derby de la semaine, les montées/descentes, le récap : tout vit dans le subreddit-maison et sur l'écran de résultat. Ce sont les joueurs qui exportent.
2. **Donner des munitions, pas des canons** : des textes prêts-à-coller uniquement sur action volontaire du joueur (`Share to your sub`), jamais de post automatique dans un sub tiers, jamais de mention automatisée d'une autre communauté.
3. **Faire des perdants de bons perdants** : la relégation est racontée comme un cliffhanger (`r/tea drops to Blaze — revenge arc starts Monday`), jamais comme une humiliation. Les rivalités durables sont des feuilletons, pas des exécutions.
4. **Respect strict des règles Reddit sur l'auto-promotion** : la croissance inter-subs passe par les membres qui parlent de leur équipe dans leurs propres communautés, selon les règles desdites communautés. C'est plus lent et beaucoup plus solide.

---

# PARTIE V — PRÉSENTATION : DA, MASCOTTE, ÉCRANS, AUDIO

## 18. L'écran de résultat idéal

C'est l'écran le plus important du jeu (d'accord avec le brief) : c'est à la fois le paiement émotionnel, l'objet de partage et le rendez-vous de demain. Hiérarchie descendante, une seule colonne, la scène figée (avec la trajectoire fantôme du tir) en fond légèrement assombri :

```
┌──────────────────────────────┐
│  (scène figée + trajectoire)  │
│                               │
│          98.73               │  ← count-up, corps 96, poids 800
│      🎯 6.4 from center       │  ← l'ancre physique, corps 15
│                               │
│   ▛ TOP 4.2% TODAY ▟          │  ← pill accent, corps 22 — LA ligne
│                               │
│   #184 Global · #7 r/gaming   │  ← corps 15, apparait à +400ms
│   🔥 12 DAY STREAK  (+1 pop)  │
│   r/gaming #3 in Inferno ✓    │  ← « ton tir a compté »
│                               │
│  ┌──────────────────────────┐ │
│  │      POST MY SHOT        │ │  ← CTA unique dominant
│  └──────────────────────────┘ │
│     Practice  ·  Copy card    │  ← secondaires, texte
│                               │
│  Tomorrow: MOON GRAVITY 🌙    │
│  Next shot in 08:42:17        │
└──────────────────────────────┘
```

Règles : le score et le percentile arrivent en **cascade** (300 ms d'écart) — la lecture est un petit récit, pas un tableau. Un seul CTA dominant. Le compte à rebours est en bas, calme (l'urgence habite le splash du feed, pas cet écran de victoire). Si Bullseye/Perfect : le tampon vient AVANT le score. Au retour dans la journée, ce même écran est l'accueil (avec `Practice` remonté en visibilité).

## 19. L'onboarding

Quasi inexistant, comme demandé — trois écrans qui sont déjà le jeu :

1. `ONE SHOT` / `One attempt. Every day.` (1,5 s, auto)
2. Scène + `WARM-UP — this one doesn't count` + `HOLD TO AIM` qui respire. Le joueur tire. Résultat d'échauffement minimal (score + distance, pas de rang).
3. `That was practice. Now for real.` / `ONE SHOT — make it count.` → boucle normale.

Après ce premier jour : plus jamais d'écran d'explication. Le seul enseignement permanent est environnemental : la flèche de vent, la distance, `HOLD TO AIM`. Un lien discret `?` ouvre un sheet d'une phrase (`Hold to charge, release to shoot. Closest to center wins. One official shot per day.`) — pour les archéologues.

## 23. Trois directions artistiques

**A — « Kinetic Minimal » (flat premium nocturne).** Formes plates franches, dégradé de ciel nocturne qui change avec le modificateur du jour, silhouettes de décor en 2 plans de parallaxe, typographie géante, lumière du tapis comme point focal. Tout le « premium » vit dans le mouvement (squash & stretch, easing soignés, particules) et le son, pas dans le détail des assets. Poids quasi nul (formes canvas/vecteur), theming quotidien automatisable par palette, lisibilité mobile maximale. Références de sensation : Alto's Odyssey, Monument Valley, Holedown.

**B — « Pixel Heritage » (pixel-art moderne 2×).** Sprites nets sur fond sombre, cible néon, tradition r/place — culturellement très Reddit, GIF-able. Risques : plus difficile de paraître « premium » qu'« amateur » sans un pixel-artist expérimenté, chiffres décimaux moins élégants en petit, theming quotidien plus coûteux (chaque variation = des sprites).

**C — « Paper Toy » (papier découpé).** Couches de papier texturé, ombres portées douces, chaleur artisanale, très screenshotable. Risques : textures = poids, theming automatique difficile, production d'assets réelle, et le rendu « craft » vieillit vite s'il n'est pas exécuté parfaitement.

## 24. La direction retenue : Kinetic Minimal (A)

Parce qu'elle maximise exactement les contraintes du brief : identifiable dans le feed en une fraction de seconde (le dégradé nocturne + le halo du tapis + Pip = une signature), poids minimal, theming par seed gratuit (le modificateur du jour EST la palette du jour : Crosswind = ciel d'acier strié, Moon = indigo profond + grosse lune, Golden = or), et le budget « premium » est investi là où l'œil le perçoit vraiment : l'animation et l'audio. B reste la carte « Retro Day » (événement #9) — le meilleur des deux mondes.

## 49. Palette / UI / style visuel

Une proposition de tokens (le thème *de base* ; chaque modificateur décline les 3 premiers) :

| Token | Hex | Usage |
|---|---|---|
| `night.900` | `#0D1626` | Fond bas de ciel |
| `night.700` | `#1E3A5C` | Fond haut de ciel (dégradé) |
| `ground` | `#0A0F1A` | Sol / silhouettes |
| `ink` | `#F2F6FC` | Texte, score, jauge |
| `ember` | `#FF6B4A` | Accent : CTA, percentile, flamme streak, anneau central |
| `gold` | `#FFC53D` | Bullseye, Perfect, Golden Day |
| `mist` | `#8DA3BF` | Texte secondaire, labels |
| `danger-free` | — | Pas de rouge d'erreur dans le jeu : un mauvais score n'est pas une erreur |

Typographie : **une seule famille**, « Space Grotesk » (ou équivalent geometric à forte personnalité), graisse 700–800 pour les scores/titres, 500 pour le reste ; chiffres tabulaires pour le count-up et le countdown. Échelle : 12 / 15 / 22 / 34 / 56 / 96. UI : coins 14 px, épaisseurs franches, aucune ombre portée molle — la profondeur vient de la couleur, pas du blur. Accessibilité : contraste AA partout, le vent est toujours **flèche + valeur numérique** (jamais couleur seule), `prefers-reduced-motion` remplace shakes et slow-mo par des fondus.

## 25. La mascotte : Pip, la balle vivante 💡

**Le personnage EST le projectile.** Une sphère charbon (`#2A3242`) avec deux grands yeux et une ligne de bouche — c'est tout. Pourquoi c'est le bon choix :

- **L'empathie est intégrée au gameplay** : on ne lance pas un objet, on lance *quelqu'un*. Le squash d'anticipation, la terreur ravie en vol, les étoiles dans les yeux après un crash, les lunettes de soleil après un Perfect — chaque état émotionnel de Pip est un état de jeu.
- **Coût d'animation minimal** : un cercle + deux yeux se rig en rien ; squash & stretch = transform scale ; toutes les expressions = les yeux et la bouche.
- **Skinnable à l'infini** : recolors, chapeaux, faces (Comet, Centurion, Eternal…) sans toucher au sprite de base.
- **Silhouette-logo** : le cercle à deux yeux au centre d'une cible = l'icône du jeu, lisible à 16 px, sans rien devoir à Snoo.

États de Pip : idle (respiration, cligne), aim (accroupi, joues gonflées), flight (étirement + yeux plissés dans le vent), impact-good (étoile de joie), impact-bad (spirale d'étourdissement, se relève, hausse les épaules — le raté doit être *attendrissant*), perfect (lunettes + pose). Alternatives considérées et écartées : archer (rig coûteux, projectile sans âme), canon-robot (le personnage ne vit pas le résultat), blob-ressort (trop proche d'un existant). Le nom « Pip » est court, international, et sonne comme l'impact ; alternatives : Otto, Boulet (marché FR).

## 26. Les animations importantes (le budget « juice », par priorité)

1. **Anticipation** : squash de Pip + jauge qui pulse au rythme de l'oscillation — le hold doit être *vivant*.
2. **Release** : micro-freeze 60 ms → pop de détente + shake 4 px / 90 ms. Le tir doit claquer.
3. **Vol** : étirement de Pip selon la vitesse, traînée, particules de vent qui frôlent, caméra à léger zoom-suivi (jamais de pan qui perd la cible de vue).
4. **Slow-mo d'approche** (si atterrissage projeté ≤ 30 u du centre) : 0,25× pendant 250 ms — LE moment de cœur qui s'arrête.
5. **Impact** : poof de poussière proportionnel à la vitesse, rebond unique, roulis d'arrêt, marqueur qui tombe + ligne pointillée vers le centre.
6. **Count-up du score** + cascade des lignes de résultat (300 ms d'intervalle).
7. **Flamme de streak** qui pop en +1.
8. **Perfect** : la séquence complète (Partie II.9) — la seule animation « maximale » du jeu.
Tout le reste (transitions d'écrans, boutons) : sobres et rapides (150–250 ms). Un seul moment orchestré par écran.

## 27. Le sound design

Petit set (≤ 14 sons, < 200 Ko total, déclenché après le premier geste utilisateur — contrainte autoplay mobile), mais chaque son a un rôle narratif :

| Moment | Son | Intention |
|---|---|---|
| Ouverture | Nappe d'ambiance très basse + vent léger | « Le monde t'attendait » |
| Hold | Tonalité qui monte/descend **en glissando avec la jauge** | Le son EST l'information de timing (jouable les yeux fermés) |
| Release | « Pop » sec, corps rond | La détente physique |
| Vol | Sifflement doux, hauteur liée à la vitesse ; le vent souffle dans son sens | Feedback continu |
| Slow-mo | Filtre passe-bas + battement de cœur discret | Suspension |
| Impact sol | Thud mat + poussière | Poids |
| Impact tapis | Thud + « toc » de tapis tendu | On sent la différence |
| Near miss (60 < dx ≤ 90) | Petit « whiff » descendant | La grimace audible |
| Bullseye | Jingle 3 notes montantes + shimmer | Fierté |
| **Perfect** | Stinger dédié (le seul « gros » son du jeu) | Légende |
| Streak +1 | Craquement de flamme + tick | Rituel |
| Nouveau record perso | Carillon court | Progression |
| UI | Ticks feutrés | Discrétion |
| Countdown < 10 s (si visible) | Rien. | On ne stresse pas. |

Mix : jamais de musique en boucle (le jeu vit dans un feed, la musique fatigue en 3 jours) ; l'« instrument » du jeu est l'ambiance de vent, dont l'intensité reflète le modificateur. Toggle son mémorisé, coupé par défaut si le device est en silencieux (⚠ détection limitée sur le web : proposer le toggle visiblement à la première session).

## 28. Le layout mobile précis

- **Cadre** : portrait, conçu pour ~390 × 700 css-px utiles ; le custom post Devvit s'affiche en carte dans le feed puis en plein écran au lancement — l'entrypoint est configuré `height: "tall"` ✅, et toute l'UI critique doit vivre dans un **safe-area centrale** (le ratio exact de la carte inline variant selon le client Reddit ⚠, le jeu doit être jouable dès 4:5).
- **Zones (de haut en bas)** : ① barre d'état du jour (n° du jour, modificateur, streak, `?`) sur 8 % ; ② la scène sur ~64 % — lanceur en bas-gauche (x≈12 %), cible en zone droite à hauteur variable, **tout l'arc visible sans scroll ni pan** (l'espace logique 1000×1600 est letterboxé, jamais rogné sur l'axe du tir) ; ③ zone d'info basse sur ~28 % : conditions du jour, puis `HOLD TO AIM`, puis (post-tir) le panneau de résultat qui glisse par-dessus.
- **Le geste** : tout l'écran est la gâchette (pas de bouton à viser au pouce) ; aucune UI interactive pendant la visée (le hold ne peut rien toucer d'autre).
- **Un pouce** : tous les CTA post-tir dans le tiers inférieur ; cibles tactiles ≥ 48 px ; pas de gestes secondaires (swipe, pinch) nulle part.
- **Desktop** (minoritaire mais réel) : même scène centrée à 430 px de large, clic = hold. Rien de spécifique.

---

# PARTIE VI — SURFACE PRODUIT & RISQUES

## 29. Les écrans nécessaires

1. **Splash du post** (dans le feed — techniquement la preview/carte du custom post) : logo, n° du jour, modificateur, compteur de tirs, `TAP TO SHOOT` ⚠ (degré de dynamisme à vérifier).
2. **Game** (un seul écran, quatre phases : reveal → aim → flight → impact).
3. **Résultat** (détaillé en V.18) — sert aussi d'écran « déjà joué » au retour.
4. **Leaderboard** (onglet : Global / My Sub (V1) / League (V1) / My Shots).
5. **Practice** (la scène, en habillage practice).
6. **Team picker** (V1, une fois, après le premier tir).
7. **Locker** (V1, équipement des cosmétiques).
8. **Sheet `?`** (une phrase de règles + crédits + toggle son).
9. **États système** : loading (< 1,5 s visé), erreur réseau, `Log in to play` (utilisateur non connecté ⚠ selon contexte client), maintenance.

C'est tout. Neuf surfaces, dont quatre minuscules.

## 30. Les états UI (machine d'états du jour)

`first_visit_ever` → `warmup_aim` → `warmup_result` → `ready` → `aiming` → `in_flight` → `impact` → `scoring_pending` (résultat client affiché en optimiste, confirmation serveur < 1 s) → `result` → (`practice_aim` ⇄ `practice_result`)* → sortie.
Au retour même jour : → `result` directement. Le lendemain : → `ready`.
États transverses : `offline` (bannière + retry), `error_submit` (le tir est conservé localement et re-soumis — le joueur ne peut JAMAIS perdre son tir du jour sur une erreur réseau), `day_rolled` (le jour a changé pendant la session → modal « New day just dropped » → reload du challenge, uniquement si le tir n'était pas parti), `logged_out`, `flagged` (compte signalé anti-triche : joue normalement, exclu silencieusement des classements en attendant revue).

## 31. Les edge cases

- **Rollover pendant la session** : le `dayNumber` de vérité est celui du serveur à la soumission. Si mismatch avec celui du client → `DAY_ROLLED`, pas de tir perdu (il n'était pas parti), rechargement.
- **Double soumission / multi-device** : verrou atomique Redis (`SET NX`) sur `user:{id}:day:{n}` — le premier tir gagne, le second reçoit `ALREADY_PLAYED` et affiche le résultat existant.
- **Horloge client fausse** : le countdown et le jour viennent du serveur (offset calculé au chargement) ; l'horloge locale ne décide de rien.
- **Latence de confirmation** : le score client s'affiche immédiatement (optimiste) avec un micro-spinner sur le rang ; si le serveur diverge (> 0,01), le score serveur remplace avec un léger « recalibrated » — statistiquement rarissime (sim partagée), mais géré.
- **Échec réseau au moment du tir** : l'input (`holdMs`) est mis en file locale et re-soumis agressivement ; le résultat affiché passe en « pending » ; le tir est daté de la *première tentative* de soumission côté client mais validé au jour serveur de réception (fenêtre de grâce 90 s autour du rollover).
- **Compte supprimé/suspendu** : retiré des leaderboards au recalcul suivant.
- **Screenshot de practice** : filigrane + désaturation + score en italique (déjà couvert) — l'anti-fraude sociale est visuelle.
- **Reduced motion / vestibulaire** : shakes, slow-mo et confettis remplacés par fondus ; la jauge reste (c'est le gameplay).
- **Daltonisme** : vent = flèche + nombre ; anneaux du tapis différenciés par valeur (clair/foncé), pas seulement par teinte.
- **Très petits écrans (< 360 px)** : échelle de scène réduite, typographie plancher 12 px, rien ne sort du cadre.
- **Utilisateur non connecté** : les interactions Devvit requièrent un compte ⚠ (comportement exact selon surface à vérifier) → état `Log in to take your shot`, la scène du jour visible en fond (donner envie avant de demander).

## 32. Les risques de triche (et la posture honnête)

Vérité de base : dans un jeu de timing web, le client contrôle son input — un tricheur peut toujours envoyer le `holdMs` optimal. On ne rend pas la triche impossible ; on la rend **sans intérêt, sans échelle et détectable** :

1. **Le serveur calcule le score, toujours** ✅ : le client n'envoie que `holdMs` (entier) ; le serveur re-simule avec le code partagé. Falsifier l'affichage est donc impossible ; la seule triche restante est « envoyer l'input parfait ».
2. **Un tir par jour par compte** (verrou atomique) : la triche ne peut pas se farmer ; son bénéfice max est un rang/jour.
3. **L'optimum n'est pas publié** : trouver le `holdMs` parfait exige de reconstruire la sim — barrière faible pour un dev, réelle pour 99,9 % des gens.
4. **Détection statistique** : monitoring du taux de Perfect global (alerte si > 5× la base), et flag des profils à précision surhumaine récurrente (ex. ≥ 99,9 sur ≥ 5 jours consécutifs) → état `flagged` (exclusion silencieuse des boards + revue). Un seul jour parfait n'est jamais sanctionné : les vrais Perfects existent, c'est le but.
5. **Frictions Reddit natives** : comptes multiples = coût réel côté Reddit ; option (V1, à activer si besoin) d'un âge de compte minimal pour figurer au top 100 global — jamais pour jouer.
6. **Transparence** : une page « fair play » qui assume le modèle. La crédibilité du top 10 est un travail continu, pas une case cochée.

## 33. Les risques liés au gameplay

- **Latence d'input variable selon device** : mitigé par la jauge en temps réel, une période lente (1,4 s), et un barème indulgent au milieu ; à surveiller : corrélation score/plateforme dans les métriques. Si l'iPhone bat structurellement Android de 3 points, ajuster la période, pas le barème.
- **Monotonie de la compétence** (« toujours relâcher au pic ») : c'est le rôle de l'angle quotidien + vent + distance : l'optimum se déplace chaque jour. Surveiller la variance du `holdMs` gagnant entre jours ; si elle s'effondre, élargir les plages de paramètres.
- **Jour raté = journée amère** : mitigé par M1 (pas de mistap), M3 (practice-revanche), le score continu, et Pip qui rend l'échec attendrissant. Métrique sentinelle : rétention D+1 des joueurs ayant scoré < 40.
- **Un jour cassé par le seed** (paramètres dégénérés, ex. cible inatteignable) : garde-fous de génération (plages bornées + test automatique « l'optimum théorique atteint-il ≥ 99 ? » exécuté à la création du post ; sinon re-roll du seed avec sel) — le bug du 14 mars ne doit jamais exister.
- **La physique « triche » perçue** (rafales) : les rafales sont déterministes et *visibles* (particules) ; l'injustice doit toujours être lisible à l'écran.

## 34. Les risques liés à la rétention

- **Le post enterré dans le feed** : c'est LE risque n°1 de tout jeu Devvit. Réponses : abonnement au subreddit-maison poussé au bon moment (après un bon score), heure de publication constante, épinglage, splash irrésistible (Partie VII.42), et le teaser de demain qui crée un rendez-vous mental.
- **Falaise de nouveauté ~J21–J30** : réponses en couches — la cadence hebdo (Extreme vendredi, Golden dimanche), la ligue qui redémarre chaque lundi, les paliers cosmétiques ≤ 7 jours du premier mois, les événements rares. On n'ajoute PAS de mécanique de gameplay pour ça.
- **Perte de streak = churn** : shield (V1), copy déculpabilisant, « longest » conservé, et surtout : le jeu reste excellent à streak 1. Ne jamais construire la valeur *uniquement* sur le streak.
- **Le joueur moyen invisible** : traité par le percentile, le rang de sub, le `vs your avg` — la métrique sentinelle est la rétention D7 du 40e–70e percentile.
- **Dépendance plateforme** : Devvit évolue (APIs, review, surfaces de découverte). Mitigation : coller aux capacités stables (posts, scheduler, redis, comments), isoler tout appel plateforme derrière une couche fine, suivre r/devvit.

---

# PARTIE VII — ROADMAP & BUSINESS

## 35. Les fonctionnalités à NE PAS développer

Liste d'interdictions, avec la raison en un mot :

- **Deuxième tentative payante ou gagnable** — tue l'identité. Jamais, sous aucune forme, y compris « pub contre retry ».
- **Système d'énergie / vies** — il n'y a qu'un tir, le concept est déjà l'anti-énergie.
- **Tout achat affectant la performance** (balle « plus stable », jauge ralentie…) — pay-to-win = mort sociale sur Reddit.
- **Multijoueur temps réel** — coût énorme, zéro apport au rituel asynchrone.
- **Éditeur de niveaux / UGC** — pipeline de modération pour rien ; le seed génère mieux.
- **Chat intégré** — Reddit a déjà les commentaires ; ne pas concurrencer la plateforme hôte.
- **Clans hors subreddits** — l'équipe naturelle existe déjà, en créer une seconde diluerait.
- **Notifications push / DM de relance** — l'urgence vit dans le produit ; le spam brûle la marque.
- **Comptes / profils hors Reddit** — l'identité Reddit suffit et simplifie tout.
- **Localisation au MVP** — anglais d'abord (Reddit global), i18n = V2+ si les données le justifient.
- **Replays vidéo exportables** — coût élevé ; la carte + le ghost couvrent le besoin (GIF = V2 éventuel).
- **Deuxième mécanique de tir (angle + puissance, double jauge…)** — la profondeur vient des conditions quotidiennes, pas de la complexité d'input.
- **Événements > 2/mois, modificateurs quotidiens multiples** (hors vendredi) — la lisibilité immédiate est sacrée.

## 36. Le MVP exact

Un seul objectif : **valider que le rituel prend** (les gens reviennent-ils tirer chaque jour ?). Tout ce qui ne sert pas cette question attend.

Contenu du MVP :
1. Custom post quotidien auto-créé (scheduler ✅) dans le subreddit-maison.
2. La scène unique : reveal → hold/release → vol → impact (physique déterministe partagée).
3. Warm-up du premier jour (flag par utilisateur).
4. Score serveur-autoritaire + percentile + rang global + fenêtre « autour de moi » + top 3.
5. Streak (attempt-based) + affichage.
6. Practice (conditions du jour, post-tir, filigrané).
7. Écran de résultat complet (V.18) avec teaser de demain et countdown.
8. Partage : Formats A + B (bouton commentaire asUser ✅ avec consentement + bouton copy).
9. 7 modificateurs coût-S (Clear, Crosswind, Tailwind, Gusty, Moon, Tiny, Long) + cadence hebdo.
10. Thème visuel par seed (palette par modificateur), Pip avec ses 6 états, 12 sons.
11. Anti-triche de base : verrou 1/jour, re-simulation serveur, monitoring du taux de Perfect.
12. Analytics des événements clés (liste au point 40).

Explicitement HORS MVP : équipes/Cup, cosmétiques/locker, shield, flairs, événements rares, carte image, ghost mondial, High Perch & Heavy Ball & Golden (coût M), archives.

## 37. La V1 (le « jeu social complet », ~4–6 semaines après un MVP validé)

- **Rep Your Sub** + leaderboard de subreddit + **Community Cup** en ligue à divisions + récap hebdo auto-posté.
- **Locker** + les 4 premiers paliers cosmétiques (J3/J7/J14/J30) + **Streak Shield**.
- **Ghost du meilleur tir mondial** (opt-in, post-tir uniquement).
- Les 3 modificateurs coût-M (High Perch, Heavy Ball, Golden Day) + Extreme Friday.
- **Carte image** de partage ⚠ (media) + flairs automatiques ⚠ (setUserFlair).
- Page **My Shots** (calendrier, records).
- Anti-triche niveau 2 : flags statistiques + outillage de revue.

## 38. La V2 (croissance & pérennité)

- **Saisons de ligue** (cycles de 6–8 semaines, reset des divisions, badge de saison).
- **Monétisation cosmétique** via Devvit Payments ✅ (API existante ; statut/review du programme ⚠) : skins/trails/FX premium, prix bas, jamais de gameplay — l'architecture du point 22 rend ça branchable sans refonte.
- **Mode satellite multi-subreddits** ⚠ (selon les options réelles de partage de données inter-installations) ou hub-and-spoke via le subreddit-maison.
- **Archives** (« play yesterday's, unranked »), Random Practice, export GIF éventuel.
- i18n si la demande existe.

## 39. Les expériences A/B à tester (une variable à la fois, ≥ 2 semaines chacune)

1. **Warm-up on/off** → D1 (hypothèse : +grosse D1 avec ; à confirmer, c'est la modification M2).
2. **Période de jauge 1,2 s vs 1,4 s vs 1,7 s** → distribution des scores, frustration (proxy : tirs practice), équité inter-devices.
3. **Écran de résultat : percentile-first vs score-first** → taux de partage.
4. **Copy du CTA** : `POST MY SHOT` vs `DROP MY SCORE` → taux de commentaire.
5. **Teaser de demain on/off** → D+1 (je parie fort sur « on »).
6. **Titre du post quotidien** : mystère (`ONE SHOT #247`) vs info (`ONE SHOT #247 — brutal crosswind, top score 99.94`) → CTR feed.
7. **Position du countdown** (résultat vs splash vs les deux) → sessions du soir.
8. **Seuil Bullseye 99 vs 98,5** → volume de partages « fiers » sans dévaluer.

## 40. Les métriques à suivre

- **Funnel du jour** : vues du post → lancements → tirs officiels (= **Daily Qualified Engagement**, la métrique reine) → partages → commentaires.
- **Rétention par cohorte** : D1 / D3 / D7 / D30 (cohorte = jour du premier tir) ; courbe de survie des streaks ; rétention segmentée par premier score (< 40 / 40–80 / > 80) et par percentile habituel.
- **Social** : taux de partage par tir, commentaires par joueur, upvotes du post quotidien, équipes actives, % d'équipes marquantes (≥ 5 joueurs).
- **Practice** : tirs practice/joueur (proxy d'engagement ET de frustration — lire avec le score du jour).
- **Santé** : distribution quotidienne des scores (médiane, p90, taux Bullseye/Perfect — dérive = problème de tuning ou triche), latence de soumission, erreurs.
- **Croissance** : nouveaux joueurs/jour, source (post organique vs récap vs externe), K-factor approx. (nouveaux joueurs / partages).

## 41. Ce qui peut augmenter la D1 et la D3

D1 (revenir demain) : le **warm-up** (premier score digne) ; le **teaser de demain** au pic émotionnel ; le **streak qui démarre à 1 immédiatement** (`🔥 1 — come back to make it 2`) ; la **practice-revanche** (« j'ai fait 97 en practice, demain je le fais en vrai ») ; l'**abonnement au sub proposé juste après un bon résultat** (le post de demain arrive alors tout seul dans le feed ✅ mécanique native) ; un badge visible à J3.
D3 (installer l'habitude) : la **cadence hebdo lisible** (on sait que vendredi sera fou) ; le premier palier cosmétique à J3 et le suivant affiché (`Comet skin in 4 days`) ; l'équipe (dès la V1) — on revient pour les autres ; la constance absolue de l'heure et du format du rendez-vous.

## 42. Ce qui peut augmenter le CTR dans Reddit

- **Le splash est une affiche, pas un logo** ⚠ (personnalisation vérifiée ✅ au niveau config, dynamisme à vérifier) : n° du jour énorme, icône du modificateur, `41,203 shots so far · top 99.94`, `TAP TO SHOOT`. Curiosité + preuve sociale + action.
- **Titre du post formulaïque et signé** : `🎯 ONE SHOT #247 — Crosswind −380. One try. 24 hours.` — l'émoji + le format constant deviennent un réflexe de reconnaissance dans le feed (à A/B tester, point 39.6).
- **Le fil de commentaires visible comme preuve de vie** : les cartes B des joueurs sous le post rendent le post lui-même intrigant depuis le feed.
- **Les jours-événements comme pics** : Extreme Friday et les événements rares sont conçus pour être upvotés vers r/all.
- **Constance d'horaire** (00:00 UTC) + épinglage dans le sub.

## 50. Le produit que je lancerais réellement

Je lance **exactement le MVP du point 36** : le rituel nu — hold/release, score, percentile, streak, practice-revanche, teaser, partage commentaire — dans **un seul subreddit-maison**, avec la DA Kinetic Minimal et Pip. Pas de Cup au lancement : la Cup est le deuxième étage de la fusée, et elle ne vaut que si le premier étage (le rendez-vous quotidien) tient tout seul. Critère de passage en V1 : **D7 ≥ 20 % sur les cohortes organiques** et un fil de commentaires quotidien vivant sans intervention. Si le rituel prend, la ligue transforme la rétention en croissance ; si le rituel ne prend pas, aucune Cup ne l'aurait sauvé. Une mécanique parfaite, puis une deuxième — dans cet ordre.

---

# PARTIE VIII — ÉTAT DE LA PLATEFORME DEVVIT (vérifié au 31/08/2026)

Sources primaires consultées : dépôt officiel `reddit/devvit-docs` (config Devvit Web), dépôts officiels `reddit/devvit` et `reddit/devvit-template-payments`, pages d'aide Reddit (Developer Platform, Developer Funds H1 2026), synthèses de la doc officielle. **Toute décision technique fine devra re-vérifier developers.reddit.com au moment du build** — la plateforme évolue vite.

✅ **Officiellement supporté (vérifié)** :
- **Devvit Web** : app web standard (client HTML/JS servi dans le post + serveur Node serverless), configurée par `devvit.json` — entrypoints de post avec hauteur (ex. `"height": "tall"`), bundle serveur en CommonJS.
- **Permissions déclaratives** : `redis`, `realtime`, `media`, `payments`, `http` (fetch sortant sur allowlist de domaines), `reddit` incluant **`asUser: ["SUBMIT_POST", "SUBMIT_COMMENT"]`** — l'app peut publier des posts/commentaires *au nom de l'utilisateur* (le cœur de notre partage).
- **Triggers** (`onPostCreate`, `onCommentSubmit`, `onModAction`) et **Scheduler** (tâches planifiées → notre post quotidien et les récaps).
- **Redis managé + hébergement + realtime** fournis par la plateforme (leaderboards via sorted sets = usage standard de Redis).
- **Payments API** pour achats in-app (template officiel dédié) — notre monétisation cosmétique V2 a un chemin officiel.
- **Publication** : upload → app privée testable sur un subreddit < 200 abonnés → publication dans l'App Directory.
- **Reddit Developer Funds** : programme de rémunération des apps selon leur usage (termes H1 2026 publiés : jusqu'à 3 apps/développeur ; cycle courant à re-vérifier, le terme H1 s'achevait fin juillet 2026). Aligné avec nos objectifs business : Reddit paie littéralement la rétention quotidienne.
- **Le stockage Redis est cloisonné par installation** (namespace par subreddit, purgé à la désinstallation) — c'est ce qui fonde notre choix M4 du subreddit-maison unique.
- Des jeux quotidiens communautaires (Pixelary, Riddonkulous) sont cités par Reddit comme références du programme — le format ONE SHOT est dans la cible éditoriale de la plateforme.

⚠️ **À vérifier au moment du build** :
- Quotas exacts (taille/débit Redis, timeout des requêtes serveur, taille de bundle, rate limits d'API Reddit).
- Personnalisation fine et **mise à jour dynamique** du splash/preview du post (notre FOMO de feed en dépend en partie).
- Statut opérationnel de Payments (GA vs beta, processus de review des produits).
- API `setUserFlair` accessible aux apps (nos flairs de statut).
- Existence d'un scope de données **global inter-installations** (conditionne le mode satellite V2).
- Surfaces de découverte actuelles (onglet/feed jeux, mises en avant éditoriales) et critères pour y figurer.
- Comportement exact pour un utilisateur non connecté selon la surface (web/app).

💡 **Idées produit** (aucune dépendance Reddit spécifique) : Community Cup en ligue, divisions, shield, Pip, warm-up, teaser, grille-cible de partage.

---

# PARTIE IX — SPEC POUR CLAUDE CODE

*Spécification du MVP (point 36). Aucun code ici : un contrat. Tout ce qui n'y figure pas est hors périmètre. Les valeurs numériques sont des défauts de départ, centralisés dans TUNABLES.*

## 9.1 Produit en une phrase

Jeu quotidien Devvit Web : chaque jour UTC, un même niveau généré par seed pour toute la planète ; le joueur a un tir officiel (hold → release), reçoit un score /100, un percentile, un rang global et un streak ; il peut ensuite s'entraîner sur les conditions du jour et poster sa carte en commentaire.

## 9.2 Stack & structure imposées

- **Plateforme** : Devvit Web (dernier template officiel `devvit init` web). Client : TypeScript + rendu Canvas 2D (pas de moteur de jeu externe, pas de framework UI lourd ; DOM autorisé pour les panneaux hors-scène). Serveur : endpoints Node du template (bundle CJS).
- **Avant d'écrire la moindre ligne** : lire la doc courante sur developers.reddit.com (Devvit Web config, redis, scheduler, userActions/asUser, menu actions) et lever les ⚠ de la Partie VIII qui touchent au MVP. Adapter les noms d'API à la réalité du jour, pas à cette spec.
- **Arborescence** :
  - `/src/client/` — jeu, écrans, audio, rendu.
  - `/src/server/` — endpoints, redis, scheduler handlers, anti-triche.
  - `/src/shared/` — **`sim.ts`** (physique + scoring + génération de niveau + PRNG), `types.ts`, `tunables.ts`, `copy.ts`. Règle absolue : `sim.ts` est importé tel quel des deux côtés ; il ne contient que de l'arithmétique (+ − × ÷, comparaisons) et aucune dépendance ; les seules fonctions trigonométriques sont appelées à l'initialisation du niveau et leurs résultats arrondis à 6 décimales.
- **Permissions `devvit.json`** : `redis: true`, `reddit: { enable: true, asUser: ["SUBMIT_COMMENT"] }`, scheduler (tâche quotidienne), entrypoint post `height: "tall"`. Pas de `http`, pas de `media`, pas de `payments` au MVP.

## 9.3 PRNG & génération du niveau (déterministe, gelée à vie)

- `dayNumber = floor(serverUnixSeconds / 86400)` ; `displayDay = dayNumber − LAUNCH_DAY + 1`.
- PRNG : xmur3(`"oneshot:" + dayNumber`) → graine → mulberry32. Implémentation standard 32 bits, dans `sim.ts`.
- **Ordre de tirage immuable** : ① modificateur (table pondérée + règle de cadence hebdo ci-dessous) ② `D` ③ `H` ④ `windBase` ⑤ `angleDeg` ⑥ `gustTable[16]` (toujours tirée, utilisée seulement si Gusty) ⑦ index de variation de palette.
- **Cadence hebdo** (par `dayOfWeekUTC`) : lun = Clear Skies forcé ; dim = *(MVP : Clear Skies — Golden est V1)* ; autres jours = tirage pondéré parmi {Crosswind 20, Tailwind 15, Gusty 15, Moon 15, Tiny 10, Long 10, Clear 15}.
- **Plages par modificateur** (appliquées comme overrides des plages de base du §II.7) :

| Modificateur | Override |
|---|---|
| Clear Skies | `windBase ∈ [−80, 80]` |
| Crosswind | `windBase ∈ [−420, −300]` |
| Tailwind | `windBase ∈ [250, 400]` |
| Gusty | `windEff(t) = windBase + GUST_AMP × lerp(gustTable, t)`, `windBase ∈ [−150, 150]` |
| Moon Gravity | `G × 0.55` |
| Tiny Target | `R = 30` |
| Long Shot | `D ∈ [780, 880]` (borne haute de la plage) |

- **Garde-fou de validité** : à la génération (côté serveur, au moment de créer le post), balayer `power` de 0 à 1 par pas de 0,001 avec la sim ; si aucun `power` n'atteint `score ≥ 99`, régénérer avec `seed' = hash("oneshot:" + dayNumber + ":r" + k)` (k = 1, 2, …) et **persister k** dans `day:{n}:meta` pour que les clients utilisent le même seed final.

## 9.4 Simulation & scoring (résumé normatif du §II.7–8)

- Espace 1000×1600, origine bas-gauche. Lanceur : bouche à `(120, 120)`.
- `power ∈ [0,1]` ← onde triangulaire de période `GAUGE_PERIOD_MS` sur la durée d'appui : `phase = (holdMs mod P) / P` ; `power = phase < 0.5 ? 2×phase : 2×(1−phase)`.
- `v0 = V_MIN + power × (V_MAX − V_MIN)` ; direction `(cos θ, sin θ)` pré-calculée et arrondie à 1e−6.
- Euler semi-implicite, `dt = 1/120`, cap `SIM_MAX_STEPS`.
- Sol effectif : `y = H` si `x ∈ [D−140, D+140]`, sinon `y = 0` ; mur de falaise en `x = D−140` pour `y < H` (impact CLIFF au franchissement). Point d'impact interpolé linéairement dans le pas.
- `dx = |x_impact − D|` (CLIFF : dx mesuré au point d'impact sur le mur). Score : barème 3 zones du §II.8, arrondi **half-up** à 2 décimales. `PERFECT ⇔ dx ≤ PERFECT_RADIUS` ; `BULLSEYE ⇔ score ≥ 99`. `x_impact > 1000` au sol ⇒ score 0, `OFF_THE_MAP`.
- **Contrat de déterminisme** : `simulate(dayNumber, holdMs) → { score, dx, impact, trajectory[] }` identique au bit près client/serveur pour les mêmes entiers d'entrée.

## 9.5 TUNABLES (un seul fichier, valeurs de départ)

| Constante | Valeur | Constante | Valeur |
|---|---|---|---|
| `GAUGE_PERIOD_MS` | 1400 | `G` | 1700 |
| `V_MIN / V_MAX` | 900 / 1900 | `ANGLE_RANGE` | [38, 62]° |
| `D_RANGE` | [520, 880] | `H_RANGE` | [0, 420] |
| `TARGET_R` | 60 | `PERFECT_RADIUS` | 4 |
| `BULLSEYE_SCORE` | 99.0 | `GUST_AMP` | 0.4 × |windBase|+120 |
| `MISFIRE_MS` | 120 | `SIM_MAX_STEPS` | 400 |
| `SLOWMO_TRIGGER_DX` | 30 | `ROLLOVER_GRACE_S` | 90 |

Livrer aussi un **script de calibration** (`npm run tune`) : 100 000 tirs simulés avec `holdMs = optimal + N(0, σ)` pour σ ∈ {30, 45, 60} ms, sortie = distribution des scores (médiane, p90, %Bullseye, %Perfect) pour chaque modificateur. Les TUNABLES finaux du lancement sortent de ce script, pas d'une intuition.

## 9.6 API serveur (contrats)

Tous les endpoints déduisent `userId` du contexte Devvit (jamais du payload). Réponses JSON. Erreurs : `{ error: CODE }`.

- `GET /api/state` → `{ dayNumber, displayDay, rerollK, serverNow, modifier, playedToday: bool, myResult?: {score, dx, rank, total, percentile}, streak: {current, longest}, firstVisit: bool, shotsToday, topScore, tomorrowModifier }`. (Le client génère le niveau localement depuis `dayNumber` + `rerollK`.)
- `POST /api/shot` body `{ dayNumber, holdMs, clientScore }` →
  - Vérifie `dayNumber == serveur` (tolérance `ROLLOVER_GRACE_S` après minuit) sinon `DAY_ROLLED`.
  - Verrou atomique `SET user:{id}:played:{dayNumber} NX` sinon `ALREADY_PLAYED` (+ renvoyer le résultat existant).
  - Re-simule ; si `|score − clientScore| > 0.01`, log `SIM_MISMATCH` (le score serveur fait foi).
  - Écrit le score, met à jour streak/records, renvoie `{ score, dx, rank, total, percentile, isBullseye, isPerfect, perfectCountToday, streak }`.
- `POST /api/warmup-done` → marque `firstVisit = false`.
- `GET /api/leaderboard?window=me|top` → top 3 + fenêtre ±3 autour du joueur `{ rank, username, score }[]`.
- `POST /api/share-comment` body `{ }` → construit la carte Format B depuis le résultat serveur (jamais depuis le client) et la poste en commentaire du post du jour via asUser ; renvoie `{ ok, commentUrl }`. Premier appel = l'UI a demandé le consentement.
- Handler scheduler `/internal/daily` (00:00 UTC) : calcule `rerollK` (garde-fou 9.3), crée le post du jour (titre : `🎯 ONE SHOT #<displayDay> — <ModifierLabel>. One try. 24 hours.`), poste + épingle le commentaire d'amorce, fige les compteurs de la veille.

## 9.7 Schéma Redis

| Clé | Type | Contenu / usage |
|---|---|---|
| `day:{n}:scores` | zset | membre `userId`, score = score du tir → rang (`ZREVRANK`), total (`ZCARD`), percentile |
| `day:{n}:meta` | hash | `rerollK`, `postId`, `perfects`, `topScore`, `shots` |
| `user:{id}` | hash | `firstVisitDone`, `streak`, `longest`, `lastPlayedDay`, `best`, `perfects`, `bullseyes`, `daysPlayed` |
| `user:{id}:played:{n}` | string (NX) | verrou + payload `{holdMs, score, dx, ts}` (audit/anti-triche) |
| `stats:daily:{n}` | hash | compteurs analytics agrégés |

Streak à la soumission : `lastPlayedDay == n−1 → streak+1` ; `== n` impossible (verrou) ; sinon `streak = 1` (le shield est V1). TTL long sur `day:*` (garder ≥ 90 jours pour l'audit).

## 9.8 Machine d'états client

`boot → (firstVisit ? warmup_aim → warmup_result → interstitial) → ready → aiming → in_flight → impact → scoring_pending → result ⇄ practice`. Retour même jour : `boot → result`. Transverses : `offline`, `error_submit` (file locale de re-soumission du `holdMs` — un tir ne se perd jamais), `day_rolled` (modal + reload, seulement si le tir n'est pas parti), `logged_out`. La practice réutilise la même scène avec `mode: "practice"` (filigrane, désaturation −20 %, score italique, aucun bouton de partage, stat locale `practiceBestToday`).

## 9.9 Écrans, copy (EN) & juice — obligations minimales

- Splash/preview du post : logo + `Day #<n>` + icône modificateur + `TAP TO SHOOT` (statique au MVP si la mise à jour dynamique n'est pas triviale).
- Scène : barre du jour (n°, modificateur, 🔥streak, `?`) ; conditions animées à l'entrée (`WIND −380 →` flèche + valeur, `DIST 640`, badge modificateur) ; `HOLD TO AIM` respirant ; jauge en arc autour du lanceur, graduée, sans chiffres.
- Copy clés : `One attempt. Every day.` · `WARM-UP — this one doesn't count` · `That was practice. Now for real.` · `HOLD TO AIM` · `Hold… then release` (misfire) · `TOP {p}% TODAY` · `{dx} from center` · `🔥 {n} DAY STREAK` · `Tomorrow: {MOD}` · `Next shot in {hh:mm:ss}` · `POST MY SHOT` · `Practice` · `Streak reset. Longest: {n} 🔥 — Day 1 starts now.` · `Only {k} of {total} players hit a Perfect today.` · `OFF THE MAP` — tout le texte utilisateur vit dans `copy.ts`.
- Juice obligatoire (cf. §V.26) : squash d'anticipation, freeze 60 ms + shake au release, étirement en vol + traînée, slow-mo conditionnel, poof + marqueur + ligne pointillée, count-up 600 ms, cascade 300 ms, flamme +1, séquences Bullseye/Perfect distinctes. `prefers-reduced-motion` : shakes/slow-mo/confettis → fondus.
- Audio : les 12 sons du §V.27 hors « record perso » et countdown (assets placeholder synthétisés acceptables au MVP, < 200 Ko, déclenchés après premier geste, toggle mémorisé).
- Formats de partage : A et B **exactement** comme au §IV.17 (la grille B : 5×5, ⚫ placé par `sign(x_impact − D)` et `dx` bucketisé sur {≤4, ≤12, ≤35, ≤60, >60} → anneau ; overshoot à droite du 🎯, undershoot à gauche).

## 9.10 Analytics (événements minimaux)

`launch` (source), `warmup_start/complete`, `aim_start`, `shot_submitted` (holdMs bucketisé, modifier), `shot_scored` (score bucketisé, percentile, isBullseye, isPerfect, simMismatch), `result_viewed`, `share_comment` / `share_copy`, `practice_shot` (n° du try), `subscribe_prompt_shown/accepted`, `error_*`. Stockés en compteurs agrégés dans `stats:daily:{n}` (pas de tracking individuel au-delà du nécessaire).

## 9.11 Critères d'acceptation du MVP

1. Deux clients sur deux devices affichent **le même niveau** un jour donné ; `simulate(day, holdMs)` renvoie le même score au centième côté client et serveur.
2. Un compte ne peut soumettre qu'un tir officiel/jour UTC, y compris en double-onglet et multi-device (test de concurrence).
3. Un tir soumis pendant une coupure réseau finit compté (file de re-soumission), sans doublon.
4. Le rollover UTC en pleine session déclenche `day_rolled` proprement (aucun tir attribué au mauvais jour hors fenêtre de grâce).
5. Premier utilisateur : warm-up → interstitiel → tir officiel ; l'état ne réapparaît jamais.
6. Résultat : score, dx, percentile, rang, fenêtre ±3, streak, teaser, countdown — tous corrects par rapport à Redis.
7. `POST MY SHOT` publie le Format B en commentaire du post du jour au nom du joueur, après consentement.
8. Le scheduler crée le post à 00:00 UTC avec garde-fou de validité (test : forcer un seed dégénéré → reroll persisté et partagé).
9. `npm run tune` produit le rapport de distribution par modificateur.
10. 60 fps stables sur un mobile milieu de gamme de 2022 ; bundle client initial raisonnablement léger (cible < 300 Ko hors sons).
11. Practice inaccessible avant le tir officiel ; visuellement infalsifiable ; sans partage.
12. `prefers-reduced-motion` respecté ; vent lisible sans couleur ; cibles tactiles ≥ 48 px.

## 9.12 Hors périmètre MVP (rappel contractuel)

Équipes/Cup, cosmétiques/locker, shield, flairs, carte image, ghost mondial, événements rares, modificateurs coût-M, archives, i18n, paiements, notifications, multi-subreddits. Toute idée nouvelle en cours de build : dans `BACKLOG.md`, pas dans le code.

## 9.13 Questions plateforme à lever en premier (bloquantes ou structurantes)

1. Noms/API exacts du template Devvit Web courant (endpoints internes, contexte utilisateur, scheduler) — s'aligner sur la doc du jour.
2. Personnalisation (et éventuel refresh) du splash/preview du post.
3. Confirmation du flux de consentement `asUser: SUBMIT_COMMENT` et de son UX imposée.
4. Quotas Redis / timeouts serveur (dimensionner la fenêtre de leaderboard et les agrégats en conséquence).
5. Comportement utilisateur non connecté sur les surfaces visées.

---

*Fin du document. Prochaine étape : ouvrir Claude Code, lui donner cette Partie IX, et construire le MVP.*
