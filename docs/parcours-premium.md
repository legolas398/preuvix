# Interface simplifiée et préparation Premium — prototype privé

## Structure des écrans

| Écran                               | Contenu                                                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Accueil `/`                         | Promesse concrète, ouverture de l’espace, trois étapes, démonstration dépliable, offres Free/Premium, carte interactive et trois questions fréquentes. |
| Espace privé                        | Liste ou état vide, création, recherche et filtres ; carte Premium discrète.                                                                           |
| Dossier                             | Résumé, document, vérification, exports et préparation Premium. Contrôles avancés, protection des copies et historique dépliables.                     |
| Comprendre `/comprendre`            | Explications techniques, limites, préparation Premium, sources existantes et conditions du prototype.                                                  |
| Annuaire `/annuaire`                | Recherche indépendante du parcours de création et du droit Premium. Aucun envoi.                                                                       |
| Préparation Premium                 | Sélection → résumé → informations accessibles → étiquette destinataire/durée → récapitulatif et confirmation → lien créé et gestion.                   |
| Consultation `/consultation/:token` | Sélection figée, rapport JSON et, seulement si autorisés, originaux sélectionnés.                                                                      |

## Répétitions retirées

- Grand bloc de présentation et statistiques retirés de la liste des dossiers.
- Développements juridiques et techniques et communauté retirés de l’accueil principal. La carte et le répertoire sont également accessibles depuis l’accueil.
- Annuaire intégré au dossier remplacé par un lien vers sa page dédiée.
- Ancien formulaire « Envoyer à un commissaire » remplacé par un assistant distinct ; les anciens accès restent révocables.
- Prix prévu affiché : 10,99 € / mois, avec comparaison Free/Premium. Le paiement reste désactivé dans le prototype. Les anciens modules de facturation restent dans le dépôt, hors du parcours actif.
- Déclarations complémentaires repliées à la création ; contrôles détaillés repliés dans le dossier.

## Configuration serveur

```dotenv
PRIVATE_PROTOTYPE=true
PREMIUM_TRANSMISSION_TEST=false
```

Ces valeurs sont les valeurs par défaut. Pour essayer Premium localement, mettre `PREMIUM_TRANSMISSION_TEST=true` dans la configuration **du serveur**, puis le redémarrer. Ce statut est ignoré en production. Il n’est pas lié à `localStorage`, à un bouton ni au module de facturation. L’interface ne propose aucun bouton permettant de s’octroyer ce droit.

Le mode prototype bloque les opérations de facturation et désactive les appels Stripe. Aucun prestataire n’a été ajouté. Les tests historiques de facturation désactivent ce mode uniquement avec un client Stripe simulé.

## Données et états

Les préparations sont stockées dans la table SQLite `transmissions`, indépendamment des preuves. « Continuer » et « Enregistrer et quitter » enregistrent les modifications. Une saisie non enregistrée est annoncée comme telle. Les droits d’écriture sont vérifiés par le serveur, de même que l’authentification, l’origine des requêtes et la révision du brouillon.

L’étape résumé propose trois modèles facultatifs (immobilier, travaux, internet). Ils ne sont insérés que dans un résumé vide pour préserver toute saisie existante. Les rubriques restent à compléter par l’utilisateur ; aucun fait n’est généré. Le résumé conserve sa limite de 1 500 caractères et suit le même enregistrement que le reste du brouillon.

- **Brouillon** : préparation enregistrée, éventuellement incomplète.
- **Prêt** : au moins une pièce, un résumé et une étiquette ; références présentes et intégrité contrôlée.
- **Lien créé** : sélection figée après confirmation explicite. Aucune possibilité de modifier les informations d’un lien existant.
- **Expiré** : date limite atteinte ; consultation et téléchargements refusés.
- **Révoqué** : consultation et téléchargements refusés, même si Premium est désactivé.

Il n’existe pas d’état « envoyé » ou « pris en charge ». Aucun email n’est adressé à un professionnel.

## Périmètre accessible

Le récapitulatif final provient du serveur et correspond à la sélection qui sera figée : titres, identifiants, tailles et empreintes, résumé et étiquette destinataire. Les notes de contexte et les originaux sont **exclus par défaut**. L’ajout des originaux avertit de la présence possible de métadonnées intégrées. Les déclarations avancées, les autres pièces, l’historique et l’export complet ne sont pas accessibles par ces nouveaux liens.

En mode empreintes seules, le rapport de sélection et les références sont disponibles ; il faut joindre les fichiers séparément selon les modalités convenues. Le rapport de sélection JSON est **non signé** et distinct des exports signés du parcours standard. L’écran de vérification photo conserve son export signé sans original ; il ne crée pas à lui seul une pièce persistante pour la préparation Premium.

Un lien est une capacité d’accès : toute personne qui le possède peut l’utiliser ou le transférer. L’étiquette n’authentifie personne. Seule l’empreinte du jeton aléatoire est conservée en base ; son URL est affichée une seule fois. L’installation locale doit être joignable pour que le lien fonctionne. Révoquer ne rappelle pas les copies déjà téléchargées. La suppression d’une pièce sélectionnée bloque la consultation de cette sélection.

## Vérification

```sh
node --import tsx --test tests/transmission.test.ts tests/sharing.test.ts tests/billing.test.ts
npm run test:browser -- --timeout=120000 --grep "simplified welcome|standard dossier|private photo verification"
```

Pour le parcours Premium, démarrer la suite avec `PREUVIX_TEST_PREMIUM=true` dans l’environnement du processus de test :

```powershell
$env:PREUVIX_TEST_PREMIUM='true'
npm.cmd run test:browser -- --timeout=120000 --grep "premium test preparation"
```

Les essais utilisent des images générées et une base de test distincte. Ils couvrent le refus sans droit, la reprise du brouillon, le contrôle de révision, les données exclues, le consentement aux originaux, l’expiration, la révocation, le retrait de Premium, la compatibilité des anciens accès et la navigation mobile/clavier.

Résultats du 6 octobre 2026 : compilation TypeScript/Vite réussie ; 12 tests serveur ciblés réussis, 1 test optionnel TrustMark ignoré (modèle absent) ; 4 tests navigateur réussis sur deux configurations serveur, avec et sans Premium. L’accueil a également été inspecté dans le navigateur sans erreur signalée, et le récapitulatif mobile vérifié visuellement. La suite historique complète n’a pas été relancée : cette validation porte sur les parcours et modules concernés.

## Limites et fonctions absentes

- Offre en préparation : aucun prix ni partenaire ajouté ou promis.
- Contrôle de complétude purement applicatif ; pas d’examen juridique du dossier.
- Ni authentification du commissaire, ni envoi, ni accusé de réception, ni acceptation de mission.
- Pas de transfert externe des originaux, de paiement ou de portail professionnel.
- Les originaux restent dans le stockage local existant ; le choix « empreintes seules » limite la consultation, il ne supprime pas l’original déjà conservé dans le dossier privé.
- Les liens anciens conservent leur périmètre historique complet ; ils sont identifiés séparément pour permettre leur révocation.
- Supprimer une pièce supprime également les préparations et les accès qui la contiennent, pour ne pas conserver leurs copies de notes dans la base active.
