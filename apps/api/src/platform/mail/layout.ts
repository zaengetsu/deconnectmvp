// Mise en page commune des emails Rekonect : charte (indigo, corail, crème), tableaux compatibles
// clients mail, version texte systématique, préheader, pied de page avec désinscription si pertinent.

export const BRAND = {
  ink: '#16182B',
  text: '#2B2D42',
  muted: '#8A8FA6',
  indigo: '#3C41A8',
  indigoSoft: '#ECEDFA',
  coral: '#FF9469',
  coralSoft: '#FFF1EA',
  cream: '#F6F4F1',
  green: '#2E9E6B',
  greenSoft: '#E6F5EE',
  red: '#D8556B',
  redSoft: '#FBEAED',
  line: '#ECE9E4',
} as const;

export type Tone = 'default' | 'success' | 'warning' | 'danger' | 'info';

export type EmailBlock =
  | { kind: 'p'; text: string }
  | { kind: 'stats'; items: { label: string; value: string; hint?: string }[] }
  | { kind: 'rows'; rows: { label: string; value: string }[] }
  | { kind: 'list'; items: string[] }
  | { kind: 'note'; text: string; tone?: Tone }
  | { kind: 'code'; label: string; value: string }
  | { kind: 'divider' };

export interface EmailContent {
  subject: string;
  /** Texte d'aperçu affiché par les messageries à côté de l'objet. */
  preheader: string;
  /** Petit libellé au-dessus du titre (ex. « Portail partenaires »). */
  eyebrow?: string;
  title: string;
  tone?: Tone;
  blocks: EmailBlock[];
  cta?: { label: string; url: string };
  secondary?: { label: string; url: string };
}

export interface EmailFooter {
  /** Pourquoi la personne reçoit cet email. */
  reason: string;
  unsubscribeUrl?: string | null;
}

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Texte → HTML : échappement puis retours à la ligne. */
const rich = (s: string) => esc(s).replace(/\n/g, '<br>');

const TONES: Record<Tone, { bg: string; fg: string; bar: string }> = {
  default: { bg: BRAND.cream, fg: BRAND.text, bar: BRAND.muted },
  info: { bg: BRAND.indigoSoft, fg: BRAND.indigo, bar: BRAND.indigo },
  success: { bg: BRAND.greenSoft, fg: '#1F6E4B', bar: BRAND.green },
  warning: { bg: BRAND.coralSoft, fg: '#A2502F', bar: BRAND.coral },
  danger: { bg: BRAND.redSoft, fg: '#9C2F43', bar: BRAND.red },
};

function block(b: EmailBlock): string {
  switch (b.kind) {
    case 'p':
      return `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${BRAND.text}">${rich(b.text)}</p>`;
    case 'stats': {
      const width = Math.floor(100 / Math.max(1, b.items.length));
      const cells = b.items
        .map(
          (i, n) => `<td width="${width}%" style="padding:0 ${n < b.items.length - 1 ? 8 : 0}px 0 0;vertical-align:top">
<div style="background:${BRAND.cream};border-radius:14px;padding:14px 12px">
<div style="font-size:22px;font-weight:800;letter-spacing:-.02em;color:${BRAND.ink}">${esc(i.value)}</div>
<div style="font-size:12px;font-weight:700;color:${BRAND.muted};margin-top:2px">${esc(i.label)}</div>${i.hint ? `<div style="font-size:11px;color:${BRAND.muted};margin-top:4px">${esc(i.hint)}</div>` : ''}
</div></td>`,
        )
        .join('');
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 16px;border-collapse:separate"><tr>${cells}</tr></table>`;
    }
    case 'rows':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border-collapse:collapse">${b.rows
        .map(
          (r) => `<tr><td style="padding:9px 0;border-bottom:1px solid ${BRAND.line};font-size:13px;color:${BRAND.muted}">${esc(r.label)}</td><td align="right" style="padding:9px 0;border-bottom:1px solid ${BRAND.line};font-size:14px;font-weight:700;color:${BRAND.ink}">${esc(r.value)}</td></tr>`,
        )
        .join('')}</table>`;
    case 'list':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px">${b.items
        .map(
          (i) => `<tr><td width="18" style="vertical-align:top;padding:4px 0"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${BRAND.coral};margin-top:7px"></span></td><td style="padding:4px 0;font-size:15px;line-height:1.5;color:${BRAND.text}">${rich(i)}</td></tr>`,
        )
        .join('')}</table>`;
    case 'note': {
      const t = TONES[b.tone ?? 'default'];
      return `<div style="margin:0 0 16px;background:${t.bg};border-left:3px solid ${t.bar};border-radius:10px;padding:12px 14px;font-size:14px;line-height:1.5;color:${t.fg}">${rich(b.text)}</div>`;
    }
    case 'code':
      return `<div style="margin:0 0 16px;text-align:center;background:${BRAND.cream};border-radius:14px;padding:16px">
<div style="font-size:11px;font-weight:700;letter-spacing:.12em;color:${BRAND.muted};text-transform:uppercase">${esc(b.label)}</div>
<div style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:24px;font-weight:700;letter-spacing:.08em;color:${BRAND.ink};margin-top:6px">${esc(b.value)}</div></div>`;
    case 'divider':
      return `<div style="height:1px;background:${BRAND.line};margin:8px 0 18px"></div>`;
  }
}

function blockText(b: EmailBlock): string {
  switch (b.kind) {
    case 'p':
      return b.text;
    case 'stats':
      return b.items.map((i) => `${i.label} : ${i.value}${i.hint ? ` (${i.hint})` : ''}`).join('\n');
    case 'rows':
      return b.rows.map((r) => `${r.label} : ${r.value}`).join('\n');
    case 'list':
      return b.items.map((i) => `- ${i}`).join('\n');
    case 'note':
      return b.text;
    case 'code':
      return `${b.label} : ${b.value}`;
    case 'divider':
      return '---';
  }
}

export function renderEmail(content: EmailContent, footer: EmailFooter): { html: string; text: string } {
  const tone = TONES[content.tone ?? 'info'];
  const button = content.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 6px"><tr><td style="border-radius:999px;background:${BRAND.ink}">
<a href="${esc(content.cta.url)}" style="display:inline-block;padding:14px 26px;font-size:14px;font-weight:800;color:#FFFFFF;text-decoration:none;border-radius:999px">${esc(content.cta.label)}</a></td></tr></table>`
    : '';
  const secondary = content.secondary
    ? `<p style="margin:10px 0 0;font-size:13px"><a href="${esc(content.secondary.url)}" style="color:${BRAND.indigo};font-weight:700">${esc(content.secondary.label)}</a></p>`
    : '';
  const unsubscribe = footer.unsubscribeUrl
    ? `<br><a href="${esc(footer.unsubscribeUrl)}" style="color:${BRAND.muted};text-decoration:underline">Ne plus recevoir ce type d’email</a>`
    : '';

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(content.subject)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.cream};font-family:Manrope,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(content.preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.cream}"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 4px 18px">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="white-space:nowrap;line-height:0;padding:0"><span style="display:inline-block;width:16px;height:16px;border:2.5px solid ${BRAND.indigo};border-radius:50%;vertical-align:middle"></span><span style="display:inline-block;width:16px;height:16px;border:2.5px solid ${BRAND.coral};border-radius:50%;margin-left:-8px;vertical-align:middle"></span></td>
<td style="padding-left:8px;font-size:18px;font-weight:800;letter-spacing:-.03em;color:${BRAND.ink}">Rekonect</td>
</tr></table></td></tr>
<tr><td style="background:#FFFFFF;border-radius:22px;padding:30px 28px 26px;border:1px solid ${BRAND.line}">
<div style="height:4px;width:44px;border-radius:4px;background:${tone.bar};margin-bottom:18px"></div>
${content.eyebrow ? `<div style="font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:${BRAND.muted};margin-bottom:8px">${esc(content.eyebrow)}</div>` : ''}
<h1 style="margin:0 0 16px;font-size:23px;line-height:1.25;font-weight:800;letter-spacing:-.03em;color:${BRAND.ink}">${esc(content.title)}</h1>
${content.blocks.map(block).join('\n')}
${button}${secondary}
</td></tr>
<tr><td style="padding:18px 8px 0;font-size:12px;line-height:1.6;color:${BRAND.muted};text-align:center">
${esc(footer.reason)}${unsubscribe}<br>Rekonect · Moins d’écran, plus de vrai
</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    content.title,
    '',
    ...content.blocks.map(blockText).flatMap((t) => [t, '']),
    ...(content.cta ? [`${content.cta.label} : ${content.cta.url}`, ''] : []),
    ...(content.secondary ? [`${content.secondary.label} : ${content.secondary.url}`, ''] : []),
    '—',
    footer.reason,
    ...(footer.unsubscribeUrl ? [`Se désinscrire : ${footer.unsubscribeUrl}`] : []),
  ].join('\n');

  return { html, text };
}
