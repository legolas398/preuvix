import type { Provenance } from '../shared/types';

export function inspectVideoMetadata(tags: unknown): Provenance {
  const text = JSON.stringify(tags ?? {}).toLowerCase();
  const tools = [
    'Midjourney',
    'DALL-E',
    'Stable Diffusion',
    'ComfyUI',
    'Adobe Firefly',
    'Automatic1111',
    'Runway',
    'Sora',
    'Synthesia',
  ];
  const signals = tools
    .filter((tool) => text.includes(tool.toLowerCase()))
    .map((tool) => `Métadonnée mentionnant ${tool}`);
  if (text.includes('trainedalgorithmicmedia'))
    signals.push('Marqueur déclaratif « trainedAlgorithmicMedia »');
  return {
    result: signals.length ? 'signals_found' : 'inconclusive',
    signals,
    credentialsDetected: text.includes('c2pa'),
    explanation:
      'Vidéo décodée et métadonnées du conteneur examinées. Ces indices non authentifiés peuvent être supprimés ou falsifiés. Aucun détecteur visuel ou audio IA et aucune validation de signature C2PA ne sont exécutés. Aucun résultat ne prouve une scène réelle ou une absence d’IA.',
  };
}
