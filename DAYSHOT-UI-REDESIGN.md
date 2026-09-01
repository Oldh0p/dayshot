# DAYSHOT — Refonte UI/UX/Game Feel

*Document de design produit — 02/09/2026. Complète `ONE-SHOT-GDD.md` (qui reste la référence gameplay/backend). Aucun code ici : des décisions, des specs, des wireframes, et le prompt final pour Claude Code en Partie 20.*

## 0. Les dix décisions (pour qui n'a que deux minutes)

1. **La carte du feed devient une vraie vue inline** (entrypoint `splash`/inline de Devvit Web, bundle séparé et léger) : Pip, la cible, l'arc fantôme, l'atmosphère du modificateur, une preuve sociale réelle, un CTA. Plus jamais un dégradé vide avec un numéro. C'est la priorité absolue, et la plateforme le permet (vérifié : les templates officiels Reddit livrent exactement ce couple `splash` inline / `game` expanded, avec `requestExpandedMode`).
2. **La scène ne disparaît plus jamais.** Le résultat est un panneau qui monte *par-dessus* le monde figé : Pip là où il s'est arrêté, marqueur d'impact, ligne pointillée jusqu'au centre, étiquette de direction (`48 over`, `251 short`).
3. **Un mot-verdict remplace « FIRST SHOT TODAY »** : PERFECT · BULLSEYE · SO CLOSE · ON THE MAT · NEAR MISS · NOT BAD · ROUGH LANDING · SCENIC ROUTE (+ OFF THE MAP / INTO THE WALL). Seuils calés sur la géométrie réelle du tapis, pas sur des dizaines rondes.
4. **Le contexte remplace le chiffre nu** : `TOP 4.2% TODAY` ou `You beat 62% today`, plus `#1,204 / 8,421`. Jamais « bottom ». Sous 50 joueurs : le rang seul, reformulé (`You opened the day`, `#7 of 12 today`).
5. **CTA du feed : `TAKE YOUR ONE SHOT`.** En jeu, le geste garde `HOLD TO AIM` (c'est la mécanique réelle). `TAP TO SHOOT` disparaît : il promettait un tir sur un tap qui n'ouvre que l'app.
6. **Pip devient l'identité** : 7 formes vectorielles, 12 expressions, zéro sprite. Pip + tapis = DAYSHOT.
7. **Sept atmosphères de modificateur**, même UI, ciel/particules/tic de Pip différents. On reconnaît le jour sans lire.
8. **Une palette tokenisée, une famille typographique, six tailles**, chiffres tabulaires partout où ça compte. Le corail redevient une couleur d'*action*, pas la couleur de « tous les gros rectangles ».
9. **Un seul moment orchestré par écran** : la comète sur l'arc (feed), la jauge (visée), la cascade de révélation (résultat). Le reste est calme.
10. **Priorités P0 → P3 strictes** et un prompt Claude Code en 11 phases, chacune verrouillée par build + typecheck + tests + QA visuelle. Le backend, la simulation et les règles métier ne bougent pas.

---

## 1. Audit critique de l'UI actuelle

### 1.1 Carte du feed (capture desktop, ~700 × 520)

| Axe | Constat précis | Conséquence |
|---|---|---|
| Hiérarchie | L'élément le plus gros est `#2` — le numéro du jour, la donnée la moins signifiante pour un inconnu. Le plus petit est le nom du jeu. Aucun élément ne dit « jeu », « cible », « un seul tir ». | Le cerveau lit « une app quelconque, jour 2 ». Le test des 2 secondes (§44 du brief) échoue sur 4 critères sur 5. |
| Densité / vide | ~85 % de la carte est un dégradé plat. Le vide n'est pas du « calme premium » : il n'y a aucun objet focal autour duquel respirer. | Lu comme un placeholder ou un chargement. |
| Branding | Ni Pip, ni tapis. Les deux signatures de la marque sont absentes de la seule surface que 95 % des gens verront. Le wordmark en petites capitales espacées ressemble à une étiquette de mode. | Zéro mémorisation ; impossible de reconnaître le jeu au deuxième passage dans le feed. |
| Lisibilité | Bonne (contraste, tailles). | Rien à corriger. |
| Émotion | Nulle : « Clear Skies » est une étiquette, pas un ciel ; aucun personnage, aucune tension, aucun mouvement. | Pas de « c'est quoi ça ? ». |
| Conversion | `TAP TO SHOOT` promet un tir sur le tap ; le tap ouvre l'app. Mismatch de promesse, et risque que l'utilisateur croie avoir *consommé* son tir en tapant. Pas de preuve sociale, pas d'enjeu (« no retries »), pas de bénéfice. La tagline diffère de la marque (« One shot that counts. Every day. » vs « One shot. Every day. No second chances. »). | CTR structurellement bas ; confusion possible sur la règle centrale. |
| Game feel | Aucun mouvement. | Le feed ne distingue pas cette carte d'une image. |
| Mobile | Même composition centrée, comprimée ; sur les apps Reddit, une vue inline `tall` peut se rendre à ~350 px de haut au lieu de 512 (issue publique #254 du repo Devvit) — le vide vertical de la composition actuelle s'effondre et le CTA peut passer sous le pli. | Doit être conçu pour 350 px ET 512 px. |
| Desktop | Composition portrait au centre d'une carte paysage : deux zones mortes latérales. | Rendu « pas fini ». |

### 1.2 Écran de résultat (capture mobile 375 px)

| Axe | Constat précis | Conséquence |
|---|---|---|
| Hiérarchie | L'ordre affiché est : score → distance → chip → streak → CTA. L'ordre cérébral demandé est : *où suis-je tombé ?* → *c'était bon ?* → score → comparaison → streak → actions → demain. Les deux premières questions n'ont **aucune réponse visuelle** : la scène est effacée. | Le « ahhh j'étais si proche » n'existe pas — il faut *voir* l'écart. |
| Vide | ~40 % de l'écran est vide au-dessus du score ; les vestiges de la scène affleurent à ~5 % d'opacité en bas. Ni scène, ni propre : le pire des deux. | Perte de la moitié de l'écran le plus important du jeu. |
| Chip `FIRST SHOT TODAY` | Ce n'est pas un verdict : c'est le repli « rang seul » quand il y a < 50 joueurs (règle validée au playtest), rendu dans la pastille corail réservée à *la* ligne émotionnelle. Deux blocs corail se disputent l'œil (`FIRST SHOT TODAY` et `POST MY SHOT`), et le libellé laisse entendre « premier tir de plusieurs ». | Ambiguïté sur la règle « un tir », hiérarchie brouillée. |
| `251.4 from center` | Un nombre sans échelle (le tapis fait 60, le plateau 140 — personne ne le sait) et sans direction. | Le joueur ne sait pas s'il était court ou long, ni de combien « en vrai ». |
| Valence du score | `50.06` n'a aucun mot pour le qualifier. | Pas de mémoire émotionnelle, rien à raconter. |
| Secondaires | `Copy card` passe à la ligne à 375 px (bug de layout) ; trois actions textuelles de même poids. | Rendu cassé sur le device majoritaire. |
| Teaser | `Tomorrow: CLEAR SKIES ✨ / Next shot in 01:48:57` en gris 13 px, même couleur que tout le reste. | La graine de demain est enterrée. |
| Streak | Correct mais statique : aucune célébration du +1. | La récompense de rétention ne se ressent pas. |
| Pip | Absent de l'écran qui devrait montrer sa réaction. | La mascotte ne vit pas le résultat. |
| Mobile | Zéro scroll : bon. Cibles tactiles ≥ 44 px : bon. | Base saine à conserver. |
| Desktop | Panneau portrait centré : structure acceptable, moitié haute gaspillée. | Même remède que mobile. |

### 1.3 Écran de visée (constaté au playtest)

Fonctionnel et juste (hold/release, jauge en arc, vent flèche + valeur). Ce qui manque : une mise en place (Pip qui saute sur le lanceur, conditions qui s'installent), un ciel qui dit le modificateur, un rappel de l'enjeu une seule fois, et une caméra qui vit pendant le vol.

---

## 2. Nouvelle philosophie UX

**La scène est l'interface.** Quatre règles, appliquées partout :

1. **Ne jamais cacher le monde.** Feed, visée, vol, résultat, leaderboard : Pip, le tapis et l'horizon restent visibles. Les panneaux se *superposent* (assombrissement 15–25 %), ils ne remplacent pas.
2. **Un moment orchestré par écran, et un seul.** Feed : la comète qui parcourt l'arc fantôme. Visée : la jauge. Résultat : la cascade de révélation. Tout le reste est immobile ou micro (≤ 200 ms, déclenché par le joueur).
3. **Un chiffre sans contexte n'apparaît pas.** Le score vient avec un mot, la distance avec une direction et une ligne, le rang avec un total, le percentile formulé pour valoriser.
4. **La tension vient d'une seule vérité : un tir.** On la montre (le monde qui s'assombrit quand le pouce appuie, « One official shot. No retries. » une fois), on ne la crie pas (aucun rouge, aucun compte à rebours agressif, aucune notification).

Parcours émotionnel → surface :

| Émotion visée | Où elle naît | Levier UI |
|---|---|---|
| « C'est quoi ça ? » | Feed | Un personnage qui *regarde* une cible ; une comète sur l'arc ; une atmosphère. |
| « J'ai envie d'essayer. » | Feed | `8,421 shots today` (réel) + `TAKE YOUR ONE SHOT` + `No retries.` |
| « Je n'ai qu'un tir. » | Visée | Mise en place calme, monde qui s'assombrit au hold, jauge vivante. |
| « Ahhh, si proche. » | Impact → Résultat | Slow-mo d'approche, ligne impact → centre, `12 short`, mot-verdict, réaction de Pip. |
| « Demain je reviens. » | Résultat | Bande de ciel de demain + `TOMORROW · Moon Gravity` + countdown ; streak qui s'incrémente. |

---

## 3. Direction artistique définitive : Kinetic Minimal, affûté

On garde la DA retenue au GDD (flat premium nocturne, formes vectorielles, theming par palette) et on la rend **reconnaissable à 60 px de haut**.

**La scène unique.** Toutes les surfaces partagent la même image à des cadrages différents : un ciel en dégradé teinté par le modificateur, deux bandes de sol en silhouette (parallaxe), le lanceur en bas à gauche, le plateau et le tapis à droite, Pip. La carte du feed *est* un cadrage de la scène de jeu. C'est ce qui crée la reconnaissance au deuxième passage.

**La lumière vient du tapis.** Un halo radial doux (or → corail, rayon ≈ 2 × R, opacité 18 %) sous la cible est la seule source lumineuse ; Pip a un reflet fixe en haut à gauche. Aucun autre glow, sauf Perfect. Pas d'ombres portées molles : la profondeur vient de la couleur (3 plans : ciel / sol / premier plan).

**Là où l'audace est dépensée** (une seule place par écran) : sur le feed, la comète ; sur le résultat, la ligne pointillée impact → centre avec son étiquette de direction, et le mot-verdict en corail (or pour Bullseye/Perfect).

**Ce qu'on refuse** : gradients multiples, néons, cartes empilées à ombres grises, dix couleurs, emojis système dans l'UI (rendus différents par OS ; on les garde uniquement dans les textes de partage). Les icônes de modificateur sont 7 glyphes vectoriels monochromes.

**Références de sensation** : Alto's Odyssey (calme + physique), Holedown (économie de formes), le Wordle d'origine (aucune décoration, une identité).

---

## 4. La carte du feed (preview) — définitive

### 4.1 Ce que la plateforme permet (vérifié)

Devvit Web distingue une **vue inline** (rendue *dans le feed*) et une **vue expanded** (plein écran). Les templates officiels Reddit (`devvit-template-react`, `devvit-template-gamemaker`) livrent deux entrypoints : `splash` (inline, « will be shown in the reddit.com feed — keep it fast ») et `game` (expanded), et le bouton de la splash appelle `requestExpandedMode(event, 'game')` depuis `@devvit/web/client` ; le contexte utilisateur (`context.username`) est disponible dans la vue inline. Donc : **animation ambiante, preuve sociale live et personnalisation par joueur sont réalisables sans nouveau backend** (un appel à l'endpoint `GET /api/state` existant). Deux contraintes à respecter : la hauteur inline peut tomber à ~350 px sur les apps mobiles (issue #254), et la doc « launch screen » contient des exemples périmés (issue #159 du repo docs) — Claude Code doit s'aligner sur le template officiel et le schéma `devvit.json`, pas sur le guide.

### 4.2 Composition

Une seule scène, cadrée en paysage sur desktop et en 4:3 sur mobile. Pip sur la lèvre du lanceur à gauche, le tapis sur son plateau à droite, un **arc fantôme pointillé** entre les deux (décoratif : pas la trajectoire optimale — un arc générique, jamais une aide au tir), l'atmosphère du modificateur dans le ciel, les deux bandes de sol en bas.

Texte, au plus quatre lignes :
- haut-gauche : wordmark `DAYSHOT` + stamp `#24` (le numéro reste un tampon, pas un titre) ;
- haut-droite : chip du modificateur (glyphe + `CROSSWIND`) ;
- bas-gauche : **preuve sociale réelle**, une ligne : `8,421 shots today · best 99.98` ;
- CTA : `TAKE YOUR ONE SHOT` ; micro-ligne : `One try. No retries.`

### 4.3 Preuve sociale : règles (données réelles uniquement, toutes déjà en Redis via `day:{n}:meta`)

| Situation | Ligne affichée |
|---|---|
| `shotsToday ≥ 100` | `8,421 shots today · best 99.98` |
| `shotsToday < 100` et `yesterdayShots > 0` | `31,842 shots yesterday · today just opened` |
| jour 1 du lancement | `Today's the first shot ever. Take yours.` |
| `perfectsToday ≥ 1` (à partir de 1 000 tirs) | remplace `best` par `12 Perfects today` |

Deux chiffres maximum. Jamais de faux compteur, jamais de « LIVE », jamais de compte à rebours agressif : le countdown n'apparaît dans le feed que sur l'état « déjà joué ».

### 4.4 Trois états personnalisés (réalisables avec `GET /api/state`)

| État | Scène | Texte | Actions |
|---|---|---|---|
| A. Nouveau / inconnu / non connecté | Pip idle regarde la cible | preuve sociale | `TAKE YOUR ONE SHOT` · `One try. No retries.` |
| B. Joueur revenant, pas encore joué | idem + chip `🔥 7 DAY STREAK` haut-droite sous le modificateur | `Your shot is waiting · 8,421 shots today` | `TAKE YOUR ONE SHOT` |
| C. Déjà joué | Pip **à son point d'impact**, marqueur, ligne vers le centre | `TODAY 94.61 · Top 11%` (ou `#7 of 12 today`) | `Practice` · `Leaderboard` (ghost) + `Next shot in 08:42:17` |

La flamme de streak n'apparaît qu'à partir de 2 (à 1, elle ne dit rien).

### 4.5 Boucle ambiante (6 s, canvas, 30 fps plafonné dans le feed)

| t | Événement |
|---|---|
| continu | Pip respire (scaleY ± 3 %, période 3 s, sinus) ; particules du modificateur à densité feed (≤ 24). |
| 1,2 s (± 0,3 s aléatoire) | Clignement 120 ms. |
| 2,0 → 3,6 s | Regard vers la cible (pupilles + 2 px vers la droite, retour). |
| 3,0 → 4,4 s | **La comète** : un point 4 px + traîne 3 points parcourt l'arc fantôme (ease-in-out). L'unique élément « spectaculaire ». |
| 4,4 s | Le tapis pulse (scale 1 → 1,04 → 1, 500 ms). |
| 4,6 s | Deuxième clignement. |
| 6,0 s | Retour au repos. |

Pause complète hors viewport (`IntersectionObserver`) et onglet caché ; `prefers-reduced-motion` → image fixe + clignement toutes les 5 s. Zéro audio.

### 4.6 Sécurité du feed

Le bundle inline n'importe **ni** la simulation, **ni** la machine d'états de jeu, **ni** les handlers de hold. Ses seuls éléments interactifs sont les boutons ; le CTA appelle `requestExpandedMode` (qui exige un geste utilisateur). Aucun scroll, aucun swipe, aucun long-press ne peut déclencher quoi que ce soit. Le tir officiel n'existe que dans l'expanded.

---

## 5. L'écran de jeu (expanded, mobile) — définitif

Zones (390 × 720 de référence) : barre du jour 44 px · scène flexible (≥ 56 %) · panneau bas ~25 %.

**Mise en place (1,2 s, interruptible au toucher)** : le ciel se stabilise (320 ms) → Pip bondit sur la lèvre du lanceur (ressort 400 ms) → les deux cartes de conditions glissent depuis le bas (stagger 80 ms) : `WIND` flèche dont la longueur est proportionnelle à |vent| + valeur, `DIST 640` → les particules démarrent → `HOLD TO AIM` respire. Sous le pill, une fois : `One official shot. No retries.` (mist). Warm-up : bannière `WARM-UP — this one doesn't count` inchangée.

**Hold** : Pip squash (1,12 × 0,88) ; la jauge en arc balaie (inchangée) ; le monde s'assombrit de 12 % (vignette) et les particules ralentissent à 0,6× — mais la flèche de vent conserve sa valeur ; glissando audio. Les pupilles de Pip rétrécissent progressivement avec la durée d'appui (peur).

**Release** : freeze 60 ms → pop → shake 2 px / 90 ms → Pip s'étire selon la vitesse (1,25 × 0,8) → traîne 6 échantillons.

**Vol** : caméra qui garde lanceur ET tapis dans le cadre, zoom 4–8 % vers l'apex puis retour ; parallaxe ciel 0,2× / sol 0,6× ; yeux de Pip plissés, pupilles dans le sens du déplacement ; particules de vent qui frôlent.

**Approche** (inchangée : slow-mo 0,25× / 250 ms si atterrissage projeté ≤ 30 u) + assombrissement 20 % + pulsation fine de l'anneau du tapis.

**Impact** : poussière (12–20 particules), un rebond, roulis d'arrêt ; le marqueur tombe (200 ms), la ligne pointillée se trace jusqu'au centre (250 ms), l'étiquette de direction s'inscrit (`48 over`). Pip réagit selon la tranche (§8). Puis le panneau de résultat monte (§6).

---

## 6. L'écran de résultat — définitif

**La scène reste, recadrée.** Après l'impact, la caméra effectue un *result framing* (400 ms, out-expo) : elle cadre le point d'impact ET le centre du tapis avec 12 % de marge, en gardant le rayon du tapis ≥ 24 px à l'écran ; en `OFF THE MAP`, elle montre tout le terrain avec le marqueur au bord et une flèche. Le monde est assombri de 15 % sous le panneau, jamais plus.

**Le panneau** (fond `elevated`, rayon 24 px en haut, ~50 % de la hauteur) répond aux sept questions dans l'ordre :

1. *Où suis-je tombé ?* — dans la scène : Pip immobile, marqueur ▼, ligne pointillée impact → centre, étiquette `48 over` / `251 short` / `into the wall, 180 below the top` / `off the map`.
2. *C'était bon ?* — le **mot-verdict** (§10.2), corail (or si ≥ 99).
3. *Mon score ?* — `96.42`, chiffres tabulaires 44 px, count-up 600 ms, sur la même ligne que le verdict.
4. *Comment je me compare ?* — une ligne : `TOP 4.2% TODAY` (chip) ou `You beat 62% today`, suivie de `#1,204 / 8,421`.
5. *Mon streak ?* — `🔥 7 → 8 day streak`, avec l'incrément animé.
6. *Que faire ?* — `POST MY SHOT` (56 px, corail, le seul bloc corail plein de l'écran) ; en dessous deux boutons ghost de largeur égale `Practice` · `Leaderboard`, et une icône « copier » (44 px) à droite. Le mot « Copy card » disparaît : la copie est un geste secondaire, l'icône + toast `Copied` suffisent.
7. *Demain ?* — une **bande de ciel de demain** (4 px, couleur `sky.top` du thème du modificateur de demain) puis `TOMORROW · Moon Gravity · 08:42:17` (glyphe, countdown tabulaire).

**Cascade** (uniquement à la première révélation ; instantanée au retour) : panneau 320 ms → verdict 200 ms (scale 0,92 → 1) → count-up 600 ms → contexte + 300 ms → streak + 300 ms (flip du chiffre + pop de flamme) → CTA + 200 ms. Total ≈ 1,6 s. Bullseye : verdict or + halo du tapis à 40 % ; Perfect : onde de choc 600 ms + particules or + ligne `Only 12 Perfects today` (réelle).

**Practice** : même écran, filigrane `PRACTICE`, pas de CTA de partage, score en italique (existant), `Try again` à la place de `POST MY SHOT`.

**Retour dans la journée** : cet écran est l'accueil, `Practice` remonte en bouton plein (mist), `POST MY SHOT` reste si non partagé, sinon devient `Shared ✓` ghost.

---

## 7. Leaderboard

Panneau glissant (88 % de hauteur) sur la scène assombrie. En-tête : `TODAY · 8,421 shots`. **Top 3** avec pastille (or / mist / corail atténué), puis séparateur `· · ·`, puis la **fenêtre ± 2 autour de vous** (5 lignes), votre ligne avec barre corail à gauche et graisse 700. Colonnes : rang (tabulaire) · pseudo · score (tabulaire, gras) · distance (mist, petit). Streak discret (flamme + nombre) seulement en P2, si le backend expose le champ dans la fenêtre (ajout minimal : lecture batch des hashes utilisateur des 8 lignes affichées). États : `< 5` joueurs → `Only 3 shots so far — you're early.` ; hors classement (pas encore joué) → la fenêtre est remplacée par `Take your shot to enter today's board.` Aucune dixième métrique, aucun onglet au MVP (les équipes sont V1).

---

## 8. Pip — la mascotte en sept formes

**Anatomie** (tout en canvas/vecteur, zéro sprite) : un disque corps `#2A3242` avec un reflet elliptique fixe en haut à gauche (ink à 25 %) ; deux yeux (sclère ink, diamètre 20 % du corps ; pupilles `ground`) ; deux paupières = arcs de la couleur du corps qui recouvrent l'œil (0–100 %) ; une variante de pupille en étoile 4 branches ; une paire d'arcs « yeux fermés heureux ». Sept formes, aucune autre. Tout le reste est transformation (scale, rotation, position des pupilles, couverture des paupières).

**Expressions**

| État | Yeux | Corps | Quand |
|---|---|---|---|
| Idle | paupières 0 %, pupilles centrées | respiration scaleY ± 3 % / 3 s | feed, visée |
| Blink | paupières 100 % pendant 120 ms | — | toutes 2–5 s (aléatoire) |
| Glance | pupilles + 2 px vers la cible, 1,6 s | — | feed (boucle), visée (à l'arrivée) |
| Fear | pupilles rétrécies à 60 %, tremblement 1 px | squash 1,12 × 0,88 | pendant le hold, proportionnel à la durée |
| Flight | paupières 30 % (plissé), pupilles dans le sens du vecteur vitesse | étirement 1,25 × 0,8 aligné sur la vitesse | vol |
| Dazed | pupilles qui orbitent en petits cercles (2 tours, 900 ms) puis clignement lent | wobble ± 4° | SCENIC ROUTE, ROUGH LANDING, OFF THE MAP |
| Deadpan | regard de côté vers le tapis, une paupière à 50 % | — | NOT BAD, NEAR MISS |
| Bright | pupilles 120 %, paupières 0 % | un petit saut (ressort) | ON THE MAT |
| Peek | paupières 100 % puis une seule s'ouvre vers le centre | — | SO CLOSE |
| Star | pupilles étoile | deux sauts | BULLSEYE |
| Bliss | arcs fermés heureux | flottement ± 6 px, halo or | PERFECT |
| Squint / Lean | paupières 40 % (Tiny Target) ; rotation 1,5° contre le vent (Crosswind) | — | tics de modificateur |

**Test de reconnaissance** : Pip idle + tapis, à 48 px, sans texte, doit se lire « DAYSHOT ». C'est l'icône de l'app, le favicon du sub, et le motif de la carte image de partage (V1).

---

## 9. Spécification de mouvement

| Élément | Déclencheur | Animation | Durée | Easing | But |
|---|---|---|---|---|---|
| Pip idle | permanent | scaleY ± 3 % | 3 000 ms | in-out-sine | vie |
| Pip blink | timer aléatoire 2–5 s | paupières 0 → 100 → 0 % | 120 ms | linear | vie |
| Pip glance | boucle feed / arrivée visée | pupilles + 2 px | 1 600 ms | in-out-sine | pointer la cible |
| Target pulse | boucle feed t = 4,4 s ; approche | scale 1 → 1,04 → 1 | 500 ms | out-sine | focal |
| Wind particles | permanent | translation selon le vent, densité par modificateur | continu | linear | lire les conditions |
| Comète (feed) | boucle t = 3,0 s | point + traîne le long de l'arc | 1 400 ms | in-out-cubic | arrêter le scroll |
| Mise en place | ouverture expanded | ciel → Pip (ressort) → cartes (stagger 80) | ≤ 1 200 ms | out-expo / spring(0,6) | rituel d'entrée |
| Hold | pointerdown | squash 1,12 × 0,88 ; vignette − 12 % ; particules 0,6× | 120 ms (in) | out-quad | tension |
| Release | pointerup | freeze 60 → stretch → shake 2 px | 60 + 90 ms | out-expo | claquer |
| Flight | vol | zoom 4–8 % vers l'apex, parallaxe 0,2 / 0,6 | durée du vol | in-out-sine | lisibilité de l'arc |
| Slow-mo | projeté ≤ 30 u | timescale 0,25 ; vignette − 20 % | 250 ms | linear | cœur qui s'arrête |
| Impact | contact | poussière 12–20 ; rebond ; roulis | 400 ms | out-quad | verdict physique |
| Marqueur + ligne | + 200 ms après impact | chute 200 ms ; tracé pointillé | 450 ms | out-cubic | raconter l'écart |
| Result framing | + 100 ms | zoom/pan pour cadrer impact + centre | 400 ms | out-expo | « où suis-je tombé » |
| Panneau | + 400 ms | translateY 100 % → 0 | 320 ms | out-expo | révélation |
| Verdict | après panneau | scale 0,92 → 1, opacity | 200 ms | spring(0,6) | mot qui claque |
| Count-up | après verdict | 0 → score | 600 ms | out-cubic | paiement |
| Streak + 1 | après contexte | flip du chiffre ; flamme pop scale 1 → 1,3 → 1 | 350 ms | out-back | récompense |
| Bullseye | verdict | halo tapis 18 → 40 % ; Pip Star | 600 ms | out-sine | rare |
| Perfect | verdict | onde de choc + 24 particules or + Pip Bliss | 900 ms | out-expo | exceptionnel |
| CTA press | pointerdown / hover | scale 0,97 ; hover translateY − 1 px | 120 ms | out-quad | réponse tactile |
| Transitions d'écran | boutons | fade + translateY 8 px | 200 ms | out-quad | sobriété |

`prefers-reduced-motion` : shakes, slow-mo, comète, parallaxe et onde de choc → fondus ; respiration et clignement conservés (ils sont lents et petits) ; count-up → valeur directe.

---

## 10. Copy (anglais, définitive)

### 10.1 Décisions de CTA

Cinq variantes évaluées pour la carte du feed : `TAP TO SHOOT` (ment : le tap n'ouvre que l'app), `SHOOT` (sec, ambigu), `I'M READY` (parle du joueur, pas de l'enjeu), `TAKE YOUR SHOT` (juste, mais oublie l'unicité), `TAKE YOUR ONE SHOT` (**retenu** : possession + unicité + honnête — aucun tir ne part sur ce tap). En jeu, le geste reste `HOLD TO AIM` avec sous-ligne `Release to shoot`. Sur l'état « déjà joué » : `Practice` · `Leaderboard`.

### 10.2 Mots-verdicts (calés sur la géométrie : 87 = bord du tapis, 99 = 12 u du centre, 100 = ≤ 4 u)

| Score | Verdict | Couleur | Note |
|---|---|---|---|
| 100 | `PERFECT` | or + halo | la séquence maximale |
| 99.00 – 99.99 | `BULLSEYE` | or | ~5–9 % des joueurs |
| 95.00 – 98.99 | `SO CLOSE` | corail | ≤ 32 u : anneau intérieur, le « argh » |
| 87.00 – 94.99 | `ON THE MAT` | ink | vous avez touché la cible |
| 70.00 – 86.99 | `NEAR MISS` | ink | ≤ 128 u : à deux largeurs de tapis |
| 50.00 – 69.99 | `NOT BAD` | ink | la médiane est à ~75 ; on reste honnête |
| 25.00 – 49.99 | `ROUGH LANDING` | mist | |
| 0.01 – 24.99 | `SCENIC ROUTE` | mist | le raté qui fait sourire |
| 0 (hors terrain) | `OFF THE MAP` | mist | |
| impact mur | `INTO THE WALL` | mist | remplace le verdict de tranche, la sous-ligne dit la hauteur manquée |

Les seuils vivent dans `copy.ts` avec la fonction de tranche, testés aux bornes. Jamais de rouge, jamais de « bottom », jamais de « fail ».

### 10.3 Contexte de comparaison

| Cas | Texte |
|---|---|
| N = 1 | `You opened the day.` |
| 2 ≤ N < 50 | `#7 of 12 today` |
| rang ≤ 3 (N ≥ 50) | chip or `#1 TODAY` / `#2 TODAY` / `#3 TODAY` |
| beat % ≥ 50 | chip corail `TOP 4.2% TODAY` (1 décimale sous 10 %, entier sinon) |
| beat % < 50 | `You beat 18% today` |
| toujours en dessous | `#1,204 / 8,421` |

### 10.4 Direction de l'impact

`48 over` · `251 short` · `12 short — inner ring` (si sur le tapis) · `into the wall, 180 below the top` · `off the map`. Toujours entier, jamais de décimale (la décimale reste dans le score).

### 10.5 Autres états

| État | Copy |
|---|---|
| Visée, sous le pill | `One official shot. No retries.` |
| Warm-up | `WARM-UP — this one doesn't count` → `That was practice. Now for real.` |
| Misfire (< 120 ms) | `Hold… then release.` |
| Feed, nouveau | `TAKE YOUR ONE SHOT` / `One try. No retries.` |
| Feed, streak | `🔥 7 DAY STREAK` / `Your shot is waiting.` |
| Feed, joué | `TODAY 94.61 · Top 11%` / `Next shot in 08:42:17` |
| Preuve sociale | `8,421 shots today · best 99.98` ; `31,842 shots yesterday · today just opened` |
| Streak | `🔥 8 day streak` ; reset : `Streak reset. Longest: 12 — day 1 starts now.` |
| Teaser | `TOMORROW · Moon Gravity` + countdown |
| Copie | toast `Copied` |
| Partage | `POST MY SHOT` → toast `Posted under today's thread` ; après : `Shared ✓` |
| Leaderboard vide | `Only 3 shots so far — you're early.` |
| Non connecté | `Log in to take today's real shot` (existant, mode démo) |
| Perfect | `Only 12 Perfects today.` (si ≥ 1) |
| Erreur réseau | `Your shot is saved. Sending…` puis `Scored.` |

Ton : verbes actifs, phrases de ≤ 7 mots, aucune exclamation, aucun « awesome ».

---

## 11. Sept atmosphères de modificateur (même UI, ciel différent)

Chaque thème définit : `sky.top`, `sky.bottom`, `ground`, `accent` (facultatif), particules, tic de Pip, traitement du tapis, glyphe. Le thème s'applique en 320 ms de fondu à l'ouverture et teinte aussi la carte du feed et la bande « demain ».

| Modificateur | Ciel (top → bottom) | Atmosphère & particules | Pip | Tapis / décor | Glyphe |
|---|---|---|---|---|---|
| Clear Skies | `#1E3A5C → #0D1626` | 12 étoiles fixes qui scintillent (opacité sinus), 6 particules dérivantes | idle standard | halo standard | soleil/étoile fine |
| Crosswind | `#2B3D52 → #0F1A28` (acier) | 30 stries horizontales dans le sens du vent, 3 nuages fins rapides ; un **fanion** sur le tapis pointe le vent | Lean 1,5° contre le vent, yeux plissés | fanion (aide de lecture) | flèches latérales |
| Tailwind | `#3A2F4F → #0D1626` (chaud) | longues stries dans le sens du tir, lignes de vitesse près du sol | pupilles vers la cible | halo légèrement allongé | flèche → |
| Gusty | `#26364A → #0D1626` | rafales : toutes les 0,8–2 s, bouffée de 15 particules ; fanion qui claque | flinch (micro-squash) à chaque rafale | fanion irrégulier | flèches en zigzag |
| Moon Gravity | `#2A2657 → #120F2A` (indigo) | grande lune (30 % de la largeur) derrière le tapis, 8 particules qui *montent* lentement | idle plus ample et plus lent (± 5 %, 4 s) | halo violet | croissant |
| Tiny Target | `#1E3A5C → #0D1626` | un cône de spot sur le tapis, particules quasi nulles | Squint 40 % | R = 30, anneaux plus contrastés | loupe |
| Long Shot | `#1B3350 → #0A0F1A` | ligne d'horizon, ticks de distance au sol tous les 100 u, brume vers la cible | pupilles 120 % (« il est loin ») | scène à 0,8×, tapis plus petit à l'écran | double flèche → → |

Extreme Friday (V1) et les modificateurs coût-M héritent du même mécanisme (combinaison de deux thèmes : le second ne fournit que ses particules).

Règle d'accessibilité : la lecture du vent ne dépend jamais des particules ; la flèche + la valeur restent la vérité.

---

## 12. Responsive

| Contexte | Dimensions de conception | Règles |
|---|---|---|
| Feed inline, mobile | 360 × **350** (pire cas) et 360 × 512 | Composition 4:3 ; le CTA est toujours visible sans scroll ; à 350 px : bandeau 36, scène 190, preuve 20, CTA 44, micro 16, marges 44. |
| Feed inline, desktop | 700 × 512 | Composition paysage : Pip à 12 % de x, tapis à 80 %, texte en bas-gauche, CTA (200 px) en bas-droite. Aucune zone morte : l'atmosphère remplit. |
| Expanded, mobile | 390 × 720 (min 360 × 640) | Zéro scroll sur le tir et le résultat ; safe areas (`env(safe-area-inset-*)`) ; cibles ≥ 48 px ; score 44 px (56 px si hauteur ≥ 760). |
| Expanded, desktop | panneau portrait 480 × 760 max, centré | Même structure, scène à 52 % ; le surplus de hauteur va à la scène, jamais au panneau ; clic = hold. |
| < 360 px | compact | Score 40 px, cartes de conditions sur une ligne, teaser sur une ligne. |

Canvas : rendu à `min(devicePixelRatio, 2)`, couches statiques (ciel, sol) mises en cache hors écran par thème ; seule la couche dynamique (particules, Pip, projectile, UI de scène) se redessine.

---

## 13. Design system (pragmatique, codable en une session)

**Couleurs (tokens CSS + constantes canvas, une seule source : `tokens.ts`)**

| Token | Hex | Rôle | Contraste sur `bg` |
|---|---|---|---|
| `bg` | `#0D1626` | fond, ciel bas | — |
| `bg.elevated` | `#16233A` | panneaux (résultat, leaderboard, cartes) | — |
| `sky.top` / `sky.bottom` | par thème (§11) | dégradé de ciel | — |
| `ground` | `#0A0F1A` | silhouettes de sol, pupilles | — |
| `ink` | `#F2F6FC` | texte principal, score, jauge | 15 : 1 |
| `mist` | `#8DA3BF` | texte secondaire, distances, verdicts bas | 7 : 1 |
| `coral` | `#FF6B4A` | **action & énergie** : CTA plein, chip percentile, flamme, verdict 95–98.99 | 6,4 : 1 |
| `coral.pressed` | `#E6553A` | état pressé | — |
| `gold` | `#FFC53D` | Bullseye, Perfect, records, top 3 | 11,5 : 1 |
| `pip` | `#2A3242` | corps de Pip | — |
| `ring.outer` / `ring.mid` / `ring.center` | `ink` 70 % / `coral` / `gold` | anneaux du tapis | — |

Règles : texte sur corail = `bg` (jamais blanc : 2,5 : 1). Un seul bloc corail plein par écran (le CTA). Le corail en texte est réservé aux chips de contexte et au verdict. Aucun rouge. Les glows n'existent qu'en deux endroits : halo du tapis et Perfect.

**Typographie** : une famille, **Space Grotesk** (woff2 embarqué dans les assets — aucune ressource externe dans un webview Devvit), graisses 500 et 700. Six tailles, rien d'autre :

| Rôle | Taille / graisse | Usage |
|---|---|---|
| Display | 44 / 700, tracking − 0,01 em | wordmark feed, mot-verdict |
| Score | 44 mobile · 56 desktop / 700, tabulaire | score, count-up |
| Heading | 20 / 700 | en-têtes de panneaux |
| Label | 12 / 700, tracking + 0,06 em, capitales | chips, tampons (`#24`, `TOMORROW`) — seul usage des capitales avec les CTA et verdicts |
| Body | 15 / 500 | contexte, lignes de preuve, boutons secondaires |
| Numeric | 15 / 700, tabulaire | rangs, distances, countdown |

Chiffres tabulaires : `font-variant-numeric: tabular-nums` ; si la fonte embarquée n'expose pas `tnum`, rendre chaque chiffre dans une boîte de largeur fixe (0,62 em). À vérifier par Claude Code au chargement de la fonte.

**Espacement** : grille 4/8 — 4, 8, 12, 16, 24, 32. **Rayons** : chips 999, boutons 14, panneaux 24 (haut), cartes de conditions 12. **Hauteurs** : CTA 56, secondaire 44, chip 28, icône 44 ; cible tactile minimale 48. **Traits** : 2 px (anneaux, jauge), 3 px (anneau central), ligne d'impact pointillée 2 px / pas 6.

**Durées** : micro 120 · court 200 · moyen 320 · long 600 · révélation ≤ 1 600 total. **Easings** : out-expo (entrées), out-quad (réponses tactiles), in-out-sine (boucles), spring(0,6) (Pip, verdict), out-back (streak). **Particules** : feed ≤ 24 ; mobile ≤ 40 ambiant / ≤ 80 en burst ; desktop ×2. **Ombres** : aucune ; profondeur par couleur ; glow uniquement §3.

**Breakpoints** : < 360 compact · 360–599 mobile · 600–899 inline desktop / tablette · ≥ 900 expanded desktop.

---

## 14. Wireframes

### A. Feed — nouveau joueur (mobile 360 × 350)

```
┌──────────────────────────────────────────┐
│ DAYSHOT #24                 ≋ CROSSWIND  │  36  wordmark + stamp / chip modificateur
│  ·  ✦          ~~~~~~   ~~~~~~   ~~~~    │
│        ·  ·  ·  ·  ·  ·  ·  ·            │      arc fantôme pointillé (comète à 3 s)
│     ·                          ·  ·      │
│   ·                                ┌──┐  │
│ (◕◕)                               │◎ │  │      Pip idle, regarde le tapis ; tapis + halo
│ ▄▄▄▄▄▄▄▄▄▄                    ▄▄▄▄┘  └▄ │      sol en 2 bandes
│ 8,421 shots today · best 99.98           │  20  preuve sociale réelle (mist)
│ ┌──────────────────────────────────────┐ │
│ │          TAKE YOUR ONE SHOT          │ │  44  CTA corail, texte bg
│ └──────────────────────────────────────┘ │
│              One try. No retries.        │  16  micro (mist)
└──────────────────────────────────────────┘
```

### B. Feed — joueur avec streak, pas encore joué

```
┌──────────────────────────────────────────┐
│ DAYSHOT #24                 ≋ CROSSWIND  │
│                             🔥 7 DAY STREAK │  chip streak (corail texte, fond elevated)
│        ·  ·  ·  ·  ·  ·  ·  ·            │
│   ·                                ┌──┐  │
│ (◕◕)                               │◎ │  │
│ ▄▄▄▄▄▄▄▄▄▄                    ▄▄▄▄┘  └▄ │
│ Your shot is waiting · 8,421 shots today │
│ ┌──────────────────────────────────────┐ │
│ │          TAKE YOUR ONE SHOT          │ │
│ └──────────────────────────────────────┘ │
│              One try. No retries.        │
└──────────────────────────────────────────┘
```

### C. Feed — déjà joué

```
┌──────────────────────────────────────────┐
│ DAYSHOT #24                 ≋ CROSSWIND  │
│                                          │
│           ·  ·  ·  ·  ·                  │      arc du VRAI tir (données du joueur)
│       ·                 ·                │
│    ·                        ·      ┌──┐  │
│  ▄▄▄▄▄                    (◕◕)▼- - │◎ │  │      Pip à l'impact, marqueur, ligne → centre
│                              48 over ┘  └│
│ TODAY 94.61 · Top 11%                    │  20  résultat du jour (ink + chip)
│ ┌────────────────┐ ┌───────────────────┐ │
│ │    Practice    │ │    Leaderboard    │ │  44  deux ghost (ouvrent l'expanded)
│ └────────────────┘ └───────────────────┘ │
│           Next shot in 08:42:17          │  16  countdown tabulaire
└──────────────────────────────────────────┘
```

### D. Expanded mobile — avant le tir (390 × 720)

```
┌────────────────────────────────────────────┐
│ #24  ≋ Crosswind                 🔥 7   ?  │ 44  barre du jour
│  ✦        ~~~~~~   ~~~~~~   ~~~~~     ✦    │
│                                            │
│                                            │
│                                     ┌───┐  │
│                                     │ ◎ │  │     tapis + halo, plateau à hauteur H
│                             ▄▄▄▄▄▄▄▄┘   └▄ │
│   (◕◕)                                     │     Pip sur la lèvre, respire, regarde
│  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄ │     sol
│ ┌──────────────────┐ ┌───────────────────┐ │
│ │ WIND  ◀━━━ −380  │ │ DIST     640      │ │ 56  cartes de conditions (rayon 12)
│ └──────────────────┘ └───────────────────┘ │
│                                            │
│              ( HOLD TO AIM )               │ 48  pill respirant (ink 70 %)
│         One official shot. No retries.     │ 16  micro (mist), une seule fois
└────────────────────────────────────────────┘
```

### E. Expanded mobile — pendant le hold

```
┌────────────────────────────────────────────┐
│ #24  ≋ Crosswind                 🔥 7   ?  │
│ ░░░░░░░░ monde assombri 12 %, particules 0,6× ░░ │
│                                     ┌───┐  │
│                                     │ ◎ │  │
│         ╭─────╮             ▄▄▄▄▄▄▄▄┘   └▄ │
│        ╱ jauge ╲                           │     arc de jauge autour du lanceur,
│   (•͈•͈)  balaie                            │     Pip en squash, pupilles rétrécies
│  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄ │
│ ┌──────────────────┐ ┌───────────────────┐ │
│ │ WIND  ◀━━━ −380  │ │ DIST     640      │ │     conditions restent lisibles
│ └──────────────────┘ └───────────────────┘ │
│                                            │
│              Release to shoot              │ 48  remplace le pill pendant l'appui
│                                            │
└────────────────────────────────────────────┘
```

### F. Expanded mobile — vol

```
┌────────────────────────────────────────────┐
│ #24  ≋ Crosswind                 🔥 7   ?  │
│              ~~~   (>͡ ͜ʖ>͡)~~~               │     Pip étiré, plissé, traîne ; caméra
│          ·  ·          ~~~ ·               │     zoome 4–8 % vers l'apex, parallaxe
│      ·                      ·   ┌───┐      │
│   ·                           · │ ◎ │      │     anneau du tapis pulse à l'approche
│  ·                      ▄▄▄▄▄▄▄▄┘   └▄     │
│ ▄▄▄▄▄▄▄▄▄▄                                 │
│  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄ │
│ ┌──────────────────┐ ┌───────────────────┐ │
│ │ WIND  ◀━━━ −380  │ │ DIST     640      │ │     figées (aucune interaction)
│ └──────────────────┘ └───────────────────┘ │
│                                            │
│                                            │
└────────────────────────────────────────────┘
```

### G. Résultat mobile

```
┌────────────────────────────────────────────┐
│ #24  ≋ Crosswind                 🔥 8   ?  │ 44
│ ░░ scène recadrée sur impact + centre, − 15 % ░ │
│          ·  ·  ·  ·                        │
│      ·              ·     ┌───────┐        │
│   ·                (◕◕)▼ - - - ◎  │        │     Pip à l'arrêt, marqueur, ligne → centre
│  ▄▄▄▄▄▄▄          ▄▄▄▄▄▄▄┘ 48 over└▄▄      │     étiquette de direction (ink 15)
│ ╭──────────────────────────────────────╮   │
│ │ SO CLOSE                      96.42  │   │ 48  verdict corail 44 / score tabulaire 44
│ │ TOP 4.2% TODAY  ·  #1,204 / 8,421    │   │ 24  chip + rang (mist)
│ │ 🔥 7 → 8 day streak                  │   │ 28  incrément animé
│ │ ┌──────────────────────────────────┐ │   │
│ │ │          POST MY SHOT            │ │   │ 56  seul bloc corail plein
│ │ └──────────────────────────────────┘ │   │
│ │ ┌─────────────┐ ┌─────────────┐ ┌──┐ │   │
│ │ │  Practice   │ │ Leaderboard │ │⧉ │ │   │ 44  ghost, ghost, icône copier
│ │ └─────────────┘ └─────────────┘ └──┘ │   │
│ │ ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀ │   │  4  bande de ciel de demain (sky.top du thème)
│ │ TOMORROW  ☾ Moon Gravity    08:42:17 │   │ 40  teaser + countdown tabulaire
│ ╰──────────────────────────────────────╯   │
└────────────────────────────────────────────┘
```

### H. Leaderboard (panneau sur la scène)

```
┌────────────────────────────────────────────┐
│ ░░░░░░░░░░ scène assombrie 25 % ░░░░░░░░░░ │
│ ╭──────────────────────────────────────╮   │
│ │ TODAY · 8,421 shots              ✕   │   │ 48  en-tête
│ │ ● #1   moonwalker_88     99.98   2   │   │     or · pseudo · score · distance (mist)
│ │ ● #2   quietarcher       99.91   3   │   │     mist
│ │ ● #3   Pip_fanclub       99.87   4   │   │     corail atténué
│ │ · · ·                                │   │
│ │   #1,202  throwaway_42   96.51   28  │   │
│ │   #1,203  dune_rider     96.47   29  │   │
│ │ ▌ #1,204  YOU            96.42   31  │   │     barre corail + graisse 700
│ │   #1,205  sky_pilot      96.40   32  │   │
│ │   #1,206  orbital_jam    96.33   33  │   │
│ │                                      │   │
│ │ You beat 85% today.                  │   │     rappel du contexte (mist)
│ ╰──────────────────────────────────────╯   │
└────────────────────────────────────────────┘
```

### I. Feed desktop (700 × 512)

```
┌──────────────────────────────────────────────────────────────────────┐
│ DAYSHOT #24                                            ≋ CROSSWIND   │
│   ✦      ~~~~~~~~~   ~~~~~~~~~     ✦     ~~~~~~~~~~~                 │
│                 ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·                      │
│           ·                                    ·  ·                  │
│       ·                                              ·     ┌─────┐   │
│    ·                                                    ·  │  ◎  │   │
│  (◕◕)                                                      │     │   │
│ ▄▄▄▄▄▄▄▄▄▄▄▄▄                                    ▄▄▄▄▄▄▄▄▄▄┘     └▄▄ │
│  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄ │
│ 8,421 shots today · best 99.98                 ┌────────────────────┐│
│ One try. No retries.                           │ TAKE YOUR ONE SHOT ││
│                                                └────────────────────┘│
└──────────────────────────────────────────────────────────────────────┘
```

### J. Résultat desktop (panneau expanded 480 × 760)

```
┌──────────────────────────────────────────────┐
│ #24  ≋ Crosswind                    🔥 8   ? │
│                                              │
│      scène 52 % — même cadrage impact/centre │
│          ·  ·  ·  ·                          │
│      ·              ·      ┌────────┐        │
│   ·                (◕◕)▼ - - - - ◎  │        │
│  ▄▄▄▄▄▄▄          ▄▄▄▄▄▄▄▄┘ 48 over └▄▄      │
│                                              │
│ ╭──────────────────────────────────────────╮ │
│ │ SO CLOSE                          96.42  │ │  score 56
│ │ TOP 4.2% TODAY  ·  #1,204 / 8,421        │ │
│ │ 🔥 7 → 8 day streak                      │ │
│ │ ┌──────────────────────────────────────┐ │ │
│ │ │            POST MY SHOT              │ │ │
│ │ └──────────────────────────────────────┘ │ │
│ │ ┌───────────────┐ ┌───────────────┐ ┌──┐ │ │
│ │ │   Practice    │ │  Leaderboard  │ │⧉ │ │ │
│ │ └───────────────┘ └───────────────┘ └──┘ │ │
│ │ ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀ │ │
│ │ TOMORROW  ☾ Moon Gravity        08:42:17 │ │
│ ╰──────────────────────────────────────────╯ │
└──────────────────────────────────────────────┘
```

---

## 15. Priorités

**P0 — indispensable (sans ça, ne pas relancer)**
1. Vue inline du feed (§4) : scène + Pip idle + tapis + arc fantôme + atmosphère + preuve sociale réelle + `TAKE YOUR ONE SHOT`, conçue pour 350 px et 512 px, états A/B/C.
2. Scène persistante au résultat + result framing + marqueur + ligne + étiquette de direction (§6).
3. Mots-verdicts et contexte de comparaison (§10.2–10.4) ; suppression de `FIRST SHOT TODAY`.
4. Panneau de résultat V2 (hiérarchie 7 questions, un seul bloc corail, secondaires en boutons, icône copier, bande de demain).
5. Tokens et typographie (§13) appliqués partout ; correction du wrap `Copy card` ; zéro scroll vérifié à 360 × 640.
6. Mise en place à l'ouverture + micro-ligne d'enjeu (§5).

**P1 — très important**
7. Pip : les 12 expressions et les réactions par tranche (§8).
8. Les 7 atmosphères de modificateur (§11), feed + jeu + bande de demain.
9. Caméra de vol (zoom apex + parallaxe), impact enrichi, cascade de révélation, incrément de streak (§9).
10. Leaderboard V2 (§7).
11. Feed : boucle ambiante complète (comète, pulse, regard) avec pause hors viewport.

**P2 — polish**
12. Bullseye/Perfect : halo, onde de choc, Pip Star/Bliss.
13. Composition paysage du feed desktop ; expanded desktop à 52 % de scène.
14. Streak dans le leaderboard (ajout backend minimal), Perfects du jour dans le feed.
15. Réglage fin des particules par device (budget adaptatif selon le frame time mesuré).

**P3 — plus tard**
16. Buckets A/B déterministes par hash d'userId (pour les tests du §17).
17. Variantes cinématiques d'événements rares, skins saisonniers (dépendent du système cosmétique V1).

Ordre d'exécution imposé : P0.5 (tokens) → P0.1 (feed) → P0.2–4 (résultat) → P0.6 → P1 dans l'ordre. Le feed avant le résultat : c'est lui qui décide si quelqu'un voit le reste.

---

## 16. Risques

| Risque | Probabilité | Mitigation |
|---|---|---|
| La vue inline se rend plus petite que prévu sur mobile (issue #254) | élevée | Concevoir à 350 px d'abord ; tester sur iOS et Android réels avant tout autre polish ; CTA jamais sous le pli. |
| La doc Devvit contredit le schéma (#159) | élevée | Claude Code s'aligne sur `devvit-template-react` (entrypoints, `requestExpandedMode`) et sur le JSON schema, pas sur le guide. |
| Le bundle inline embarque le jeu par accident | moyenne | Entrée séparée, import de `sim.ts` interdit dans `/inline`, test de taille (≤ 60 Ko gzip) dans la CI. |
| Régression du déterminisme (la UI touche la sim) | faible | Interdiction absolue de modifier `/shared/sim.ts` et le scoring ; la caméra et le framing ne lisent la trajectoire qu'en lecture. |
| Fatigue visuelle / animations permanentes | moyenne | Une boucle de 6 s avec 60 % de repos ; reduced-motion honoré ; aucune animation sur les textes. |
| Trop de corail | moyenne | Règle « un bloc plein par écran » vérifiée en QA visuelle. |
| Espace Grotesk sans chiffres tabulaires | moyenne | Vérification à l'intégration ; repli boîtes fixes. |
| Perf sur mobiles d'entrée de gamme | moyenne | Budgets de particules, couches statiques en cache, DPR ≤ 2, frame time mesuré. |
| Le nouveau CTA laisse croire que le tir est consommé | faible | Le tap ouvre l'expanded sur la mise en place, jamais sur un tir ; `HOLD TO AIM` reste le geste. |
| Review Reddit : audio auto, CTA trompeur, données fictives | faible | Aucun audio dans le feed ; copy honnête ; chiffres réels uniquement (§4.3). |
| Claude Code passe six heures sur Pip avant le feed | élevée | Ordre d'exécution verrouillé dans le prompt (§20), une phase = un commit + une QA. |

---

## 17. Métriques & hypothèses

| Surface | Métrique | Instrumentation | Hypothèse testable |
|---|---|---|---|
| Feed | taux de lancement = expansions / impressions inline | événement `inline_view` (throttlé 1/session/post) + `expand_click` | La scène + preuve sociale double le taux de lancement vs la carte actuelle. |
| Visée | complétion = tirs officiels / lancements | existant (`aim_start`, `shot_submitted`) | La mise en place ne réduit pas la complétion (< 1 s, interruptible). |
| Résultat | taux de partage = (commentaire + copie) / tirs | existant | Le mot-verdict + la ligne d'impact augmentent le partage, surtout sous 90. |
| Teaser | D1 | cohortes existantes | La bande de demain + teaser lisible augmente D1 de quelques points. |
| Practice | tirs practice / tir officiel | existant | La scène visible au résultat augmente la revanche immédiate. |
| Leaderboard | ouvertures / tir | `leaderboard_open` | La fenêtre « autour de vous » retient les joueurs médians. |

Aucune de ces améliorations n'est garantie ; chaque ligne est une hypothèse mesurée sur ≥ 2 semaines et ≥ 1 000 joueurs par bras avant conclusion. Tests A/B à venir (P3, une variable à la fois) : `TAKE YOUR ONE SHOT` vs `TAP TO SHOOT` ; preuve sociale visible vs absente ; Pip proéminent vs minimal ; score-first vs percentile-first ; teaser fort vs discret ; verdict on/off. Devvit n'offre pas de plateforme A/B : un bucket déterministe par hash d'`userId` suffira le jour venu.

---

## 18. Fichiers et composants probablement touchés (à confirmer par inspection du repo)

- `devvit.json` — ajout de l'entrypoint inline (`splash`, `inline: true`) à côté de `game` ; hauteur `tall`.
- `src/client/inline/` (nouveau) — `index.html`, `main.ts`, `scene-lite.ts` (Pip idle, tapis, arc, particules feed), `states.ts` (A/B/C), aucun import de `sim.ts`.
- `src/client/ui/tokens.ts` (nouveau) + `tokens.css` — palette, typo, espacements, durées, easings (source unique).
- `src/client/scene/` — `renderer.ts` (couches, DPR, cache statique), `pip.ts` (nouveau : 7 formes, 12 expressions), `particles.ts` (nouveau), `camera.ts` (nouveau : zoom de vol, result framing), `themes.ts` (nouveau : 7 atmosphères), `target.ts` (halo, fanion, anneaux).
- `src/client/screens/result.ts` — panneau V2, cascade, verdict, contexte, bande de demain, icône copier.
- `src/client/screens/leaderboard.ts` — top 3 + fenêtre, états vides.
- `src/client/screens/game.ts` / machine d'états — mise en place, hold/flight hooks vers `camera.ts`, `result_framing` entre `impact` et `result`.
- `src/client/audio/` — accents (aucun nouveau son requis).
- `src/shared/copy.ts` — verdicts, contexte, directions, CTA, états feed.
- `src/shared/types.ts` — champs de réponse `state` si ajout (`yesterdayShots`, `perfectsToday` sont déjà dans `day:{n}:meta`).
- `src/server/` — `GET /api/state` : exposer `yesterdayShots` (lecture `day:{n−1}:meta`) ; éventuellement `streak` dans la fenêtre de leaderboard (P2). Rien d'autre.
- `public/fonts/` — Space Grotesk 500/700 woff2 sous-ensemble latin.
- `tests/` — verdicts aux bornes, contexte N = 1/2/49/50/4381, result framing (impact proche, lointain, off map, mur), taille du bundle inline, snapshots de copy.
- `tools/harness` — captures automatisées des états de QA (§20, phase 10).

---

## 19. Plan d'implémentation (résumé ; détail dans le prompt §20)

| Phase | Contenu | Gate |
|---|---|---|
| 0 | Baseline : tests, typecheck, build, cartographie de l'architecture, captures avant | tout vert |
| 1 | Tokens, fonte, utilitaires de layout | tests inchangés |
| 2 | Vue inline du feed (états A/B/C, boucle ambiante, sécurité) | bundle ≤ 60 Ko gz, 350 px OK |
| 3 | Scène de jeu : mise en place, thèmes, Pip idle, conditions | 60 fps mobile |
| 4 | Résultat V2 : framing, marqueur, ligne, verdict, contexte, panneau, cascade | zéro scroll 360 × 640 |
| 5 | Leaderboard V2 | états vides testés |
| 6 | Atmosphères des 7 modificateurs (feed + jeu + bande de demain) | reconnaissance sans lire |
| 7 | Pip expressions/réactions, caméra de vol, impact, streak, Bullseye/Perfect | reduced-motion OK |
| 8 | Responsive mobile/desktop, safe areas, compact | 3 viewports |
| 9 | Accessibilité, performance, budgets | contraste AA, DPR, particules |
| 10 | QA visuelle complète + tests + rapport | captures livrées |

---

# PROMPT FINAL POUR CLAUDE CODE

*À coller tel quel dans Claude Code, depuis la racine du projet, après avoir déposé ce fichier à la racine sous le nom `DAYSHOT-UI-REDESIGN.md`.*

~~~
Tu interviens sur DAYSHOT, un jeu Devvit Web fonctionnel (gameplay, physique déterministe, seed quotidien, scoring serveur, streak, leaderboard, practice, partage, scheduler, anti-triche, 220 tests). Ta mission est une refonte UI / UX / direction artistique / game feel / motion. Tu ne réécris pas le projet : tu inspectes, tu comprends, tu modifies la couche de présentation, et tu laisses le backend et la simulation intacts.

LIS D'ABORD, DANS CET ORDRE, AVANT TOUTE MODIFICATION :
1. DAYSHOT-UI-REDESIGN.md (racine) — la spec de cette refonte. Ses décisions sont fermes : tokens (§13), copy (§10), verdicts (§10.2), wireframes (§14), motion (§9), atmosphères (§11), priorités (§15). Quand tu hésites, la spec tranche ; quand la spec est muette, choisis la solution la plus simple qui respecte ses principes (§2).
2. ONE-SHOT-GDD.md — la référence gameplay/backend (le jeu s'appelle désormais DAYSHOT ; le GDD conserve l'ancien nom, c'est normal).
3. Le repository entier : devvit.json, src/client, src/server, src/shared, tests, tools, AGENTS.md, RELEASE.md, PLAYTEST.md, CALIBRATION.md. Cartographie l'architecture réelle (entrypoints, machine d'états, rendu canvas, écrans, copy.ts, tunables, harness) et écris cette cartographie dans docs/ARCHITECTURE-UI.md avant de toucher à quoi que ce soit.
4. La doc Devvit courante sur developers.reddit.com ET le template officiel reddit/devvit-template-react (src/client/splash.tsx, devvit.json) : c'est là que se trouvent le pattern officiel d'entrypoint inline (`splash`) + expanded (`game`) et l'appel `requestExpandedMode(event, 'game')` depuis `@devvit/web/client`. En cas de contradiction entre le guide et le template/schéma, le template et le schéma gagnent (la doc contient des exemples périmés — issue #159 du repo docs). Sache aussi qu'une vue inline `tall` peut se rendre à ~350 px de haut sur les apps mobiles (issue #254) : conçois pour 350 px d'abord.

INTERDICTIONS ABSOLUES (toute violation = retour en arrière) :
- Ne modifie ni src/shared/sim.ts, ni le scoring, ni la génération de seed, ni les verrous, ni les clés Redis, ni le scheduler, ni le partage, ni l'anti-triche, ni la logique de streak/leaderboard/practice. Seuls ajouts backend autorisés, minimaux : exposer `yesterdayShots` dans GET /api/state (lecture de day:{n-1}:meta) et, en P2 seulement, le streak des lignes affichées dans la fenêtre de leaderboard.
- Aucun test métier existant ne doit être modifié pour passer. Tu peux en ajouter.
- Le bundle inline (feed) n'importe jamais sim.ts, la machine d'états de jeu, l'audio ou les handlers de hold. Il ne contient que : rendu léger de la scène, états A/B/C, un fetch vers /api/state, le CTA qui appelle requestExpandedMode. Taille cible ≤ 60 Ko gzip, avec un test qui échoue au-delà.
- Aucun tir ne peut être déclenché depuis le feed. Aucun audio dans le feed. Aucune donnée fictive, aucun faux compteur, aucun « LIVE », aucune urgence artificielle, aucun rouge d'erreur pour un score.
- Une seule famille typographique (Space Grotesk, woff2 embarqué dans les assets, 500 et 700). Aucune ressource externe.
- Un seul bloc corail plein par écran (le CTA). Texte sur corail = couleur bg, jamais blanc.
- prefers-reduced-motion respecté partout (§9, dernière ligne).
- Pas de bibliothèque d'animation ; canvas + rAF + transforms/opacity CSS.

MÉTHODE DE TRAVAIL :
- Travaille directement dans le repository, fichier par fichier. Pas de snippets théoriques.
- Une phase = une branche de commits atomiques + un gate : `npm run type-check` (ou équivalent), `npm run lint`, `npm run test`, `npm run build`, puis captures via le harness local (`npm run harness`) ou l'outil de capture disponible ; corrige avant de continuer. Ne passe JAMAIS à la phase suivante avec un gate rouge.
- Feature flag : introduis `UI_V2` (constante de build, défaut true) permettant de rebasculer l'ancien résultat et l'ancienne splash pendant les phases 2–4 ; supprime le flag et l'ancien code en phase 10.
- Toute idée hors spec va dans BACKLOG.md, pas dans le code.
- Copy joueur uniquement dans src/shared/copy.ts ; tokens uniquement dans src/client/ui/tokens.ts (+ tokens.css générés ou miroirs).
- Après chaque phase, écris 5 lignes dans docs/UI-V2-LOG.md : ce qui a été fait, ce qui a été vérifié, ce qui reste.

PHASE 0 — BASELINE
- Exécute type-check, lint, tests, build : tout doit être vert AVANT toi. Note les chiffres (nombre de tests, taille des bundles).
- Capture l'état actuel (feed, ready, hold, flight, résultat, leaderboard, practice) en mobile 390×720 et desktop, via le harness ; range-les dans docs/qa/before/.
- Écris docs/ARCHITECTURE-UI.md. Liste les fichiers que tu prévois de toucher (compare avec la §18 de la spec et signale les écarts).
Gate : baseline verte + captures + cartographie commitées.

PHASE 1 — FONDATIONS
- Crée src/client/ui/tokens.ts (couleurs, typo, espacements, rayons, hauteurs, durées, easings, budgets de particules, breakpoints — valeurs exactes de la §13) et le miroir CSS.
- Intègre Space Grotesk 500/700 (sous-ensemble latin) depuis public/fonts ; vérifie `tnum` ; sinon implémente le repli à boîtes fixes pour les chiffres (score, countdown, rangs).
- Remplace toute couleur/taille/durée codée en dur par les tokens. Aucun changement visuel volontaire dans cette phase à part la fonte.
Gate : tests inchangés, build vert, captures identiques au pixel près hors typographie.

PHASE 2 — VUE INLINE DU FEED (P0, priorité absolue)
- Ajoute l'entrypoint inline dans devvit.json selon le pattern officiel (`splash` inline + `game` expanded ; `height: tall`). Vérifie le nom exact des champs dans le schéma installé.
- Crée src/client/inline/ : scène légère (ciel du thème, deux bandes de sol, lanceur, tapis + halo, arc fantôme pointillé décoratif, Pip idle avec respiration/clignement/regard, particules ≤ 24), les 3 états A/B/C de la §4.4 alimentés par un seul fetch /api/state (état A si non connecté ou erreur), la preuve sociale selon les règles de la §4.3, le CTA `TAKE YOUR ONE SHOT` → requestExpandedMode(event, 'game') ; en état C, `Practice` et `Leaderboard` ouvrent l'expanded avec un paramètre de route lu par la machine d'états (route ⇒ écran direct, sans mise en place).
- Boucle ambiante de 6 s (§4.5), 30 fps plafonné, pause hors viewport et onglet caché, reduced-motion = image fixe + clignement.
- Deux compositions : mobile 4:3 (conçue à 350 px puis 512 px) et desktop paysage (§14 A/B/C/I). CTA toujours visible sans scroll.
- Conserve un splash statique de repli (config Devvit) reprenant la même composition en image par modificateur, si la plateforme l'exige quand l'inline n'est pas rendu — vérifie dans la doc/le schéma si ce repli existe et comment il se configure.
Gate : bundle inline ≤ 60 Ko gzip (test), aucune importation interdite (test), rendu vérifié à 360×350, 360×512, 700×512 ; le tap du CTA ouvre l'expanded sans déclencher de tir (test manuel + assertion : la machine d'états n'est pas instanciée dans le bundle inline).

PHASE 3 — SCÈNE DE JEU
- Refactorise le renderer en couches (ciel/sol en cache hors écran par thème ; couche dynamique), DPR ≤ 2.
- Implémente src/client/scene/themes.ts avec les 7 atmosphères de la §11 (couleurs, particules, tics de Pip, traitement du tapis, glyphes vectoriels de modificateur — remplace les emojis dans l'UI, garde-les dans les textes de partage).
- Mise en place à l'ouverture (§5, ≤ 1,2 s, interruptible), cartes de conditions (flèche de vent proportionnelle + valeur, distance), pill `HOLD TO AIM` respirant, micro-ligne `One official shot. No retries.`.
- Hold : squash, vignette −12 %, particules 0,6×, pupilles qui rétrécissent. Release : freeze 60 ms, stretch, shake 2 px. Aucune modification de la jauge ni du calcul de holdMs.
Gate : 60 fps sur mobile milieu de gamme (mesure le frame time dans le harness), tests verts, reduced-motion vérifié.

PHASE 4 — RÉSULTAT V2 (P0)
- Ajoute l'état `result_framing` entre impact et result : caméra qui cadre impact + centre (§6), 400 ms out-expo, rayon du tapis ≥ 24 px à l'écran, cas OFF THE MAP et INTO THE WALL.
- Marqueur qui tombe, ligne pointillée impact → centre, étiquette de direction (§10.4). Pip reste où il s'est arrêté.
- Panneau V2 (§6 + wireframe G) : verdict (§10.2, fonction de tranche testée aux bornes 0 / 0.01 / 24.99 / 25 / 49.99 / 50 / 69.99 / 70 / 86.99 / 87 / 94.99 / 95 / 98.99 / 99 / 99.99 / 100 + mur + off map), score tabulaire, contexte (§10.3, testé à N = 1, 2, 49, 50, 4381 et rangs 1/2/3), streak avec incrément animé, CTA unique, `Practice` / `Leaderboard` en boutons ghost égaux + icône copier (toast `Copied`), bande de ciel de demain + `TOMORROW · <Modifier> · countdown`.
- Cascade (§9) uniquement à la première révélation ; instantané au retour ; practice = filigrane, `Try again`, pas de partage.
- Supprime `FIRST SHOT TODAY` et l'ancien panneau (derrière UI_V2 jusqu'à la phase 10).
Gate : zéro scroll à 360×640 et 390×720, toutes les lignes visibles, tests verts, captures des états médiocre / bon / Bullseye / Perfect / off map / mur / practice.

PHASE 5 — LEADERBOARD V2
- Panneau sur scène assombrie (§7, wireframe H) : en-tête avec total du jour, top 3 à pastilles, séparateur, fenêtre ±2 autour du joueur, ligne YOU marquée, colonnes rang/pseudo/score/distance, états `< 5 joueurs` et `pas encore joué`. Aucun changement de l'endpoint (sauf P2).
Gate : tests des états vides, captures mobile/desktop.

PHASE 6 — ATMOSPHÈRES PARTOUT
- Applique les thèmes au feed inline, à la scène, à la bande de demain (`sky.top` du modificateur de demain) et au splash de repli. Vérifie que le vent reste lisible sans particules (flèche + valeur).
Gate : capture des 7 modificateurs en feed et en jeu ; un lecteur doit nommer le modificateur sans lire le chip.

PHASE 7 — PIP, VOL, IMPACT, RÉCOMPENSES
- src/client/scene/pip.ts : 7 formes, 12 expressions de la §8 (idle, blink, glance, fear, flight, dazed, deadpan, bright, peek, star, bliss, squint/lean).
- Caméra de vol (zoom apex 4–8 %, parallaxe 0,2/0,6, lanceur et tapis toujours dans le cadre), impact (poussière, rebond, roulis), réactions par tranche, streak flip + flamme, Bullseye (halo 40 %, Pip star), Perfect (onde de choc, particules or, Pip bliss, ligne `Only N Perfects today` réelle).
- Durées et easings exactement ceux de la §9. Session complète (ouverture → résultat lisible) ≤ 20 s hors temps de visée.
Gate : reduced-motion transforme shakes/slow-mo/comète/onde en fondus ; tests verts ; captures.

PHASE 8 — RESPONSIVE
- Trois viewports mobiles (360×640, 390×720, 430×860) + compact < 360 + desktop (panneau 480×760, feed 700×512). Safe areas. Le surplus de hauteur va à la scène.
Gate : aucune coupure, aucun overflow, aucun CTA sous le pli, aucune zone morte.

PHASE 9 — ACCESSIBILITÉ ET PERFORMANCE
- Contraste AA vérifié sur chaque paire texte/fond (liste dans docs/qa/contrast.md), focus visible sur tous les boutons, navigation clavier sur desktop, cibles ≥ 48 px, aucune information portée par la seule couleur.
- Budgets : particules (§13), DPR ≤ 2, couches statiques en cache, frame time médian < 10 ms sur le harness en mode « mobile lent » (CPU throttling 4×).
Gate : rapport de perf et de contraste commité.

PHASE 10 — QA VISUELLE, TESTS, NETTOYAGE
- Retire UI_V2 et l'ancien code. Supprime tout emoji résiduel de l'UI (grep), toute couleur codée en dur (grep des hex hors tokens.ts).
- Captures finales dans docs/qa/after/ — MOBILE : feed A/B/C, ready, hold, flight, résultat médiocre (≈ 45), bon (≈ 90), Bullseye, Perfect, off map, mur, leaderboard, practice ; DESKTOP : feed, ready, résultat bon, leaderboard. Pour chaque capture, vérifie : clipping, overflow, texte coupé, canvas flou, CTA sous le pli, tapis invisible, Pip trop petit (< 28 px), contraste, zones mortes, deux blocs corail.
- Relance toute la suite (les 220 tests métier + les nouveaux), build, lint, type-check.
- Mets à jour README (captures), RELEASE.md (ce qui change pour la review : nouvel entrypoint inline, aucun audio dans le feed, CTA honnête), AGENTS.md (conventions UI : tokens, copy, interdits).
Gate final : tout vert, captures avant/après côte à côte dans docs/qa/REPORT.md.

RAPPORT ATTENDU À LA FIN (dans ta réponse et dans docs/qa/REPORT.md) :
1. Tableau phase → commits → gates → captures.
2. Ce qui diffère de la spec et pourquoi (chaque écart argumenté en une phrase).
3. Ce que tu n'as pas pu vérifier sans environnement réel (ex. hauteur inline réelle sur iOS/Android, comportement du splash de repli) et comment je le teste au playtest.
4. Les métriques instrumentées (`inline_view`, `expand_click`, `leaderboard_open`) et où elles sont comptées.

CRITÈRE FINAL, À VÉRIFIER SUR TES CAPTURES AVANT DE CONCLURE :
Quelqu'un qui découvre DAYSHOT dans le feed comprend en moins de 2 secondes que c'est un jeu, qu'il y a une cible, qu'il n'a qu'un tir aujourd'hui, que d'autres jouent, et qu'il peut essayer maintenant. Après son tir, il comprend en moins de 2 secondes où il est tombé, son score, si c'était bon, comment il se compare, et qu'un nouveau défi arrive demain. Si une capture ne passe pas ce test, corrige avant de rendre.
~~~

---

*Fin du document.*
