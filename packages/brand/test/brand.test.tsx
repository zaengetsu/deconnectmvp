import { render, screen } from '@testing-library/react';
import {
  anchorStyle, Backdrop, CornerRing, BRAND, ELEVATION, fadeMask, Halo, Logo, LogoMark, Pattern, PATTERN_KINDS, patternStyle, ProgressRing, Rings, Scene, Sprinkles, Staged, Sticker, Target, tint,
} from '../src';

describe('tint', () => {
  it('convertit les hexadécimaux en rgba', () => {
    expect(tint('#3C41A8', 0.5)).toBe('rgba(60,65,168,0.5)');
    expect(tint('#fff', 0.2)).toBe('rgba(255,255,255,0.2)');
  });
  it('borne l’opacité et passe par color-mix pour les variables CSS', () => {
    expect(tint('#000000', 2)).toBe('rgba(0,0,0,1)');
    expect(tint('var(--rk-accent)', 0.16)).toBe('color-mix(in srgb, var(--rk-accent) 16%, transparent)');
    expect(tint('rgba(1,2,3,1)', -1)).toBe('color-mix(in srgb, rgba(1,2,3,1) 0%, transparent)');
  });
});

describe('motifs', () => {
  it('produit une image de fond pour chaque motif de la charte', () => {
    for (const k of PATTERN_KINDS) expect(patternStyle(k).backgroundImage).toMatch(/gradient/);
  });
  it('reprend les valeurs exactes de la charte', () => {
    expect(patternStyle('links')).toEqual({
      backgroundImage:
        'radial-gradient(circle, transparent 15px, rgba(255,255,255,.16) 15.5px 17px, transparent 17.5px),radial-gradient(circle, transparent 15px, rgba(255,148,105,0.5) 15.5px 17px, transparent 17.5px)',
      backgroundSize: '44px 44px',
      backgroundPosition: '0 0,22px 0',
    });
    expect(patternStyle('dots').backgroundSize).toBe('14px 14px');
    expect(patternStyle('hatch').backgroundImage).toContain('115deg');
    expect(patternStyle('arcs').backgroundImage).toContain('circle at 100% 100%');
    expect(patternStyle('confetti').backgroundSize).toBe('90px 90px');
    expect(patternStyle('waves').backgroundImage).toContain('circle at 20% 120%');
  });
  it('accepte couleurs, échelle et origine', () => {
    const s = patternStyle('links', { line: 'red', accent: 'var(--rk-accent)', scale: 0.5 });
    expect(s.backgroundSize).toBe('22px 22px');
    expect(s.backgroundImage).toContain('var(--rk-accent)');
    expect(patternStyle('waves', { origin: '85% 125%', line: 'blue', accent: 'green' }).backgroundImage).toContain('circle at 85% 125%, green');
    expect(patternStyle('dots', { line: 'pink', scale: 2 }).backgroundImage).toContain('pink 2.8px');
    expect(patternStyle('hatch', { line: 'x' }).backgroundImage).toContain('x 0 2px');
    expect(patternStyle('arcs', { line: 'a', accent: 'b' }).backgroundImage).toMatch(/a 21.5px.*b 21.5px/);
    expect(patternStyle('confetti', { accent: 'c', line: 'd' }).backgroundImage).toMatch(/c 0 3px.*d 0 2px/);
  });
  it('estompe par un masque en dégradé', () => {
    expect(fadeMask()).toEqual({ WebkitMaskImage: 'linear-gradient(200deg, #000 0%, transparent 60%)', maskImage: 'linear-gradient(200deg, #000 0%, transparent 60%)' });
    expect(fadeMask(90, 30).maskImage).toContain('90deg');
  });
});

describe('ancrage', () => {
  it('centre un calque sur un coin ou un point libre', () => {
    expect(anchorStyle('bottom-left', 100)).toEqual({ left: '6%', top: '100%', width: 100, height: 100, transform: 'translate(-50%,-50%)' });
    expect(anchorStyle({ x: '10px', y: '20px' }, '50%')).toMatchObject({ left: '10px', top: '20px', width: '50%' });
  });
});

describe('éléments graphiques', () => {
  it('Pattern est décoratif et applique le masque demandé', () => {
    const { container } = render(<div><Pattern kind="dots" fade={180} opacity={0.5} /><Pattern kind="hatch" /></div>);
    const [a, b] = Array.from(container.querySelectorAll<HTMLElement>('[data-rk-pattern]'));
    expect(a).toHaveAttribute('aria-hidden', 'true');
    expect(a!.style.maskImage).toContain('180deg');
    expect(a!.style.opacity).toBe('0.5');
    expect(b!.style.maskImage).toBe('');
  });

  it('Rings trace des ondes de plus en plus marquées vers le centre', () => {
    const { container } = render(<Rings size={200} count={3} color="#3C41A8" focal="#FF9469" />);
    const root = container.querySelector<HTMLElement>('[data-rk-rings]')!;
    const circles = Array.from(root.children) as HTMLElement[];
    expect(circles).toHaveLength(4);
    expect(circles[0]!.style.width).toBe('200px');
    expect(circles[2]!.style.width).toBe('74px');
    expect(circles[0]!.style.border).toContain('rgba(60, 65, 168, 0.15)');
    expect(circles[3]!.style.background).toBe('rgb(255, 148, 105)');
    const single = render(<Rings count={1} />).container.querySelector('[data-rk-rings]')!;
    expect(single.children).toHaveLength(1);
  });

  it('Halo et Backdrop composent les couches 2 et 3', () => {
    const { container, rerender } = render(<Backdrop />);
    expect(container.querySelector('[data-rk-pattern="links"]')).toBeInTheDocument();
    expect(container.querySelector('[data-rk-rings]')).toBeInTheDocument();
    expect(container.querySelector('[data-rk-halo]')).toBeInTheDocument();
    rerender(<Backdrop pattern={false} rings={false} halo={false} />);
    expect(container.childElementCount).toBe(0);
    rerender(<Halo color="#3C41A8" at="center" />);
    expect(container.querySelector<HTMLElement>('[data-rk-halo]')!.style.background).toContain('radial-gradient');
  });

  it('Scene pose le décor sous le contenu', () => {
    render(
      <Scene bg="#16182B" color="#fff" radius={20} padding={16} pattern="dots" rings="top-right" halo={false} data-testid="scene" as="section">
        <h2>Titre</h2>
      </Scene>,
    );
    const scene = screen.getByTestId('scene');
    expect(scene.tagName).toBe('SECTION');
    expect(scene).toHaveStyle({ position: 'relative', overflow: 'hidden', borderRadius: '20px' });
    expect(scene.querySelector('[data-rk-pattern="dots"]')).toBeInTheDocument();
    expect(scene.querySelector('[data-rk-halo]')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Titre' }).parentElement).toHaveStyle({ position: 'relative' });
  });

  it('Sticker s’incline et accepte une pastille', () => {
    const { rerender } = render(<Sticker>+25 pts</Sticker>);
    expect(screen.getByText('+25 pts')).toHaveStyle({ transform: 'rotate(-4deg)', background: 'rgb(255, 148, 105)' });
    rerender(<Sticker tone="indigo" badge={3} tilt={0} size="lg" shadow>Explorateur</Sticker>);
    const s = screen.getByText('Explorateur');
    expect(s.style.transform).toBe('');
    expect(s.style.boxShadow).not.toBe('');
    expect(screen.getByText('3')).toBeInTheDocument();
    rerender(<Sticker bg="red" fg="blue" size="sm">X</Sticker>);
    expect(screen.getByText('X')).toHaveStyle({ background: 'rgb(255, 0, 0)', color: 'rgb(0, 0, 255)' });
  });

  it('ProgressRing borne la valeur et l’expose aux lecteurs d’écran', () => {
    const { rerender } = render(<ProgressRing value={72} label="Points" />);
    expect(screen.getByRole('progressbar', { name: 'Points' })).toHaveAttribute('aria-valuenow', '72');
    expect(screen.getByText('72%')).toBeInTheDocument();
    rerender(<ProgressRing value={140} label="Points"><b>Niv. 4</b></ProgressRing>);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByText('Niv. 4')).toBeInTheDocument();
    rerender(<ProgressRing value={Number.NaN} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('Logo, Target, Staged et Sprinkles', () => {
    const { container } = render(
      <div>
        <Logo tag="PARTENAIRES" color="#fff" />
        <Logo size={20} tagBg="red" tagFg="blue" tag="X" />
        <LogoMark size={44} stroke={3} />
        <Target />
        <Staged tilt={0}>Carte</Staged>
        <Staged>Inclinée</Staged>
        <Sprinkles />
        <Sprinkles light={false} />
      </div>,
    );
    expect(screen.getAllByText('Rekonect')).toHaveLength(2);
    expect(screen.getByText('PARTENAIRES')).toBeInTheDocument();
    expect(screen.getByText('Carte').style.transform).toBe('');
    expect(screen.getByText('Inclinée')).toHaveStyle({ transform: 'rotate(4deg)', boxShadow: ELEVATION[3] });
    expect(container.querySelectorAll('[aria-hidden]').length).toBeGreaterThan(6);
    expect(BRAND.peach).toBe('#FF9469');
  });
});

describe('CornerRing', () => {
  it('déborde de l’angle demandé', () => {
    const { container, rerender } = render(<CornerRing />);
    const el = container.querySelector<HTMLElement>('[data-rk-corner-ring]')!;
    expect(el).toHaveStyle({ top: '-60px', right: '-60px', width: '200px' });
    rerender(<CornerRing corner="bottom-left" size={100} overflow={0.5} color="var(--rk-accent)" alpha={0.2} />);
    const b = container.querySelector<HTMLElement>('[data-rk-corner-ring]')!;
    expect(b).toHaveStyle({ bottom: '-50px', left: '-50px' });
  });
});
