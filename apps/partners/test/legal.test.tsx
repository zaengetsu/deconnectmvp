import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Confidentialite from '@/app/confidentialite/page';
import Support from '@/app/support/page';
import { CONTACT_EMAIL, SUPPORT_FAQ } from '@/features/legal';

describe('pages publiques de la fiche App Store', () => {
  it('confidentialité : sections clés, enfants protégés, suppression de compte', () => {
    render(<Confidentialite />);
    expect(screen.getByRole('heading', { level: 1, name: 'Politique de confidentialité' })).toBeInTheDocument();
    for (const title of ['Qui est responsable de vos données', 'Les données que nous traitons', 'Les enfants', 'Supprimer votre compte', 'Vos droits']) {
      expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument();
    }
    expect(screen.getByText(/ne voient/)).toHaveTextContent('jamais');
    expect(screen.getByText(/aucun outil publicitaire/)).toBeInTheDocument();
    const mail = screen.getAllByRole('link', { name: CONTACT_EMAIL });
    expect(mail[0]).toHaveAttribute('href', `mailto:${CONTACT_EMAIL}`);
    expect(screen.getByRole('link', { name: 'Confidentialité' })).toHaveAttribute('href', '/confidentialite');
    expect(screen.getByRole('link', { name: 'Support' })).toHaveAttribute('href', '/support');
  });

  it('support : FAQ dépliable et contact', async () => {
    render(<Support />);
    expect(screen.getByRole('heading', { level: 1, name: 'Besoin d’aide ?' })).toBeInTheDocument();
    const first = screen.getByRole('button', { name: SUPPORT_FAQ[0].q });
    expect(first).toHaveAttribute('aria-expanded', 'true');
    const deletion = screen.getByRole('button', { name: 'Comment supprimer mon compte ?' });
    expect(deletion).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(deletion);
    expect(deletion).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/Réglages → Mon compte → Supprimer mon compte/)).toBeInTheDocument();
    expect(first).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('link', { name: 'politique de confidentialité' })).toHaveAttribute('href', '/confidentialite');
  });
});
