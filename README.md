# DULCES VICTORIA

Site de l’école de pâtisserie: catalogue des trois formations, programmes détaillés, recherche et filtres, espace étudiant et administration.

## Architecture

Frontend HTML/CSS/JavaScript natif, navigation par URL fragment, sans compilation du navigateur. Backend Firebase Authentication, Firestore et Storage. API Vercel pour configuration publique et autorisation vidéo côté serveur. Aucun secret dans le navigateur.

- `node scripts/build.mjs`: prépare les fichiers publics.
- `npm test`: vérifications de configuration, de validation et de refus d’accès.
- `README_BACKEND.md`: procédure d’activation Firebase et limites connues.
- `.env.example`: noms des variables à configurer dans Vercel.

## État de livraison

Le catalogue reprend les programmes fournis par le client. Les tarifs, durées, coordonnées, conditions commerciales définitives et vidéos n’ont pas été fournis. Aucun achat ni résultat d’apprentissage n’est simulé. Le projet Firebase dédié `dulces-victoria-7cf8f` est créé sans Analytics. Email/Password et Firestore Belgique sont configurés; règles privées publiées. La diffusion vidéo exige encore le forfait Blaze, le stockage, les secrets serveur, le compte administrateur et les vidéos de test.

Les demandes d’inscription sont vérifiées manuellement après accord commercial externe. Aucun encaissement intégré n’est activé. Le lecteur prend en charge MP4 et HLS avec proxy privé, jetons courts, contrôle des accès à chaque segment et filigrane visuel. La lecture réelle et les règles Firebase attendent un projet configuré et des vidéos de test. La limitation à une session et les sauvegardes automatisées ne sont pas implémentées.

Les photos de démonstration proviennent d’Unsplash et ne représentent pas les réalisations de la formatrice. Remplacer par les visuels propriétaires lors de leur réception.

## Migration Hostinger préparée

Voir `ops/hostinger/README.md`: serveur Node, stockage vidéo privé local, HLS, contrôle des droits et cookie de lecture lié au navigateur. Le déploiement distant est bloqué par l’accès Hostinger. Aucune installation, dépense ou bascule DNS n’a eu lieu. Firebase Auth/Firestore gratuit est conservé; Firebase Storage n’est pas nécessaire.
