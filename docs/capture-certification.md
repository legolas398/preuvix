# Capture documentée et attestation technique

Le protocole accepte une photo (JPEG, PNG, WebP, 10 Mo) ou une vidéo (MP4/WebM, 50 Mo, 120 s, 3840 × 2160 maximum). La caméra du navigateur produit une photo JPEG ou un enregistrement de 60 s maximum. Le microphone est désactivé par défaut. HTTPS ou localhost est nécessaire pour la caméra et le SHA-256 ; l’adresse réseau HTTP ne permet pas ces fonctions.

1. L’utilisateur connecté ouvre la caméra. Le serveur émet une session aléatoire liée à sa connexion, valable dix minutes.
2. Le navigateur encode le média, calcule son SHA-256 et engage cette empreinte auprès du serveur. Cet engagement est immuable et idempotent. Les dates du navigateur sont explicitement déclaratives ; la date de réception du serveur n’est pas un horodatage indépendant.
3. Le déposant relit le média, ajoute le contexte et, facultativement, une déclaration de bonne foi avec un auteur déclaré. L’identité n’est pas vérifiée. Le dépôt doit avoir lieu dans les 24 heures de l’engagement.
4. Le serveur recalcule l’empreinte, vérifie la session et décode le média. Il conserve les octets reçus sans conversion, fige le manifeste et signe ses octets exacts avec Ed25519. Un import reçoit aussi une attestation d’intégrité, mais sans attestation de session de capture.
5. Si un prestataire RFC 3161 est configuré, le manifeste est soumis à l’horodatage existant. Sinon le statut reste « en attente ». Aucune date qualifiée n’est inventée.
6. Le PDF imprimable décrit les contrôles, les déclarations, les empreintes, la signature et les limites. Le ZIP contient l’original, le manifeste exact, sa signature, la clé publique, l’attestation JSON, le PDF et, si obtenu, le jeton d’horodatage.

## Vérification indépendante

Extraire le ZIP puis exécuter `node scripts/verify-export.mjs chemin-du-dossier`. Un troisième argument facultatif désigne une clé publique obtenue par un canal de confiance. Le script vérifie les octets de l’original et la signature du manifeste, mais pas le jeton RFC 3161. Pour ce dernier, suivre le fichier LISEZ-MOI dans le ZIP avec une chaîne de confiance indépendante.

La signature porte sur `manifest.json`, pas sur le PDF. La clé est auto-générée pour cette installation, dans `DATA_DIR/attestation-ed25519.pem`. Sauvegarder cette clé de manière confidentielle avec les données ; ne jamais la publier. La clé publique et son empreinte sont disponibles sur `/api/certification/key`. Une clé incluse dans un ZIP ne prouve pas, à elle seule, l’identité de son signataire. Ce mécanisme n’est ni un certificat d’identité émis par un tiers ni une signature qualifiée eIDAS.

## IA et examen contradictoire

Les métadonnées d’image et les tags du conteneur et des flux vidéo sont examinés comme indices non authentifiés. Ils peuvent être absents, modifiés ou falsifiés. Leur présence ne suffit pas à conclure à une génération IA et leur absence ne prouve pas une scène réelle. Aucun détecteur visuel ou audio IA, validation C2PA, reconnaissance faciale, note de crédibilité ni exclusion automatique selon un indice IA n’est effectué.

Chaque nouveau dépôt reçoit une évaluation `preuvix-media-v1`, figée dans le manifeste avant signature et affichée dans le dossier et le PDF. Un indice reconnu ou un marqueur C2PA impose le statut `review_required` (examen recommandé, sans rejet du dépôt). Sinon, une session de capture vérifiée donne `capture_documented`, et un import `integrity_only`. Dans tous les cas, `aiAuthenticity` reste `not_established`. Les anciens manifestes ne sont pas modifiés. Le statut d’horodatage reste indépendant et ne transforme pas cette évaluation en certificat « sans IA ».

Une caméra virtuelle, une injection dans le navigateur, une scène mise en scène ou un écran filmé restent possibles. L’engagement lie une session à une empreinte, sans attester un capteur physique. Le serveur et sa clé demeurent sous le contrôle de l’exploitant. Une expertise humaine ou un constat peut compléter le dossier selon l’enjeu.

L’intégrité et la traçabilité documentent le dossier ; elles ne garantissent ni la licéité de la collecte, ni la réalité des faits, ni la recevabilité. L’article 1366 concerne les conditions de force probante de l’écrit électronique, pas une admission automatique de toute photo ou vidéo.

Sources : [Code civil, article 1366](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032042461), [NIST AI 100-4](https://www.nist.gov/publications/reducing-risks-posed-synthetic-content-overview-technical-approaches-digital-content), [MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder), [FFprobe](https://ffmpeg.org/ffprobe.html).
