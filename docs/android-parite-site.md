# Application Android et site communs

Android embarque désormais `App` et les mêmes styles que le site : accueil, dossiers,
captures, preuves, vérification de photos, protection, liens privés, transmission,
offres et annuaire. La disponibilité des services dépend de la configuration du
même serveur, exactement comme sur le site.

Les adaptations natives sont limitées au transport API (session mobile en mémoire,
sans cookie ni identifiant dans les liens), à la lecture GPS, aux aperçus privés,
au partage des fichiers et à la navigation. Les liens copiés utilisent l'adresse
du serveur, jamais `https://localhost`.

Les anciens brouillons IndexedDB restent accessibles via « Retrouver mes anciens
brouillons » lorsqu'ils existent pour ce serveur. Installer la mise à jour par-dessus
l'application existante, sans désinstallation. Les nouvelles captures utilisent les
brouillons et le parcours communs au site. Une fermeture de l'application exige
une nouvelle connexion ; aucun mot de passe n'est embarqué dans l'APK.

Validation automatisée : `tests/android/parity.spec.ts` utilise le bundle embarqué
avec une API Express et une base isolées ; `tests/android/mobile.spec.ts` conserve
le scénario de reprise des anciens brouillons. Les permissions et la feuille de
partage natives doivent aussi être confirmées sur un téléphone physique.

Partage natif : [documentation Capacitor Share](https://capacitorjs.com/docs/apis/share).

## Résultats de validation — 17 octobre 2026

- APK 0.2.0, code de version 2 : compilation TypeScript/Vite/Gradle réussie,
  signature APK vérifiée. Installation possible en mise à jour avec la même clé.
- Deux tests Android réussis : reprise des anciens brouillons après réponse perdue,
  photo/vidéo, refus de localisation, exports et parcours commun au site ; création
  de dossier, capture, intégrité, PDF/ZIP, lien public, aperçu privé, vérification,
  Premium, annuaire et retour sans perdre la connexion.
- Deux tests API mobile réussis (configuration et capture/export/reprise).
- Trois tests web réussis : refus GPS, capture photo/vidéo complète, dossiers
  versionnés avec export et révocation. Le test web de panne d'encodage simulée
  n'est pas validé : attente dépassée, puis chargement de page dépassant 120 s.
- Téléchargement public de l'APK vérifié par SHA-256 ; les routes privées restent
  protégées. Le tunnel expiré a été remplacé, sans changer la base ni le mot de passe.
- Aucun téléphone USB connecté : permissions système et partage natif restent à
  confirmer sur appareil. Les tests navigateur ne les remplacent pas.

Capture du parcours : `.tools/android-parity.png`.
