/** Recherche texte tolérante (minuscules, sans accents) pour les catalogues. */
/** Normalise pour la recherche : minuscules, sans accents. */
export const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export const matches = (query: string, ...fields: (string | null | undefined)[]) => {
  const q = norm(query.trim());
  if (!q) return true;
  return fields.some(f => f && norm(f).includes(q));
};

