# Vidéos privées — futur VPS Hostinger

Ce composant est préparé et testable localement. Il n'est pas déployé et ne contient ni vidéos, ni clés de service, ni identifiants de production. Il ne nécessite pas Cloud Functions ni Cloud Storage Firebase. Il s'exécute sur le futur VPS ; ses vérifications Firestore consomment les quotas du projet Firebase.

## Contrat avec l'application

1. L'étudiant connecté envoie `POST /api/video/playback`, `Authorization: Bearer <Firebase ID token>`, `Content-Type: application/json`, corps `{ "courseId": "…", "lessonId": "…" }`, avec `credentials: "include"`.
2. Le service vérifie le jeton Firebase avec `checkRevoked=true`, le profil actif et les droits à jour. Il retourne `{ "url": "/api/video/hls/<grant>/index.m3u8", "expiresAt": 1790000000000 }` et un cookie HttpOnly/Secure/SameSite=Strict.
3. Le lecteur utilise cette URL. Le cookie est envoyé automatiquement par le navigateur. Un lien copié sans ce cookie est refusé. La durée par défaut est 5 minutes ; l'application renouvelle avant expiration en refaisant le POST avec un jeton Firebase actualisé et recharge le manifeste en préservant la position. Chaque nouvelle autorisation invalide la précédente pour ce compte.
4. Au départ du lecteur ou à la déconnexion : `DELETE /api/video/playback`, avec cookies et Origin. Une déconnexion dans un autre appareil ne révoque pas automatiquement le jeton déjà remis ; la session vidéo expire au plus tard après 5 minutes. La révocation administrative Firebase est vérifiée à chaque requête.

**Même origine requise en production.** Le site et `/api/video/` doivent partager une origine HTTPS, avec le proxy Nginx fourni. Cette version n'autorise pas CORS ni les cookies tiers. Un site temporaire sur `*.web.app` ne pourra donc lire les vidéos du VPS directement : au raccordement du VPS, déployer également les fichiers frontend sur l'origine du VPS ou concevoir et tester une autre architecture de domaines. Ne pas simplement renseigner un domaine vidéo différent dans le frontend.

Schéma Firestore attendu :

| Document | Champs vérifiés |
| --- | --- |
| `users/{uid}` | `status: "active"` |
| `enrollments/{uid}_{courseId}` | `userId`, `courseId`, `status: "active"`, `expiresAt` Timestamp facultatif |
| `courses/{courseId}` | `status: "published"` |
| `courses/{courseId}/lessons/{lessonId}` | `videoAssetId` : identifiant de dossier privé |

Le serveur ne fait confiance à aucun rôle ou droit envoyé par le navigateur. Ses appels Admin SDK contournent les règles Firestore : la vérification explicite ci-dessus est indispensable. Chaque manifeste, segment, sous-titre ou clé relit ces droits sans cache ; une suspension ou un retrait bloque la prochaine requête. Les secondes déjà mises en mémoire par le lecteur peuvent encore être lues.

## Installation au moment où le VPS sera disponible

- Installer une version Node.js maintenue (22 ou supérieure), Nginx et FFmpeg. Utiliser un compte système dédié, sans connexion root applicative.
- Exécuter `npm ci --omit=dev` dans ce dossier. Copier `.env.example` vers `/etc/dulces-victoria/video.env` et remplir les valeurs dans un canal sécurisé, jamais dans Git ni dans le chat.
- Générer un secret aléatoire avec `openssl rand -hex 32`. Monter hors du site une clé de compte de service dédiée, lisible uniquement par le compte du service, via `GOOGLE_APPLICATION_CREDENTIALS`.
- Donner au compte de service uniquement les droits nécessaires pour lire Firestore et consulter l'état des utilisateurs Firebase Auth. Ne pas utiliser une clé administrateur globale Editor/Owner. Le service ne modifie pas les comptes ni les documents.
- Créer `/srv/dulces-victoria/private-hls` en dehors de tout dossier web. Le service lit les vidéos ; la conversion/import est réservée à l'exploitation. Aucun serveur statique ni alias Nginx ne doit exposer ce dossier.
- Renseigner `APP_ORIGIN` avec l'origine HTTPS réelle, sans chemin ni slash final. Garder l'écoute sur `127.0.0.1:8081`. Installer le service systemd et le bloc proxy fournis après adaptation des chemins.
- Activer HTTPS, pare-feu, mises à jour et sauvegardes externes. Aucun port Node/Firestore ne doit être exposé publiquement.
- Avant production : vérifier sur téléphone et ordinateur le flux autorisé, l'expiration, le refus sans cookie, la suspension, le retrait d'accès et une restauration des vidéos/sauvegardes. Ces vérifications sur le VPS réel restent à faire.

Les appels de connexion/sortie sont protégés par une correspondance exacte d'Origin. La limite applicative protège les sessions et lectures ; derrière le proxy, compléter par une limitation réseau/IP Nginx adaptée au trafic. Ne jamais journaliser les en-têtes Authorization, les cookies, ni les URL de lecture signées.

## Préparer une vidéo

Utiliser un identifiant opaque de 1 à 128 caractères alphanumériques, `_` ou `-` (exemple : `cake-basics-lesson-01`). La source originale reste dans une sauvegarde privée séparée. Produire du HLS MPEG-TS :

```sh
mkdir -p /srv/dulces-victoria/private-hls/cake-basics-lesson-01
ffmpeg -i /chemin/prive/original.mp4 -c:v libx264 -preset medium -crf 23 \
  -c:a aac -b:a 128k -force_key_frames 'expr:gte(t,n_forced*6)' \
  -hls_time 6 -hls_playlist_type vod -hls_segment_type mpegts \
  -hls_segment_filename '/srv/dulces-victoria/private-hls/cake-basics-lesson-01/segment%05d.ts' \
  /srv/dulces-victoria/private-hls/cake-basics-lesson-01/index.m3u8
```

Renseigner ensuite `videoAssetId` dans la leçon. Seuls `.m3u8`, `.ts`, `.key` et `.vtt` sont servis ; les MP4 originaux et les chemins distants sont refusés. Les références dans les manifestes doivent être des chemins relatifs locaux sans `..`. Les échappements de chemin et liens symboliques sortant du dossier de la vidéo sont refusés.

## Tests et limites

`npm test` exécute des tests réels HTTP avec identité/Firestore simulés : authentification, origine, lien copié, lecture du segment, suspension, retrait d'accès, révocation du jeton, invalidation de session et protections de fichiers. Les tests ne remplacent pas les vérifications des identifiants, quotas, réseau, TLS et appareils sur le VPS réel.

Le HLS et les autorisations limitent le partage ordinaire ; il ne s'agit pas de DRM et l'enregistrement de l'écran reste possible. Le filigrane étudiant doit être affiché par le lecteur frontend. Le service conserve les sessions uniquement en mémoire : un redémarrage les invalide, le lecteur demande une nouvelle autorisation. Une seule instance Node est prévue ; plusieurs instances nécessiteraient un magasin de sessions partagé. Le contrôle sans cache réalise quatre lectures Firestore et une vérification Auth par ressource. Avec des segments de six secondes, une heure de visionnage représente environ 2 400 lectures, auxquelles s'ajoutent les manifestes, renouvellements et lectures du site. À titre de dimensionnement, un quota disponible de 50 000 lectures quotidiennes représente donc moins de 20 heures cumulées de visionnage par jour après prise en compte des autres usages. Vérifier le quota réel du projet et surveiller son utilisation. Une optimisation ultérieure devra conserver une stratégie de révocation explicitement testée ; aucun cache d'autorisations obsolètes n'est activé ici. Aucun passage automatique au forfait Blaze n'est implémenté.

Références officielles : [vérification des jetons](https://firebase.google.com/docs/auth/admin/verify-id-tokens), [révocation des sessions](https://firebase.google.com/docs/auth/admin/manage-sessions).
