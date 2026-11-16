'use client';
import { LegalSection, LegalShell } from './legal-shell';

// BROUILLON À VALIDER PAR LA SOCIÉTÉ avant publication de l'app : identité légale de
// l'éditeur, adresse de contact, durées de conservation. Inventaire des données et
// sources : docs/app-store/donnees-personnelles.md.

/** Contact unique pour les questions de données personnelles et le support. */
// TODO(société) : confirmer l'adresse ; seule l'adresse partenaires@rekonect.app existe dans le dépôt.
export const CONTACT_EMAIL = 'contact@rekonect.app';
/** Identité légale de l'éditeur (raison sociale, forme, siège, SIREN) : à compléter. */
// TODO(société) : remplacer par « SERVICES, <forme> au capital de …, <adresse>, SIREN … ».
export const PUBLISHER = 'SERVICES, éditeur de l’application Rekonect';

const UPDATED_AT = '15 novembre 2026';

export function PrivacyPolicy() {
  return (
    <LegalShell
      kicker="CONFIDENTIALITÉ"
      title="Politique de confidentialité"
      intro={<>Rekonect aide les familles à passer plus de temps hors écran. Cette page explique quelles données l’app traite, pourquoi, et comment exercer vos droits. Dernière mise à jour : {UPDATED_AT}.</>}
    >
      <LegalSection id="responsable" title="Qui est responsable de vos données">
        <p>Le responsable du traitement est {PUBLISHER}. Pour toute question : <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
      </LegalSection>

      <LegalSection id="donnees" title="Les données que nous traitons">
        <ul>
          <li><strong>Compte parent</strong> : adresse email, nom, mot de passe (stocké sous forme chiffrée irréversible), dates de connexion.</li>
          <li><strong>Profil de l’enfant</strong>, créé par le parent : prénom ou pseudonyme, âge, avatar et code PIN (chiffré). Aucune date de naissance, adresse ou photo d’identité n’est demandée.</li>
          <li><strong>Activités</strong> : activités proposées, réalisées et validées, points, badges et récompenses.</li>
          <li><strong>Preuves</strong> : la photo ou la vidéo que l’enfant choisit d’envoyer pour montrer une activité réalisée. Elle n’est visible que par sa famille, et l’enfant peut la retirer.</li>
          <li><strong>Temps d’écran</strong> : les minutes et objectifs saisis par le parent. L’app ne mesure pas l’usage du téléphone.</li>
          <li><strong>Appareils et notifications</strong> : identifiant technique du téléphone relié, jeton de notification et préférences de notification.</li>
          <li><strong>Abonnement</strong>, le cas échéant : formule, statut et factures. Les données de carte sont traitées par notre prestataire de paiement, jamais par Rekonect.</li>
          <li><strong>Bons partenaires</strong> : les bons et codes obtenus, toujours remis au parent.</li>
        </ul>
        <p>Rekonect n’utilise aucun outil publicitaire ni de mesure d’audience tiers, et ne fait aucun suivi entre applications ou sites.</p>
      </LegalSection>

      <LegalSection id="enfants" title="Les enfants">
        <p>Le compte est ouvert et géré par un parent, qui crée le profil de l’enfant et relie son téléphone : c’est ce consentement parental qui permet à l’enfant d’utiliser l’app. L’enfant ne peut devenir « ami » avec un autre enfant qu’avec l’accord des deux parents ; un ami ne voit que le prénom ou pseudonyme et l’avatar.</p>
        <p>Les partenaires (enseignes, collectivités, comités d’entreprise) ne voient <strong>jamais</strong> de donnée personnelle d’un enfant : seulement des statistiques globales, calculées sur au moins dix familles et arrondies. Ils ne peuvent pas contacter un enfant ; les bons et codes sont remis au parent. Chaque offre est vérifiée par Rekonect avant publication.</p>
      </LegalSection>

      <LegalSection id="finalites" title="Pourquoi nous les utilisons">
        <ul>
          <li>Fournir le service : comptes, activités, validations, récompenses, notifications et emails de service (exécution du contrat).</li>
          <li>Gérer les abonnements et la facturation (exécution du contrat, obligations comptables).</li>
          <li>Sécuriser les comptes et prévenir les abus (intérêt légitime).</li>
          <li>Produire des statistiques anonymes pour les partenaires et améliorer l’app (intérêt légitime).</li>
        </ul>
      </LegalSection>

      <LegalSection id="prestataires" title="Où sont vos données et avec qui elles sont partagées">
        <p>Nous ne vendons aucune donnée. Elles sont hébergées dans l’Union européenne et confiées uniquement aux prestataires nécessaires au service :</p>
        <ul>
          <li>Scaleway (France) : hébergement de l’application ;</li>
          <li>Supabase : base de données, hébergée dans l’Union européenne ;</li>
          <li>Brevo : envoi des emails ;</li>
          <li>Stripe : paiement des abonnements ;</li>
          <li>Apple et Google : acheminement des notifications sur les téléphones.</li>
        </ul>
      </LegalSection>

      <LegalSection id="conservation" title="Combien de temps nous les gardons">
        {/* TODO(société) : fixer les durées ; aucune purge automatique n'est programmée aujourd'hui. */}
        <p>Les données sont conservées tant que le compte est actif. À la suppression du compte, le profil du parent, les profils des enfants, leurs activités, preuves, notifications et sessions sont effacés ; seules restent les statistiques déjà anonymes et les factures, que la loi nous oblige à conserver.</p>
      </LegalSection>

      <LegalSection id="suppression" title="Supprimer votre compte">
        <p>Depuis l’application : <strong>Réglages → Mon compte → Supprimer mon compte</strong>, puis confirmez avec votre mot de passe. La suppression est immédiate et définitive : votre compte, les profils de vos enfants, leurs appareils liés, activités, preuves, points, récompenses et bons sont effacés, et vous recevez un email de confirmation. Un abonnement payant n’est plus renouvelé ; la période en cours n’est pas remboursée automatiquement.</p>
        <p>Si vous êtes co-parent invité, seul votre compte est supprimé : la famille qui vous a invité est conservée.</p>
        <p>Vous pouvez aussi nous écrire depuis l’adresse email de votre compte à <a href={`mailto:${CONTACT_EMAIL}?subject=Suppression%20de%20compte`}>{CONTACT_EMAIL}</a> : nous supprimons alors le compte et vous le confirmons par email, dans un délai d’un mois au plus.</p>
      </LegalSection>

      <LegalSection id="droits" title="Vos droits">
        <p>Vous pouvez accéder à vos données et à celles de vos enfants, les rectifier, les faire supprimer, en demander une copie ou vous opposer à certains traitements, en écrivant à <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Vous pouvez aussi saisir la CNIL (cnil.fr).</p>
      </LegalSection>
    </LegalShell>
  );
}
