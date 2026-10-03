// Short, human-readable dossier reference shared by the interface and the PDF.
export const shortId = (id: string) => `PRX-${id.slice(0, 8).toUpperCase()}`;
