# Pilote privé HTTPS — préparation et restauration

## Ce qui est préparé

Une installation Linux unique : Caddy termine HTTPS, puis transmet à Express sur le réseau Docker. Le port 3000 n'est pas publié. La base SQLite, les originaux et les clés restent dans `private-runtime/data`. Le site et Android utilisent le même serveur.

L'espace de données est protégé par le mot de passe propriétaire existant. La page de connexion reste accessible sur Internet ; ce montage ne fournit ni VPN, ni comptes séparés, ni accès réseau sur invitation. Pour un serveur entièrement inaccessible au public, ajouter un réseau privé/VPN et y connecter aussi le téléphone avant de déployer. Ne pas ajouter une authentification HTTP Basic devant l'API Android sans adapter son client.

Ce dossier prépare le déploiement ; il ne crée pas de serveur, n'achète pas de domaine et n'obtient pas de certificat sur ce poste. Docker et Restic ne sont pas disponibles dans l'environnement Windows de préparation : leur exécution et l'émission HTTPS devront être validées sur le serveur.

## Est-ce facile ?

Oui pour un pilote à un propriétaire, avec un serveur Linux déjà accessible : l'application n'a besoin que d'un processus et d'un disque persistant. La partie manuelle reste le serveur, le DNS, les accès administrateur, le stockage externe des sauvegardes et la vérification depuis un téléphone. Compter en heures plutôt qu'en minutes pour une première installation ; ce n'est pas une promesse de délai.

Le site devient accessible avec une URL HTTPS. Android demande en plus une nouvelle compilation pointant vers cette URL et une signature de distribution. Publier sur Google Play est une étape séparée. Les dépenses à prévoir sont le serveur, le domaine et le stockage de sauvegarde, selon les offres retenues. Aucun achat ni prestataire payant n'est activé par ces fichiers.

## 1. Préparer le serveur

Prérequis : Linux, Docker Engine avec Compose v2, Restic et `flock` (util-linux), accès SSH, domaine ou sous-domaine contrôlé, stockage persistant. Un point de départ à évaluer : 2 vCPU, 2–4 Go de RAM et assez de disque pour les originaux, les images Docker et plusieurs copies de sauvegarde. Les traitements vidéo peuvent demander davantage.

Copier une version revue du projet dans `/opt/preuvix`, sans les `.env` locaux, `.tools`, `node_modules`, `data` ni APK. Conserver le code exact de chaque version déployée pour pouvoir restaurer avec le même schéma de base.

Dans `/opt/preuvix` :

```sh
cp deploy/private.env.example .env.production
chmod 600 .env.production
sudo install -d -m 700 private-runtime
sudo install -d -m 700 -o 1000 -g 1000 private-runtime/data private-runtime/snapshots
sudo install -d -m 755 trust
```

Éditer `.env.production` : domaine réel sans schéma ni chemin, e-mail ACME, mot de passe aléatoire unique d'au moins 32 caractères. Utiliser un gestionnaire de mots de passe. Le mot de passe d'exemple est volontairement refusé au démarrage. Ne pas imprimer `docker compose config` en clair dans un journal : il peut contenir les secrets interpolés.

`REQUIRE_TIMESTAMP=false` est l'option explicite du pilote sans service qualifié configuré. Elle ne crée aucun horodatage qualifié. Paiements et Premium de test restent désactivés. Les services externes éventuels doivent être configurés et validés séparément.

Faire pointer le DNS A vers le serveur ; ne publier AAAA que si IPv6 fonctionne aussi. Autoriser les ports 80 et 443 et limiter SSH à l'administration. Caddy obtient et renouvelle les certificats automatiquement lorsque DNS et réseau sont corrects. Les volumes Caddy conservent ses certificats ; ne pas les supprimer lors des mises à jour.

```sh
docker compose --env-file .env.production -f deploy/compose.private.yaml config --quiet
docker compose --env-file .env.production -f deploy/compose.private.yaml build
docker compose --env-file .env.production -f deploy/compose.private.yaml up -d preuvix caddy
docker compose --env-file .env.production -f deploy/compose.private.yaml ps
```

Le conteneur doit être `healthy`. Le contrôle `/api/config` est un contrôle applicatif HTTP, pas un test de restauration. Vérifier le certificat et la redirection HTTP depuis un autre réseau. Vérifier la connexion, la capture GPS/caméra, le dépôt et les exports depuis un navigateur réel. Ne pas importer les données locales avant que l'accès et la restauration isolée soient validés.

Pour Android : `VITE_BACKEND_URL=https://votre-domaine-reel` dans `.env.android.local`, puis `npm run android:build` et `npm run android:sync`. La signature release et les tests natifs suivent [README_ANDROID.md](../README_ANDROID.md). Ne mettre aucun secret serveur dans `VITE_*`.

## 2. Sauvegarde cohérente et copie chiffrée externe

`scripts/backup.mjs` utilise l'API de sauvegarde SQLite, contrôle l'intégrité et les clés étrangères, copie les fichiers auxiliaires et vérifie que la clé Ed25519 correspond à celle enregistrée dans la base. Un manifeste SHA-256 permet de détecter les altérations. Il ne constitue pas une signature d'authenticité de l'archive.

Les originaux sont des BLOB SQLite et font donc partie de la sauvegarde. Les clés archivées, `partners.json`, `community.json` et les autres fichiers réguliers à la racine des données sont inclus. Le cache téléchargeable `models/` est exclu. Un autre sous-répertoire inattendu fait échouer la sauvegarde plutôt que de l'omettre silencieusement. Les journaux SQLite sont traités par l'API, pas copiés comme des bases indépendantes.

Le script de production arrête brièvement Express pour figer également les fichiers auxiliaires, réalise le snapshot, puis redémarre l'application même si la création échoue. Ne pas effectuer de rotation de clé ni d'édition manuelle des données pendant cette opération. HTTPS peut afficher une indisponibilité pendant cette courte fenêtre ; l'envoi vers Restic a lieu après le redémarrage.

Installer Restic depuis sa distribution officielle. Créer un dépôt **sur une autre machine ou un stockage objet**, pas seulement sur le disque de l'application. Créer `/etc/preuvix/restic.env` et un fichier de mot de passe séparé, lisibles seulement par root. Exemple de paramètres, à remplacer :

```sh
RESTIC_REPOSITORY='sftp:backup-user@backup-host:/srv/preuvix'
RESTIC_PASSWORD_FILE='/etc/preuvix/restic-password'
```

Configurer l'accès SFTP (clé dédiée et empreinte d'hôte vérifiée) ou les variables du fournisseur choisi. Garder une copie de récupération du mot de passe Restic hors du serveur ; sa perte rend les sauvegardes inutilisables. Initialiser une seule fois, puis tester :

```sh
sudo -i
cd /opt/preuvix
set -a
. /etc/preuvix/restic.env
set +a
restic init
/bin/sh deploy/backup-private.sh
restic check --read-data
restic snapshots --tag preuvix-private
```

`restic init` est seulement pour un nouveau dépôt. Le script sauvegarde le snapshot, `.env.production`, `trust` et `deploy`, puis vérifie le dépôt Restic. Il ne sauvegarde pas automatiquement le code source, les certificats Caddy ou une configuration externe à ces chemins : conserver la version du code et toute configuration externe nécessaire séparément. Les certificats HTTPS peuvent être réémis si le domaine reste contrôlé.

Les snapshots locaux restent en clair, protégés par les droits du système : utiliser un disque chiffré. La copie Restic est chiffrée. Les droits Unix de ces scripts ne remplacent pas la gestion des ACL sous Windows.

Après un premier exercice de restauration réussi, installer le minuteur :

```sh
sudo cp deploy/preuvix-backup.service deploy/preuvix-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now preuvix-backup.timer
systemctl list-timers preuvix-backup.timer
journalctl -u preuvix-backup.service
```

Adapter les chemins si le projet n'est pas dans `/opt/preuvix`. La sauvegarde est prévue chaque jour à 03:15, heure du serveur, avec un léger décalage. Le minuteur ne constitue pas une alerte : configurer une notification d'échec et surveiller l'espace disque avant de laisser le pilote sans surveillance.

Politique de départ à confirmer : 7 sauvegardes quotidiennes et 4 hebdomadaires. Examiner `restic forget --tag preuvix-private --group-by host,tags --keep-daily 7 --keep-weekly 4 --dry-run` avant d'appliquer la rétention. Le regroupement ignore les chemins datés pour que la rétention s'applique réellement entre les sauvegardes. Aucune purge automatique n'est activée dans cette préparation. Nettoyer les anciens snapshots locaux seulement après validation de la copie externe et de sa restauration. Une sauvegarde quotidienne implique jusqu'à 24 heures de données potentiellement perdues ; le délai réel de reprise doit être mesuré sur le serveur.

## 3. Restaurer et vérifier avant remise en service

Restaurer d'abord dans un répertoire isolé, jamais directement sur la base active :

```sh
restic restore SNAPSHOT_ID --target /srv/preuvix-recovery --verify
```

Repérer le répertoire contenant `backup-manifest.json` (les chemins archivés sont conservés), puis avec Node 24 :

```sh
node scripts/backup.mjs verify /chemin/du/snapshot
node scripts/backup.mjs restore /chemin/du/snapshot /chemin/nouveau-data
```

Le parent du nouveau répertoire doit exister. Le script refuse toute destination existante, toute destination à l'intérieur de la source, toute copie altérée ou incomplète et une clé incompatible. Les sessions et captures en cours sont révoquées dans la copie restaurée : il faut se reconnecter. Les originaux, manifestes et signatures sont conservés.

Avec la version de code correspondant à la sauvegarde, démarrer une instance de contrôle isolée sur les données restaurées, sans exposition publique ni prestataires externes actifs. Se connecter, ouvrir les dossiers, comparer les empreintes et vérifier les PDF/ZIP et anciennes signatures. Réappliquer les suppressions et révocations intervenues après la sauvegarde : des liens précédemment révoqués peuvent revenir dans une ancienne base. Tenir ce suivi hors de la sauvegarde restaurée.

Pour la remise en service : arrêter Express, conserver l'ancien répertoire de données comme retour arrière, positionner le répertoire restauré à `private-runtime/data`, rétablir propriétaire UID/GID 1000 et droits restreints, restaurer la configuration et les certificats de confiance appropriés, puis redémarrer. Ne pas supprimer l'ancien état avant validation. Aucune de ces opérations sur les données réelles n'est exécutée automatiquement par les scripts fournis.

Tester la récupération chaque mois, après toute migration de schéma et après une rotation de clé. Un `restic check` seul ne prouve pas que l'application redémarre.

## 4. Validation dans le projet

Le test `tests/backup.test.ts` crée une vraie preuve synthétique via l'API, sauvegarde puis restaure dans `.tools/backup-tests/`. Il vérifie les octets de l'original, la signature Ed25519, la clé conservée, la révocation des sessions, une nouvelle connexion, la lecture du dossier et les exports PDF/ZIP. Il vérifie aussi le refus d'une sauvegarde altérée, d'un écrasement et d'une destination imbriquée.

Exécution : `node --import tsx --test tests/backup.test.ts`. Les données de cet exercice sont synthétiques ; ce test ne prouve ni un upload Restic distant, ni l'émission d'un certificat, ni l'état du futur serveur. Les résultats d'exécution sont à consigner dans le compte rendu de livraison.

Résultat du 14 octobre 2026 : test de restauration réussi (1 test, 0 échec), compilation TypeScript/Vite réussie. Le contrôle navigateur de l'accueil confirme des réponses HTTP 200 pour la page, l'API de configuration et l'annuaire, sans erreur JavaScript. Le comparatif est la dernière section de l'accueil et ne déborde pas à 390 px de largeur. Docker, l'émission HTTPS et la copie Restic externe n'ont pas été exécutés ici : validation restante sur le serveur cible.

## Comparatif après mise en ligne

| | Site web | Application Android |
| --- | --- | --- |
| Accès | URL HTTPS, sans installation | APK/AAB compilé pour le même backend HTTPS |
| Mise à jour | Nouvelle version sur le serveur | Backend mis à jour et, pour l'interface native, nouvelle version à installer |
| Capture | Photo/vidéo, GPS obligatoire | Photo/vidéo, GPS obligatoire et permissions Android |
| Travail | Dossiers, comparaison, liens privés, annuaire, demandes de signature | Capture terrain, brouillons après engagement en ligne, partage natif |
| Sauvegarde | Données reçues par le serveur incluses | Même protection serveur ; brouillons uniquement locaux exclus |
| Hors ligne | Connexion nécessaire | Pas de nouvelle capture certifiable entièrement hors ligne |
| Exports | PDF/ZIP depuis le navigateur | Partage natif limité à 32 Mo ; utiliser le site au-delà |
| Travail restant | Validation HTTPS et exercice de restauration sur l'hôte | Même backend, puis compilation release, signature et validation physique |

## Sources techniques

- [Caddy : HTTPS automatique](https://caddyserver.com/docs/automatic-https)
- [Caddy : reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
- [Node : API SQLite backup](https://nodejs.org/api/sqlite.html)
- [Restic : restauration](https://restic.readthedocs.io/en/stable/050_restore.html)
- [Restic : vérification du dépôt](https://restic.readthedocs.io/en/stable/045_working_with_repos.html)
