# PREUVIX sur Android par USB — mode d'emploi

Ce parcours utilise ce PC Windows et un téléphone Android relié par câble. Aucun serveur à louer, domaine, compte Google Play ni ouverture de port du pare-feu n'est nécessaire. Le PC héberge les dossiers de test et doit rester allumé.

## 1. Ce qui est préparé

| Élément | Emplacement |
| --- | --- |
| Lancer / installer | `C:\Documents\preuvix\Tester-Preuvix-USB.cmd` |
| Arrêter le serveur | `C:\Documents\preuvix\Arreter-Preuvix-USB.cmd` |
| APK debug | `android/app/build/outputs/apk/debug/app-debug.apk` |
| Site de test sur le PC | `http://localhost:3016` |
| Adresse intégrée dans l'APK | `http://127.0.0.1:3016`, reliée au PC par ADB |
| Données isolées | `.tools/usb-test/data/` |
| Mot de passe dédié | `.tools/usb-test/password.txt` |
| Journaux | `.tools/usb-test/server.log` et `server-error.log` |

Node 24, JDK 21, SDK Android et ADB sont déjà présents dans `.tools/` sur ce poste. La version USB est une version de développement signée, pas une publication Google Play. Le HTTP local est autorisé uniquement dans cette variante ; la version de production conserve ses protections.

Le site habituel sur le port 3000, ses données et son mot de passe ne sont pas utilisés. Ne pas utiliser les anciens scripts `.tools/install-phone-test.ps1` ou `.tools/start-phone-test-server.mjs` : ils visaient le port 3015. Le nouveau lanceur gère le port **3016**.

## 2. Préparer le téléphone

Prévoir un téléphone **Android 7.0 minimum (API 24)**, un câble USB capable de transférer des données et de l'espace libre. Un iPhone ne peut pas installer cet APK. Un téléphone professionnel peut interdire le débogage ou l'installation.

1. Déverrouiller le téléphone.
2. Ouvrir **Paramètres → À propos du téléphone**, puis éventuellement **Informations sur le logiciel**.
3. Toucher sept fois **Numéro de build / Numéro de version**. Saisir le code du téléphone si demandé.
4. Ouvrir **Options pour les développeurs**, puis activer **Débogage USB**.
5. Brancher le câble directement au PC. Si nécessaire, sélectionner **Transfert de fichiers** dans la notification USB.
6. Accepter **Autoriser le débogage USB** pour ce PC sur l'écran du téléphone. Le garder déverrouillé pendant l'installation.

Les intitulés varient selon la marque. Le root et le déverrouillage du bootloader ne sont pas nécessaires. Les étapes officielles et les informations sur les pilotes Windows sont dans [la documentation Android](https://developer.android.com/studio/run/device).

## 3. Lancer l'application

Dans l'Explorateur Windows, ouvrir `C:\Documents\preuvix` et double-cliquer sur **Tester-Preuvix-USB.cmd**.

Le lanceur contrôle l'APK et les sources, recompile si nécessaire, vérifie la signature, démarre le serveur local, teste la connexion Android, détecte le téléphone, crée le tunnel USB, installe l'APK et ouvre PREUVIX. Il utilise une mise à jour `adb install -r` : aucune désinstallation ni suppression de données n'est effectuée.

Attendre **PREUVIX installe et ouvert**. Une recompilation peut prendre plusieurs minutes. La première compilation peut nécessiter Internet pour récupérer des dépendances ; celles de la version préparée sont déjà installées sur ce PC.

Le fichier `.cmd` lance PowerShell avec une autorisation limitée à ce processus, sans modifier la stratégie globale de Windows. Si une politique d'entreprise bloque le lancement, demander à l'administrateur ; ne pas désactiver globalement les protections du PC.

Alternative PowerShell :

```powershell
cd C:\Documents\preuvix
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Test-Android-USB.ps1
```

Options : `-PrepareOnly` prépare sans installer, `-Build` force la compilation, `-Serial NUMERO_ADB` sélectionne un téléphone lorsque plusieurs appareils sont connectés. Pour un premier essai, n'en brancher qu'un.

## 4. Se connecter

Sur le PC, ouvrir `.tools\usb-test\password.txt` dans le Bloc-notes. Depuis PowerShell :

```powershell
notepad .tools\usb-test\password.txt
```

Sur le téléphone, saisir ce mot de passe dans **Mot de passe de l'espace**, puis choisir **Ouvrir mon espace**. Ne pas ajouter d'espace. Ce mot de passe est propre au test USB ; il peut être différent de celui du site habituel. Ne pas me l'envoyer et ne pas publier le fichier.

Sur le PC, le même espace est accessible à **http://localhost:3016**. Le lanceur conserve le mot de passe et les données à chaque démarrage. Fermer puis rouvrir entièrement l'application nécessite une nouvelle connexion, car la session Android reste uniquement en mémoire.

## 5. Premier parcours : dossier → photo → dépôt → PDF

Commencer avec une image sans données sensibles, par exemple une feuille « Test USB ».

1. Choisir **Créer un dossier** et donner un titre reconnaissable : **Test USB — date du jour**.
2. Choisir **Enregistrer le brouillon**, puis **Envoyer ce brouillon**. Le dossier serveur doit s'ouvrir.
3. Choisir **Prendre une photo ou une vidéo**.
4. Autoriser d'abord la **localisation** pendant l'utilisation de l'application. Activer la localisation du téléphone et choisir une position précise pour le premier essai.
5. Autoriser ensuite la **caméra**. Le microphone ne sert que si l'option son est activée.
6. Attendre l'image et l'activation de **Prendre la photo**. Si le GPS ne répond pas, se rapprocher d'une fenêtre ou sortir, vérifier les permissions et choisir **Recommencer la session**.
7. Prendre la photo, puis attendre la préparation et l'engagement de l'empreinte auprès du serveur.
8. Dans les brouillons, choisir **Envoyer ce brouillon**. La pièce doit apparaître une seule fois dans le dossier, avec sa localisation.
9. Choisir **Enregistrer / partager le PDF** et sélectionner une application Android capable de l'enregistrer ou de le lire. Ouvrir le PDF pour vérifier son contenu.
10. Sur le PC, ouvrir `http://localhost:3016`, se connecter avec le même mot de passe et retrouver le dossier dans **Dossiers multi-fichiers**.

La capture exige une connexion au serveur et la localisation. Aucun import de galerie/PDF n'est prévu ; les PDF sont disponibles à l'export. Un horodatage « en attente » est normal sans prestataire configuré : ce statut n'est pas un échec de la photo ni une validation externe.

## 6. Tests complémentaires

| Essai | Action | Résultat attendu |
| --- | --- | --- |
| Vidéo | Filmer 5–10 secondes puis terminer | Positions de début/fin, dépôt et pièce lisible |
| GPS refusé | Refuser la localisation | Message clair, capture bloquée, reprise possible |
| Caméra refusée | Refuser la caméra | Message ; corriger les permissions Android puis recommencer |
| USB seul | Après le premier essai, couper Wi-Fi et données mobiles, garder USB | Serveur accessible par câble ; l'indication réseau ne désactive plus les boutons |
| Câble retiré | Débrancher avant un envoi, rebrancher puis relancer le lanceur | Erreur, brouillon conservé, reprise possible en restant connecté dans l'application |
| Rotation / Retour | Tourner le téléphone, utiliser Retour | Interface utilisable ; noter toute perte inattendue |
| Redémarrage app | Fermer entièrement puis rouvrir | Nouvelle connexion, dossiers serveur retrouvés |
| Export | PDF/ZIP d'un petit dossier | Fichier ouvert par l'application choisie ; limite mobile de 32 Mo |

Le GPS peut être plus lent sans réseau : commencer avec Wi-Fi/données activés. L'USB ne remplace pas le GPS. Les services externes, dont Bitcoin, nécessitent leur accès Internet et ne font pas partie du premier essai.

Envoyer les captures encore locales **dans les 24 heures et avant de se déconnecter**. Après une nouvelle connexion, une nouvelle capture peut être nécessaire si le serveur n'avait pas reçu le fichier. Si le serveur l'avait reçu mais que sa réponse était perdue, la reprise permet de récupérer le dépôt sans doublon.

Ne pas désinstaller l'application ni effacer ses données pour résoudre un problème avant d'avoir récupéré les éléments utiles : cela supprime les brouillons locaux.

## 7. Séances suivantes et arrêt

Brancher et déverrouiller le téléphone, puis relancer **Tester-Preuvix-USB.cmd**. Le tunnel USB est recréé, notamment après débranchement ou redémarrage. Garder le PC éveillé et le câble connecté pendant les opérations ; aucun réglage permanent de veille n'est modifié.

Fermer la fenêtre du lanceur ne coupe pas le serveur en arrière-plan. Pour l'arrêter, double-cliquer sur **Arreter-Preuvix-USB.cmd**. Les données sont conservées ; l'application retrouve son serveur au prochain lancement.

## 8. Dépannage

| Symptôme | Action |
| --- | --- |
| Aucun téléphone autorisé | Déverrouiller, câble de données, port direct, débogage activé ; vérifier le pilote constructeur Windows |
| `unauthorized` | Accepter la demande sur le téléphone ; si absente, révoquer les autorisations de débogage puis rebrancher |
| `offline` dans ADB | Rebrancher et relancer ; éventuellement redémarrer le téléphone |
| Plusieurs appareils | Débrancher les autres ou utiliser `-Serial` |
| Installation refusée | Vérifier l'écran du téléphone et accepter l'installation si demandé |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | Une autre signature existe : ne pas désinstaller immédiatement, préserver les données et me donner le message |
| `INSTALL_FAILED_VERSION_DOWNGRADE` | Ne pas forcer une rétrogradation : me donner le message |
| Stockage insuffisant | Libérer de l'espace sans supprimer les brouillons PREUVIX |
| Serveur inaccessible | Relancer le lanceur ; contrôler câble, PC éveillé et `http://localhost:3016` sur le PC |
| Mot de passe refusé | Utiliser `.tools/usb-test/password.txt`, sans espace |
| GPS indisponible | Activer localisation/permissions, attendre près d'une fenêtre ou dehors puis recommencer |
| Caméra noire | Vérifier permission et fermer les autres applications utilisant la caméra |
| Port 3016 occupé | Lire `.tools/usb-test/server-error.log` ; ne pas arrêter un processus inconnu |
| Outils absents sur un autre PC | Installer Node 24, JDK 21 et SDK Android ; ce lanceur utilise les outils préparés sur ce poste |

Diagnostic sans modification du téléphone :

```powershell
cd C:\Documents\preuvix
.\.tools\android-toolchain\sdk\platform-tools\adb.exe devices -l
.\.tools\node-v24.21.0-win-x64\node.exe scripts/usb-test.mjs check
```

Le lanceur ne désactive pas Play Protect, ne roote pas le téléphone, ne modifie pas le pare-feu et ne désinstalle pas une application en conflit.

## 9. Sauvegarder les essais

Les pièces envoyées sont dans `.tools/usb-test/data`, avec leur clé. Les brouillons non envoyés restent uniquement sur le téléphone. Après arrêt du serveur USB :

```powershell
cd C:\Documents\preuvix
$usbSnapshot = '.tools/usb-test/snapshot-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
.\.tools\node-v24.21.0-win-x64\node.exe scripts/backup.mjs create .tools/usb-test/data $usbSnapshot
.\.tools\node-v24.21.0-win-x64\node.exe scripts/backup.mjs verify $usbSnapshot
```

Cette copie locale ne protège pas contre la perte du PC. Consulter [le guide de sauvegarde externe et restauration](private-https-deployment.md). Les secrets et données dans `.tools/` sont exclus de Git.

## 10. Ce que j'attends de toi

- Brancher un téléphone **Android**, le déverrouiller et accepter le débogage USB.
- Donner la **marque, le modèle et la version Android**.
- Accepter les demandes d'installation, localisation et caméra sur son écran.
- Faire une photo et un export PDF selon les étapes ci-dessus.
- En cas d'échec, indiquer **l'étape exacte et le message**, sans mot de passe ni image sensible.

Je peux ensuite vérifier l'installation avec ADB et corriger les problèmes constatés. Tant qu'aucun téléphone autorisé n'apparaît dans ADB, l'installation et les permissions physiques ne peuvent pas être validées.

## 11. Chances de réussite

Estimation de travail : **environ 80 %** de chances de réussir le premier parcours USB (connexion, photo, dépôt, PDF) sans correction supplémentaire, avec un appareil compatible, un câble de données, les pilotes et les permissions nécessaires. C'est une appréciation technique subjective, pas une statistique mesurée ni une garantie que toutes les fonctions marcheront sur chaque modèle.

Les incertitudes restantes concernent surtout le câble/pilote, les restrictions constructeur, les permissions et la caméra/GPS réels. Les résultats obtenus sont consignés dans [le compte rendu USB](validation-android-usb.md). Un test navigateur ne remplace pas un essai physique.

Sources : [appareil Android physique](https://developer.android.com/studio/run/device), [ADB](https://developer.android.com/tools/adb), [pilotes Windows](https://developer.android.com/studio/run/oem-usb).
