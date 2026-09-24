/**
 * Saisie en caisse : code tapé à la main (« rk4m 82qa »), ou contenu du QR code lu par une douchette
 * (« rekonect:voucher:RK4M-82QA »). Renvoie le code normalisé « RK4M-82QA » ou la saisie en majuscules.
 */
export function parseVoucherInput(raw: string): string {
  const text = raw.trim().replace(/^rekonect:voucher:/i, '');
  const compact = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^RK[A-Z0-9]{0,6}$/.test(compact) && compact.length > 4) return `${compact.slice(0, 4)}-${compact.slice(4)}`;
  return compact.startsWith('RK') ? compact : text.toUpperCase();
}
