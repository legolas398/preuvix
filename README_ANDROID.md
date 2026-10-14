# Preuvix Android — première version

**Essai USB sur ce PC :** utiliser [le mode d'emploi détaillé](docs/test-android-usb.md), puis double-cliquer sur `Tester-Preuvix-USB.cmd`. Le lanceur utilise un serveur isolé sur le port **3016**, vérifie l'APK, crée le tunnel USB, installe et ouvre l'application. Le [compte rendu USB](docs/validation-android-usb.md) distingue les contrôles exécutés de la validation physique restante.

Application Capacitor avec ressources React embarquées, et **backend Preuvix séparé**. Aucun serveur Node, SQLite, secret TSA ou fichier `.env` serveur n’est embarqué. Le site web conserve son entrée `src/main.tsx`, sa compilation `dist/` et ses cookies habituels. Android utilise `src/mobile/main.tsx` et `dist-android/`.

## Audit du dépôt

Aucun fichier `AGENTS.md` trouvé dans le dépôt ni dans ses répertoires parents consultés.

| Élément            | État constaté avant cette intégration                                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend           | React 19, TypeScript, Vite 7 ; rendu dans le navigateur, sans SSR obligatoire. CSS et identité Preuvix, Lucide, composants de traçabilité réutilisables.                                                                              |
| Serveur            | Express 5, Node 24, API `/api/*`. En développement, Vite est intégré à Express ; en production, Express sert `dist/`.                                                                                                                 |
| Données            | SQLite via `node:sqlite`, fichier `DATA_DIR/preuvix.sqlite` ; originaux et justificatifs en BLOB. Clés de signature dans le répertoire serveur.                                                                                       |
| Authentification   | Une installation = un espace propriétaire. Mot de passe unique, sessions hachées en SQLite, expiration 12 h. Pas d’inscription, de comptes multiples ni d’OAuth/PKCE existants.                                                       |
| Fonctions réelles  | Connexion, preuves, dossiers versionnés, manifestes signés Ed25519, contrôle d’intégrité, exports PDF/ZIP, liens privés révocables, capture web avec défi, services TSA/signature configurables, OpenTimestamps Bitcoin.              |
| Limites constatées | L’API web refuse les nouveaux imports et exige une capture avec localisation. Pas de dépôt de PDF comme pièce, de plugins téléphone ni de stockage de brouillons persistants.                                                         |
| Services externes  | RFC 3161 qualifié soumis à configuration et revue opérateur ; signature externe optionnelle. OpenTimestamps gratuit par défaut, dépendant des calendriers et explorateurs publics. Une demande en attente n’est pas une confirmation. |
| Démonstrations     | `ProofDemo`/`MapDemo` sont des démonstrations ; exemples partenaires et modes Premium de test ne constituent pas des prestations disponibles. Ces écrans ne sont pas inclus dans l’application Android.                               |
| Réseau             | Les appels web relatifs et les cookies `SameSite=Strict` supposent la même origine. `localhost` depuis Android désigne Android, pas le PC.                                                                                            |

Capacitor convient : il embarque le frontend compilé, tandis que les opérations de preuve restent sur Express. Il n’y a ni export statique du backend ni migration vers React Native/Kotlin. La vue mobile réutilise React, les styles, polices, types, calcul SHA-256 et composants de traçabilité ; sa navigation est dédiée au téléphone.

## Fonctions de cette version

- Connexion au même espace propriétaire. Liste, création et lecture des dossiers et de leurs versions.
- Capture de photos et vidéos en direct uniquement, dans la caméra intégrée à l’application (WebView). Photos JPEG : 10 Mo maximum. Vidéos MP4/WebM selon le moteur de l’appareil : 60 secondes et 50 Mo maximum. Aucun sélecteur de galerie ni import photo, vidéo ou PDF. Le serveur refuse aussi les imports directs via API.
- Même protocole que le site : session serveur liée à la connexion, SHA-256 engagé avant le dépôt, puis contrôle du fichier reçu et signature du manifeste. Aucun code ni geste à reproduire. Le statut ordinaire est `capture_documented`, sans authentification matérielle du capteur. Les pixels de la caméra sont encodés en JPEG par la vue intégrée.
- Géolocalisation obligatoire à chaque photo et au début et à la fin de chaque vidéo, avec permission système, relevé frais et contrôle serveur. Un refus, une indisponibilité ou une mesure trop ancienne bloque la capture. Aucun suivi en arrière-plan. Les coordonnées de l’appareil ne prouvent pas le lieu réel de la scène.
- Brouillons IndexedDB contenant les octets et métadonnées après engagement en ligne. Le fichier doit être déposé dans les 24 heures, avant changement de connexion. Une réponse perdue après dépôt peut être récupérée avec le même identifiant, même après reconnexion. Un brouillon non encore reçu par le serveur exige une nouvelle capture après reconnexion. Les anciens brouillons importés ne sont plus envoyables. Les dossiers déjà déposés restent lisibles.
- États distincts : local, envoi en cours, reçu par le serveur, ajout au dossier terminé, horodatage validé seulement si un reçu réel existe. Une réponse perdue peut laisser temporairement l’état « local » alors que le serveur a reçu le fichier ; la reprise réconcilie cet état sans nouveau dépôt.
- Exports PDF/ZIP existants via Filesystem + feuille de partage Android ; choisir une application destinataire ou une application permettant d’enregistrer le fichier. Les fichiers temporaires restent dans le cache privé pour que le destinataire puisse les lire. Android peut ensuite purger ce cache.
- Traçabilité : empreintes, versions, clé publique, événements et états réels des prestataires. Android permet de demander un horodatage ou un ancrage (avec consentement), de reprendre une demande, de vérifier Bitcoin et de partager la preuve `.ots`. La signature électronique auprès d’un prestataire se demande encore sur le site web.
- Certification : Android et le site partagent la présentation des justificatifs, reçus RFC 3161, détails Bitcoin, erreurs et dates de mise à jour. Les justificatifs concernent uniquement la version affichée ; les versions historiques sont signalées.

La caméra intégrée, les permissions GPS et le partage nécessitent une validation sur appareil. Un navigateur de test ne prouve pas que les activités natives fonctionnent sur tous les constructeurs.

## Prérequis

- Node **24 LTS** et npm (le backend utilise `node:sqlite`).
- Android Studio **Otter 2025.2.1 ou ultérieur**, SDK Android **36**, Platform Tools et émulateur ou téléphone avec débogage USB.
- **JDK 21**, `JAVA_HOME` vers son installation ; le projet compile en Java 21.
- Gradle Wrapper **8.14.3**, Android Gradle Plugin **8.13.0**, installés/résolus par le projet. Android minimum API **24**.
- Capacitor Core/Android/CLI **8.5.3** ; versions exactes des plugins consignées dans `package-lock.json`. Installer avec `npm ci` pour les reproduire.

Dans PowerShell, si Node n’est pas installé globalement et que le Node portable du dépôt est présent :

```powershell
$env:PATH = (Join-Path $PWD '.tools\node-v24.21.0-win-x64') + ';' + $env:PATH
node --version
npm.cmd ci
```

Sous un environnement avec Node dans le PATH, `npm ci` suffit. Android Studio peut créer `android/local.properties` avec le chemin du SDK ; ce fichier reste ignoré. Configurer le JDK Gradle sur **21** dans Android Studio, et `JAVA_HOME` pour le terminal.

## Backend de développement

Conserver la configuration `.env` serveur existante et son mot de passe. Pour une nouvelle installation seulement : `npm run setup`. Configurer côté serveur :

```dotenv
MOBILE_ENABLED=true
HOST=0.0.0.0
PORT=3000
# Conserver APP_ORIGIN correspondant au site web.
# Ne pas copier OWNER_PASSWORD ni aucun autre secret dans VITE_*.
```

Lancer le backend dans un terminal :

```powershell
npm.cmd run dev
```

La base et les originaux restent sur cette machine. Aucune donnée de démonstration n’est créée dans l’espace propriétaire par la configuration Android.

### Émulateur Android Studio

Dans un second terminal à la racine :

```powershell
Copy-Item .env.android.example .env.android-development.local
# VITE_BACKEND_URL=http://10.0.2.2:3000
npm.cmd run android:build:dev
npm.cmd run android:sync
npm.cmd run android:open
```

Le projet `android/` est déjà créé. Ne pas refaire `cap add android`. Dans Android Studio, sélectionner un émulateur, puis Run. Alternative avec un émulateur déjà démarré : `npm.cmd run android:run`.

### Téléphone physique

Mettre dans `.env.android-development.local` :

```dotenv
VITE_BACKEND_URL=http://ADRESSE_IP_LAN_DU_PC:3000
```

Remplacer le texte par l’adresse IPv4 effective du PC. PC et téléphone doivent être sur le même réseau ; autoriser explicitement le port du serveur dans le pare-feu local si nécessaire. Refaire `android:build:dev`, `android:sync`, puis installer l’APK de debug. Un backend HTTPS de développement est préférable hors réseau de confiance.

Alternative USB : `adb reverse tcp:3000 tcp:3000`, avec `VITE_BACKEND_URL=http://127.0.0.1:3000` **uniquement pour le debug**.

## Compilation APK debug

```powershell
npm.cmd run android:build:dev
npm.cmd run android:sync
Push-Location android
.\gradlew.bat assembleDebug
Pop-Location
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Sous Linux/macOS : `cd android && ./gradlew assembleDebug`. Artefact attendu après réussite : `android/app/build/outputs/apk/debug/app-debug.apk`. Une clé de debug est gérée par les outils Android ; ce n’est pas une clé de publication.

HTTP et le contenu mixte sont autorisés seulement pour le parcours debug. Le manifeste principal refuse HTTP ; le manifeste `src/debug` fournit l’exception. L’origine embarquée `https://localhost` est l’origine **interne des ressources Capacitor**, jamais l’adresse du backend de production.

## Production et AAB

1. Déployer cette version du backend avec un domaine HTTPS réel et un certificat valide. Activer `MOBILE_ENABLED=true`, conserver `COOKIE_SECURE=true` pour le site et ses contrôles de lancement. Les secrets TSA, Stripe et signature restent côté serveur. Sans prestataire TSA qualifié, le lancement exige l’option explicite existante `REQUIRE_TIMESTAMP=false` ; l’application affiche alors l’indisponibilité, pas un certificat inventé.
2. Créer `.env.android.local` avec **uniquement** `VITE_BACKEND_URL=https://votre-domaine-public-reel`. Aucun nom fictif n’est fourni comme configuration opérationnelle. Ne pas y mettre de secret.
3. Exécuter :

```powershell
npm.cmd run android:build
npm.cmd run android:sync
Push-Location android
.\gradlew.bat bundleRelease
Pop-Location
```

Le build échoue si l’adresse de production manque, utilise HTTP, une IP ou un domaine local. Gradle refuse aussi un bundle frontend de développement, une URL distante de WebView ou le contenu mixte en release. `dist/` du site web n’est pas modifié par le build Android.

Le projet ne contient **aucune configuration ni clé de signature de publication**. La commande Gradle prépare un AAB non signé ; utiliser ensuite Android Studio → **Build → Generate Signed Bundle / APK → Android App Bundle**, sélectionner la clé de publication dont vous êtes propriétaire et la variante release. Si aucune clé n’existe, sa création et sa conservation relèvent de l’exploitant. Ne jamais la committer. Le chemin de sortie Gradle attendu est `android/app/build/outputs/bundle/release/` ; Android Studio affiche son chemin de destination. Incrémenter `versionCode` pour les versions suivantes. Aucune publication Google Play n’est effectuée.

## Authentification et intégrité

`POST /api/mobile/login` utilise la même vérification de mot de passe et la même table de sessions expirantes que le site. Les sessions mobiles sont marquées séparément, envoyées comme Bearer et conservées **uniquement en mémoire JS** ; elles ne sont pas stockées dans les préférences, IndexedDB ou le bundle. Il faut se reconnecter après redémarrage. Une réponse 401 efface la session, sans supprimer les brouillons.

Le middleware n’accepte les sessions mobiles que si `MOBILE_ENABLED=true`. CORS autorise précisément `https://localhost`, sans cookies ni wildcard. Les contrôles CSRF et cookies HttpOnly/SameSite=Strict du site sont conservés. Une session Bearer expirée ne contourne pas ces contrôles. Il n’y a pas de flux OAuth existant à adapter. Ne pas interpréter cette installation mono-propriétaire comme une application multi-comptes : la séparation par organisation ou utilisateur nécessiterait un modèle de droits supplémentaire.

`POST /api/mobile/proofs` exige une session mobile valide, conserve les octets exacts, compare leur SHA-256 et inclut les métadonnées mobiles dans le manifeste signé. Les nouveaux dépôts web et Android exigent une capture en direct et sa position. Les imports de photos et de PDF sont refusés ; les PDF restent disponibles comme exports de dossier.

Les reprises utilisent le même `requestKey`. Si le fichier a été reçu mais son rattachement échoue, son identifiant est enregistré localement ; la reprise vérifie sa présence dans la dernière version avant de l’ajouter. En cas de modification concurrente, le serveur rejette le conflit de version et une nouvelle tentative explicite recharge la version courante. Les brouillons envoyés restent sur l’appareil jusqu’à suppression explicite. Effacer les données de l’application ou la désinstaller supprime les brouillons locaux ; ils ne constituent pas une sauvegarde serveur. Android Auto Backup est désactivé.

Permissions : Internet, caméra et position approximative/précise à la demande. Le microphone est facultatif, désactivé par défaut ; son activation demande la permission Android RECORD_AUDIO. La caméra intégrée utilise `getUserMedia` et la permission Android CAMERA, gérée par Capacitor. Aucun accès à la galerie ni suivi GPS en arrière-plan. Une connexion est obligatoire pour ouvrir la session et engager le SHA-256 ; aucune nouvelle capture certifiable entièrement hors ligne.

## Vérifications

```powershell
npm.cmd run build
node --import tsx --test tests/mobile.test.ts tests/app.test.ts tests/cases.test.ts tests/capture-controls.test.ts tests/certification-policy.test.ts
npm.cmd run android:build:dev
npm.cmd run test:android
npm.cmd run android:sync
```

`test:android` utilise Edge sur Windows (Chromium ailleurs), les ressources réellement compilées et un backend isolé sur le port 3013. Il simule l’origine Capacitor par interception réseau, **pas un appareil Android**. Sous Linux, installer préalablement Chromium via `npx playwright install chromium`. La base de test est `.tools/android-browser-data` ; ne pas y placer de données réelles.

Couverture automatisée : connexion, CORS, expiration/logout, création idempotente, capture réelle via caméra simulée, blocage GPS refusé/indisponible/périmé, refus photo/PDF importés et absence de session, cohérence du SHA-256 et des coordonnées, perte de réponse et reprise sans doublon, export PDF, affichage mobile et certification sans défi.

Validation physique encore requise avant diffusion :

| Parcours     | À vérifier sur Android                                                                                            |
| ------------ | ----------------------------------------------------------------------------------------------------------------- |
| Connexion    | Bon/mauvais mot de passe, expiration, fermeture/réouverture, déconnexion.                                         |
| Caméra       | Annulation, appareil absent, photo grande taille, rotation, recréation d’activité, absence d’édition silencieuse. |
| Vidéo        | MP4/WebM, arrêt manuel et à 60 s, audio optionnel, refus du GPS de fin, lecture de l’original exporté.            |
| Localisation | Refus, permission approximative, précision, GPS coupé, mesure fraîche et absence de suivi en arrière-plan.        |
| Réseau       | Mode avion avant et pendant l’envoi, réponse perdue, reprise après redémarrage, absence de doublon.               |
| Exports      | PDF/ZIP ouverts dans l’application destinataire, annulation du partage, gros dossiers et manque d’espace.         |
| Interface    | Clavier, bouton Retour, barres système, petit écran, orientation et lecteur d’écran.                              |

### Résultat dans l’environnement de travail

Validation du 14 octobre 2026 : compilation web, compilation des ressources Android, synchronisation Capacitor et compilation native Gradle réussies. APK debug produit : `android/app/build/outputs/apk/debug/app-debug.apk`, signature APK v2 vérifiée. Neuf tests API/certification ciblés passent, ainsi que le parcours navigateur Android (photo, vidéo, GPS obligatoire au début et à la fin, reprise après réponse perdue, certification et export PDF). Ce parcours navigateur ne remplace pas un essai physique.

Le backend local de test répond sur le port 3015 ; l'APK de test utilise `http://127.0.0.1:3015` avec `adb reverse tcp:3015 tcp:3015`. Aucun appareil autorisé n'est détecté par ADB : installation et validation sur téléphone restent à effectuer. Aucun déploiement public ni AAB release n'a été réalisé ; le domaine backend et la signature de publication restent à configurer.

Autres limites : pas de synchronisation automatique en arrière-plan ni de liste serveur accessible hors ligne après une nouvelle connexion ; les brouillons persistants restent locaux. Les exports mobiles sont plafonnés à **32 Mo** avant passage en mémoire/base64 vers le plugin natif ; au-delà, un message invite à utiliser le site web. Les gros ZIP demandent encore une optimisation vers un transfert natif en flux. Les services externes non configurés et leur validation réelle restent des dépendances du backend.

## Documentation officielle consultée

- [Capacitor 8 et configuration Android](https://capacitorjs.com/docs/updating/8-0)
- [Caméra, permissions et restauration d’activité](https://capacitorjs.com/docs/apis/camera)
- [Géolocalisation](https://capacitorjs.com/docs/apis/geolocation)
- [Filesystem](https://capacitorjs.com/docs/apis/filesystem) et [Share](https://capacitorjs.com/docs/apis/share)
- [Capawesome File Picker, compatibilité et conservation des fichiers](https://capawesome.io/docs/sdks/capacitor/file-picker/)
