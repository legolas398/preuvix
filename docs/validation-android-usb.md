# Validation USB — 14 octobre 2026

## Résultat

Préparation PC et APK terminée. Aucun téléphone autorisé n'est détecté par `adb devices -l` à la fin de cette préparation : l'installation, le tunnel sur un appareil et les permissions natives restent à vérifier avec le téléphone de l'utilisateur.

| Contrôle exécuté | Résultat |
| --- | --- |
| TypeScript et compilation Vite Android | Réussis |
| Synchronisation Capacitor | Réussie, 6 plugins Android détectés |
| Gradle `assembleDebug` | Réussi |
| Signature de l'APK | Vérifiée, APK Signature Scheme v2 |
| Backend intégré | `http://127.0.0.1:3016`, mode développement |
| Contrôle du serveur USB | Instance identifiée, connexion Android et lecture des dossiers réussies |
| Lanceur `-PrepareOnly` | Réussi ; APK actuel reconnu sans recompilation |
| Lanceur sans téléphone | Diagnostic explicite, aucune installation ou suppression effectuée |
| Arrêt puis redémarrage du serveur | Réussis ; données et mot de passe conservés |
| Tests `tests/mobile.test.ts` | 2 réussis, 0 échec |
| Test navigateur Android | 1 réussi, 0 échec après augmentation du délai de démarrage du serveur de test |
| Téléphone physique | Non testé : aucun appareil dans ADB |

Le premier lancement du test navigateur a dépassé le délai de démarrage de 120 secondes avant tout scénario. Le délai a été porté à 240 secondes ; la relance a réussi. Il ne s'agissait pas d'un échec de dépôt Android observé.

Le test navigateur utilise le bundle Android réellement compilé pour l'USB et un backend isolé de test. Il couvre connexion, création d'un dossier, refus de GPS avant capture, photo/vidéo, position de fin, perte de réponse après réception serveur, reprise sans doublon, justificatifs et export PDF. `navigator.onLine` y est simulé à `false` alors que l'API reste joignable, afin de vérifier le cas USB sans Internet. Les erreurs JavaScript et le débordement horizontal sont contrôlés.

Cela ne valide pas les dialogues Android de permissions, un appareil photo matériel, un fix GPS réel, la feuille de partage native, les pilotes Windows ou un câble physique.

## Artefact livré

- APK : `android/app/build/outputs/apk/debug/app-debug.apk`.
- SHA-256 : `04b181aaf5d068f5566dfd59bcd2d734c7d165d773e563f0a241d6d59c02df34`.
- Métadonnées locales de compilation et empreinte des sources : `.tools/usb-test/apk.json`.
- Lanceur : `Tester-Preuvix-USB.cmd`.
- Arrêt : `Arreter-Preuvix-USB.cmd`.
- Mode d'emploi : [test-android-usb.md](test-android-usb.md).

Toute recompilation peut changer l'empreinte de l'APK. Le lanceur compare l'artefact avec les métadonnées locales et les sources, puis reconstruit si nécessaire. Le fichier de mot de passe n'est ni inclus dans l'APK ni imprimé dans ce rapport.

## Reste à obtenir de l'utilisateur

1. Téléphone Android connecté avec un câble de données, déverrouillé, débogage USB autorisé.
2. Marque, modèle et version Android.
3. Autorisations d'installation, caméra et localisation acceptées sur l'écran.
4. Essai réel photo → dépôt → ouverture PDF, puis une courte vidéo.

L'estimation de réussite de 80 % figurant dans le guide est subjective et conditionnelle. Ce n'est pas une mesure de fiabilité ni une validation de toutes les fonctions sur un modèle non testé.
