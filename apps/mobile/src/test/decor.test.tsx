import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RK_TONES, RkAllClear, RkCelebrate, RkFeature, RkHeader, RkHero, RkPrompt, RkStat } from '../components/rk/RkDecor';
import RkEmpty from '../components/rk/RkEmpty';

describe('habillage charte (motifs et éléments graphiques)', () => {
  it('RkHeader : arcs estompés et ondes à la couleur de navigation, contenu au premier plan', () => {
    const { container } = render(<RkHeader><h1>Mes défis</h1></RkHeader>);
    const head = container.querySelector<HTMLElement>('[data-rk-header]')!;
    expect(head.style.background).toBe('var(--rk-surface)');
    expect(head.querySelector('[data-rk-pattern="arcs"]')).toBeInTheDocument();
    expect(head.querySelector('[data-rk-rings]')).toBeInTheDocument();
    expect(head.querySelector('[data-rk-halo]')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Mes défis' }).parentElement).toHaveStyle({ position: 'relative' });
  });

  it('RkHero : une recette par ton, surchargeable', () => {
    const { container, rerender } = render(<RkHero tone="accent">x</RkHero>);
    let hero = container.querySelector<HTMLElement>('[data-rk-hero="accent"]')!;
    expect(hero.style.background).toBe('var(--rk-accent)');
    expect(hero.querySelector('[data-rk-pattern="hatch"]')).toBeInTheDocument();
    rerender(<RkHero tone="indigo" decor={{ pattern: 'dots', halo: false }}>x</RkHero>);
    hero = container.querySelector<HTMLElement>('[data-rk-hero="indigo"]')!;
    expect(hero.querySelector('[data-rk-pattern="dots"]')).toBeInTheDocument();
    expect(hero.querySelector('[data-rk-halo]')).toBeNull();
    expect(Object.keys(RK_TONES)).toEqual(['indigo', 'accent', 'ink']);
  });

  it('RkFeature devient un bouton accessible quand il est cliquable', () => {
    const onClick = vi.fn();
    const { rerender } = render(<RkFeature onClick={onClick} label="Ouvrir les validations">2 activités</RkFeature>);
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir les validations' }));
    expect(onClick).toHaveBeenCalledOnce();
    rerender(<RkFeature tone="ink">statique</RkFeature>);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('statique').closest('[data-rk-feature="ink"]')).toBeInTheDocument();
  });

  it('RkStat, RkPrompt, RkAllClear et RkCelebrate', () => {
    const go = vi.fn();
    const stat = vi.fn();
    const { container } = render(
      <div>
        <RkStat value={3} label="Enfants" />
        <RkStat value={1} label="Demandes" color="var(--rk-amber)" align="center" onClick={stat} />
        <RkPrompt title="Ajoutez votre premier enfant" text="Deux minutes suffisent." onClick={go} />
        <RkPrompt title="Choisis ton défi" img="/images/categories/track.png" onClick={go} />
        <RkAllClear title="Tout est à jour" text="Rien à valider." />
        <RkAllClear title="Calme plat" />
        <RkCelebrate />
      </div>,
    );
    expect(container.querySelectorAll('[data-rk-corner-ring]')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /Demandes/ }));
    expect(stat).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: /Ajoutez votre premier enfant/ }));
    fireEvent.click(screen.getByRole('button', { name: /Choisis ton défi/ }));
    expect(go).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Tout est à jour')).toBeInTheDocument();
    expect(container.querySelector('[data-rk-pattern="confetti"]')).toBeInTheDocument();
  });

  it('RkEmpty garde son contenu lisible au-dessus des ondes', () => {
    const cta = vi.fn();
    const { container } = render(<RkEmpty img="/images/categories/books.png" title="Aucune notification" text="Rien pour l'instant." steps={['Un', 'Deux']} cta={{ label: 'Voir le catalogue', onClick: cta }} />);
    const card = container.querySelector<HTMLElement>('[data-rk-empty]')!;
    expect(card).toHaveStyle({ position: 'relative', overflow: 'hidden' });
    expect(card.querySelector('[data-rk-rings]')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Voir le catalogue' }));
    expect(cta).toHaveBeenCalledOnce();
  });
});
