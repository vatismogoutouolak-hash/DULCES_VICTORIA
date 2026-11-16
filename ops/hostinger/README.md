# DULCES VICTORIA — déploiement VPS Hostinger

## État réel

Paquet de migration préparé, non installé sur un VPS. Aucun VPS, domaine, DNS, pare-feu ou compte Hostinger n’a été modifié. L’accès depuis le navigateur distant est bloqué par Hostinger; le serveur MCP n’est pas disponible dans cette session.

Cette migration déplace le site et les vidéos vers le VPS. Firebase Authentication et Firestore déjà configurés restent utilisés pour les comptes, demandes, progression et droits. Les vidéos sont des fichiers privés du VPS; aucun forfait Firebase Storage/Blaze n’est nécessaire pour cette architecture. Le projet reste soumis aux quotas gratuits Auth/Firestore. Le passage de la base de données elle-même sur le VPS est une migration distincte, non réalisée par ce paquet.

## Architecture

Nginx HTTPS → application Node non privilégiée → vérification Firebase Auth + droits Firestore → HLS privé local. Le navigateur ne voit jamais le chemin système des vidéos. Les fichiers source, .env, clés et vidéos ne sont pas servis par le serveur statique; seuls les assets publics du build sont exposés.

## Préparatifs après accès serveur

1. Identifier le VPS existant, son système, le disque libre, les services déjà présents et leur sauvegarde. Ne pas réinstaller ni écraser un serveur existant. Dimensionner avec le volume vidéo et la simultanéité attendue; ne pas acheter sans prix et cible validés.
2. Choisir le domaine. Relever les DNS actuels, préserver MX/SPF/DKIM/DMARC et vérifications. Vérifier l’adresse cible avant la bascule.
3. Préparer un compte technique avec accès SSH par clés; vérifier son accès avant toute désactivation de root/password. Pare-feu: HTTP/HTTPS et SSH restreint; aucun port de base de données public. Installer Docker, Compose, Nginx, Certbot et FFmpeg depuis les sources officielles.
4. Créer `/etc/dulces-victoria` (0700) et `/srv/dulces-victoria/videos` (0750). Configurer `production.env` (0600) depuis l’exemple, fournir les identifiants serveur Firebase par un canal sûr et générer le secret vidéo. Ne jamais publier ces données dans Git ou dans le navigateur.
5. Charger le dépôt, exécuter `npm ci --ignore-scripts`, `npm run build`, `npm test` et `npm run test:hostinger`. Construire avec `docker compose -f ops/hostinger/compose.yaml build`, puis lancer avec `up -d`. Le port 3000 n’est publié que sur 127.0.0.1.
6. Installer le vhost Nginx après remplacement de DOMAIN; vérifier `nginx -t`. Émettre le certificat avec Certbot, activer la redirection HTTPS puis tester le renouvellement. Ne pas ouvrir commercialement l’instance HTTP temporaire. Régler la confiance proxy uniquement pour le relais réel et tester la limitation par IP.
7. Autoriser le domaine définitif dans Firebase Auth. Configurer le compte propriétaire avec le custom claim admin et activer une authentification forte adéquate avant livraison des accès. Le script `scripts/init-admin.mjs` exige un contexte d’administration authentifié et un UID sur stdin.
8. Charger les vidéos hors de `public/`. Préparer HLS: `node scripts/prepare-video.mjs SOURCE chantilly genoise-classique /srv/dulces-victoria/videos`. Le script refuse de remplacer un dossier existant. Ajuster propriétaire/groupe pour permettre au conteneur UID1000 de lire, sans écriture. Enregistrer la leçon avec son chemin `courses/chantilly/genoise-classique/index.m3u8`.
9. Sauvegarder fichiers privés/configuration avec chiffrement vers une destination externe; conserver une copie des originaux. Les sauvegardes Firestore constituent un point séparé à choisir selon les coûts et quotas. Tester une restauration sur une instance isolée avant mise en production.

## Recette obligatoire avant livraison

- Domaine réel, HTTPS, en-têtes, aucune exposition .env/source/vidéo.
- Inscription, validation e-mail, connexion, réinitialisation, déconnexion.
- Rôles administrateur/apprenant, refus d’un autre utilisateur, attribution et suspension.
- HLS ordinateur/téléphone, jeton expiré ou altéré, lien copié dans un autre navigateur, arrêt après suspension.
- Protection admin renforcée, limites de tentatives, sauvegardes et restauration.
- Charge: CPU, mémoire, volume des segments, débit et simultanéité; pas de promesse de capacité avant mesures.

Le filigrane est une dissuasion visuelle; l’enregistrement d’écran demeure possible. L’autohébergement ne constitue pas à lui seul une preuve de conformité. La MFA administrateur, les sauvegardes automatiques et la restauration ne sont pas configurées dans le compte distant par ce paquet. L’audit des cookies d’authentification du cahier reste à finaliser: Firebase Auth côté client n’est pas une session applicative HttpOnly côté serveur. Aucune migration n’est déclarée terminée avant ces essais et la résolution des écarts retenus avec le client.

## Retour arrière

Conserver la version Vercel et le projet Firebase existants pendant la recette. Si la bascule DNS échoue, rétablir les enregistrements précédemment relevés. Conserver les archives de versions et les sauvegardes avant toute intervention sur une installation existante.
