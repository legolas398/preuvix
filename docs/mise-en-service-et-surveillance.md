# Mise en service et surveillance

## État réel

La configuration HTTPS et les scripts sont préparés. Aucun serveur distant, domaine ou dépôt de sauvegarde externe n’a été fourni pendant cette intervention. Docker et Restic ne sont pas installés sur le poste de développement. **Le déploiement, la sauvegarde externe et la livraison d’alertes ne sont donc pas déclarés opérationnels.**

Les tests locaux peuvent valider la restauration et les décisions du moniteur avec des données synthétiques. Ils ne prouvent ni la résolution DNS, ni l’émission d’un certificat TLS, ni la disponibilité du fournisseur de stockage.

## Informations nécessaires

- Serveur Linux et moyen d’accès déjà configuré.
- Domaine et accès à sa configuration DNS.
- Dépôt Restic extérieur au serveur et identifiants installés sur ce serveur.
- Destination HTTPS d’alerte acceptant un JSON `{"text":"..."}`. Installer le secret directement dans `.env.monitor`, sans le copier dans la conversation ni dans Git.

Suivre d’abord [le guide HTTPS privé](private-https-deployment.md) pour l’installation, le DNS, les fichiers d’environnement et les volumes. Le service reste mono-propriétaire ; cette étape ne crée pas de comptes clients séparés.

## Surveillance fournie

`GET /api/health` vérifie la disponibilité de la connexion SQLite sans exposer les preuves. Le contrôle Docker utilise cette route.

Le service de surveillance vérifie :

- l’accès HTTPS public, le certificat via la validation TLS de Node et la réponse de santé attendue ;
- une sauvegarde externe réussie depuis moins de 36 heures ;
- une restauration isolée vérifiée depuis moins de 35 jours ;
- au moins 1 Gio et 10 % d’espace disque libre.

Il envoie uniquement des codes d’incident, jamais de preuve, coordonnées ou mot de passe. Les incidents identiques sont rappelés au maximum toutes les six heures et le rétablissement est signalé. Sans destination d’alerte, il retourne un échec de configuration. Un moniteur exécuté sur le serveur ne peut pas prévenir si le serveur entier est éteint : ajouter une sonde externe vers `/api/health` auprès du service de supervision choisi.

## Activer sur le serveur

Depuis `/opt/preuvix`, après configuration du domaine :

```sh
mkdir -p private-runtime/status
chmod 700 private-runtime/status
cp deploy/monitor.env.example .env.monitor
chmod 600 .env.monitor
# Renseigner MONITOR_WEBHOOK_URL directement sur le serveur.
docker compose --env-file .env.production -f deploy/compose.private.yaml up -d --build
sh deploy/backup-private.sh
```

Le script de sauvegarde met à jour `private-runtime/status/backup-success.json` uniquement après succès de l’envoi Restic et de `restic check`. Ne pas fabriquer manuellement ces marqueurs : ils sont utilisés comme résultats d’exécution.

## Exercice de restauration depuis le stockage externe

Choisir l’identifiant exact d’une sauvegarde Restic PREUVIX, puis :

```sh
sh deploy/restore-drill.sh IDENTIFIANT_HEXADECIMAL_RESTIC
```

Le script télécharge la sauvegarde dans un nouveau répertoire, vérifie le manifeste et la clé, restaure une base séparée, recalcule les empreintes de toutes les preuves et vérifie leurs signatures techniques. Les sessions restaurées sont invalidées. Le conteneur de vérification n’a ni réseau ni montage des données de production.

Après succès uniquement, il écrit `restore-success.json`. Les fichiers déchiffrés de l’exercice sont conservés sous `private-runtime/restore-drills` avec accès restreint. Prévoir leur nettoyage manuel après revue, sans supprimer l’unique sauvegarde externe ni sa clé. Le test automatisé `tests/backup.test.ts` couvre aussi les réponses de l’API et les exports depuis une installation restaurée synthétique.

Installer les unités :

```sh
cp deploy/preuvix-monitor.service deploy/preuvix-monitor.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now preuvix-monitor.timer
systemctl start preuvix-monitor.service
journalctl -u preuvix-monitor.service -n 20 --no-pager
```

Le chemin `/opt/preuvix` doit correspondre à l’installation. Les unités de sauvegarde existantes se configurent selon le guide HTTPS. Refaire l’exercice de restauration chaque mois et après changement important de stockage ou de clés.

## Critères de validation avant ouverture du pilote

Le domaine présente un certificat valide ; les routes privées refusent l’accès sans connexion ; une vraie capture se dépose depuis un téléphone ; son PDF et son original se téléchargent ; la sauvegarde externe est lisible ; la restauration isolée réussit ; une alerte de test et son rétablissement arrivent à la destination choisie. Les étapes dépendant du serveur et du téléphone restent à exécuter avec ces ressources.
