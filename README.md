# DULCES VICTORIA — Firebase et vidéos privées sur VPS

Application avec inscription et connexion Firebase Authentication, catalogue
Firestore, espace étudiant et administration privée. Les vidéos sont servies
par un service Node.js séparé, prévu pour le futur VPS Hostinger. Le code ne
requiert ni Firebase Storage, ni Cloud Functions, ni forfait Blaze.

## Démarrage

Node.js 22 ou 24, puis `npm ci` et `npm run dev -- --host 127.0.0.1`.
La configuration Firebase web publique de production est fournie dans
`.env.production`. Pour le développement, copier `.env.example` en `.env.local`
et renseigner les valeurs publiques du projet.

`npm run build` produit `dist/` avec accueil, `/espace.html` et
`/administration.html`. L'administration exige un compte Firebase actif et une
entrée de confiance `admins/{uid}`. Aucun bouton navigateur ne peut promouvoir
un étudiant. Voir `docs/OPERATIONS.md` avant migration ou déploiement.

## État de validation au 16 novembre 2026

- Compilation Vite réussie.
- Règles Firestore: 8 tests d'émulateur réussis.
- Service vidéo: 9 tests réussis, y compris suspension, révocation et liens copiés.
- Migration et sauvegarde: 3 tests de transformation réussis.
- Console du projet `dulces-victoria-7cf8f` accessible, forfait Spark confirmé,
  base vide observée. Cela ne constitue pas un déploiement de cette version.

Cette version doit être déployée avec ses règles, puis testée de bout en bout
avant ouverture. Le propriétaire administrateur reste à provisionner. Les vidéos
réelles et le futur VPS ne sont pas encore raccordés; aucun paiement automatique
n'est fourni. La MFA administrateur et la restauration complète en environnement
isolé restent à valider. Les tests vidéo utilisent des services Firebase simulés;
ils ne prouvent pas la lecture d'une vidéo de production sur Hostinger.

## Tests

`npm ci --prefix tests/security`, puis
`npx -y firebase-tools@latest emulators:exec --project demo-dulces --only firestore 'npm --prefix tests/security test'`.

`npm ci --prefix video-server && npm run test:video`.
`node --test scripts/*.test.mjs`.

## Hébergement et continuité

Le frontend temporaire peut être hébergé sur Firebase Hosting ou Vercel pour
tester les comptes. Pour les vidéos, déployer les fichiers `dist/` et le reverse
proxy `/api/video/` sous le même domaine HTTPS du VPS, selon
`video-server/README.md`. Les comptes et données restent dans Firebase si le VPS
expire. Le site et les vidéos du VPS deviennent alors indisponibles. Conserver
les vidéos originales et les sauvegardes hors de ce serveur.

Ne jamais committer de clé privée, de fichier de compte de service, de jeton,
de sauvegarde de données personnelles ou de fichier `.env` serveur.
