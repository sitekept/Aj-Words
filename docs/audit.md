# Audit produit & technique — AJ Words

Date : 20 juillet 2026
Périmètre : application PWA frontend complète, données embarquées, persistance locale, quiz, flashcards, accessibilité, offline, performance, sécurité client, maintenabilité — **enrichi d'un benchmark concurrentiel** (Quizlet, Anki, Memrise, Duolingo, Drops, Clozemaster) fondé sur leurs sites, la presse spécialisée, les forums et les avis utilisateurs.

## Synthèse exécutive

AJ Words occupe un créneau stratégique que le marché vient précisément de libérer : **une app d'apprentissage de vocabulaire gratuite, locale, sans compte et sans publicité**. En 2025–2026, Quizlet a placé son mode « Learn » (5 tours gratuits puis payant, ~36 $/an) et ses tests derrière un paywall, supprimé l'export, et multiplié les publicités — ses avis Trustpilot se sont effondrés et les forums étudiants débordent de recherches d'alternatives. AJ Words offre exactement ce que ces utilisateurs réclament, avec en plus un vrai moteur de répétition espacée. Ce positionnement est un atout à défendre, pas un acquis.

Deux chantiers conditionnent la crédibilité de ce positionnement :

1. **Fiabilité des données (P0).** Une app « local-first » qui perd les données de l'utilisateur perd sa seule promesse. `localStorage` est aujourd'hui l'unique stockage : quota ~5 Mo, éviction possible sous pression de stockage, erreurs d'écriture absorbées silencieusement. C'est le risque existentiel de l'app.
2. **Profondeur d'apprentissage (P1).** Les fonctionnalités existent mais sont en dessous des standards du marché sur des points que les utilisateurs des apps concurrentes citent constamment : correction des réponses trop stricte (pas de tolérance aux fautes de frappe, aux accents, aux synonymes), une seule direction de question, pas d'audio, pas de contexte. Le cas le plus flagrant est interne : **9 des 19 listes intégrées (les « השלמת משפטים », ~370 phrases à trous) sont quasi inutilisables en quiz écrit**, car la réponse attendue est une phrase complète à taper.

La stratégie recommandée : **d'abord rendre excellent ce qui existe** (correction intelligente, sens inverse, fiabilité), **ensuite combler les manques** (audio, contexte, statistiques), **enfin différencier** (heatmap, FSRS, partage). Aucune migration backend n'est nécessaire.

## Scores synthétiques

| Axe | Score | Évaluation |
| --- | ---: | --- |
| Positionnement produit | 9/10 | Gratuit, local, sans compte, SRS réel — pile dans le vide laissé par Quizlet. |
| Qualité des fonctionnalités existantes | 6/10 | Parcours solides, mais correction stricte, sens unique et listes cloze mal servies. |
| Complétude face au marché | 5/10 | Pas d'audio, pas de champ exemple/note, pas de statistiques de progression, pas de signal quotidien. |
| UX | 8/10 | Parcours clair, reprise de session, états vides utiles. |
| Accessibilité | 7/10 | Bons labels, mais audit clavier/lecteur d'écran et focus modal à élargir. |
| Performance | 8/10 | Bundle raisonnable, rendu statique ; marge sur les grandes listes. |
| Offline / PWA | 8/10 | Manifest, service worker, stratégie de cache ; tests offline automatisés manquants. |
| Robustesse des données | 6/10 | Normalisation et migrations solides, mais `localStorage` seul = point de défaillance unique. |
| Maintenabilité | 8/10 | Types stricts, logique métier isolée, 18 tests unitaires. |

## Méthode et validations

Zones examinées : `components/VocabularyApp.tsx`, `ListDetail.tsx`, `QuizRunner.tsx`, `ScoreScreen.tsx`, `FlashcardMode.tsx`, `TestHistory.tsx`, `ui.tsx` ; `lib/vocabulary-storage.ts`, `vocabulary-persistence.ts`, `useVocabularyStore.ts`, `srs.ts`, `quiz-modes.ts`, `quiz-session-storage.ts`, `vocabulary-import.ts` ; `types/vocabulary.ts`, `lib/builtin-vocabulary-data.json`, `scripts/import-phone-export.mjs` ; `app/globals.css`, `app/manifest.ts`, `public/sw.js`, `next.config.ts`.

Validations au 20 juillet 2026 :

- `npm test` : 18 tests passés ;
- `npm run lint` : réussi ;
- `npm run build` : réussi (Next.js 16.2.9, validé lors de la passe précédente) ;
- inspection du contenu réel des 19 listes intégrées (1 liste Darija en translittération latine « arabizi » → français ; 18 listes hébreu : 9 listes de vocabulaire anglais → hébreu, 9 listes de complétion de phrases anglais → phrase à trou) ;
- recherche concurrentielle documentée (sources en fin de document).

## Benchmark concurrentiel

### Panorama des acteurs et de leur réception

| App | Ce que les utilisateurs louent | Ce qu'ils reprochent (avis, forums) |
| --- | --- | --- |
| **Quizlet** | Variété des modes, « smart grading » NLP, immense catalogue | Paywall du mode Learn (5 tours gratuits), pubs intrusives, export supprimé, app jugée buggée — avis Trustpilot très dégradés en 2025–2026 |
| **Anki** | SRS de référence (FSRS par défaut depuis 23.10), gratuit, réponse tapée avec `type:nc` (diacritiques ignorés), stats et heatmap | UX austère, courbe d'apprentissage raide, mobile iOS payant |
| **Memrise** | SRS efficace, vidéos de locuteurs natifs, bien pour débutants | Trop de QCM (reconnaissance passive), contenu communautaire retiré, peu de grammaire |
| **Duolingo** | Streaks + mécanismes de pardon = formation d'habitude redoutable (DAU ×10 depuis 2019) | « Shallow learning trap » : on optimise le XP, pas la langue ; gamification culpabilisante (« streak creep ») |
| **Drops** | Sessions courtes, très visuel | 5 min/jour en gratuit, profondeur limitée |
| **Clozemaster** | Apprentissage en contexte par phrases à trous | Interface datée, dépend de la qualité des corpus |

### Six enseignements du marché pour AJ Words

1. **Le paywall de Quizlet est une opportunité historique.** Les fonctionnalités qu'il a verrouillées (quiz adaptatif, tests, export) sont exactement le cœur gratuit d'AJ Words. La contrepartie : les utilisateurs qui migrent vers une app locale ne pardonneront pas une perte de données.
2. **La correction « intelligente » des réponses tapées est devenue le standard.** Quizlet accepte une réponse si elle diffère d'au plus 1 caractère ou ~15 % de la cible (distance de Levenshtein) ; Anki propose `type:nc` pour ignorer les diacritiques et affiche un diff caractère par caractère en cas d'erreur. Une correction binaire stricte est perçue comme punitive et pousse à l'abandon du mode écrit.
3. **L'audio est un attendu de base** pour les langues à phonologie non familière ; les guides d'achat de flashcard apps le citent systématiquement, en privilégiant les voix locales (offline, gratuites).
4. **Le contexte (phrases d'exemple) est le deuxième facteur de rétention** mis en avant partout — c'est le produit entier de Clozemaster. AJ Words possède déjà ~370 phrases à trous dans ses données… mais pas le mode de quiz pour les exploiter.
5. **Un rythme quotidien doux fonctionne, la culpabilisation non.** La recherche derrière le streak Duolingo valide l'activité quotidienne consécutive comme levier d'habitude, mais la littérature critique (« streak creep ») confirme le choix d'AJ Words d'éviter la pression. La bonne position médiane : un signal passif « X mots à revoir », jamais une dette qui s'accumule.
6. **FSRS > SM-2 > Leitner en efficacité** (~20–30 % de révisions en moins pour la même rétention), mais l'écart entre algorithmes est faible comparé à « utiliser un SRS ou non ». Le Leitner actuel est défendable ; FSRS est une piste d'optimisation, pas une urgence.

### AJ Words face aux standards du marché

| Capacité | Standard marché | AJ Words aujourd'hui | Écart |
| --- | --- | --- | --- |
| Correction tapée tolérante (typos, accents, synonymes) | Quizlet smart grading, Anki `type:nc` + diff | trim + minuscules + espaces (`QuizRunner.tsx:49`) | **Élevé** |
| Sens de question inverse (traduction → mot) | Universel (Anki, Quizlet, Memrise) | Non — uniquement mot → traduction | **Élevé** |
| Mode cloze (phrase à trou → taper le mot) | Clozemaster, Quizlet, Anki | Non, alors que 9 listes intégrées sont des cloze | **Élevé** |
| Audio / prononciation | Universel | Non | **Élevé** |
| Fiabilité de sauvegarde | Sync cloud (AnkiWeb, comptes) | `localStorage` seul | **Élevé** (critique en local-first) |
| Champs exemple / note / réponses alternatives | Anki (champs libres), Quizlet | Modèle `word`/`translation` seul | Moyen |
| Statistiques de progression | Anki (heatmap, rétention, prévisions) | `ProgressSummary` + 30 derniers tests | Moyen |
| Signal quotidien / habitude | Duolingo (streak + pardon), Anki (due du jour) | Retiré de l'interface (le SRS calcule toujours `dueAt`) | Moyen |
| Algorithme SRS | FSRS / SM-2 | Leitner 6 boîtes (intervalle max 35 j) | Faible |
| Images sur les cartes | Quizlet, Memrise, Drops | Non | Faible |

## Élever l'existant au niveau « excellent »

C'est la priorité produit : chaque fonctionnalité déjà livrée doit soutenir la comparaison avec la meilleure app du marché sur ce point précis.

### 1. Correction des réponses écrites — le chantier qualité n°1

`normalizeAnswer` (`components/QuizRunner.tsx:49`) ne fait que trim / minuscules / espaces. Conséquences mesurables sur les données réelles de l'app :

- **Synonymes refusés** : « abdomen → בטן, כרס » exige de taper *les deux* mots avec la virgule exacte ; taper בטן seul est compté faux.
- **Ponctuation piégeuse** : « חו"ל », « קיצור (ר"ת) » — le gershayim et les parenthèses doivent être reproduits au caractère près.
- **Accents et translittération** : la liste Darija est en arabizi (m3mra, 7, 9…) traduite en français ; « Remplie » vs « remplie » passe, mais « déjà » vs « deja » échoue.

Recommandations, dans l'ordre :

1. **Folding des diacritiques** : normalisation Unicode NFD + suppression des marques combinantes avant comparaison (équivalent du `type:nc` d'Anki). Bénéficie au français, à l'hébreu vocalisé et aux translittérations.
2. **Réponses alternatives** : découper la cible sur `,` / `;` / `/` et accepter chaque variante seule ; traiter les parenthèses comme optionnelles (« קיצור (ר"ת) » accepte « קיצור »).
3. **Tolérance aux fautes de frappe** : distance de Levenshtein ≤ 1 caractère (ou ~15 % de la longueur, comme Quizlet), avec un verdict distinct « correct, petite faute de frappe » affiché à l'utilisateur — jamais silencieux, pour ne pas ancrer l'orthographe fautive.
4. **Diff visuel en cas d'erreur** (à la Anki) : montrer caractère par caractère où la réponse diverge, au lieu d'un simple « incorrect ».
5. Ignorer la ponctuation terminale (`.`, `!`, `?`) des deux côtés.

Toute cette logique doit vivre dans un module pur `lib/answer-matching.ts` avec des tests par propriété (hébreu RTL, arabizi, français accentué), pas dans le composant.

### 2. Sens des questions et mode cloze — débloquer 9 listes intégrées

Le quiz interroge uniquement mot → traduction. Or dans les 9 listes « השלמת משפטים », la « traduction » est une phrase anglaise complète à trou (« IDF is an _________ of… ») : le quiz écrit demande donc de **taper la phrase entière**, et le choix multiple affiche quatre phrases longues. Près de la moitié du contenu embarqué est mal servi par le moteur.

1. **Sens inverse** (traduction → mot) : réglage par session, valeur par défaut mémorisée par liste. C'est aussi la réponse au reproche « trop de reconnaissance passive » fait à Memrise : la production active (taper le mot cible) est le mode le plus efficace documenté.
2. **Détection cloze** : si la traduction contient un trou (`_{2,}`), présenter automatiquement la phrase comme énoncé et demander le mot — c'est exactement le format Clozemaster, gratuit et déjà dans les données.
3. À terme, un champ explicite `kind: "vocab" | "cloze"` par item dans le modèle, plutôt qu'une heuristique.

### 3. Choix multiple — des distracteurs plus intelligents

`buildOptions` (`QuizRunner.tsx:52`) tire 3 mauvaises réponses au hasard. Standard du marché : des distracteurs plausibles (longueur voisine, préfixe commun, même catégorie). Amélioration à faible coût : trier les candidats par similarité avec la bonne réponse avant d'en garder 3, et garder l'exigence actuelle de ≥ 4 items. Vérifier aussi le cas où deux items partagent la même traduction (doublons dans les listes fusionnées) : la « mauvaise » option serait identique à la bonne.

### 4. SRS — trois ajustements ciblés, pas de refonte

Le Leitner de `lib/srs.ts` est propre (promotion/démotion d'une boîte, statut toujours dérivé). Trois limites :

1. **Plafond à 35 jours** : une carte maîtrisée revient toutes les 5 semaines pour toujours. Anki monte en mois puis années. Ajouter une ou deux boîtes (p. ex. 75 j, 150 j) réduit la charge de révision à maturité sans rien casser (`LEITNER_INTERVALS` est la seule constante à étendre, `MASTERED_BOX` reste à 5).
2. **`full-review` écrit dans le SRS** : une carte maîtrisée non due, ratée en revue complète, est rétrogradée. C'est défendable (Anki le permet en decks filtrés) mais c'est une décision produit à assumer et documenter — ou à assouplir en proposant « revue libre sans impact ».
3. **FSRS** : à considérer seulement quand le volume d'historique le justifiera (piste P3). Le consensus de la recherche : l'écart Leitner→FSRS est réel (~20–30 % de révisions économisées) mais secondaire tant que les fondamentaux ci-dessus ne sont pas au niveau.

### 5. Flashcards — les gestes attendus du genre

- **Annuler le dernier swipe** : standard absolu des decks de cartes (un pouce qui glisse ne doit pas coûter une progression) ; aujourd'hui un swipe « mastered » accidentel promeut la carte sans recours.
- Barre de progression de session et compteur restant.
- Option « mélanger » vs ordre de liste.
- Le resume-index par liste existe déjà — bon point, à conserver.

### 6. Écran de score et historique — transformer la donnée en motivation

`TestHistory` stocke 30 sessions mais les présente en liste brute. Le marché (Anki en tête) montre que les statistiques sont un moteur de rétention : courbe du taux de réussite par session, répartition new/learning/mastered dans le temps, mots les plus ratés de la liste. Tout est déjà dans les données ; c'est un chantier purement UI.

## Combler les manques pour une app complète

### P0 — Fiabilité des données : la promesse local-first

**Zone :** `lib/vocabulary-storage.ts`, `lib/vocabulary-persistence.ts`, `lib/useVocabularyStore.ts`.

`localStorage` est l'unique stockage. Trois aggravants documentés : les navigateurs peuvent **évincer le stockage non persistant sous pression disque** ; le quota (~5 Mo) peut être atteint par de gros imports ; les échecs d'écriture sont absorbés silencieusement — l'utilisateur croit sauvegardé ce qui ne l'est pas.

**Recommandations :**

1. Appeler `navigator.storage.persist()` au premier usage réel (création de liste ou premier quiz) — une ligne qui protège contre l'éviction, seul l'utilisateur pouvant alors effacer les données.
2. Afficher une alerte persistante et actionnable (bouton Export) dès qu'une lecture ou écriture échoue.
3. **Sauvegarde automatique locale** : conserver un export horodaté (rotation sur 3–5 copies) avant toute migration de schéma et périodiquement, pour offrir un « restaurer la sauvegarde d'hier ».
4. Planifier la **migration vers IndexedDB** (asynchrone, accessible au service worker, quota en dizaines de Go) derrière l'interface actuelle du store — l'architecture s'y prête : seuls les helpers de persistance changent, la logique métier est déjà pure.

### P1 — Audio (TTS) : gratuit, offline, sans dépendance

L'API `speechSynthesis` est supportée par tous les navigateurs modernes avec des voix locales (propriété `localService` pour garantir l'offline). Application au contenu réel :

- **Listes hébreu** : les mots sont en anglais (voix universelles) et les traductions en hébreu (voix he-IL disponibles sur les principales plateformes, p. ex. Carmit sur iOS/macOS) — les deux côtés de la carte sont sonorisables.
- **Liste Darija** : la translittération arabizi (m3mra, 7, 9) n'est prononçable par aucune voix ; assumer l'absence d'audio pour cette liste plutôt qu'une lecture absurde.

Implémentation : un bouton écoute sur flashcards et quiz, détection dynamique des voix par langue de la liste (le champ `language` existe déjà sur `WordList`), dégradation silencieuse si aucune voix ne correspond. Zéro dépendance, zéro coût, conforme au positionnement sans réseau.

### P1 — Modèle de données enrichi : notes, exemples, réponses alternatives, tags

`VocabularyItem` ne porte que `word`/`translation` (+ SRS). Les champs optionnels à ajouter, tous plébiscités par les utilisateurs d'Anki/Quizlet : `note` (mnémonique, grammaire), `example` (phrase en contexte), `altAnswers` (synonymes acceptés explicites, complément du découpage automatique), `tags`.

Attention au coût réel : toute évolution du modèle touche **les deux chaînes de parsing** — runtime (`normalize*` dans `vocabulary-storage.ts`) et build-time (`lib/builtin-vocabulary.ts`, `scripts/import-phone-export.mjs`) — plus la version du format d'export. À faire en une seule fois, avec tests de migration.

### P1 — Signal quotidien doux : réintroduire le « dû aujourd'hui » sans la dette

La file de révision quotidienne a été retirée de l'interface — un choix défendable contre la sur-gamification. Mais le SRS continue de calculer `dueAt`, et **un SRS dont l'utilisateur ne voit jamais les échéances perd l'essentiel de sa valeur** : la recherche sur la formation d'habitude (streak Duolingo, avec ses mécanismes de pardon) montre que le rappel du rythme quotidien est le premier levier de rétention, tandis que la critique du « streak creep » condamne seulement la culpabilisation.

Position médiane recommandée :

1. Un **compteur passif « X mots à revoir »** par liste et global sur l'accueil — information, pas injonction ;
2. Un bouton « Réviser (X) » qui lance une session limitée aux items dus ;
3. Optionnel, plus tard : un objectif quotidien discret avec pardon intégré (pas de perte de série sur un jour manqué) ;
4. Jamais : notifications agressives, dette cumulée, écrans de honte.

### P2 — Statistiques, recherche, hygiène de liste

- Recherche/filtre dans les listes (les listes intégrées font jusqu'à 159 mots ; les imports peuvent être bien plus gros) + filtre par statut new/learning/mastered.
- Courbe de progression et mots difficiles (voir section 6 ci-dessus).
- Action « Réinitialiser la progression » avec confirmation et export préalable recommandé.
- Nombre de mots, nombre de dus et dernière activité visibles dans la bibliothèque.

### P3 — Différenciateurs

- Heatmap d'activité (à la Anki), images sur les cartes, partage de listes par fichier/lien, FSRS.

## Points techniques priorisés

### Résolu depuis l'audit précédent

- ~~README annonçant six modes dont la daily review~~ — le README affiche désormais cinq modes et le SRS comme moteur interne.

### P0 — perte possible de données locales

Voir « Fiabilité des données » ci-dessus : `navigator.storage.persist()`, alerte d'échec d'écriture, sauvegardes locales versionnées, migration IndexedDB planifiée.

### P1 — absence de tests end-to-end de régression

Les tests actuels vérifient des fonctions pures. Les flux créer une liste → ajouter des mots → quiz → recharger → reprendre ne sont pas couverts. **Recommandation :** Playwright, scénarios desktop (1440×1000) et mobile (390×844) : création, quiz écrit, choix multiple, flashcards, import/export, reload de session — et, dès la correction tolérante livrée, des cas de réponse accentuée/synonyme/typo.

### P1 — validation offline de production à formaliser

La stratégie de cache de `public/sw.js` n'est couverte par aucun test qui build, démarre, installe le SW, coupe le réseau et recharge. **Recommandation :** smoke test production (`npm run build` + `npm run start`) vérifiant `/manifest.webmanifest`, `/sw.js`, la registration, le cache shell et le reload hors connexion. Rappel : toute vérification SW se fait sur le build de production, jamais en dev (le SW y est activement désenregistré).

### P1 — gestion du focus dans les modales

Confirmer focus initial, focus trap, Escape et retour du focus au déclencheur dans `ListFormModal`, `WordFormModal`, `components/ui.tsx` — au clavier et au lecteur d'écran, y compris clavier virtuel mobile.

### P2 — grandes listes et affichage dense

`ListDetail` rend tous les items simultanément. Ajouter la recherche/filtre d'abord ; `content-visibility: auto` ou virtualisation seulement si la taille le justifie.

### P2 — reduced motion et scène décorative

`AJWordsScene` et les transitions doivent respecter `prefers-reduced-motion` via une variante CSS désactivant transformations et transitions non essentielles.

### P2 — robustesse des imports volumineux et invalides

Limites explicites de taille avant `JSON.parse`, résumé avant remplacement d'une liste existante, tests sur fichiers énormes, listes vides, IDs builtin, doublons, champs SRS malformés.

### P2 — headers de sécurité incomplets

`X-Content-Type-Options` et `Referrer-Policy` présents ; ajouter une CSP compatible Next.js après inventaire des inline scripts (celui de `app/layout.tsx` inclus), puis `Permissions-Policy` et HSTS quand le domaine HTTPS est maîtrisé.

### P3 — dette technique mineure

Remplacer l'API Three.js dépréciée (`THREE.Clock`) si encore présente dans la branche active. Supprimer (avec accord) les copies de synchronisation cloud suffixées ` 2` — jamais les éditer ni les documenter.

## Feuille de route proposée

### Horizon 1 — Fiabiliser et rehausser (le socle de confiance)

1. `navigator.storage.persist()` + alerte d'échec de stockage + sauvegarde locale automatique.
2. Module `lib/answer-matching.ts` : diacritiques, synonymes/parenthèses, Levenshtein, diff visuel — avec tests.
3. Sens inverse + détection cloze (débloque les 9 listes de phrases).
4. Annuler le dernier swipe en flashcards ; recherche dans les listes.
5. `prefers-reduced-motion` ; compteur passif « X à revoir ».

### Horizon 2 — Approfondir (la parité avec le meilleur du marché)

1. TTS via `speechSynthesis` (anglais, hébreu, français ; pas d'audio arabizi).
2. Modèle enrichi : `note`, `example`, `altAnswers`, `tags` — runtime + build-time + export en une passe.
3. Statistiques : courbe de réussite, mots difficiles, dus par jour.
4. Playwright + smoke test offline de production.
5. Boîtes Leitner supplémentaires (75/150 j) ; décision documentée sur `full-review` et le SRS.

### Horizon 3 — Différencier

1. Heatmap d'activité ; objectif quotidien optionnel avec pardon.
2. Images sur les cartes ; partage de listes.
3. Évaluation FSRS ; migration IndexedDB si le volume le justifie.

## Parcours à valider régulièrement

### Premier lancement

- Démarrage avec les listes builtin sans écriture inutile des données publiques.
- Création et sélection immédiate d'une liste locale ; le rafraîchissement conserve la sélection (URL + stockage UI).

### Étude

- Créer une liste, ajouter quatre mots, lancer chaque mode.
- Vérifier réponse correcte, incorrecte, **réponse à un synonyme seul, réponse sans accent, réponse avec une faute de frappe** (dès la correction tolérante livrée), mise à jour SRS et écran de score.
- Recharger pendant un quiz et reprendre la session ; reprendre les flashcards à l'index attendu.
- Ouvrir une liste « השלמת משפטים » et vérifier que le mode cloze présente la phrase, pas l'inverse.

### Import/export

- Exporter puis réimporter une liste ; rejeter un JSON invalide avec message exploitable.
- Importer un ID builtin → copie locale ; remplacement d'une liste locale → confirmation destructive.

### PWA

- Build + start production ; manifest, service worker, headers.
- Charger en ligne, couper le réseau, recharger, ouvrir une liste ; vérifier `navigator.storage.persisted()`.

## Conclusion

AJ Words a la bonne architecture et le bon positionnement au bon moment : le marché des flashcards vit une crise de confiance (paywalls, pubs, données captives) et l'app incarne l'alternative. Ce qui la sépare d'un produit de référence n'est pas une liste de fonctionnalités à rallonge, mais trois exigences : **ne jamais perdre une donnée** (P0 stockage), **corriger comme un professeur, pas comme un compilateur** (answer matching, sens inverse, cloze), et **rendre la progression visible** (dus du jour, statistiques). Le tout reste faisable sans backend, sans compte et sans dépendance — c'est précisément ce qui rend le produit défendable.

## Sources

Benchmark et réception des concurrents :
[Trustpilot — avis Quizlet](https://www.trustpilot.com/review/www.quizlet.com) · [MintDeck — Quizlet Paywall: What You've Lost](https://www.mintdeck.app/blog/quizlet-paywall-free-alternative) · [PA Webpage — Quizlet's paywall proves students are its last priority](https://pawebpage.com/3269/opinions/quizlets-paywall-proves-that-students-are-its-last-priority/) · [Studydrome — Quizlet Review](https://studydrome.com/guides/quizlet-review/) · [Nibble — Quizlet App Review 2026](https://nibble-app.com/blog/quizlet-review) · [Test Prep Insight — Memrise Review](https://testprepinsight.com/reviews/memrise-review/) · [Headway — Memrise Review](https://makeheadway.com/blog/memrise-review/) · [FluentU — Best Flashcard Apps for Languages](https://www.fluentu.com/blog/learn/language-flashcards-app/) · [MintDeck — Best Free Flashcard App for Language Learning](https://www.mintdeck.app/blog/flashcard-app-language-learning)

Correction des réponses :
[Quizlet Help — Smart grading](https://help.quizlet.com/hc/en-us/articles/360048313652-Using-smart-grading-US) · [Tech @ Quizlet — How Quizlet does smarter grading (ML/NLP, Levenshtein)](https://medium.com/tech-quizlet/how-quizlet-does-smarter-grading-using-ml-and-nlp-to-grade-millions-of-answers-86514323e332) · [Anki Manual — Field Replacements (type:nc)](https://docs.ankiweb.net/templates/fields.html) · [Anki Forums — Ignore combining characters when typing](https://forums.ankiweb.net/t/ignore-combining-characters-diacritics-when-type-ing-official-thread/826)

Algorithmes SRS :
[Anki FAQ — What spaced repetition algorithm does Anki use](https://faqs.ankiweb.net/what-spaced-repetition-algorithm) · [SmartRecall — SM-2 vs FSRS vs Leitner](https://smartrecallai.com/blog/sm2-vs-fsrs-vs-leitner-vs-anki-2026) · [Brainscape Academy — Comparing Spaced Repetition Algorithms](https://www.brainscape.com/academy/comparing-spaced-repetition-algorithms/) · [Active Recalling — Spaced Repetition Complete Guide](https://activerecalling.com/blog/spaced-repetition-ultimate-guide)

Habitude et gamification :
[Duolingo Blog — How the streak builds habit](https://blog.duolingo.com/how-duolingo-streak-builds-habit/) · [The Decision Lab — Streak Creep](https://thedecisionlab.com/insights/consumer-insights/streak-creep-the-perils-of-too-much-gamification) · [StriveCloud — Duolingo gamification](https://www.strivecloud.io/blog/gamification-examples-boost-user-retention-duolingo) · [Trophy — The Psychology of Streaks](https://trophy.so/blog/the-psychology-of-streaks-how-sylvi-weaponized-duolingos-best-feature-against-them) · [DEV — Duolingo's Shallow Learning Trap](https://dev.to/yaptech/duolingos-shallow-learning-trap-gamified-streaks-harmful-habits-4134)

Stockage et TTS :
[web.dev — Offline data (persist, IndexedDB)](https://web.dev/learn/pwa/offline-data) · [Microsoft Learn — Store data on the device](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/offline) · [LogRocket — Offline storage for PWAs](https://blog.logrocket.com/offline-storage-for-pwas/) · [MDN — Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API) · [Hadrien Gardeur — Recommended voices for the Web Speech API](https://github.com/HadrienGardeur/web-speech-recommended-voices)
