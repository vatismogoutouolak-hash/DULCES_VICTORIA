# Backend Firebase — DULCES VICTORIA

État: code préparé; aucun projet Firebase ou service distant n’a été provisionné ni validé dans cette session. Le site ne simule ni création de compte, ni paiement, ni accès payant lorsque Firebase n’est pas configuré.

## Activation

1. Choisir un projet Firebase dédié à DULCES VICTORIA. Créer Firestore natif et Storage, activer Email/Password et éventuellement Google dans Authentication. Autoriser le domaine Vercel définitif.
2. Renseigner les variables de `.env.example` dans Vercel. Les cinq paramètres web sont publics. `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` et `VIDEO_TOKEN_SECRET` (aléatoire, 32 caractères minimum) sont réservés au serveur; ne jamais les ajouter dans Git.
3. Déployer règles et index: `npx -y firebase-tools@latest deploy --only firestore:rules,firestore:indexes,storage --project VOTRE_PROJET`. Accorder à Storage la permission de consulter Firestore lorsque demandé. Valider d’abord avec les émulateurs et un projet de test.
4. Créer le compte propriétaire, puis attribuer son custom claim admin avec `node scripts/init-admin.mjs` (UID sur stdin), après authentification Application Default Credentials dans un environnement de confiance. Aucun rôle privilégié ne peut être attribué par le navigateur.
5. Charger des MP4 ou paquets HLS autonomes (manifeste .m3u8 et segments relatifs .ts/.m4s, clés .key si utilisées) dans `courses/chantilly/`, `courses/creme-au-beurre/`, `courses/gateaux-en-pot/`. Publier leurs métadonnées depuis l’administration. Ne pas créer de jetons de téléchargement publics pour les vidéos privées. Activer les fonctionnalités Storage/signature du compte de service selon le projet.
6. Tester inscription, vérification email, connexion, réinitialisation, demande d’accès, refus/approbation, progression, lecture et révocation. Les demandes ne sont pas des paiements; l’administrateur valide l’accès après vérification commerciale externe.

## Données et autorisations

`enrollments/{uid_courseId}` contient la demande et son statut. Seul l’utilisateur concerné et un administrateur peuvent la lire. L’étudiant ne peut créer que `pending`; seuls les administrateurs changent le statut. `users/{uid}/progress/{courseId_lessonId}` appartient à l’étudiant. `courses/{courseId}/lessons/{lessonId}` est réservé aux inscrits approuvés et administrateurs. Toute autre collection est inaccessible côté client. Les vidéos exigent une inscription approuvée ou un custom claim administrateur.

`POST /api/video` vérifie le jeton Firebase avec contrôle de révocation, recharge l’inscription et la leçon côté serveur puis émet un jeton HMAC privé valable quinze minutes pour `/api/stream`. Le proxy réécrit les manifestes HLS et leurs URI vers les segments authentifiés; chaque requête contrôle à nouveau le compte Auth, la révocation, la leçon et l’inscription. Une suspension du compte ou de l’inscription bloque les prochaines requêtes de segments. Les données déjà mises en mémoire tampon peuvent encore être lues. Le lecteur doit renouveler son jeton avant expiration pour les longues vidéos. Les paquets HLS doivent utiliser des URI relatives sans traversée (`..`), sans URL externe ni query string. Les segments sont limités à 32 Mio, les manifestes à 1 Mio et les plages MP4 à 8 Mio.

## Limites connues

Le contrôle de session unique n’est pas implémenté. Le jeton temporaire et le filigrane dissuadent le partage sans empêcher l’enregistrement d’écran. La révocation ne retire pas les segments déjà téléchargés. Le lecteur HLS et le proxy ont été contrôlés statiquement; aucun fichier vidéo privé réel n’a pu être diffusé sans configuration Firebase. Aucun prestataire de paiement n’est configuré. Les prix, vidéos, durées et pièces légales définitives restent à fournir/valider.

Règles de sécurité préparées à l’état de prototype: séparation des données privées, schéma strict, accès par propriétaire, custom claims administrateur et refus par défaut. La revue logique couvre accès public, usurpation UID, élévation de privilège, champs supplémentaires, tailles et timestamps. Les règles n’ont pas pu être compilées ni exécutées contre un projet authentifié; une validation émulateur et une revue sont nécessaires avant ouverture des inscriptions.
