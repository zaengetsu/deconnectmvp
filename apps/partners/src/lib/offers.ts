import { type Offer, formatNumber, formatShortDate } from '@rekonect/api-client';

/** « 640 / 1 500 » et pourcentage d'utilisation du stock. */
export function usageLine(o: Pick<Offer, 'usage'>) {
  const total = o.usage.total;
  return { used: total ? `${formatNumber(o.usage.used)} / ${formatNumber(total)}` : `${formatNumber(o.usage.used)} obtenus`, pct: o.usage.percent == null ? '—' : `${o.usage.percent}%`, width: `${o.usage.percent ?? 0}%` };
}

/** « 1 oct. → 31 déc. », « jusqu'au 30 juin », « sans limite de date ». */
export function offerDates(o: Pick<Offer, 'startsAt' | 'endsAt'>) {
  if (o.startsAt && o.endsAt) return `${formatShortDate(o.startsAt)} → ${formatShortDate(o.endsAt)}`;
  if (o.endsAt) return `jusqu'au ${formatShortDate(o.endsAt)}`;
  if (o.startsAt) return `dès le ${formatShortDate(o.startsAt)}`;
  return 'sans limite de date';
}
