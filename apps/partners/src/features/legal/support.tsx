'use client';
import { useState } from 'react';
import { FaqItem } from '../landing/faq';
import { LegalSection, LegalShell } from './legal-shell';
import { CONTACT_EMAIL } from './privacy';

export const SUPPORT_FAQ = [
  {
    q: 'Comment relier le téléphone de mon enfant ?',
    a: 'Dans l’app, ouvrez la fiche de votre enfant puis « Relier son téléphone ». Un QR code et un code à 6 caractères s’affichent : sur le téléphone de l’enfant, ouvrez Rekonect et scannez le QR code, ou saisissez le code.',
  },
  {
    q: 'J’ai oublié mon mot de passe.',
    a: 'Sur l’écran de connexion, touchez « Mot de passe oublié » et indiquez votre email : vous recevez un lien pour en choisir un nouveau. Pensez à vérifier vos courriers indésirables.',
  },
  {
    q: 'Mon enfant a changé de téléphone ou oublié son code PIN.',
    a: 'Depuis la fiche de l’enfant, choisissez « Nouveau téléphone, ou code PIN oublié » puis reliez de nouveau l’appareil. Ses points et ses activités sont conservés.',
  },
  {
    q: 'Comment fonctionne l’abonnement ?',
    a: 'La formule de la famille, ses limites et ses factures se trouvent dans Réglages, rubrique abonnement. Passer à une formule inférieure ne supprime rien : au-delà des limites, les contenus restent consultables.',
  },
  {
    q: 'Comment supprimer mon compte ?',
    a: `Dans l’application : Réglages → Mon compte → Supprimer mon compte, puis confirmez avec votre mot de passe. Le compte et toutes les données de la famille sont effacés immédiatement, et un email le confirme. Vous pouvez aussi nous écrire depuis l’adresse email de votre compte à ${CONTACT_EMAIL}.`,
  },
];

export function SupportPage() {
  const [open, setOpen] = useState(0);
  return (
    <LegalShell
      kicker="SUPPORT"
      title="Besoin d’aide ?"
      intro={<>Les réponses aux questions les plus fréquentes sur l’app Rekonect. Pour tout le reste, écrivez-nous.</>}
    >
      <LegalSection id="faq" title="Questions fréquentes">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {SUPPORT_FAQ.map((f, i) => (
            <FaqItem key={f.q} id={`support-${i}`} q={f.q} a={f.a} open={open === i} onToggle={() => setOpen(open === i ? -1 : i)} />
          ))}
        </div>
      </LegalSection>
      <LegalSection id="contact" title="Nous contacter">
        <p>
          Par email : <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Indiquez l’adresse email de votre compte et, si possible, le modèle de votre téléphone.
        </p>
        <p>
          Vos données et celles de vos enfants : voir la <a href="/confidentialite">politique de confidentialité</a>.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
