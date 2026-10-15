# Validation sur téléphone réel

État initial : aucun appareil autorisé détecté par ADB lors de la préparation. Les tests automatisés utilisent une caméra simulée et ne valident pas les permissions matérielles du téléphone.

## Ouvrir le site par USB

1. Branchez un câble de données, déverrouillez le téléphone et activez le débogage USB.
2. Acceptez l’autorisation de cet ordinateur sur l’écran du téléphone.
3. Double-cliquez sur **Tester-Site-USB.cmd**. Le lanceur compile le site, redémarre uniquement l’instance de test isolée et ouvre le navigateur via le tunnel USB.
4. Ouvrez localement `.tools/usb-test/password.txt` pour vous connecter. Ne partagez pas ce fichier.
5. L’adresse `http://127.0.0.1:3016` est locale au téléphone grâce au tunnel USB. Elle permet les API caméra/GPS sur les navigateurs qui prennent en charge le contexte sécurisé de boucle locale. Le site public utilisera HTTPS.

Le PC doit rester allumé et le câble branché. Les données de test sont séparées de celles de l’installation principale. **Arreter-Preuvix-USB.cmd** arrête le serveur de test. Ce lanceur ne désinstalle aucune application et ne réinitialise aucune permission.

## Fiche de recette à compléter

Indiquer modèle, version Android, navigateur/version, date et résultat réel pour chaque ligne. Un lancement ADB réussi ne suffit pas à déclarer la caméra validée.

| Essai | Résultat attendu | Résultat observé |
|---|---|---|
| Refuser puis autoriser la localisation | Message explicite ; capture possible après autorisation et nouvelle session | À tester |
| Refuser puis autoriser la caméra | Message explicite ; nouvelle session possible | À tester |
| Photo en portrait puis paysage | Aperçu correct, aucun débordement, empreinte vérifiée après dépôt | À tester |
| Verrouiller puis déverrouiller avant capture | Reprise ou message invitant à recommencer ; aucun écran bloqué | À tester |
| Passer dans une autre application puis revenir | État cohérent ; brouillon déjà enregistré conservé | À tester |
| Débrancher le câble pendant l’envoi | Absence de fausse confirmation ; nouvelle tentative après reconnexion | À tester |
| Recharger après un échec d’envoi | Brouillon présent avec titre, fichier et dossier associés | À tester |
| Créer deux brouillons de dossiers différents | Les deux restent indépendants | À tester |
| Se reconnecter avant de déposer | Reprise avec engagement initial, dans la limite de 24 heures | À tester |
| Ouvrir le PDF et vérifier le QR code | Lien accessible, comparaison locale correcte | À tester |

Après une réponse réseau perdue, la reprise recherche aussi une preuve déjà créée pour la capture : elle ne doit pas fabriquer un doublon. Les informations d’une preuve déjà enregistrée restent celles du dépôt initial.

Pour tester la latence réelle du réseau mobile, utiliser le futur hébergement HTTPS : le tunnel USB ne reproduit pas la connexion 4G/5G. Les simulations navigateur couvrent l’interruption et la latence, pas le matériel ni la gestion d’énergie du constructeur.
