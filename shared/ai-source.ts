// Exact registered source identifiers; arbitrary URLs containing the same word
// must not be treated as C2PA declarations about the asset.
export function isSyntheticSource(value: string): boolean {
  return /^https?:\/\/cv\.iptc\.org\/newscodes\/digitalsourcetype\/(trainedAlgorithmicMedia|compositedWithTrainedAlgorithmicMedia|compositeWithTrainedAlgorithmicMedia|algorithmicMedia|compositeSynthetic)$/.test(
    value,
  );
}
