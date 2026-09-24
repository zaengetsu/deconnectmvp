import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import {
  Button, Card, CardLink, CardTitle, Chips, CountBadge, Dot, Drawer, EmptyState, ErrorBox, Field, Grid, IconSquare, Initials, KpiCard, Modal, MultiChips,
  Notice, PageHeader, Pill, ProgressBar, SectionLabel, Segmented, Select, Skeleton, Spinner, Stack, StatCard, TableHead, TableRow, TextArea, TextInput, Tile, Toggle, ToggleRow,
  ToastProvider, useToast, C, chip, seg,
} from '../src';

describe('composants', () => {
  it('surfaces et en-têtes reprennent les valeurs des maquettes', () => {
    render(
      <Stack>
        <PageHeader title="Vue d'ensemble" subtitle="Données au 24 septembre 2026" actions={<Button>+ Nouvelle activité</Button>} />
        <Card data-testid="card">
          <CardTitle action={<CardLink onClick={() => undefined}>Catalogue →</CardLink>}>Activités qui fonctionnent</CardTitle>
          <CardLink href="/x">Lien</CardLink>
        </Card>
        <Grid min={220} fill>
          <KpiCard label="Familles actives" value="12 480" delta="+8,2 %" sub="1 024 nouvelles" />
          <KpiCard label="Sans variation" value="3" delta="" />
          <StatCard value="68 %" label="Appareil enfant lié" color={C.amberText} />
          <Tile value="1 380" label="Assignations 30 j" />
        </Grid>
        <SectionLabel>PARENTS</SectionLabel>
        <Notice tone="amber">Note</Notice>
        <Notice>Bleue</Notice>
      </Stack>,
    );
    expect(screen.getByRole('heading', { name: "Vue d'ensemble" })).toHaveStyle({ fontSize: '30px', fontWeight: '800' });
    expect(screen.getByTestId('card')).toHaveStyle({ borderRadius: '20px', padding: '22px' });
    expect(screen.getByText('+8,2 %')).toHaveStyle({ color: C.greenText, background: C.greenSoft });
    expect(screen.getByText('68 %')).toHaveStyle({ color: C.amberText });
    expect(screen.getByRole('link', { name: 'Lien' })).toHaveAttribute('href', '/x');
  });

  it('boutons : variantes, chargement, désactivé', async () => {
    const onClick = vi.fn();
    render(
      <>
        <Button onClick={onClick}>Approuver</Button>
        <Button variant="outline" loading>Enregistrer</Button>
        <Button variant="coral" disabled block shadow={false}>Envoyer</Button>
        <Button variant="dangerSoft">Supprimer</Button>
        <Spinner />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Approuver' }));
    expect(onClick).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Approuver' })).toHaveStyle({ background: C.primary, height: '40px' });
    expect(screen.getByRole('button', { name: /Enregistrer/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Envoyer' })).toHaveStyle({ opacity: '0.5', width: '100%' });
  });

  it('segmenté, puces, puces multiples', async () => {
    function Demo() {
      const [v, setV] = useState<'7' | '30'>('30');
      const [c, setC] = useState<'all' | 'sport'>('all');
      const [ages, setAges] = useState<string[]>(['7-9']);
      return (
        <>
          <Segmented ariaLabel="Période" options={[{ id: '7', label: '7 jours' }, { id: '30', label: '30 jours', badge: <CountBadge>4</CountBadge> }]} value={v} onChange={setV} stretch />
          <Chips options={[{ id: 'all', label: 'Tout', badge: 64 }, { id: 'sport', label: 'Sport' }]} value={c} onChange={setC} />
          <MultiChips options={[{ id: '4-6', label: '4–6 ans' }, { id: '7-9', label: '7–9 ans' }]} value={ages} onChange={setAges} />
          <output>{ages.join(',')}</output>
        </>
      );
    }
    render(<Demo />);
    expect(screen.getByRole('tab', { name: /30 jours/ })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('tab', { name: '7 jours' }));
    expect(screen.getByRole('tab', { name: '7 jours' })).toHaveStyle(seg(true));
    await userEvent.click(screen.getByRole('button', { name: 'Sport' }));
    expect(screen.getByRole('button', { name: 'Sport' })).toHaveStyle({ background: chip(true).background });
    await userEvent.click(screen.getByRole('button', { name: '4–6 ans' }));
    await userEvent.click(screen.getByRole('button', { name: '7–9 ans' }));
    expect(screen.getByRole('status', { hidden: true })).toBeTruthy;
    expect(document.querySelector('output')?.textContent).toBe('4-6');
  });

  it('indicateurs : pastilles, barres, interrupteurs, lignes de tableau', async () => {
    const onToggle = vi.fn();
    const onRow = vi.fn();
    render(
      <>
        <Pill tone="green">Publiée</Pill>
        <Pill bg="#000" fg="#fff">Brut</Pill>
        <Pill>Neutre</Pill>
        <Dot color="red" />
        <ProgressBar percent={140} label="Taux" />
        <ProgressBar percent={null} />
        <Toggle checked onChange={onToggle} label="Visible" />
        <Toggle checked={false} label="Lecture seule" />
        <ToggleRow label="Photo de preuve" checked={false} onChange={onToggle} last />
        <TableHead template="1fr 1fr" columns={[{ label: 'ACTIVITÉ' }, { label: 'POINTS', align: 'right' }]} />
        <TableRow template="1fr 1fr" onClick={onRow} label="Lire 20 minutes"><span>Lire</span><span>20</span></TableRow>
        <TableRow template="1fr"><span>Statique</span></TableRow>
        <EmptyState title="Rien ici" action={<Button>Créer</Button>}>Aucune offre</EmptyState>
        <Skeleton />
        <IconSquare src="/a.png" />
        <Initials>CR</Initials>
      </>,
    );
    expect(screen.getByText('Publiée')).toHaveStyle({ background: C.greenSoft, color: C.greenText });
    expect(screen.getByRole('progressbar', { name: 'Taux' })).toHaveAttribute('aria-valuenow', '100');
    await userEvent.click(screen.getByRole('switch', { name: 'Visible' }));
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(screen.getByRole('switch', { name: 'Lecture seule' })).toBeDisabled();
    await userEvent.click(screen.getByRole('switch', { name: 'Photo de preuve' }));
    expect(onToggle).toHaveBeenLastCalledWith(true);
    await userEvent.click(screen.getByRole('row', { name: 'Lire 20 minutes' }));
    expect(onRow).toHaveBeenCalled();
    expect(screen.getAllByRole('columnheader')[1]).toHaveStyle({ textAlign: 'right' });
  });

  it('champs de formulaire et erreurs', async () => {
    const retry = vi.fn();
    render(
      <>
        <Field label="Titre" htmlFor="t" error="Trop court"><TextInput id="t" invalid defaultValue="a" /></Field>
        <Field label="Consigne" hint="Visible par l’enfant"><TextArea aria-label="Consigne" focusColor="#FF9469" /></Field>
        <Field label="Difficulté"><Select aria-label="Difficulté"><option>Facile</option></Select></Field>
        <ErrorBox error={new Error('Le serveur ne répond pas')} onRetry={retry} />
        <ErrorBox error="x" />
      </>,
    );
    expect(screen.getByLabelText('Titre')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Trop court')).toBeInTheDocument();
    expect(screen.getByText('Visible par l’enfant')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(retry).toHaveBeenCalled();
    expect(screen.getByText('Une erreur est survenue.')).toBeInTheDocument();
  });

  it('tiroir et fenêtre : ouverture, fermeture par bouton, fond et Échap', async () => {
    const close = vi.fn();
    const { rerender } = render(<Drawer open kicker="FICHE FAMILLE" onClose={close} footer={<Button>Enregistrer</Button>}>Contenu</Drawer>);
    expect(screen.getByRole('dialog', { name: 'FICHE FAMILLE' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Fermer le panneau' }));
    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(close).toHaveBeenCalledTimes(3);
    rerender(<Drawer open={false} kicker="x" onClose={close}>x</Drawer>);
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(<Modal open title="Refuser l’offre" onClose={close} footer={<Button>Refuser</Button>}>Motif</Modal>);
    expect(screen.getByRole('dialog', { name: 'Refuser l’offre' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Fermer la fenêtre' }));
    expect(close).toHaveBeenCalledTimes(4);
    rerender(<Modal open={false} title="x" onClose={close}>x</Modal>);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('notifications éphémères', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    function Demo() {
      const toast = useToast();
      return (
        <>
          <button onClick={() => toast('Offre approuvée', 'success')}>ok</button>
          <button onClick={() => toast('Échec', 'error')}>ko</button>
        </>
      );
    }
    render(<ToastProvider duration={1000}><Demo /></ToastProvider>);
    fireEvent.click(screen.getByText('ok'));
    fireEvent.click(screen.getByText('ko'));
    expect(screen.getByText('Offre approuvée')).toBeInTheDocument();
    expect(screen.getByText('Échec')).toHaveStyle({ background: C.redText });
    await act(() => vi.advanceTimersByTimeAsync(1100));
    expect(screen.queryByText('Offre approuvée')).toBeNull();
    vi.useRealTimers();
  });
});
