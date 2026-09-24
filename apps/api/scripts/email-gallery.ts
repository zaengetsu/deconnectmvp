// Génère une galerie HTML de tous les emails automatiques (données d'exemple) : relecture produit et design.
// Usage : pnpm --filter @rekonect/api email:gallery [chemin de sortie]
import { writeFileSync } from 'node:fs';
import { CATEGORY_LABELS, EMAIL_TEMPLATE_IDS, EMAILS, type EmailCategory, type EmailUrls, UNSUBSCRIBABLE } from '../src/platform/mail/catalog';
import { esc, renderEmail } from '../src/platform/mail/layout';
import { SAMPLE_EMAIL_DATA } from '../src/platform/mail/samples';

const urls: EmailUrls = { app: 'rekonect://', partners: 'https://partenaires.rekonect.app', admin: 'https://admin.rekonect.app' };
const AUDIENCES: Record<string, string> = { any: 'Tous les comptes', parent: 'Parents', partner: 'Partenaires', admin: 'Équipe Rekonect' };

export function buildGallery(): { html: string; count: number } {
  const items = EMAIL_TEMPLATE_IDS.map((id) => {
    const def = EMAILS[id];
    const content = (def.render as (d: unknown, u: EmailUrls) => ReturnType<typeof def.render>)(SAMPLE_EMAIL_DATA[id], urls);
    const unsub = UNSUBSCRIBABLE.includes(def.category) ? 'https://api.rekonect.app/v1/emails/unsubscribe?…' : null;
    const { html } = renderEmail(content, { reason: 'Vous recevez cet email car vous avez un compte Rekonect.', unsubscribeUrl: unsub });
    return { id, audience: def.audience, category: def.category as EmailCategory, subject: content.subject, preheader: content.preheader, html, unsub: !!unsub };
  });
  const groups = ['any', 'parent', 'partner', 'admin'].map((a) => ({ a, list: items.filter((i) => i.audience === a) }));
  const html = `<title>Emails Rekonect</title>
<style>
:root{--bg:#F6F4F1;--card:#fff;--ink:#16182B;--muted:#8A8FA6;--line:#ECE9E4;--indigo:#3C41A8;--coral:#FF9469}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#121320;--card:#1C1D2E;--ink:#F2F2F7;--muted:#9A9DB3;--line:#2A2C40}}
:root[data-theme="dark"]{--bg:#121320;--card:#1C1D2E;--ink:#F2F2F7;--muted:#9A9DB3;--line:#2A2C40}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Manrope,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif}
header{padding:28px 16px 8px;max-width:1180px;margin:0 auto}h1{font-size:28px;letter-spacing:-.03em;margin:0}
.lead{color:var(--muted);margin:6px 0 0;font-size:14px;line-height:1.5}
nav{position:sticky;top:0;z-index:2;background:var(--bg);border-bottom:1px solid var(--line)}
nav div{max-width:1180px;margin:0 auto;padding:10px 16px;display:flex;gap:8px;flex-wrap:wrap}
nav a{font-size:13px;font-weight:700;color:var(--ink);text-decoration:none;border:1px solid var(--line);border-radius:999px;padding:6px 12px;background:var(--card)}
main{max-width:1180px;margin:0 auto;padding:8px 16px 48px}
h2{font-size:18px;margin:28px 0 12px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,340px),1fr));gap:14px}
details{background:var(--card);border:1px solid var(--line);border-radius:16px;overflow:hidden}
summary{list-style:none;cursor:pointer;padding:14px 16px}summary::-webkit-details-marker{display:none}
.id{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:var(--muted)}
.subj{font-weight:800;font-size:14px;margin:4px 0 2px;line-height:1.35}.pre{font-size:12px;color:var(--muted);line-height:1.4}
.tags{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}.tag{font-size:11px;font-weight:700;border-radius:999px;padding:3px 8px;background:var(--bg);color:var(--muted)}
.tag.u{color:var(--indigo)}
iframe{display:block;width:100%;height:620px;border:0;border-top:1px solid var(--line);background:#F6F4F1}
</style>
<header><h1>Emails automatiques Rekonect</h1><p class="lead">${items.length} modèles, rendus avec des données d’exemple. Cliquez sur un email pour l’ouvrir. Les emails de sécurité, de compte et de facturation ne proposent pas de désinscription.</p></header>
<nav><div>${groups.filter((g) => g.list.length).map((g) => `<a href="#${g.a}">${AUDIENCES[g.a]} · ${g.list.length}</a>`).join('')}</div></nav>
<main>${groups
    .filter((g) => g.list.length)
    .map(
      (g) => `<h2 id="${g.a}">${AUDIENCES[g.a]}</h2><div class="grid">${g.list
        .map(
          (i) => `<details><summary><div class="id">${esc(i.id)}</div><div class="subj">${esc(i.subject)}</div><div class="pre">${esc(i.preheader)}</div>
<div class="tags"><span class="tag">${esc(CATEGORY_LABELS[i.category])}</span>${i.unsub ? '<span class="tag u">désinscription possible</span>' : ''}</div></summary>
<iframe loading="lazy" title="${esc(i.subject)}" srcdoc="${esc(i.html)}"></iframe></details>`,
        )
        .join('')}</div>`,
    )
    .join('')}</main>`;
  return { html, count: items.length };
}

if (require.main === module) {
  const out = process.argv[2] ?? 'email-gallery.html';
  const { html, count } = buildGallery();
  writeFileSync(out, html);
  console.log(`${count} emails → ${out}`);
}
