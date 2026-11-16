# Dulces Victoria — Exploitation Firebase et futur VPS vidéo

## Architecture et état réel

Le projet Firebase identifié dans le dépôt antérieur est `dulces-victoria-7cf8f`.
La nouvelle application utilise Authentication (email/mot de passe) et Firestore.
Les vidéos seront conservées dans un répertoire privé du futur VPS Hostinger;
elles ne passent ni par YouTube ni par Firebase Storage. Aucun Cloud Function,
Firebase App Hosting, paiement automatique ou abonnement Blaze n'est nécessaire
à cette architecture de base.

Les scripts de ce dossier ne constituent pas une preuve de connexion ni de
déploiement. Les accès Firebase distants doivent être vérifiés au moment de
l'exécution. Aucun VPS n'est encore configuré par ces scripts. Aucun identifiant
de compte de service ne doit être enregistré dans Git, dans le navigateur ou
dans une archive publique. Utiliser Application Default Credentials dans un
environnement de confiance, ou un fichier secret externe via
`GOOGLE_APPLICATION_CREDENTIALS` sans afficher son contenu.

## Migration depuis l'ancien dépôt

L'ancien dépôt utilisait des inscriptions avec `uid` et les statuts
`pending/approved/rejected/suspended`, ainsi que des leçons `videoPath` et des
custom claims administrateur. La nouvelle version utilise `userId`,
`active/revoked`, `videoAssetId`, et la collection privée `admins/{uid}`.
Déployer les nouvelles règles avant une migration cohérente peut rendre les
données anciennes illisibles. Prévoir une fenêtre de maintenance, sans écritures
administrateur/étudiant pendant la sauvegarde et la migration.

Depuis la racine du projet, après installation des dépendances serveur:

```bash
export FIREBASE_PROJECT_ID=dulces-victoria-7cf8f
node scripts/migrate.mjs --backup-dir /chemin/prive/dulces-backups
```

Cette commande lit l'état actuel et enregistre une sauvegarde et un plan privés;
elle ne change aucune donnée distante. Examiner les avertissements, les comptes
à compléter et les correspondances vidéo dans le plan avant d'appliquer:

```bash
node scripts/migrate.mjs --backup-dir /chemin/prive/dulces-backups --apply
```

Chaque écriture vérifie que le document n'a pas changé depuis la sauvegarde.
Un conflit arrête la migration; les écritures précédentes peuvent déjà avoir
été appliquées. Une nouvelle exécution ignore les documents déjà au nouveau
format. Les trois formations connues sont ajoutées uniquement si absentes,
masquées et avec prix `null` (tarif inconnu). Une ancienne inscription approuvée
devient active; les demandes en attente, refusées ou suspendues ne donnent aucun
accès. Leur statut original est conservé dans la sauvegarde obligatoire. Les
leçons reçoivent un identifiant vidéo déterministe; aucun fichier n'est déplacé
ou converti par cette migration.

Les anciens comptes Auth sans profil doivent compléter nom, téléphone et pays
avant d'utiliser l'espace étudiant. Ne pas inventer ces informations. Un compte
sans profil actif ne doit recevoir aucune vidéo. Les custom claims admin ne
suffisent plus: le propriétaire doit être provisionné explicitement ci-dessous.
Les anciennes données de progression ne sont pas supprimées, mais leur reprise
dans la nouvelle interface doit être vérifiée séparément.

## Provisionner un administrateur

Le compte doit déjà exister dans Firebase Authentication, être actif et avoir
une adresse e-mail vérifiée. Préparer hors du dépôt un fichier privé contenant
`uid`, `name`, `telephone`, `country`, avec les informations réelles du
propriétaire. Puis:

```bash
node scripts/bootstrap-admin.mjs < /chemin/prive/proprietaire.json
```

Le script crée la fiche compatible et `admins/{uid}` par transaction. Il refuse
un profil suspendu et n'affiche ni mot de passe ni jeton. La collection admins
n'est pas modifiable depuis le navigateur. Utiliser un compte propriétaire
distinct des comptes étudiants.

La double authentification administrateur doit être évaluée/configurée avant
l'ouverture commerciale. Elle n'est pas fournie par ce script; ne pas annoncer
une conformité intégrale au cahier des charges tant que ce point et les essais
de sécurité ne sont pas validés. Ne pas activer de service payant pour la MFA
sans avoir vérifié les conditions et obtenu l'accord du propriétaire.

## Sauvegardes indépendantes

```bash
node scripts/backup.mjs /chemin/prive/dulces-backups/sauvegarde-unique.json
```

La sauvegarde parcourt récursivement les documents et sous-collections, y
compris celles dont le parent n'existe plus. Les timestamps, octets, références
et coordonnées sont typés. Elle inclut les métadonnées des comptes Auth et leurs
custom claims, mais **aucun hash de mot de passe ni jeton**. Elle contient des
données personnelles: conserver chiffrée, hors Git et hors dossiers publics.
Le fichier est créé en mode 0600 et n'écrase jamais une sauvegarde existante.

La lecture n'est pas un snapshot transactionnel global: arrêter les écritures
pendant la capture pour une sauvegarde cohérente. La sauvegarde ne comprend ni
les règles, index, configuration Auth, secrets, ni les vidéos. Conserver aussi
le code Git et une copie indépendante des vidéos originales et paquets HLS.
L'expiration du VPS n'efface pas Firestore; elle coupe cependant la lecture des
vidéos et peut entraîner la perte des fichiers VPS sans sauvegarde externe.

## Restauration prudente

```bash
node scripts/restore.mjs /chemin/prive/sauvegarde.json
node scripts/restore.mjs /chemin/prive/sauvegarde.json --apply
```

Le mode par défaut simule. L'outil refuse toute restauration qui écraserait un
document existant; aucun drapeau de force n'est prévu. Un conflit concurrent
après vérification fait échouer l'écriture `create`. Une erreur en cours de
restauration peut laisser une restauration partielle. Tester sur un projet de
reprise isolé en adaptant explicitement la garde de projet dans une copie
contrôlée du script, avant toute opération de production.

**Les comptes Auth et leurs mots de passe ne sont pas restaurés par cet outil.**
Les fiches Auth servent d'inventaire; un plan de reprise Auth distinct est
nécessaire si le projet Firebase lui-même est perdu. L'export Firestore seul ne
constitue pas une sauvegarde complète du système.

## Vérifications avant ouverture

- Email/mot de passe activé, domaine public autorisé et envoi de vérification /
  réinitialisation réellement testé.
- Règles et index validés dans les émulateurs, puis déployés sur le bon projet.
- Compte étudiant autorisé, non autorisé, suspendu et administrateur testés.
- Catalogue publié uniquement après validation des contenus et tarifs.
- VPS HTTPS configuré, vidéo privée réelle diffusée et liens copiés refusés.
- Sauvegarde puis restauration de test réalisées; documentation complétée avec
  les résultats réels, sans assimiler une procédure préparée à un test réussi.
- Modalités de vente, confidentialité et contact validées; activation manuelle
  des accès après vérification du paiement tant qu'aucune passerelle n'existe.

Les quotas Spark et conditions Firebase peuvent évoluer: vérifier les limites
officielles avant lancement et surveiller l'usage. Aucun forfait gratuit ne doit
être présenté comme une garantie illimitée de disponibilité ou de conservation.
