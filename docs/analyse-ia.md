# Analyse des indices IA

Les dépôts photo et la vérification photo partagent la même extraction des indices : EXIF/XMP et blocs PNG tEXt, zTXt et iTXt. La lecture PNG vérifie les CRC et limite le nombre, la taille et la décompression des blocs. Les paramètres de génération Stable Diffusion et les nœuds de workflow ComfyUI sont reconnus sans exporter les prompts ou le workflow brut.

La vérification affiche trois résultats : déclaration de synthèse signée et liée au fichier, indices non authentifiés à examiner, ou origine indéterminée. La confiance dans le signataire reste distincte. Les déclarations C2PA de retouche partielle `compositedWithTrainedAlgorithmicMedia` sont reconnues ; seules les actions structurées du manifeste actif servent à classifier sa source. Une simple mention dans le titre ou un ingrédient ne devient pas une déclaration sur l’image entière.

Cette analyse ne classe pas visuellement les pixels et ne mesure pas une probabilité d’IA. Des métadonnées supprimées, une photo d’un écran ou une image générée sans déclaration peuvent rester indéterminées. Les jeux de tests synthétiques vérifient les règles et la confidentialité, pas une précision de détection sur un corpus de photos réelles.

L’analyse reste incluse dans Free. Premium ajoute la préparation guidée d’une transmission et les liens révocables ; il ne promet pas de meilleure authenticité. Son tarif reste à venir, sans paiement activé.

Références de format : [PNG, W3C](https://www.w3.org/TR/png-3/) et [actions C2PA](https://spec.c2pa.org/specifications/specifications/2.2/guidance/Guidance.html).
