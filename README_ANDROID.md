# Preuvix Android — première version

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
- Import via sélecteur système de photos JPEG/PNG/WebP et documents **PDF**, 10 Mo par pièce, 500 pages maximum pour un PDF. Les autres documents bureautiques ne sont pas pris en charge.
- Caméra Android avec le plugin officiel ; aucune réduction de dimensions ni édition demandée. Le JPEG peut être traité par la caméra/le plugin, ce qui est indiqué dans le brouillon, le manifeste et les rapports. Aucun statut de capture web avec défi n’est attribué.
- Géolocalisation ponctuelle facultative, après activation explicite ; source, précision et date de mesure conservées. Le refus ou l’indisponibilité est enregistré sans bloquer le fichier. La position se rapporte au téléphone lors de l’action, pas à l’origine historique d’un document importé.
- Brouillons IndexedDB contenant les octets et métadonnées, avant tout envoi. Après fermeture/reconnexion, reprise manuelle avec le même identifiant. Les brouillons sont séparés par adresse de backend.
- États distincts : local, envoi en cours, reçu par le serveur, ajout au dossier terminé, horodatage validé seulement si un reçu réel existe. Une réponse perdue peut laisser temporairement l’état « local » alors que le serveur a reçu le fichier ; la reprise réconcilie cet état sans nouveau dépôt.
- Exports PDF/ZIP existants via Filesystem + feuille de partage Android ; choisir une application destinataire ou une application permettant d’enregistrer le fichier. Les fichiers temporaires restent dans le cache privé pour que le destinataire puisse les lire. Android peut ensuite purger ce cache.
- Traçabilité : empreintes, versions, clé publique, événements et états réels des prestataires. Les nouvelles demandes TSA/signature/ancrage restent à effectuer depuis le site web dans cette première version ; leurs résultats sont consultables sur Android.

La caméra, le sélecteur et le partage nécessitent une validation sur appareil. Un navigateur de test ne prouve pas que les activités natives fonctionnent sur tous les constructeurs.

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

`POST /api/mobile/proofs` exige une session mobile valide, conserve les octets exacts, compare leur SHA-256 et inclut les métadonnées mobiles dans le manifeste signé. Le dépôt web strict existant reste inchangé. Les PDF sont lus structurellement, pas exécutés ni considérés comme signés/qualifiés. Les téléchargements d’originaux PDF sont des pièces jointes.

Les reprises utilisent le même `requestKey`. Si le fichier a été reçu mais son rattachement échoue, son identifiant est enregistré localement ; la reprise vérifie sa présence dans la dernière version avant de l’ajouter. En cas de modification concurrente, le serveur rejette le conflit de version et une nouvelle tentative explicite recharge la version courante. Les brouillons envoyés restent sur l’appareil jusqu’à suppression explicite. Effacer les données de l’application ou la désinstaller supprime les brouillons locaux ; ils ne constituent pas une sauvegarde serveur. Android Auto Backup est désactivé.

Permissions : Internet, position approximative/précise uniquement à la demande. Aucune localisation en arrière-plan, permission globale de stockage, microphone ou permission caméra permanente n’est demandée. La caméra utilise l’activité système, sans enregistrement dans la galerie. La récupération `appRestoredResult` conserve le contexte si Android recrée l’application pendant la caméra ; ce cas reste à tester physiquement.

## Vérifications

```powershell
npm.cmd run build
node --import tsx --test tests/mobile.test.ts tests/app.test.ts tests/cases.test.ts tests/capture-controls.test.ts tests/certification-policy.test.ts
npm.cmd run android:build:dev
npm.cmd run test:android
npm.cmd run android:sync
```

`test:android` utilise Edge sur Windows (Chromium ailleurs), les ressources réellement compilées et un backend isolé sur le port 3013. Il simule l’origine Capacitor par interception réseau, **pas un appareil Android**. Sous Linux, installer préalablement Chromium via `npx playwright install chromium`. La base de test est `.tools/android-browser-data` ; ne pas y placer de données réelles.

Couverture automatisée : connexion, CORS, refus d’origine étrangère, expiry/logout, création idempotente, import photo/PDF, conservation des octets, refus GPS, perte de réponse après réception serveur, récupération du brouillon après rechargement, reprise sans doublon, export PDF, absence de débordement horizontal à 390 px et maintien des restrictions d’import web.

Validation physique encore requise avant diffusion :

| Parcours     | À vérifier sur Android                                                                                            |
| ------------ | ----------------------------------------------------------------------------------------------------------------- |
| Connexion    | Bon/mauvais mot de passe, expiration, fermeture/réouverture, déconnexion.                                         |
| Caméra       | Annulation, appareil absent, photo grande taille, rotation, recréation d’activité, absence d’édition silencieuse. |
| Sélecteurs   | Photo locale/cloud, PDF, annulation, HEIC refusé sans conversion, absence de permission globale de stockage.      |
| Localisation | Refus, permission approximative, précision, GPS coupé, mesure fraîche et absence de suivi en arrière-plan.        |
| Réseau       | Mode avion avant et pendant l’envoi, réponse perdue, reprise après redémarrage, absence de doublon.               |
| Exports      | PDF/ZIP ouverts dans l’application destinataire, annulation du partage, gros dossiers et manque d’espace.         |
| Interface    | Clavier, bouton Retour, barres système, petit écran, orientation et lecteur d’écran.                              |

### Résultat dans l’environnement de travail

Validation du 12 octobre 2026 : compilations web et ressources Android réussies, synchronisation des six plugins réussie, 26 tests API/de régression réussis (puis 5 tests ciblés relancés après les derniers ajustements). Le parcours navigateur mobile passe avec refus GPS, réponse d’envoi perdue, rechargement, reprise idempotente et PDF. Le parcours navigateur web des dossiers passe aussi : captures, versions, contrôle d’intégrité, exports et révocation du partage. Sa position GPS simulée est désormais renouvelée à chaque capture, pour respecter le contrôle existant de fraîcheur de 30 secondes. Les ressources natives ont été inspectées, mais pas compilées sur cette machine.

`gradlew.bat assembleDebug` a été tenté et s’est arrêté : **`JAVA_HOME is not set and no 'java' command could be found`**. Aucun JDK/SDK Android ou appareil n’a été détecté. **Aucun APK ni AAB n’a donc été généré ici.** La compilation release n’a pas été effectuée : il faut d’abord fournir le domaine backend réel et la configuration de signature de l’exploitant.

Autres limites : pas de synchronisation automatique en arrière-plan ni de liste serveur accessible hors ligne après une nouvelle connexion ; les brouillons persistants restent locaux. Les exports mobiles sont plafonnés à **32 Mo** avant passage en mémoire/base64 vers le plugin natif ; au-delà, un message invite à utiliser le site web. Les gros ZIP demandent encore une optimisation vers un transfert natif en flux. Les services externes non configurés et leur validation réelle restent des dépendances du backend.

## Documentation officielle consultée

- [Capacitor 8 et configuration Android](https://capacitorjs.com/docs/updating/8-0)
- [Caméra, permissions et restauration d’activité](https://capacitorjs.com/docs/apis/camera)
- [Géolocalisation](https://capacitorjs.com/docs/apis/geolocation)
- [Filesystem](https://capacitorjs.com/docs/apis/filesystem) et [Share](https://capacitorjs.com/docs/apis/share)
- [Capawesome File Picker, compatibilité et conservation des fichiers](https://capawesome.io/docs/sdks/capacitor/file-picker/)
