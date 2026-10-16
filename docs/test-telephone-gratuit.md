# Tester PREUVIX gratuitement, sans USB

Ce mode utilise un tunnel HTTPS Cloudflare gratuit, sans compte, carte bancaire ou domaine. Le PC reste le serveur : il doit rester allumé, connecté à Internet et éveillé. Le téléphone peut utiliser le Wi-Fi ou la 4G/5G.

## Ouvrir le site

1. Double-cliquer sur `Tester-Preuvix-Gratuit.cmd` et garder sa fenêtre ouverte.
2. Attendre `PREUVIX HTTPS`, puis ouvrir `.tools/free-phone/ouvrir-sur-telephone.html` sur le PC.
3. Scanner le QR code avec le téléphone. Ouvrir le lien dans Chrome.
4. Lire le mot de passe dans `.tools/free-phone/password.txt` sur le PC et le saisir sur le téléphone. Ce mot de passe est distinct de celui des tests USB.
5. Choisir **Capturer**, autoriser la localisation puis la caméra, prendre une photo et conserver la preuve.

Les données de cet espace sont séparées des données habituelles, dans `.tools/free-phone/data`. La page de connexion est publique ; les dossiers nécessitent le mot de passe. Le trafic transite par Cloudflare. Aucun secret n'est placé dans le QR code.

## Installer l'application Android

Le lien du tunnel doit être actif avant la compilation de l'APK. Double-cliquer sur `Preparer-Android-Gratuit.cmd`, ou depuis PowerShell, dans le dossier du projet :

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Preparer-Android-Gratuit.ps1
```

Une fois la compilation terminée :

1. Ouvrir Chrome sur le téléphone. Aucune connexion au site n'est nécessaire pour télécharger l'APK.
2. Ouvrir le lien **télécharger directement l'application Android** de la page locale, ou ajouter `/api/test-android.apk` à l'adresse HTTPS du site.
3. Télécharger l'APK et autoriser son installation par le navigateur si Android le demande.
4. Ouvrir PREUVIX et utiliser le même mot de passe de test.
5. Créer un dossier, prendre une photo, envoyer le brouillon et ouvrir le PDF.

Cette APK de test est signée avec la clé de développement locale, sans publication Google Play. Si Android signale une signature incompatible, ne pas désinstaller une application contenant des brouillons : relever le message.

Le téléchargement de l'installateur est public. Il ne contient ni mot de passe ni dossiers : la connexion reste obligatoire dans l'application pour accéder à l'espace privé.

## Fin et prochaine séance

`Arreter-Preuvix-Gratuit.cmd` arrête le tunnel et le serveur identifiés. Les données envoyées restent sur le PC. Un arrêt du PC rend le lien inaccessible.

À chaque nouveau tunnel, l'adresse change : relancer le lanceur, utiliser le nouveau QR code, puis reconstruire et réinstaller l'APK pour cette adresse. Les anciens liens de partage et QR codes des PDF peuvent nécessiter une nouvelle génération. Les brouillons web sont liés à l'ancienne adresse : les déposer avant l'arrêt. Les brouillons Android non envoyés peuvent nécessiter une nouvelle capture après reconnexion.

Un tunnel ne constitue pas une sauvegarde ni un hébergement permanent. Les sauvegardes peuvent être préparées avec `scripts/backup.mjs` en ciblant explicitement `.tools/free-phone/data`. Ne pas effacer les données du navigateur ou désinstaller l'APK avant de déposer les brouillons utiles.

## Limites et dépannage

- Le tunnel gratuit ne garantit pas de disponibilité ; ses limites sont décrites dans la documentation Cloudflare.
- Une caméra ou un GPS refusé se réautorise dans les réglages du navigateur ou de l'application.
- Si le port 3017 est occupé, arrêter l'ancienne séance avec le lanceur d'arrêt ; ne pas arrêter un programme inconnu.
- En cas d'échec, lire les journaux `.tools/free-phone/server-error.log` et `tunnel.log`.
- Le binaire Cloudflare sur ce poste a été téléchargé depuis sa distribution officielle et son SHA-256 vérifié. Un autre PC nécessite aussi Node, les dépendances du projet et Cloudflared.

Source : https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/
