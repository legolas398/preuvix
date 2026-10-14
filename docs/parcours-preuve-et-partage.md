# Dossiers, capture et vérification

## Créer et retrouver un dossier

Dans l’espace privé, ouvrez **Dossiers multi-fichiers**, puis **Créer un dossier**.
Utilisez le titre pour identifier le client ou l’intervention, et décrivez le contexte.
La recherche porte sur le titre et la description. Les filtres de dates portent sur la dernière mise à jour (UTC).

Ajoutez une capture ou une preuve existante. Chaque modification produit une version ; les versions précédentes restent consultables. Le filtre photos/vidéos/documents ne change que l’affichage, jamais le contenu des exports.

La checklist rappelle les pièces présentes, le contexte et la relecture des exports. Elle n’attribue aucun statut de certification et ne clôture pas automatiquement le dossier. L’historique est un journal applicatif, pas un audit indépendant.

## Capturer et conserver

1. Cliquez sur **Créer une preuve** ou **Capturer une photo ou vidéo** depuis un dossier.
2. Ouvrez la caméra : la localisation est demandée avant l’accès à la caméra.
3. Capturez, puis vérifiez l’aperçu et renseignez le titre et le contexte.
4. Cliquez sur **Conserver ma preuve**. Attendez la confirmation **Preuve enregistrée sur le serveur**.
5. Cliquez sur **Ouvrir la preuve enregistrée**. Si la capture a été lancée depuis un dossier, cette action l’y ajoute. Si l’ajout échoue, le fichier reste dans les preuves et peut être rattaché ensuite.

Un engagement d’empreinte n’est pas un dépôt du fichier. Le résumé distingue l’enregistrement serveur et l’obtention éventuelle d’un horodatage externe. L’enregistrement serveur ne confirme pas une sauvegarde externe.

### Brouillon et échec d’envoi

Après l’engagement de la capture, le navigateur conserve automatiquement un brouillon (fichier, description et identifiant de dépôt) dans IndexedDB. Un seul brouillon en attente est conservé par profil de navigateur et par adresse du site. Évitez de préparer plusieurs captures dans plusieurs onglets en même temps.

Après une interruption réseau, utilisez **Réessayer le dépôt**. Après rechargement ou fermeture, utilisez **Reprendre le brouillon** dans l’espace privé. L’identifiant de dépôt est conservé pour reconnaître une répétition du même envoi. Vérifiez la liste des preuves si une réponse a été perdue.

Le brouillon n’est pas une sauvegarde serveur : les utilisateurs du même profil peuvent y accéder et l’effacement des données du navigateur le supprime. Déposez dans les 24 heures, avec la session de connexion ayant ouvert la capture. Une déconnexion ou expiration de session peut imposer une nouvelle capture. Un brouillon repris depuis l’accueil n’est pas automatiquement rattaché à son ancien dossier : rattachez la preuve depuis le dossier après dépôt.

**Télécharger ma capture locale** permet de garder les octets sur l’appareil ; cela ne crée pas de preuve serveur. **Supprimer le brouillon local** efface la copie du navigateur. Après confirmation serveur, le brouillon est supprimé automatiquement ; un message signale un échec de cette suppression.

Si l’engagement de l’empreinte échoue après l’encodage, un téléchargement de secours reste disponible dans la fenêtre de capture. Ce fichier n’est pas encore un brouillon récupérable après fermeture. Si le stockage local est indisponible, le site l’indique : gardez la fenêtre ouverte jusqu’au dépôt.

## Lire les cinq contrôles

- **Intégrité** : recalcul serveur des empreintes du fichier et du manifeste à l’ouverture de la preuve.
- **Signature** : signature technique Ed25519 contrôlée avec une clé connue de l’installation. Elle n’authentifie pas l’identité civile du déposant.
- **Horodatage** : reçu externe s’il existe ; sinon absence explicite. La date de réception serveur et l’heure déclarée par l’appareil restent distinctes.
- **Localisation** : coordonnées, précision annoncée et heure du relevé. Le lieu réel n’est pas authentifié.
- **Origine** : caméra navigateur, caméra Android ou fichier importé pour les anciens dossiers. Cette origine reste déclarative.

Le bouton **Voir les détails techniques** affiche notamment l’empreinte de clé et celle du fichier. Aucun de ces contrôles ne garantit la réalité de la scène photographiée.

## Partager et vérifier

Dans une preuve, ouvrez **Lien de vérification des empreintes**. Choisissez 7, 30 ou 90 jours. La localisation est masquée par défaut ; cochez son partage uniquement si vous souhaitez exposer coordonnées, précision et date du relevé.

Activez le lien, puis téléchargez le **Rapport PDF** : le QR code du rapport ouvre la page de vérification. Cette page montre les empreintes, l’horodatage, le résultat du contrôle serveur et éventuellement la localisation autorisée. Elle ne donne pas accès à l’original ni à sa description.

Le destinataire peut sélectionner une copie pour comparer ses octets dans son navigateur, sans envoyer le fichier au serveur. Une correspondance valide l’empreinte, pas la scène. Une différence peut venir d’une recompression ou d’une modification.

**Révoquer le lien** bloque les prochains accès. Pour modifier la durée ou la visibilité, révoquez puis créez un nouveau lien et téléchargez un nouveau rapport. Les anciens QR codes ne fonctionneront plus. Les liens historiques restent identifiés comme sans expiration jusqu’à leur révocation. Les copies déjà téléchargées ne sont pas rappelées.

Le partage d’une version complète depuis **Dossiers multi-fichiers** reste distinct : son écran énumère les informations exposées, dont la localisation et l’adresse, et propose l’inclusion des originaux. Utilisez le lien de vérification d’une preuve lorsque vous souhaitez limiter les informations partagées.

## Périmètre des tests

Les tests ciblent les API d’intégrité et de partage (authentification, GPS masqué, expiration, rotation, révocation et fichier corrompu) et le parcours navigateur (capture simulée, échec réseau, reprise, dépôt, comparaison, exports et dossiers). Les permissions et la caméra d’un téléphone physique doivent toujours être vérifiées sur cet appareil.
