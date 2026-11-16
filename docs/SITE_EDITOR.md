# Administration du contenu Dulces Victoria

L’onglet Contenu du site est réservé à un compte actif présent dans admins/{uid}. Il permet de modifier les textes existants, liens, images de fond, logo, titre et description des pages Accueil, Espace étudiant et Administration. Les formations, leçons et accès restent dans leurs onglets dédiés.

## Utilisation

1. Choisir la page et ouvrir les groupes de champs.
2. Modifier les textes et liens, importer une image PNG/JPG/WebP ou fournir son URL HTTPS.
3. Régler les couleurs, l’ordre et la visibilité des sections. Ajouter des sections de témoignages, contact ou informations si nécessaire.
4. Vérifier l’aperçu puis enregistrer le brouillon. Publier applique le contenu aux visiteurs.
5. Exporter une sauvegarde JSON avant les changements importants. Une sauvegarde peut être importée puis publiée. Reprendre la version publiée remplace le brouillon en cours, après confirmation.

Les images importées sont redimensionnées et compressées, avec une limite de 100 000 caractères par image et 250 000 par page. Pour de nombreuses images, employer des URL HTTPS sur un hébergement média. Les vidéos privées restent sur le VPS et ne passent pas par cet éditeur.

## Configuration et limites actuelles

Les règles firestore.rules de cette branche doivent être publiées dans le projet dulces-victoria-7cf8f avant utilisation de l’éditeur. Tant que cette étape n’est pas effectuée, l’onglet indique clairement l’attente d’activation et ne prétend pas enregistrer de contenu. Aucun accès à la console Firebase ou outil de déploiement Firebase n’est disponible dans la session du 16 novembre pour finaliser cette étape.

Les documents siteContent/draft et siteContent/published contiennent pages {home,student,admin} (JSON sérialisé), theme, updatedBy et updatedAt. Les visiteurs lisent uniquement published, les comptes administrateurs actifs seuls modifient le contenu. Les sauvegardes sont manuelles et exportables ; pas d’historique illimité implicite.

Les champs éditables sont enregistrés depuis les éléments statiques avant le chargement de l’application. Les mots de passe, droits, données privées des étudiants et composants dynamiques ne sont pas des contenus éditoriaux. Modifier la structure des gabarits dans une future version nécessite de migrer les identifiants de champs CMS pour conserver leurs associations. Le titre et la description sont appliqués côté navigateur.

Une transaction empêche l’écrasement silencieux d’un brouillon modifié dans une autre fenêtre. Les textes sont rendus avec textContent ; aucun HTML ou JavaScript fourni dans l’éditeur n’est exécuté. Les images acceptent HTTPS et images raster importées ; les liens autorisent chemins internes, ancres, HTTPS, email et téléphone.
