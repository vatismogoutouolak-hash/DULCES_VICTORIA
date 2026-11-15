# DULCES VICTORIA

Site de l’école de pâtisserie: catalogue des trois formations, programmes détaillés, recherche et filtres, espace étudiant et administration.

## Architecture

Frontend HTML/CSS/JavaScript natif, navigation par URL fragment, sans compilation du navigateur. Backend Firebase Authentication, Firestore et Storage. API Vercel pour configuration publique et autorisation vidéo côté serveur. Aucun secret dans le navigateur.

- `node scripts/build.mjs`: prépare les fichiers publics.
- `npm test`: vérifications de configuration, de validation et de refus d’accès.
- `README_BACKEND.md`: procédure d’activation Firebase et limites connues.
- `.env.example`: noms des variables à configurer dans Vercel.

## État de livraison

Le catalogue reprend les programmes fournis par le client. Les tarifs, durées, coordonnées, conditions commerciales définitives et vidéos n’ont pas été fournis. Aucun achat ni résultat d’apprentissage n’est simulé. L’ouverture des comptes et des accès attend la configuration d’un projet Firebase dédié et la validation de ses règles en émulateur.

Les demandes d’inscription sont vérifiées manuellement après accord commercial externe. Aucun encaissement intégré n’est activé. Le lecteur prend en charge MP4 et HLS avec proxy privé, jetons courts, contrôle des accès à chaque segment et filigrane visuel. La lecture réelle et les règles Firebase attendent un projet configuré et des vidéos de test. La limitation à une session et les sauvegardes automatisées ne sont pas implémentées.

Les photos de démonstration proviennent d’Unsplash et ne représentent pas les réalisations de la formatrice. Remplacer par les visuels propriétaires lors de leur réception.
