# Capture documentée et attestation technique

Le protocole accepte une photo (JPEG, PNG, WebP, 10 Mo) ou une vidéo (MP4/WebM, 50 Mo, 120 s, 3840 × 2160 maximum). La caméra du navigateur produit une photo JPEG ou un enregistrement de 60 s maximum. Le microphone est désactivé par défaut. HTTPS ou localhost est nécessaire pour la caméra et le SHA-256 ; l’adresse réseau HTTP ne permet pas ces fonctions.

1. L’utilisateur connecté ouvre la caméra. Le serveur émet une session aléatoire liée à sa connexion et un **défi en direct** : un code de 6 caractères et un geste tirés au hasard. Le code doit être écrit à la main et montré dans l’image avec le geste. Le serveur refuse tout nouvel engagement après 180 secondes, même si la session est encore conservée. L’engagement doit aussi renvoyer le nonce exact de la session.
2. Le navigateur encode le média, calcule son SHA-256 et engage cette empreinte auprès du serveur. Cet engagement est immuable et idempotent. Les dates du navigateur sont explicitement déclaratives ; la date de réception du serveur n’est pas un horodatage indépendant.
3. Le déposant relit le média, ajoute le contexte et, facultativement, une déclaration de bonne foi avec un auteur déclaré. L’identité n’est pas vérifiée. Le dépôt doit avoir lieu dans les 24 heures de l’engagement.
4. Le serveur recalcule l’empreinte, vérifie la session et décode le média. Il conserve les octets reçus sans conversion, fige le manifeste et signe ses octets exacts avec Ed25519. Un import reçoit aussi une attestation d’intégrité, mais sans attestation de session de capture.
5. Si un prestataire RFC 3161 est configuré, le manifeste est soumis à l’horodatage existant. Sinon le statut reste « en attente ». Aucune date qualifiée n’est inventée.
6. Le PDF imprimable décrit les contrôles, les déclarations, les empreintes, la signature et les limites. Le ZIP contient l’original, le manifeste exact, sa signature, la clé publique, l’attestation JSON, le PDF et, si obtenu, le jeton d’horodatage.

## Défi en direct

Les dates déclarées sont contrôlées avec une tolérance de 30 secondes par rapport à l’émission et à la réception serveur. Une durée supérieure à 10 secondes pour la création de la photo ou 65 secondes pour la vidéo du navigateur est refusée. Une nouvelle capture exige une nouvelle session ; une répétition identique de l’engagement reste idempotente, mais une modification des coordonnées, du nonce ou du fichier est refusée. Les anciens dossiers restent lisibles ; recharger les onglets de capture ouverts avant cette mise à jour.

## Localisation consentie

La case « Inclure la localisation de la prise de vue » est décochée par défaut. Le navigateur demande une position fraîche (`maximumAge: 0`, précision élevée demandée, délai limité) juste avant la photo ou le démarrage de la vidéo, puis à la fin de la vidéo. Chaque relevé comprend latitude, longitude, précision annoncée en mètres et date de mesure. Aucun suivi en arrière-plan ni géocodage externe n’est effectué. Permission refusée, position indisponible et absence de demande sont des états explicites ; la capture reste possible.

Le serveur valide les bornes et refuse un relevé distant de plus de 30 secondes du moment de capture déclaré. Les données sont figées dans l’engagement, le manifeste signé et les exports, et affichées dans le dossier et le PDF. Elles ne sont pas exposées par la page publique de comparaison d’empreintes ni par les sélections Premium. Un export complet ou un ancien lien de consultation du dossier complet peut les divulguer à son destinataire.

La signature protège les coordonnées enregistrées contre une modification ultérieure ; elle n’authentifie ni un GPS matériel, ni le lieu réel de la scène. Une position simulée reste possible, et deux relevés vidéo ne reconstituent pas le trajet. Les fichiers importés et les dossiers antérieurs n’obtiennent pas de localisation rétroactive. Référence : [API Geolocation du navigateur](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition).

## Examen du défi

Un média préparé à l’avance, ou généré, ne peut pas contenir un code tiré au hasard quelques secondes avant sa capture. Le défi (code, geste, délai entre l’émission et l’engagement) est figé dans le manifeste signé. Si l’engagement intervient dans le délai, le dossier reçoit le statut `capture_challenged`. Sa présence dans l’image reste à **vérifier visuellement** : dans le dossier, un vérificateur indique « visible et conforme », « absent ou non conforme » ou « illisible ». Chaque vérification est signée séparément (Ed25519, `preuvix-challenge-review-v1`), liée à l’empreinte du manifeste, conservée en ajout seul et exportée dans `reviews.json`. Le nom du vérificateur est déclaré, pas authentifié. La vérification d’un tiers indépendant a plus de poids que celle du déposant.

Limites : une génération IA en temps réel pilotée par un opérateur, une caméra virtuelle ou un écran filmé peuvent reproduire un défi. Le défi élève le coût d’une falsification ; il ne l’exclut pas.

## Signatures d’appareil C2PA

Certains appareils (Leica, Sony, Nikon, Canon, Google Pixel, Samsung récents…) signent chaque prise de vue avec une clé matérielle (Content Credentials, C2PA). Chaque dépôt est validé avec la bibliothèque officielle `@contentauth/c2pa-node`, sans réseau : ni manifeste distant ni OCSP.

| Résultat          | Signification                                                                         | Effet                                                      |
| ----------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `trusted`         | Signature et liaisons intactes, signataire chaîné à une ancre de `C2PA_TRUST_ANCHORS` | `camera_signed` si la source déclarée est `digitalCapture` |
| `valid_untrusted` | Intact, mais signataire inconnu ou aucune ancre configurée                            | Aucun gain de statut                                       |
| `invalid`         | Fichier modifié après signature ou manifeste corrompu                                 | `review_required`                                          |
| IA déclarée       | `trainedAlgorithmicMedia`, `compositeWithTrainedAlgorithmicMedia`…                    | `review_required`                                          |

Pour activer la confiance, télécharger la liste de confiance C2PA officielle (PEM) et renseigner son chemin dans `C2PA_TRUST_ANCHORS`. Sans ancre, aucun signataire n’est présenté comme de confiance. La caméra du navigateur ne produit pas de C2PA : ce statut concerne les imports depuis un appareil compatible. Une signature d’appareil atteste l’origine matérielle, pas la scène : un écran ou une mise en scène photographiés restent possibles.

## Politique `preuvix-media-v2`

Statuts, du plus fort au plus faible : `camera_signed` (signature d’appareil de confiance), `capture_challenged` (session et défi dans le délai), `capture_documented` (session sans défi valable), `integrity_only` (import). `review_required` l’emporte dès qu’un indice IA, une signature C2PA invalide ou une IA déclarée apparaît. `aiAuthenticity` vaut `camera_provenance_verified` uniquement pour `camera_signed` ; sinon `not_established`. Les dossiers `preuvix-media-v1` restent lisibles sans modification.

## Copie protégée contre les détournements

Pour diffuser une photo, le dossier propose une **copie protégée** : les pixels de l’original reçoivent un filigrane invisible [TrustMark](https://github.com/adobe/trustmark) (Adobe, open source, variante Q, code correcteur BCH_5, 61 bits). Le code est tiré au hasard et lié au dossier. La copie est réencodée en JPEG sans métadonnées (GPS, appareil) ; l’original conservé n’est jamais modifié et reste la seule preuve.

« Vérifier une copie en circulation » lit le filigrane d’une image, retrouve le dossier d’origine et compare l’image à l’original sur une grille de 16 × 16 zones. Une recompression ou un redimensionnement restent au-dessus de 96 % de similarité dans la zone la plus modifiée ; une retouche locale, un recadrage ou un changement de couleurs descendent en dessous et sont signalés comme modifiés. Cette comparaison est indicative : une retouche très fine peut passer inaperçue, et un filigrane peut être effacé par une transformation lourde. Elle aide à démontrer qu’une image retouchée ou générée à partir de la vôtre en dérive ; elle ne détecte pas les images IA sans lien avec un dossier.

Les modèles (65 Mo) sont téléchargés au premier usage dans `DATA_DIR/models/trustmark` ou `TRUSTMARK_MODEL_DIR`. Les vidéos ne sont pas filigranées.

## Rapport de certification

Le PDF porte l’identité PREUVIX sur chaque page (dossier `PRX-…` et référence de rapport `PVX-XXXX-XXXX-XXXX`, dérivée du manifeste signé). Il présente un aperçu du média, la synthèse du dossier, le déroulé daté du processus (session, défi, engagement, réception, C2PA, signature, horodatage, vérification visuelle, copie protégée), les contrôles, les déclarations, la portée et les étapes de vérification, puis se termine par le bloc « Certificat PREUVIX » qui récapitule les identifiants, l’empreinte du manifeste, la clé de signature et la date d’émission. La signature porte sur `manifest.json`, pas sur le PDF.

## Lien pour un commissaire de justice

Depuis un dossier, « Envoyer à un commissaire de justice » crée un lien privé en lecture seule, valable 7, 30 ou 90 jours, nommé d’après son destinataire. Il ouvre une page sans compte avec le média, l’état de certification, les empreintes, le rapport PDF, l’export ZIP vérifiable et l’original. Seule l’empreinte du lien est conservée : il est affiché une seule fois, avec un e-mail prérempli. Chaque consultation est comptée et inscrite dans l’historique ; le lien peut être révoqué à tout moment et disparaît avec le dossier. Toute personne en possession du lien accède à l’original : ne le transmettre qu’au destinataire prévu.

## Gestion de la clé

- Clé Ed25519 auto-générée dans `DATA_DIR/attestation-ed25519.pem` (mode 600). Sauvegarder confidentiellement avec les données ; ne jamais la publier.
- Publication : l’empreinte (`keyId`, SHA-256 de la clé publique PEM) est servie sur `/api/certification/key`. La publier aussi par un canal indépendant (site, courrier, acte) pour que `scripts/verify-export.mjs dossier cle.pem` puisse établir le signataire.
- Contrôles : autocontrôle de signature Ed25519 au démarrage, empreinte active épinglée dans SQLite, refus d’une clé remplacée sans rotation explicite et refus à la lecture d’une attestation signée par une clé inconnue de l’installation. Le dossier propose la comparaison de l’empreinte avec une référence obtenue indépendamment. Un administrateur capable de modifier à la fois la base et les clés reste hors de cette protection.
- Une rotation génère et protège la nouvelle clé, archive l’ancienne et actualise l’empreinte active. Ne pas supprimer la clé pour en provoquer la régénération. Sauvegarder la base et les clés ensemble avant rotation ; si elle est interrompue entre le remplacement du fichier et la mise à jour de la base, restaurer cette sauvegarde cohérente avant de redémarrer. La rotation ne révoque pas rétroactivement les anciennes signatures.
- Rotation (annuelle, ou immédiate si compromission) : arrêter le serveur, lancer `npm run key:rotate`, redémarrer, publier la nouvelle empreinte. L’ancienne clé publique est ajoutée à `retired-keys.json` et exposée dans `retired` ; la clé privée archivée doit être détruite en cas de compromission. Les anciens dossiers restent vérifiables : chaque attestation embarque sa clé publique.

## Vérification indépendante

Extraire le ZIP puis exécuter `node scripts/verify-export.mjs chemin-du-dossier`. Un troisième argument facultatif désigne une clé publique obtenue par un canal de confiance. Le script vérifie les octets de l’original, la signature du manifeste et les vérifications de défi signées, mais pas le jeton RFC 3161. Pour ce dernier, suivre le fichier LISEZ-MOI dans le ZIP avec une chaîne de confiance indépendante.

La signature porte sur `manifest.json`, pas sur le PDF. La clé est auto-générée pour cette installation, dans `DATA_DIR/attestation-ed25519.pem`. Sauvegarder cette clé de manière confidentielle avec les données ; ne jamais la publier. La clé publique et son empreinte sont disponibles sur `/api/certification/key`. Une clé incluse dans un ZIP ne prouve pas, à elle seule, l’identité de son signataire. Ce mécanisme n’est ni un certificat d’identité émis par un tiers ni une signature qualifiée eIDAS.

## IA et examen contradictoire

Les métadonnées d’image et les tags du conteneur et des flux vidéo sont examinés comme indices non authentifiés. Ils peuvent être absents, modifiés ou falsifiés. Leur présence ne suffit pas à conclure à une génération IA et leur absence ne prouve pas une scène réelle. Aucun détecteur visuel ou audio IA, reconnaissance faciale, note de crédibilité ni exclusion automatique selon un indice IA n’est effectué : ces détecteurs sont contournables par recompression et se périment à chaque nouveau générateur.

L’évaluation `preuvix-media-v2` est figée dans le manifeste avant signature et affichée dans le dossier et le PDF. `review_required` recommande un examen, sans rejeter le dépôt. Le statut d’horodatage reste indépendant et ne transforme pas cette évaluation en certificat « sans IA ».

Une caméra virtuelle, une injection dans le navigateur, une scène mise en scène ou un écran filmé restent possibles. L’engagement lie une session à une empreinte, sans attester un capteur physique. Le serveur et sa clé demeurent sous le contrôle de l’exploitant. Une expertise humaine ou un constat peut compléter le dossier selon l’enjeu.

L’intégrité et la traçabilité documentent le dossier ; elles ne garantissent ni la licéité de la collecte, ni la réalité des faits, ni la recevabilité. L’article 1366 concerne les conditions de force probante de l’écrit électronique, pas une admission automatique de toute photo ou vidéo.

Sources : [Code civil, article 1366](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032042461), [NIST AI 100-4](https://www.nist.gov/publications/reducing-risks-posed-synthetic-content-overview-technical-approaches-digital-content), [MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder), [FFprobe](https://ffmpeg.org/ffprobe.html).
