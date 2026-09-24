import { CATEGORY_LABELS, EMAIL_CATEGORIES, EMAIL_TEMPLATE_IDS, EMAILS, type EmailTemplateId, UNSUBSCRIBABLE } from '../../src/platform/mail/catalog';
import { renderEmail } from '../../src/platform/mail/layout';
import { describeDevice } from '../../src/modules/identity/auth.service';
import { SAMPLE_EMAIL_DATA } from '../../src/platform/mail/samples';

const URLS = { app: 'rekonect://', partners: 'https://partenaires.rekonect.app', admin: 'https://admin.rekonect.app' };

describe('Catalogue des emails', () => {
  it('couvre parents, partenaires et équipe : plus de 45 modèles, chacun avec un exemple', () => {
    expect(EMAIL_TEMPLATE_IDS.length).toBeGreaterThanOrEqual(45);
    const audiences = EMAIL_TEMPLATE_IDS.map((id) => EMAILS[id].audience);
    expect(audiences.filter((a) => a === 'partner').length).toBeGreaterThanOrEqual(20);
    expect(audiences.filter((a) => a === 'parent').length).toBeGreaterThanOrEqual(18);
    expect(audiences.filter((a) => a === 'admin').length).toBeGreaterThanOrEqual(5);
    expect(Object.keys(SAMPLE_EMAIL_DATA).sort()).toEqual([...EMAIL_TEMPLATE_IDS].sort());
  });

  it.each(EMAIL_TEMPLATE_IDS)('%s : objet, aperçu, titre, HTML et texte', (id) => {
    const def = EMAILS[id];
    expect(EMAIL_CATEGORIES).toContain(def.category);
    const content = (def.render as (d: unknown, u: typeof URLS) => ReturnType<typeof def.render>)(SAMPLE_EMAIL_DATA[id as EmailTemplateId], URLS);
    expect(content.subject.length).toBeGreaterThan(5);
    expect(content.subject.length).toBeLessThanOrEqual(90);
    expect(content.preheader.length).toBeGreaterThan(0);
    expect(content.title.length).toBeGreaterThan(3);
    const { html, text } = renderEmail(content, { reason: 'test', unsubscribeUrl: UNSUBSCRIBABLE.includes(def.category) ? 'https://api/unsub' : null });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).not.toContain('undefined');
    expect(text).not.toContain('undefined');
    expect(text).toContain(content.title);
    // Liens de l'app bien formés (rekonect://parent/…, jamais rekonect:/parent).
    expect(html).not.toMatch(/rekonect:\/[^/]/);
    if (content.cta) expect(text).toContain(content.cta.url);
  });

  it('échappe le contenu fourni par les utilisateurs', () => {
    const content = EMAILS['partner.offer_rejected'].render({ offerTitle: '<script>alert(1)</script>', offerId: 'x', reason: '"><img src=x>', changesOnly: false }, URLS);
    const { html } = renderEmail(content, { reason: 'test' });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('désinscription : seulement pour bilans, bons et conseils ; jamais sécurité ni facturation', () => {
    expect([...UNSUBSCRIBABLE].sort()).toEqual(['offers', 'reports', 'tips']);
    for (const id of EMAIL_TEMPLATE_IDS) {
      const c = EMAILS[id].category;
      if (['security', 'billing', 'account'].includes(c)) expect(UNSUBSCRIBABLE).not.toContain(c);
    }
    expect(Object.keys(CATEGORY_LABELS).sort()).toEqual([...EMAIL_CATEGORIES].sort());
    const withLink = renderEmail(EMAILS['parent.weekly_report'].render(SAMPLE_EMAIL_DATA['parent.weekly_report'], URLS), { reason: 'r', unsubscribeUrl: 'https://u' });
    expect(withLink.html).toContain('Ne plus recevoir ce type d’email');
    expect(withLink.text).toContain('Se désinscrire : https://u');
  });

  it('ton des emails famille : jamais culpabilisant', () => {
    const text = JSON.stringify(EMAILS['parent.inactive_nudge'].render({ childNames: ['Emma'], days: 15, idea: 'Vélo (20 min)' }, URLS));
    expect(text).not.toMatch(/trop d.écran|vous devriez|attention/i);
    expect(text).toContain('C’est normal');
  });

  it('libellé d’appareil pour l’alerte de nouvelle connexion', () => {
    expect(describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Version/17.0 Mobile Safari/604.1')).toBe('iPhone · Safari');
    expect(describeDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0 Safari/537.36')).toBe('Mac · Chrome');
    expect(describeDevice('Mozilla/5.0 (Linux; Android 14) AppleWebKit Capacitor Chrome/120')).toBe('Android · App Rekonect');
    expect(describeDevice('curl/8')).toBe('Appareil inconnu');
  });
});
