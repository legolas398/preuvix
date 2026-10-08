# Dossiers, intégrité et services de preuve

L’onglet **Dossiers multi-fichiers** permet de créer un dossier titré et décrit,
d’ajouter des originaux, de remplacer un fichier en conservant son historique,
de recalculer les empreintes et de télécharger un PDF, un manifeste JSON ou un ZIP.
Les formats acceptés restent JPEG/PNG/WebP (10 Mo) et MP4/WebM (50 Mo), avec
50 fichiers par version et 100 Mo d’originaux maximum par ZIP.

## Données et permissions

Cette application conserve son modèle existant : **un propriétaire privé par
installation**, authentifié par session. Elle n’est pas une plateforme multi-comptes.
Pour plusieurs propriétaires indépendants, utiliser des installations et bases
séparées ; une mutualisation nécessite une authentification multi-utilisateurs et
des contrôles de propriétaire sur toutes les requêtes, non implémentés ici.

Les routes `/api/cases` et les documents signés nécessitent la session propriétaire.
Les mutations exigent aussi l’origine autorisée. Le partage nécessite un accord
explicite, un lien aléatoire stocké sous forme d’empreinte, une version précise,
une durée de 7/30/90 jours et un choix concernant les originaux. Le lien expose les
informations annoncées, dont les coordonnées disponibles. La révocation bloque les
accès futurs, sans supprimer les copies déjà téléchargées.

Les originaux ne sont pas réencodés. Le serveur calcule SHA-256, taille, type et
date de réception UTC. Les versions des dossiers sont immuables et chaînées par
l’empreinte de la précédente. Un original référencé par une version ne peut plus
être supprimé individuellement. Il n’existe pas encore de suppression de dossier
depuis l’interface. Les opérations importantes sont consignées dans `case_events`.
Ce journal local n’est pas un journal certifié résistant à un administrateur système.

Au démarrage, la migration transactionnelle et idempotente `cases-v1` crée les
tables `cases`, `case_versions`, `case_version_files`, `case_operations`,
`case_callback_events`, `case_events` et `case_links`. Sauvegarder la base SQLite
et les clés avant mise à jour, serveur arrêté, ou avec l’API de sauvegarde SQLite.
Ne pas copier seulement le fichier principal pendant une écriture en mode WAL.

## Dates et localisation

La date de réception du serveur est distincte d’un horodatage RFC 3161. La capture
du navigateur demande l’accord de l’utilisateur et conserve latitude, longitude,
précision en mètres, date et source `browser_geolocation`. Le refus et
l’indisponibilité sont conservés. Les captures anciennes sans champ source restent
lisibles. Une adresse saisie est déclarative et ne devient jamais une position GPS.
Les coordonnées peuvent être simulées ; elles ne prouvent pas à elles seules le
lieu de prise de vue.

## Horodatage RFC 3161

Réutiliser la configuration existante : `TSA_URL`, `TSA_NAME`,
`TSA_AUTHORIZATION` si nécessaire, `TSA_CA_FILE`, `TSA_POLICY_OID`,
`TSA_SIGNER_SHA256` et `OPENSSL_BIN`. Le service existant vérifie la réponse
RFC 3161 avec OpenSSL ; le dossier conserve requête, réponse et reçu de validation.
`TSA_TRUST_LIST_URL` et `TSA_REVIEW_VALID_UNTIL` consignent une revue de l’exploitant,
pas une validation automatique de qualification eIDAS. Les exigences de démarrage
`REQUIRE_TIMESTAMP` restent applicables. Exécuter `npm run timestamp:check` après
configuration. Aucun jeton réel n’est produit sans un prestataire opérationnel.

## Passerelles d’ancrage et de signature

Les intégrations ci-dessous sont un **contrat de passerelle HTTPS**, pas des
connecteurs natifs à un prestataire commercial donné. Il faut fournir une passerelle
respectant ce contrat, l’adapter au prestataire choisi et renseigner ses identifiants.
Une simple clé d’un prestataire dont l’API diffère ne suffit pas.
Sans configuration complète, l’interface affiche **Non configuré** et refuse les
demandes ; elle ne simule jamais de confirmation.

Variables serveur, à ne jamais préfixer par `VITE_` :

| Service   | Configuration                                                                                                                                         |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ancrage   | `ANCHOR_SERVICE_URL`, `ANCHOR_SERVICE_NAME`, `ANCHOR_SERVICE_TOKEN`, `ANCHOR_WEBHOOK_SECRET`, `ANCHOR_NETWORK`, `ANCHOR_MIN_CONFIRMATIONS` (défaut 1) |
| Signature | `SIGNATURE_SERVICE_URL`, `SIGNATURE_SERVICE_NAME`, `SIGNATURE_SERVICE_TOKEN`, `SIGNATURE_WEBHOOK_SECRET`                                              |

Les URL doivent être HTTPS, sans identifiants intégrés, query ni fragment.
Les secrets de callback doivent contenir au moins 32 caractères.
Les appels envoient `Authorization: Bearer <TOKEN>` ; les redirections sont refusées.
Délai maximal : 20 secondes, réponse JSON : 64 Ko, PDF retourné : 15 Mo/500 pages.

### Création et suivi

`POST <SERVICE_URL>/requests`, `Content-Type: application/json`,
`Idempotency-Key: <UUID de l’opération persistée>`.
La passerelle **doit** conserver l’idempotence, y compris si PREUVIX a perdu la
réponse HTTP. Une nouvelle tentative utilise le même UUID et le même PDF source.

Corps ancrage :

```json
{
  "algorithm": "sha256",
  "digest": "<empreinte du manifeste de version>",
  "network": "<réseau configuré>"
}
```

Seule cette empreinte est à publier. Aucun original, adresse, titre ou autre donnée
personnelle ne doit être publié sur la blockchain. La passerelle est responsable
de soumettre la transaction et de vérifier ses confirmations sur le réseau réel.

Corps signature, uniquement après consentement explicite :

```json
{
  "algorithm": "sha256",
  "digest": "<empreinte de version>",
  "documentBase64": "<PDF récapitulatif>",
  "sourceDocumentSha256": "<empreinte du PDF>",
  "signerEmail": "<destinataire>"
}
```

La passerelle doit organiser le parcours du signataire (par exemple invitation
envoyée par le prestataire). PREUVIX n’envoie pas les fichiers originaux. Le PDF
peut contenir des coordonnées et des données déclarées : le consentement le précise.

Création et `GET <SERVICE_URL>/requests/<requestId>` retournent :

```json
{ "requestId": "identifiant-stable", "digest": "<empreinte demandée>", "state": "pending" }
```

`requestId` : 1–120 caractères ASCII alphanumériques, `_` ou `-`.
`state` : `pending`, `confirmed` ou `failed`.
Pour l’ancrage, fournir `network` dès la première réponse, puis `transactionId`,
`confirmations` et `confirmedAt` (ISO UTC) pour confirmer. Un nombre de confirmations
inférieur au seuil reste en attente. PREUVIX vérifie la liaison à l’empreinte et au
réseau, mais ne consulte pas lui-même un nœud blockchain.

Pour la signature, fournir `sourceDocumentSha256` dès la première réponse.
La confirmation exige aussi `signedDocumentSha256`, `evidenceReference` et
`confirmedAt`. `reportedLevel` indique exactement le niveau déclaré par le
prestataire (ne pas lui attribuer un niveau supérieur).
`GET <SIGNATURE_SERVICE_URL>/requests/<requestId>/document` retourne le PDF signé
avec `Content-Type: application/pdf`. PREUVIX vérifie ses octets, sa structure PDF
et la concordance des empreintes avant de conserver et d’afficher le résultat.
**La validation cryptographique des certificats de signature PDF et la qualification
eIDAS ne sont pas implémentées.** Le niveau reste une déclaration du prestataire,
`qualificationVerified` reste `false`. La signature technique Ed25519 de PREUVIX
est distincte de la signature électronique du signataire.

Les états et erreurs sont persistés. Les boutons Actualiser/Réessayer relancent le
suivi sans créer une seconde demande. Il n’y a pas de polling automatique ni de
worker de reprise : utiliser les callbacks ou le bouton de suivi. Changer de
prestataire bloque les anciennes demandes jusqu’au rétablissement de leur
configuration. Chaque nouvelle version possède ses propres opérations.

### Callbacks authentifiés et idempotents

`POST <APP_ORIGIN>/api/evidence/callback/anchor` ou `/signature`, JSON brut :

```json
{ "eventId": "evenement-unique", "requestId": "identifiant-stable" }
```

En-têtes : `X-Preuvix-Timestamp` (secondes Unix) et
`X-Preuvix-Signature: sha256=<hex HMAC-SHA256>`.
Calculer le HMAC avec le secret du service sur la concaténation exacte
`timestamp + "." + corpsJSONBrut`, en UTF-8. Tolérance : 300 secondes.
Générer une nouvelle date et signature pour une tentative tardive, en gardant
l’identifiant d’événement et le corps identiques. Les duplicatas traités répondent
200 sans répéter le traitement ; une collision avec un autre contenu répond 409.
Le callback déclenche une lecture HTTPS authentifiée du statut : son corps ne peut
pas imposer une confirmation. En cas d’échec, l’événement reste réessayable.
La passerelle doit réessayer les erreurs temporaires, dont 404 si le callback
arrive avant l’enregistrement de l’identifiant de demande et 409 si elle est en cours.

## Manifestes et vérification indépendante

`dossier.json` suit `preuvix-case/1`. Sa sérialisation `PREUVIX-JSON-v1` trie
récursivement les clés par unités UTF-16 (ordre JavaScript `sort`), conserve l’ordre
des tableaux et les chaînes Unicode sans normalisation, utilise `JSON.stringify`
pour les chaînes, booléens, null et nombres finis (`-0` devient `0`). Les valeurs
non JSON sont refusées. Encodage UTF-8, sans BOM, indentation ou saut de ligne final.
Ce format propre à PREUVIX ne revendique pas une conformité RFC 8785.

Le SHA-256 des octets de `dossier.json` est l’empreinte immuable demandée aux services.
Le ZIP contient séparément `manifest.json` (`preuvix-case-export/1`) : une enveloppe
canonique avec le dossier, son empreinte, la date d’export, les résultats disponibles
et les empreintes des fichiers joints. Elle est signée par la clé technique PREUVIX.
Les justificatifs arrivant plus tard ne changent pas l’empreinte déjà ancrée.
Deux exports à des dates différentes ont naturellement des empreintes différentes ;
une même enveloppe produit toujours la même empreinte.

Après extraction, avec Node 24 :

```sh
node scripts/verify-case-export.mjs chemin-du-dossier-extrait cle-publique-de-confiance.pem
```

La clé indépendante est facultative pour contrôler les octets, mais nécessaire
pour établir une correspondance avec une identité de clé connue. Le vérificateur
contrôle manifestes, signatures techniques et pièces incluses ; il ne vérifie pas
la finalité blockchain, les certificats PDF, la réalité de la scène ou une garantie
de recevabilité juridique.

## Validation

`tests/cases.test.ts` couvre versions, originaux, permissions, altération, export
indépendant, liens, erreurs de services, callbacks et conservation des jetons.
Les prestataires des tests sont des doubles explicitement fictifs.
`tests/browser/cases.spec.ts` couvre le parcours de dépôt, remplacement, contrôle,
téléchargement, consultation externe et révocation. Les tests ne prouvent pas le
fonctionnement d’un prestataire réel : une recette avec ses identifiants reste requise.
