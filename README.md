# PREUVIX

Pilote open source pour la France : capturer ou importer une photo ou une vidéo, figer son empreinte et son contexte, signer le manifeste, obtenir un jeton RFC 3161 si un prestataire est configuré, exporter un dossier et comparer les fichiers. Licence MIT. Facturation Stripe optionnelle.

## Capture documentée et attestation

Le [protocole de capture et de certification technique](docs/capture-certification.md) décrit les sessions engagées, la vidéo, la signature Ed25519, le PDF imprimable, les garanties et les limites anti-IA. Les nouveaux dossiers sont signés par la clé propre à l’installation ; les anciens dossiers restent lisibles sans signature rétroactive. L’identité du déposant et la réalité de la scène ne sont pas certifiées. L’horodatage indépendant reste en attente tant qu’un prestataire n’est pas configuré.

En développement, le serveur accepte aussi les origines exactes `http://localhost:PORT` et `http://127.0.0.1:PORT` pour permettre la capture sur le poste même lorsque `APP_ORIGIN` utilise une IP du réseau. En production, seule `APP_ORIGIN` est acceptée. Les caméras des autres appareils exigent une adresse HTTPS de confiance.

**État : pilote mono-propriétaire. Le connecteur d'horodatage est implémenté ; aucun prestataire qualifié n'est fourni ni activé. Sans configuration, les dossiers restent « en attente ». Ne pas présenter cette installation comme un service qualifié prêt à lancer.**

## Démarrer en local

Node.js 24 LTS est requis. OpenSSL 3 est requis seulement pour les jetons RFC 3161.

```sh
npm ci
npm run setup
npm run dev
```

Ouvrir http://localhost:3000 et utiliser le mot de passe généré par `setup` (également dans `.env`). Sous Windows, utiliser `npm.cmd` si PowerShell bloque `npm.ps1`. Le runtime portable utilisé pendant le développement se trouve éventuellement dans `.tools/node-v24.21.0-win-x64`, dossier ignoré par Git.

Sur ce poste Windows, `Start-Preuvix.ps1` trouve aussi ce runtime portable et effectue la configuration initiale sans écraser un `.env` existant :

```powershell
powershell -ExecutionPolicy Bypass -File .\Start-Preuvix.ps1
```

L'application n'utilise pas de services payants en mode local. Ne pas exposer le serveur de développement sur Internet.

```sh
npm test
npm run build
```

## Ce qui fonctionne

- Interface française responsive, un espace privé protégé par mot de passe, sessions de 12 h.
- Import JPEG/PNG/WebP (10 Mo, 40 mégapixels maximum), caméra via `getUserMedia`, refus des images invalides et animées.
- Octets reçus conservés sans transformation, SHA-256 côté serveur, manifeste JSON figé avec titre, contexte, origine déclarée et métadonnées techniques.
- Empreinte SHA-256 calculée dans le navigateur avant l'envoi et affichée dans le formulaire. Le serveur refait le calcul et refuse le dépôt si les empreintes diffèrent. L'API de dépôt exige maintenant le champ `clientSha256` ; recharger les anciens onglets après mise à jour.
- Validation réelle des signatures C2PA (Content Credentials) des appareils compatibles : intégrité, signataire (liste de confiance via `C2PA_TRUST_ANCHORS`) et type de source déclaré. Une signature de confiance déclarant une capture numérique donne le statut « signature d'appareil vérifiée » ; une signature cassée ou une génération IA déclarée impose un examen.
- Défi en direct à la capture (code et geste aléatoires, 180 s) et vérifications visuelles signées séparément.
- Copie protégée par filigrane invisible TrustMark et vérification d’une copie en circulation (dossier d’origine, zones retouchées).
- Rapport de certification PDF identifié PREUVIX (processus daté, contrôles, certificat final) et lien privé, révocable et limité dans le temps pour un commissaire de justice.
- Inspection limitée de métadonnées pour indices déclaratifs d'outils IA. **Aucun détecteur visuel « réel/faux ».** Un marqueur peut être falsifié et son absence ne prouve rien.
- Jetons RFC 3161 via OpenSSL : empreinte, nonce, chaîne, usage du certificat, politique et signataire épinglé. Échec du prestataire : fichier conservé en attente, nouvelle tentative explicite.
- Rapport PDF, QR lorsqu'un partage est activé, ZIP contenant original, manifeste exact, historique, rapport et requête/réponse RFC 3161 si disponibles.
- Partage volontaire par jeton aléatoire de 192 bits, révocable. La page publique ne révèle pas le titre, la photo, le nom original, la description ou la géolocalisation. Elle révèle les empreintes, l'identifiant et le reçu d'horodatage.
- Comparaison SHA-256 dans le navigateur sans envoi du fichier à comparer.
- Comparaison privée directement dans un dossier, sans activer de partage. L'écran « Vérifier un fichier » permet aussi de calculer une empreinte et de la comparer à celle d'un ancien rapport, même après suppression du dossier serveur. Cette comparaison ne valide pas un jeton ni l'authenticité du rapport de référence.
- Suppression de l'original et de toutes les données du dossier dans la base active, révocation du partage.
- Contrôle d'accès, vérification d'origine sur les mutations, cookie HttpOnly/SameSite, limites de requêtes et d'upload, quota de stockage.

## Architecture et choix de périmètre

React + TypeScript + Vite, serveur Express, SQLite embarqué (`node:sqlite`), originaux stockés comme BLOB dans la même base. Une installation, un processus, un propriétaire. Ce choix remplace Next.js/Supabase dans le plan initial pour diminuer le nombre de services et garder une suppression atomique.

La base et son journal ne sont jamais servis comme fichiers statiques. Les triggers refusent les modifications de l'original et du manifeste par l'application. Un administrateur du serveur peut contourner ces triggers : **ce n'est pas du stockage WORM**. L'ancre externe est le jeton d'horodatage conservé dans les exports, pas la seule base ni l'historique applicatif. L'application ne chiffre pas elle-même le disque : chiffrement de volume et sauvegardes sont à la charge de l'opérateur.

Le manifeste est sérialisé une fois, stocké dans ses octets exacts puis horodaté. Il lie le hash de l'original aux déclarations. Ne pas reformater `manifest.json` avant vérification. Le titre et le contexte ne sont plus modifiables après dépôt.

Les sessions et requêtes de dépôt ont des identifiants aléatoires. Les nouvelles tentatives avec le même identifiant de dépôt sont idempotentes. Un nouveau dépôt intentionnel du même fichier crée un autre dossier. Le débit est limité en mémoire pour un seul processus ; il se réinitialise au redémarrage. Aucun compte public, partage d'équipe ou réinitialisation de mot de passe par email n'est inclus. Ne pas multiplier les instances ou utilisateurs sans changer l'architecture.

## Configurer l'horodatage qualifié

Exécuter `npm run timestamp:check` pour contrôler la configuration locale, OpenSSL et la lisibilité du bundle CA. Cette commande n'affiche pas les secrets et ne contacte pas le prestataire. Un résultat positif ne valide ni le contrat, ni les accès, ni la qualification : un vrai dépôt doit encore être testé.

Obtenir un accès **au service d'horodatage qualifié** d'un prestataire figurant dans une liste de confiance européenne. Le statut du prestataire seul ne suffit pas : vérifier le service précis, la politique, le signataire et leur validité à la date du jeton.

Configurer dans `.env` (voir `.env.example`) :

```dotenv
TSA_URL=https://endpoint-du-prestataire
TSA_AUTHORIZATION=Basic ...ou Bearer ...selon le prestataire
TSA_NAME=Nom du service
TSA_CA_FILE=/app/trust/tsa-ca.pem
TSA_POLICY_OID=OID.exact.fourni.par.le.prestataire
TSA_SIGNER_SHA256=empreinte_hex_sha256_du_certificat_signataire
TSA_TRUST_LIST_URL=https://lien-vers-la-liste-officielle-du-service
TSA_REVIEW_VALID_UNTIL=date_ISO_de_fin_de_validite_de_la_revue
OPENSSL_BIN=openssl
```

Obtenir les certificats de confiance et l'empreinte du signataire par un canal indépendant du jeton. Le bundle CA doit contenir les autorités nécessaires ; le jeton doit fournir ses certificats intermédiaires si le service en utilise. Ne pas ajouter un certificat inconnu à la confiance pour contourner une erreur. Un changement de signataire nécessite une revue et une mise à jour du pin.

`TSA_REVIEW_VALID_UNTIL` documente une revue faite par l'opérateur ; ce n'est **pas** une preuve automatique de qualification. L'interface dit « service examiné par l'opérateur », jamais « qualification automatiquement validée ». La consultation automatisée des listes de confiance, OCSP/CRL, la validation eIDAS complète et l'archivage probatoire à long terme ne sont pas implémentés. La signature est vérifiée à la réception, pas à chaque ouverture de la page publique.

Le mode production refuse de démarrer sans HTTPS, cookie sécurisé et configuration/revue courante. `REQUIRE_TIMESTAMP=false` désactive volontairement cette dernière barrière pour un pilote privé ; il ne rend pas le service qualifié. La création d'un dossier peut rester en attente en cas d'indisponibilité du prestataire. Ne jamais confondre la date serveur, la date de capture déclarée et la date du jeton.

Avant de considérer le lancement qualifié terminé : obtenir le contrat et les tarifs, configurer le service, réaliser un vrai dépôt, vérifier indépendamment son jeton, documenter le contrôle de qualification et faire valider les formulations. Aucun achat ni appel payant n'a été effectué par ce projet.

## Déployer

Héberger sur un serveur dans l'UE avec disque persistant, HTTPS, accès administrateur limité et sauvegardes chiffrées. L'installation n'est pas publiée automatiquement.

1. Générer `.env`, définir `APP_ORIGIN=https://votre-domaine.fr`, `COOKIE_SECURE=true` et une configuration TSA réelle.
2. Placer le bundle CA dans `trust/tsa-ca.pem`, monté en lecture seule par Compose.
3. Exécuter `docker compose up --build -d`.
4. Configurer le reverse proxy HTTPS vers `127.0.0.1:3000`. Exemple Caddy sur l'hôte :

```caddy
votre-domaine.fr {
    reverse_proxy 127.0.0.1:3000
}
```

Ne pas activer les logs d'URL contenant les jetons de partage, ou expurger `/verification/*`. PREUVIX ignore les en-têtes IP des proxys par défaut : derrière un proxy, la limite de débit est commune à son IP. Adapter la confiance proxy uniquement à une topologie réellement maîtrisée avant un usage plus large. Les certificats et secrets ne doivent pas être ajoutés au dépôt Git.

Le volume `preuvix-data` contient `preuvix.sqlite`. Arrêter l'application avant de copier la base pour une sauvegarde cohérente, ou utiliser l'API SQLite Backup. Tester la restauration. Définir une durée de rétention des sauvegardes et une procédure de réapplication des suppressions après restauration. `secure_delete` nettoie les cellules SQLite actives ; il ne garantit pas l'effacement physique d'un SSD ou des instantanés de l'hébergeur.

## Budget initial : enveloppe de 100 €

Ces montants sont des **plafonds de planification, pas des devis** : 25 € pour domaine/premier hébergement, 50 € réservés au prestataire/aux premiers jetons, 25 € de marge. Développer et tester localement avant de dépenser. Si le minimum contractuel du service qualifié dépasse cette enveloppe, conserver le pilote privé et reporter le lancement qualifié. Aucune garantie de disponibilité commerciale à ce prix n'est donnée.

Limiter le pilote à un propriétaire et quelques testeurs accompagnés, sans transmettre le mot de passe à des utilisateurs indépendants. Mesurer le temps de dépôt, la compréhension du rapport et la capacité à vérifier/exporter un dossier. Ne pas ajouter de facturation.

## Essayer le parcours import → empreinte → comparaison

1. Choisir « Créer une preuve », puis une photo JPEG, PNG ou WebP. Attendre l'empreinte SHA-256 : la photo n'est pas envoyée à ce stade.
2. Ajouter le titre puis conserver le dossier. Le serveur exige que son empreinte corresponde à celle du navigateur.
3. Dans le dossier, ouvrir « Comparer une copie avec ce dossier » et sélectionner le même fichier : correspondance attendue, sans partage public ni nouvel envoi.
4. Essayer une copie modifiée ou réencodée : différence attendue, même si la photo semble identique à l'œil.
5. Exporter le ZIP et le rapport. Dans « Vérifier un fichier », coller l'empreinte du rapport et sélectionner la copie pour une comparaison sans dépendre d'un lien de partage.

HEIC/HEIF n'est pas décodé par ce pilote. Le formulaire et le serveur le refusent avec une explication. Exporter volontairement une copie JPEG depuis la photothèque : PREUVIX conserve alors les octets de cette copie et n'établit aucune identité avec le HEIC initial. Aucune conversion automatique n'est effectuée. Tester ce choix sur un véritable iPhone et Android avant ouverture ; les tests navigateur automatisés ne remplacent pas les sélecteurs de fichiers natifs.

## France, données personnelles et limites

L'opérateur doit compléter ses informations légales et sa politique de confidentialité avant ouverture : identité/contact, finalités, bases légales, destinataires, hébergement, prestataire TSA, conservation, droits et procédure de suppression. Le fichier original peut contenir des données personnelles de tiers ou des coordonnées GPS même si PREUVIX ne demande pas de géolocalisation. L'empreinte envoyée au prestataire n'est pas une promesse d'anonymisation.

Une suppression n'efface ni les exports détenus par d'autres, ni les sauvegardes externes, ni les éventuels journaux du prestataire. Définir une conservation adaptée au cas d'usage avec un professionnel du droit. Ne pas promettre une recevabilité automatique, une identité vérifiée, un lieu certifié ou une détection certaine d'IA.

Références primaires :

- [Code civil, article 1366](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032042461)
- [Commission européenne : listes de confiance et services qualifiés](https://digital-strategy.ec.europa.eu/en/policies/eu-trusted-lists)
- [OpenSSL : protocole et vérification RFC 3161](https://docs.openssl.org/3.6/man1/openssl-ts/)
- [C2PA : spécification de provenance](https://spec.c2pa.org/)

## Abonnement Stripe

Premium est prévu à **10,99 € par mois**, avec Checkout hébergé par Stripe et portail client. La facturation reste désactivée sans les identifiants de test. Voir [la configuration Stripe](docs/stripe-setup.md) pour les variables serveur, webhooks, essais et limites de déploiement. Aucun paiement réel n’est activé par défaut. Le quota Premium est effectivement contrôlé au dépôt ; les preuves déjà conservées ne sont pas supprimées après résiliation.

## Répertoire des partenaires Preuvix

La carte inclut aussi un relevé de 2 496 localisations publiques de l’annuaire officiel, dans `public/offices.json`, avec la date de collecte et un lien vers chaque fiche source. Ces études ne sont pas présentées comme partenaires. Recherche par ville, code postal ou nom, marqueurs cliquables, liste liée à la zone visible et itinéraires sont disponibles sans configuration. Les données ne sont pas mises à jour en direct : confirmer les coordonnées dans la fiche officielle. Pour actualiser le relevé, télécharger la page publique de `https://annuaire.commissaire-justice.fr/` dans `.tools/directory-page.html`, puis exécuter `node scripts/import-offices.mjs` ; le script extrait les données sans exécuter le JavaScript téléchargé et refuse un résultat incomplet. Vérifier les conditions de réutilisation applicables avant une diffusion commerciale du répertoire.

La carte interactive utilise Leaflet et les tuiles OpenStreetMap (connexion requise). Pour placer une étude, ajouter un objet `coordinates` avec `lat` et `lng` numériques, correspondant à son adresse vérifiée. Les fiches sans coordonnées restent visibles dans la liste. Les filtres de la liste filtrent aussi les marqueurs. Le bouton de localisation demande la permission du navigateur ; les tuiles affichées sont chargées depuis OpenStreetMap. La recherche Google Maps ouvre un service externe et ne présente pas ses résultats comme des partenaires. Aucun partenaire fictif n’est ajouté à la carte.

La démo compare réellement deux textes UTF-8 avec SHA-256 dans le navigateur. Les trois scénarios sont fictifs ; le rapport téléchargeable n’est ni un horodatage ni un constat professionnel. Les polices Outfit et Syne sont hébergées avec l’application.

Le répertoire est accessible dans la section commissaire de justice de l’accueil et dans chaque dossier, après les exports. Il propose recherche par étude, ville ou département, filtre par type de constat, fiche officielle, préparation locale d’une demande téléchargeable et accès au site de l’étude. Aucun message ni fichier n’est transmis automatiquement.

Pour alimenter le réseau, créer `partners.json` dans le répertoire `DATA_DIR` (par défaut `data/partners.json`) à partir de `server/partners.example.json`. Remplacer toutes les valeurs d’exemple par les coordonnées approuvées d’une étude réelle. Après confirmation de son accord de partenariat et vérification de sa fiche officielle, passer `partnershipConfirmed` et `published` à `true`. Ces deux indicateurs sont nécessaires pour publier. Mettre `published` à `false` pour retirer une fiche. Ne jamais publier les exemples comme des partenaires.

Le fichier est relu à chaque appel public `GET /api/partners` : aucun redémarrage n’est nécessaire, il suffit de recharger la page. Les identifiants doivent être uniques ; les liens HTTPS sont obligatoires et `directoryUrl` doit pointer vers `annuaire.commissaire-justice.fr`. Les départements utilisent des codes comme `75`, `2A` ou `974`. Les services admis sont `Constat immobilier`, `Constat internet`, `Travaux et malfaçons` et `Autre constat matériel`. Un fichier absent produit une liste vide ; un fichier invalide rend le répertoire indisponible, sans publier de données partielles. Écrire le fichier de façon atomique pour éviter une lecture pendant sa modification.

### Espaces de la communauté

La page d’accueil présente quatre espaces partenaires : commissaires de justice (alimenté par `partners.json` ci-dessus), avocats, associations d’aide et experts. Pour les trois derniers, créer `community.json` dans `DATA_DIR` à partir de `server/community.example.json`. Champs : `id` unique, `space` (`avocats`, `associations` ou `experts`), `name`, `area` (ville ou « National »), `description`, `topics` (6 maximum), `website` et `verificationUrl` facultatif en HTTPS (annuaire du barreau, liste d’experts, agrément…). Comme pour les études, `published` et `partnershipConfirmed` doivent valoir `true` pour publier ; un fichier invalide rend les espaces indisponibles sans publier de données partielles. Le fichier est relu à chaque appel de `GET /api/community`. Renseigner `COMMUNITY_CONTACT_EMAIL` pour afficher le bouton « Devenir partenaire » (lien e-mail) ; sans cette variable, la page indique que les candidatures ouvriront bientôt.

Le statut de partenaire correspond à un accord référencé par l’exploitant ; il ne vaut ni certification d’un dossier ni garantie d’acceptation d’une mission. Les honoraires et modalités restent à convenir directement avec le professionnel. Aucun partenaire réel n’est préconfiguré.

## Tests et limites de validation

`npm test` couvre authentification, protection d'origine, conservation exacte, intégrité, idempotence concurrente, export ZIP/PDF, confidentialité des réponses publiques, révocation, suppression, quotas, images invalides et panne de prestataire. Les tests Stripe simulent les appels distants mais vérifient réellement les signatures webhook avec le SDK, la liaison au propriétaire, les retries, les quotas et les conditions d’activation. Le test applicatif d'horodatage utilise un double explicitement fictif. Un test cryptographique supplémentaire utilise une autorité temporaire locale pour produire un vrai jeton RFC 3161 et rejeter les mauvaises empreintes, politiques, autorités et signataires. Il est ignoré si OpenSSL est absent ; définir `OPENSSL_BIN` si son exécutable n'est pas dans le PATH.

`npm run test:browser` vérifie le parcours utilisateur complet dans Edge sous Windows, ou Chromium ailleurs (`npx playwright install chromium` si nécessaire). Il utilise des photos synthétiques et une base séparée dans `.tools/browser-data`. Il produit des captures desktop/mobile dans `test-results`. La comparaison est testée avec un fichier identique puis différent, sans requête POST.

Ces tests ne valident pas un vrai prestataire, son statut qualifié ni les coûts. Le connecteur doit encore être testé avec le service choisi et l'image Docker validée avant production.
