# Vérification Bitcoin gratuite

Sans `ANCHOR_SERVICE_URL`, les dossiers utilisent OpenTimestamps sur Bitcoin. Les calendriers publics Alice et Bob sont gratuits, sans compte, clé API ni portefeuille. Un prestataire explicitement configuré reste utilisable pour les installations existantes.

Depuis un dossier contenant une capture, autoriser l’ancrage de son empreinte puis demander l’ancrage blockchain. Le serveur envoie uniquement un engagement SHA-256 avec un nonce aléatoire, jamais le média, les coordonnées ou le manifeste. Le reçu standard `dossier.json.ots` est enregistré pour cette version immuable et inclus dans l’export ZIP.

Le premier reçu est **en attente**, pas confirmé. Après quelques heures, « Vérifier la preuve Bitcoin » récupère les branches complètes depuis les calendriers autorisés. Le serveur recalcule les opérations cryptographiques OTS, vérifie le SHA-256 du manifeste et la racine de Merkle dans l’en-tête Bitcoin. Le hash de cet en-tête doit correspondre au bloc indiqué à cette hauteur par Blockstream et mempool.space. Le statut confirmé exige au moins six confirmations selon les deux explorateurs. Une nouvelle version du dossier nécessite son propre ancrage.

Les requêtes externes ont un délai et une taille limités ; les redirections et les URL de calendrier arbitraires sont refusées. Un échec réseau reste réessayable et ne produit jamais de confirmation. Les reçus sont conservés même si un contrôle ultérieur échoue.

Cette vérification dépend des explorateurs publics pour la chaîne canonique. Pour vérifier indépendamment, extraire `dossier.json` et `dossier.json.ots`, puis utiliser le client officiel OpenTimestamps avec son propre nœud Bitcoin :

```sh
ots upgrade dossier.json.ots
ots verify dossier.json.ots
```

L’ancrage démontre l’existence de l’engagement au plus tard au moment du bloc ; il ne certifie ni le lieu réel, ni l’heure de prise de vue, ni l’authenticité de la scène.

Références : [OpenTimestamps](https://opentimestamps.org/), [client officiel](https://github.com/opentimestamps/opentimestamps-client).
