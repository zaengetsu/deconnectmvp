import React, { useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';

// ─── Minimal SVG illustrations — color-aligned ────────────────
const Illustration: React.FC<{ index: number }> = ({ index }) => {
  const illustrations = [
    // Slide 1 — phone with X, freedom arrow
    <svg key={0} viewBox="0 0 160 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="55" y="10" width="50" height="80" rx="8" stroke="rgba(108,92,231,0.2)" strokeWidth="1.5" fill="rgba(108,92,231,0.04)"/>
      <rect x="62" y="18" width="36" height="52" rx="4" fill="rgba(108,92,231,0.08)" stroke="rgba(108,92,231,0.2)" strokeWidth="1"/>
      <line x1="72" y1="30" x2="88" y2="58" stroke="#6C5CE7" strokeWidth="2" strokeLinecap="round"/>
      <line x1="88" y1="30" x2="72" y2="58" stroke="#6C5CE7" strokeWidth="2" strokeLinecap="round"/>
      <path d="M105 50 L125 50 L120 44 M125 50 L120 56" stroke="var(--dc-text)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="130" cy="35" r="2.5" fill="rgba(108,92,231,0.35)"/>
      <circle cx="138" cy="52" r="1.5" fill="rgba(162,155,254,0.5)"/>
      <circle cx="128" cy="65" r="2" fill="rgba(108,92,231,0.25)"/>
      <circle cx="80" cy="100" r="5" stroke="rgba(108,92,231,0.2)" strokeWidth="1.2" fill="none"/>
    </svg>,

    // Slide 2 — rising bars / progress
    <svg key={1} viewBox="0 0 160 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="20" y1="95" x2="140" y2="95" stroke="var(--dc-border)" strokeWidth="1"/>
      <rect x="28" y="72" width="20" height="23" rx="4" fill="rgba(162,155,254,0.15)" stroke="rgba(162,155,254,0.35)" strokeWidth="1"/>
      <rect x="60" y="50" width="20" height="45" rx="4" fill="rgba(108,92,231,0.2)" stroke="rgba(108,92,231,0.4)" strokeWidth="1"/>
      <rect x="92" y="28" width="20" height="67" rx="4" fill="#6C5CE7" stroke="#A29BFE" strokeWidth="1"/>
      <rect x="124" y="15" width="20" height="80" rx="4" fill="rgba(108,92,231,0.06)" stroke="rgba(108,92,231,0.15)" strokeWidth="1" strokeDasharray="4 3"/>
      <path d="M134 10 L135.5 6 L137 10 L141 10 L138 12.5 L139.2 16.5 L135.5 14 L131.8 16.5 L133 12.5 L130 10Z"
        fill="var(--dc-gold)"/>
      <path d="M30 85 Q60 75 90 55 Q110 45 130 25" stroke="rgba(108,92,231,0.2)" strokeWidth="1.2" strokeDasharray="3 3" fill="none"/>
    </svg>,

    // Slide 3 — family circle
    <svg key={2} viewBox="0 0 160 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="80" y1="60" x2="40" y2="35" stroke="rgba(108,92,231,0.2)" strokeWidth="1" strokeDasharray="4 3"/>
      <line x1="80" y1="60" x2="120" y2="35" stroke="rgba(108,92,231,0.2)" strokeWidth="1" strokeDasharray="4 3"/>
      <line x1="80" y1="60" x2="40" y2="88" stroke="rgba(108,92,231,0.2)" strokeWidth="1" strokeDasharray="4 3"/>
      <line x1="80" y1="60" x2="120" y2="88" stroke="rgba(108,92,231,0.2)" strokeWidth="1" strokeDasharray="4 3"/>
      <circle cx="80" cy="60" r="18" fill="rgba(108,92,231,0.1)" stroke="#6C5CE7" strokeWidth="1.5"/>
      <circle cx="80" cy="60" r="10" fill="#6C5CE7"/>
      {[
        { cx: 40, cy: 35 }, { cx: 120, cy: 35 },
        { cx: 40, cy: 88 }, { cx: 120, cy: 88 },
      ].map(({ cx, cy }, i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r="12" fill="rgba(162,155,254,0.1)" stroke="rgba(162,155,254,0.35)" strokeWidth="1.2"/>
          <circle cx={cx} cy={cy - 4} r="4" fill="rgba(108,92,231,0.4)"/>
          <path d={`M${cx - 5} ${cy + 5} Q${cx} ${cy + 2} ${cx + 5} ${cy + 5}`} stroke="rgba(108,92,231,0.4)" strokeWidth="1" fill="none"/>
        </g>
      ))}
    </svg>,
  ];
  return illustrations[index] ?? null;
};

const slides = [
  {
    label: '01 / 03',
    title: 'Déconnectez\npour mieux vivre',
    desc: "Transformez le temps d'écran en vraies aventures — activités, jeux, sorties en famille.",
  },
  {
    label: '02 / 03',
    title: 'Récompensez\nchaque effort',
    desc: 'Les enfants gagnent des points en réalisant des défis et débloquent des récompenses choisies par les parents.',
  },
  {
    label: '03 / 03',
    title: 'En famille,\nensemble',
    desc: 'Parents et enfants partagent les progrès. Invitez un co-parent ou un éducateur en quelques secondes.',
  },
];

const OnboardingPage: React.FC = () => {
  const [current, setCurrent] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const history = useHistory();

  const goNext = () => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(() => {
      setCurrent(c => c + 1);
      setLeaving(false);
    }, 200);
  };

  const slide = slides[current];
  const isLast = current === slides.length - 1;

  return (
    <IonPage>
      <IonContent fullscreen scrollY={false}>
        <style>{`
          @keyframes ob-up   { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:translateY(0); } }
          @keyframes ob-down { from { opacity:1; } to { opacity:0; transform:translateY(-10px); } }
          .ob-enter { animation: ob-up 0.35s ease both; }
          .ob-exit  { animation: ob-down 0.2s ease both; }
        `}</style>

        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--dc-bg)' }}>

          {/* ── Top section with illustration ── */}
          <div style={{
            flex: '0 0 auto',
            padding: 'calc(env(safe-area-inset-top) + 20px) 28px 28px',
            position: 'relative', overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
          }}>
            {/* Decorative orb */}
            <div style={{
              position: 'absolute', top: -50, right: -50, width: 200, height: 200,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(108,92,231,0.1) 0%, transparent 60%)',
              pointerEvents: 'none',
            }} />

            {/* Top row: logo + skip */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32, zIndex: 1 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: 'linear-gradient(135deg, #6C5CE7, #A29BFE)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 16px rgba(108,92,231,0.25)',
              }}>
                <span style={{ fontSize: 18, fontWeight: 900, color: 'white', letterSpacing: -0.5 }}>D</span>
              </div>
              {!isLast && (
                <button onClick={() => history.push('/login')} style={{
                  background: 'rgba(108,92,231,0.08)', border: 'none', color: 'var(--dc-text-muted)',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '6px 14px',
                  borderRadius: 50,
                }}>
                  Passer
                </button>
              )}
            </div>

            {/* Illustration */}
            <div className={leaving ? 'ob-exit' : 'ob-enter'} key={`ill-${current}`}
              style={{ display: 'flex', justifyContent: 'center', marginBottom: 20, zIndex: 1 }}>
              <div style={{
                width: 150, height: 112, borderRadius: 24,
                background: 'white',
                border: '1.5px solid var(--dc-border)',
                boxShadow: 'var(--dc-shadow)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Illustration index={current} />
              </div>
            </div>

            {/* Slide label */}
            <p style={{ color: 'var(--dc-text-muted)', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', margin: 0, zIndex: 1 }}>
              {slide.label}
            </p>
          </div>

          {/* ── Card content section ── */}
          <div className={leaving ? 'ob-exit' : 'ob-enter'} key={`card-${current}`}
            style={{
              flex: 1, background: 'white', borderRadius: '28px 28px 0 0',
              padding: '28px 24px 40px',
              display: 'flex', flexDirection: 'column',
              boxShadow: '0 -4px 20px rgba(0,0,0,0.04)',
            }}>
            <div style={{ flex: 1 }}>
              <h1 style={{
                fontSize: 28, fontWeight: 900, color: 'var(--dc-text)',
                margin: '0 0 14px', lineHeight: 1.2, letterSpacing: -0.5,
                whiteSpace: 'pre-line',
              }}>
                {slide.title}
              </h1>
              <p style={{ fontSize: 15, color: 'var(--dc-text-light)', lineHeight: 1.65, margin: 0 }}>
                {slide.desc}
              </p>
            </div>

            {/* Progress dots */}
            <div style={{ display: 'flex', gap: 5, marginBottom: 24 }}>
              {slides.map((_, i) => (
                <div key={i} style={{
                  height: 4, borderRadius: 2, transition: 'all 0.3s ease',
                  width: i === current ? 28 : 8,
                  background: i === current
                    ? 'linear-gradient(90deg, #6C5CE7, #A29BFE)'
                    : 'var(--dc-border)',
                }} />
              ))}
            </div>

            {/* Actions */}
            {!isLast ? (
              <button className="dc-btn dc-btn-primary dc-btn-full dc-btn-lg" onClick={goNext}>
                Continuer
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button className="dc-btn dc-btn-primary dc-btn-full dc-btn-lg"
                  onClick={() => history.push('/register')}>
                  Créer un compte parent
                </button>
                <button className="dc-btn dc-btn-outline dc-btn-full"
                  style={{ height: 52, fontSize: 15, borderRadius: 50 }}
                  onClick={() => history.push('/child-link')}>
                  Je suis un enfant
                </button>
                <button className="dc-btn dc-btn-ghost"
                  style={{ fontSize: 14, color: 'var(--dc-text-muted)' }}
                  onClick={() => history.push('/login')}>
                  J'ai déjà un compte
                </button>
              </div>
            )}
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default OnboardingPage;
