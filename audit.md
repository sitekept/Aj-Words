# Audit complet AJ Words

Date : 20 juillet 2026  
Périmètre : application PWA frontend complète, données embarquées, persistance locale, quiz, flashcards, accessibilité, offline, performance, sécurité client et maintenabilité.

## Synthèse

AJ Words est une application d’apprentissage bien cadrée : elle fonctionne sans compte ni backend, conserve les données sur l’appareil et propose un parcours cohérent entre listes, flashcards, quiz et historique. L’architecture est suffisamment modulaire pour continuer à évoluer sans refonte immédiate.

Le principal risque fonctionnel est la dépendance à `localStorage` pour toutes les données utilisateur. Une corruption, un quota dépassé ou une suppression du stockage peut faire perdre les progrès si l’utilisateur n’a pas exporté ses listes. Le deuxième axe de travail est la couverture de tests d’interface et de parcours réels : les tests de logique sont présents, mais la plupart des comportements utilisateur restent validés manuellement.

La fonctionnalité de révision quotidienne a été retirée de l’interface et du type `QuizMode`. Le SRS interne reste actif : `box`, `dueAt`, les statistiques, la sélection adaptative et l’ordre des cartes continuent de fonctionner.

## Scores synthétiques

| Axe | Score | Évaluation |
| --- | ---: | --- |
| UX | 8/10 | Parcours clair, modes d’étude distincts, reprise de session et états vides utiles. |
| Accessibilité | 7/10 | Bons labels sur les boutons et modales, mais audit clavier/screen reader à élargir. |
| Performance | 8/10 | Bundle raisonnable et rendu statique, avec une marge sur les grandes listes et la scène décorative. |
| Offline / PWA | 8/10 | Manifest, service worker et stratégie de cache présents ; tests offline automatisés manquants. |
| Robustesse des données | 7/10 | Normalisation, migration SRS et import/export solides ; `localStorage` reste un point de défaillance unique. |
| Maintenabilité | 8/10 | Types stricts, modules de stockage séparés et tests unitaires ; quelques documents peuvent dériver. |

## Méthode et validations

Les zones examinées sont :

- `components/VocabularyApp.tsx`, orchestration des vues, URL, import/export et persistance UI ;
- `components/ListDetail.tsx`, `ListLibrary.tsx`, `ListFormModal.tsx`, `WordFormModal.tsx` et `components/ui.tsx` ;
- `components/QuizRunner.tsx`, `ScoreScreen.tsx`, `FlashcardMode.tsx` et `TestHistory.tsx` ;
- `lib/vocabulary-storage.ts`, `vocabulary-persistence.ts`, `useVocabularyStore.ts`, `srs.ts`, `quiz-session-storage.ts` et `vocabulary-import.ts` ;
- `types/vocabulary.ts`, `lib/quiz-modes.ts`, les données builtin et le script d’import ;
- `app/globals.css`, `app/manifest.ts`, `public/sw.js` et `next.config.ts`.

Validations réalisées :

- `npm test` : 18 tests passés ;
- `npm run lint` : réussi ;
- `npm run build` : réussi avec Next.js 16.2.9 ;
- `git diff --check` : réussi ;
- rendu headless desktop/mobile déjà vérifié, sans erreur JavaScript ni overflow horizontal visible ;
- manifest, service worker, headers et parcours PWA identifiés pour validation de production.

## Points forts

### Produit

- Positionnement clair : apprendre du vocabulaire rapidement, localement et sans compte.
- Les listes, flashcards, quiz écrit, choix multiple, mode mixte, test et revue complète couvrent plusieurs styles de mémorisation.
- Le retrait de la révision quotidienne réduit la complexité visible et évite de présenter une file de tâches obligatoire par jour.
- Les scores affichent les erreurs, les réponses correctes et les mots encore en apprentissage.
- Les listes builtin sont protégées par un modèle copy-on-write : une modification crée une copie locale sans écraser le contenu partagé.

### Architecture

- Next.js App Router, React et TypeScript strict sont utilisés de manière cohérente.
- Le composant `VocabularyApp` orchestre l’état de navigation, tandis que les composants d’étude restent séparés.
- Les règles métier importantes sont isolées dans `lib/srs.ts`, `lib/vocabulary-storage.ts` et `lib/vocabulary-persistence.ts`.
- Le statut `new | learning | mastered` est dérivé des données SRS plutôt que traité comme une source indépendante.
- Les sessions de quiz en cours sont persistées séparément, ce qui permet une reprise après rechargement.

### UX et accessibilité

- Les boutons d’icône utilisent des noms accessibles via `IconButton`.
- Les actions destructives sur les mots et listes demandent une confirmation.
- Les états vides et les états de chargement sont présents.
- Les formulaires de création et d’édition sont réutilisés au lieu de dupliquer la logique.
- L’URL et `localStorage` mémorisent la liste sélectionnée, ce qui rend le retour dans l’application prévisible.

### PWA et confidentialité

- Le manifest définit le nom, les icônes, le scope et le mode standalone.
- Le service worker distingue shell, assets statiques, navigation et manifest.
- Le service worker est désactivé en développement pour éviter un cache local trompeur.
- Aucun backend, compte, tracking ou télémétrie n’est requis.
- Les exports permettent à l’utilisateur de déplacer ou sauvegarder ses données.

### Données et qualité

- Les données builtin Darija ont été fusionnées en une seule liste canonique de 159 entrées uniques.
- L’ID public canonique Darija est conservé pour protéger les overlays et progressions locales existants.
- Les données legacy sans SRS sont migrées via `inferSrsFromLegacy`.
- L’historique des tests est plafonné et les entrées importées sont normalisées.
- Les tests de logique couvrent le SRS, les modes de quiz, la persistance publique/localisée et l’intégrité des listes builtin.

## Points à améliorer priorisés

### P0 — perte possible de données locales

**Zone :** `lib/vocabulary-storage.ts`, `lib/vocabulary-persistence.ts`, `lib/useVocabularyStore.ts`.

`localStorage` est le stockage unique. Les erreurs de JSON, de quota, d’écriture ou de format sont généralement absorbées pour permettre à l’application de continuer, mais l’utilisateur peut ne pas savoir que ses dernières modifications n’ont pas été sauvegardées.

**Impact :** perte silencieuse de listes, de progrès ou de sessions.

**Recommandation :** afficher une alerte persistante lorsqu’une lecture ou une écriture échoue, effectuer une validation de capacité avant une grosse importation et proposer un export automatique local versionné avant migration destructrice.

### P1 — absence de tests end-to-end de régression

**Zone :** parcours global dans `components/VocabularyApp.tsx` et composants d’étude.

Les tests actuels vérifient surtout des fonctions pures. Les flux créer une liste → ajouter des mots → lancer un quiz → recharger → reprendre une session ne sont pas couverts automatiquement.

**Impact :** une régression de navigation, de focus, de `localStorage` ou de session peut passer le lint, les tests unitaires et le build.

**Recommandation :** ajouter Playwright avec des scénarios desktop/mobile pour création, quiz écrit, choix multiple, flashcards, import/export et reload d’une session.

### P1 — documentation incohérente après suppression de la revue quotidienne

**Zone :** `README.md` dans la liste des fonctionnalités.

Le README mentionne encore six modes, dont la “daily review”, alors que `QuizMode` en expose désormais cinq et que le module quotidien a été supprimé.

**Impact :** attentes utilisateur et documentation incorrectes.

**Recommandation :** mettre à jour le README pour annoncer cinq modes et documenter le SRS comme moteur interne, sans présenter une révision quotidienne comme fonctionnalité.

### P1 — validation offline de production à formaliser

**Zone :** `public/sw.js`, `app/manifest.ts`, `next.config.ts`.

La stratégie de cache est correcte pour un shell statique, mais elle n’est pas couverte par un test automatisé qui installe le service worker, charge l’application, coupe le réseau et recharge.

**Impact :** une modification de route, de cache ou de version peut casser le fonctionnement offline sans être détectée.

**Recommandation :** ajouter un test de smoke production avec `npm run build` puis `npm run start`, vérification de `/manifest.webmanifest`, `/sw.js`, registration, cache shell et reload hors connexion.

### P1 — gestion du focus dans les modales

**Zone :** `ListFormModal.tsx`, `WordFormModal.tsx`, `components/ui.tsx`.

Les modales doivent être testées avec Tab, Shift+Tab, Escape et lecteur d’écran afin de confirmer le focus initial, le focus trap et le retour du focus au bouton déclencheur.

**Impact :** parcours clavier difficile, surtout sur mobile avec clavier virtuel et pour les utilisateurs de technologies d’assistance.

**Recommandation :** formaliser un composant modal accessible ou vérifier explicitement ces comportements dans les tests navigateur.

### P2 — grandes listes et affichage dense

**Zone :** `ListDetail.tsx`, liste de mots, `builtin-vocabulary-data.json`.

Une liste de plus de 50 mots rend tous les éléments simultanément. La taille actuelle reste acceptable, mais le coût augmente avec les listes importées.

**Impact :** défilement long et rendu moins fluide sur appareils modestes.

**Recommandation :** ajouter recherche/filtre par mot et envisager `content-visibility: auto` ou une virtualisation uniquement lorsque la taille le justifie.

### P2 — reduced motion et scène décorative

**Zone :** `app/globals.css`, `components/AJWordsScene.tsx`.

La scène visuelle et les transitions doivent respecter `prefers-reduced-motion`. La scène est décorative et correctement masquée aux lecteurs d’écran, mais ses animations ne doivent pas gêner les utilisateurs sensibles au mouvement.

**Recommandation :** ajouter une variante CSS qui désactive les transformations et transitions non essentielles.

### P2 — robustesse des imports volumineux et invalides

**Zone :** `VocabularyApp.tsx`, `lib/vocabulary-storage.ts`, `scripts/import-phone-export.mjs`.

Les imports invalides sont rejetés, mais il faut tester explicitement les fichiers très volumineux, les listes sans mots, les IDs builtin, les doublons de mots et les champs SRS malformés.

**Impact :** import lent, mémoire excessive ou résultat inattendu dans une liste existante.

**Recommandation :** ajouter des limites explicites de taille, un résumé avant remplacement et une normalisation testée par propriété sur les champs numériques/dates.

### P2 — headers de sécurité incomplets

**Zone :** `next.config.ts`.

`X-Content-Type-Options` et `Referrer-Policy` sont présents. Une CSP n’est pas définie.

**Impact :** défense en profondeur limitée si une future dépendance ou une injection HTML est introduite.

**Recommandation :** définir une CSP compatible avec Next.js et les éventuels assets inline après vérification en production. Ajouter éventuellement `Permissions-Policy` et `Strict-Transport-Security` lorsque le domaine HTTPS est maîtrisé.

### P3 — dette technique mineure

**Zone :** scène 3D et fichiers de configuration/documentation.

L’audit précédent signalait l’utilisation dépréciée de `THREE.Clock`. Il faut remplacer cette API si elle est toujours présente dans la branche active. Les fichiers locaux suffixés ` 2` sont des copies non suivies et peuvent perturber TypeScript ou les recherches.

**Recommandation :** supprimer ces copies hors contrôle de version avec accord explicite, ou les exclure durablement comme le fait déjà `tsconfig.json`. Vérifier aussi que la documentation ne décrit jamais des fichiers non suivis.

## Recommandations concrètes

### Quick wins

1. Corriger `README.md` : cinq modes de quiz, sans daily review.
2. Ajouter `prefers-reduced-motion` dans les styles globaux.
3. Afficher une notification claire en cas d’échec de lecture ou d’écriture `localStorage`.
4. Ajouter une recherche dans les listes longues.
5. Remplacer les textes de chargement avec ponctuation cohérente et vérifier les textes longs en français, anglais, Darija et hébreu.

### Corrections techniques

1. Centraliser la validation des exports et appliquer une limite de taille avant `JSON.parse`.
2. Versionner les migrations de stockage et conserver une copie de secours avant migration.
3. Ajouter des tests de corruption `localStorage`, quota, données partielles et dates invalides.
4. Ajouter une CSP après inventaire des scripts et styles réellement nécessaires.
5. Remplacer l’API Three.js dépréciée et vérifier le rendu canvas dans les builds de production.

### Améliorations UX

1. Ajouter un indicateur explicite “Sauvegardé localement” et un accès rapide à Export.
2. Permettre de filtrer une liste par statut : nouveau, apprentissage, maîtrisé.
3. Ajouter une action “Réinitialiser la progression” avec confirmation et export recommandé.
4. Afficher le nombre de mots et la dernière activité dans la bibliothèque.
5. Prévoir un vrai parcours de récupération après import ou stockage corrompu.

### Dette de test

- Tests Playwright : premier lancement, création, édition, suppression, quiz, flashcards, reprise après reload.
- Tests accessibilité : axe clavier, focus modal, noms accessibles, contraste et reduced motion.
- Tests PWA : manifest, registration, cache shell, navigation offline et mise à jour du cache.
- Tests données : export/import valide et invalide, remplacement de builtin, doublons, historique plafonné, migration SRS.
- Tests responsive : 390×844 et 1440×1000, textes longs et listes de grande taille.

## Parcours à valider régulièrement

### Premier lancement

- L’application démarre avec les listes builtin sans écriture inutile des données publiques.
- Une liste locale peut être créée et sélectionnée immédiatement.
- Le rafraîchissement conserve la liste sélectionnée via URL et stockage UI.

### Étude

- Créer une liste, ajouter quatre mots et lancer chaque mode disponible.
- Vérifier la réponse correcte, la réponse incorrecte, la mise à jour du SRS et l’écran de score.
- Recharger pendant un quiz et reprendre la session sauvegardée.
- Reprendre les flashcards à l’index attendu après reload.

### Import/export

- Exporter une liste puis la réimporter.
- Rejeter un JSON invalide avec un message exploitable.
- Importer une liste portant un ID builtin et confirmer qu’elle devient une copie locale.
- Vérifier le remplacement d’une liste locale existante et la confirmation destructive.

### PWA

- Construire puis démarrer l’application en production.
- Vérifier manifest, service worker et headers.
- Charger une fois en ligne, couper le réseau, recharger et ouvrir une liste déjà disponible.

## Conclusion

AJ Words est déjà exploitable comme PWA locale et possède une base technique saine. Les prochaines priorités sont la visibilité des erreurs de stockage, les tests end-to-end et offline, puis la cohérence documentaire et les améliorations d’accessibilité motion/focus. Aucune migration backend, authentification ou télémétrie n’est nécessaire pour répondre aux besoins actuels.

