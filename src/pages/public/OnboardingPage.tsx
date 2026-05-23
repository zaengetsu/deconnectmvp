import React, { useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';

// ─── Minimal SVG illustrations — no emojis ─────────────────────
const Illustration: React.FC<{ index: number }> = ({ index }) => {
  const illustrations = [
    // Slide 1 — phone with X, nature emerging
    <svg key={0} viewBox="0 0 160 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Phone outline */}
      <rect x="55" y="10" width="50" height="80" rx="8" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" fill="rgba(255,255,255,0.03)"/>
      <rect x="62" y="18" width="36" height="52" rx="4" fill="rgba(108,92,231,0.1)" stroke="rgba(108,92,231,0.3)" strokeWidth="1"/>
      {/* X on screen */}
      <line x1="72" y1="30" x2="88" y2="58" stroke="#6C5CE7" strokeWidth="2" strokeLinecap="round"/>
      <line x1="88" y1="30" x2="72" y2="58" stroke="#6C5CE7" strokeWidth="2" strokeLinecap="round"/>
      {/* Arrow breaking free */}
      <path d="M105 50 L125 50 L120 44 M125 50 L120 56" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Sparkle dots */}
      <circle cx="130" cy="35" r="2.5" fill="rgba(255,255,255,0.4)"/>
      <circle cx="138" cy="52" r="1.5" fill="rgba(162,155,254,0.6)"/>
      <circle cx="128" cy="65" r="2" fill="rgba(255,255,255,0.3)"/>
      {/* Home button */}
      <circle cx="80" cy="100" r="5" stroke="rgba(255,255,255,0.15)" strokeWidth="1.2" fill="none"/>
    </svg>,

    // Slide 2 — rising bar chart / progress
    <svg key={1} viewBox="0 0 160 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Base line */}
      <line x1="20" y1="95" x2="140" y2="95" stroke="rgba(255,255,255,0.1)" strokeWidth="1"/>
      {/* Bars */}
      <rect x="28" y="72" width="20" height="23" rx="4" fill="rgba(162,155,254,0.2)" stroke="rgba(162,155,254,0.4)" strokeWidth="1"/>
      <rect x="60" y="50" width="20" height="45" rx="4" fill="rgba(108,92,231,0.35)" stroke="rgba(108,92,231,0.6)" strokeWidth="1"/>
      <rect x="92" y="28" width="20" height="67" rx="4" fill="#6C5CE7" stroke="#A29BFE" strokeWidth="1"/>
      <rect x="124" y="15" width="20" height="80" rx="4" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="4 3"/>
      {/* Star on top bar */}
      <path d="M134 10 L135.5 6 L137 10 L141 10 L138 12.5 L139.2 16.5 L135.5 14 L131.8 16.5 L133 12.5 L130 10Z"
        fill="rgba(255,255,255,0.4)"/>
      {/* Arrow trend */}
      <path d="M30 85 Q60 75 90 55 Q110 45 130 25" stroke="rgba(255,255,255,0.25)" strokeWidth="1.2" strokeDasharray="3 3" fill="none"/>
    </svg>,

    // Slide 3 — family circle
    <svg key={2} viewBox="0 0 160 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Center connecting lines */}
      <line x1="80" y1="60" x2="40" y2="35" stroke="rgba(108,92,231,0.3)" strokeWidth="1" strokeDasharray="4 3"/>
      <line x1="80" y1="60" x2="120" y2="35" stroke="rgba(108,92,231,0.3)" strokeWidth="1" strokeDasharray="4 3"/>
      <line x1="80" y1="60" x2="40" y2="88" stroke="rgba(108,92,231,0.3)" strokeWidth="1" strokeDasharray="4 3"/>
      <line x1="80" y1="60" x2="120" y2="88" stroke="rgba(108,92,231,0.3)" strokeWidth="1" strokeDasharray="4 3"/>
      {/* Center circle */}
      <circle cx="80" cy="60" r="18" fill="rgba(108,92,231,0.15)" stroke="#6C5CE7" strokeWidth="1.5"/>
      <circle cx="80" cy="60" r="10" fill="#6C5CE7"/>
      {/* Person nodes */}
      {[
        { cx: 40, cy: 35 }, { cx: 120, cy: 35 },
        { cx: 40, cy: 88 }, { cx: 120, cy: 88 },
      ].map(({ cx, cy }, i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r="12" fill="rgba(162,155,254,0.12)" stroke="rgba(162,155,254,0.4)" strokeWidth="1.2"/>
          <circle cx={cx} cy={cy - 4} r="4" fill="rgba(255,255,255,0.5)"/>
          <path d={`M${cx - 5} ${cy + 5} Q${cx} ${cy + 2} ${cx + 5} ${cy + 5}`} stroke="rgba(255,255,255,0.5)" strokeWidth="1" fill="none"/>
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
    desc: 'Transformez le temps d\'écran en vraies aventures — activités, jeux, sorties en famille.',
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
          .ob-btn-primary {
            width:100%; padding:15px; border-radius:12px; border:none;
            font-size:16px; font-weight:700; cursor:pointer; letter-spacing:-0.2px;
            background:linear-gradient(135deg,#6C5CE7,#A29BFE); color:white;
            transition:opacity 0.15s,transform 0.15s;
          }
          .ob-btn-primary:active { transform:scale(0.98); }
          .ob-btn-secondary {
            width:100%; padding:15px; border-radius:12px;
            font-size:16px; font-weight:700; cursor:pointer;
            background:rgba(108,92,231,0.06); border:1.5px solid rgba(108,92,231,0.15);
            color:#6C5CE7; transition:opacity 0.15s,transform 0.15s;
          }
          .ob-btn-ghost {
            width:100%; padding:13px; border:none; background:none;
            font-size:15px; font-weight:500; color:#aeaeb2; cursor:pointer;
          }
        `}</style>

        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* ── Dark top section ── */}
          <div style={{
            background: '#0f0e17', flex: '0 0 auto',
            padding: '52px 28px 36px',
            position: 'relative', overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
          }}>
            {/* Orb */}
            <div style={{
              position: 'absolute', top: -60, right: -60, width: 220, height: 220,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(108,92,231,0.18) 0%, transparent 65%)',
              pointerEvents: 'none',
            }} />

            {/* Top row: logo + skip */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 36, zIndex: 1 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'linear-gradient(135deg, #6C5CE7, #A29BFE)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: 16, fontWeight: 900, color: 'white', letterSpacing: -0.5 }}>D</span>
              </div>
              {!isLast && (
                <button onClick={() => history.push('/login')} style={{
                  background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)',
                  fontSize: 14, fontWeight: 500, cursor: 'pointer', padding: 0,
                }}>
                  Passer
                </button>
              )}
            </div>

            {/* Illustration */}
            <div className={leaving ? 'ob-exit' : 'ob-enter'} key={`ill-${current}`}
              style={{ display: 'flex', justifyContent: 'center', marginBottom: 28, zIndex: 1 }}>
              <div style={{
                width: 140, height: 105, borderRadius: 20,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Illustration index={current} />
              </div>
            </div>

            {/* Slide label */}
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', margin: 0, zIndex: 1 }}>
              {slide.label}
            </p>
          </div>

          {/* ── White card section ── */}
          <div className={leaving ? 'ob-exit' : 'ob-enter'} key={`card-${current}`}
            style={{
              flex: 1, background: 'white', borderRadius: '24px 24px 0 0',
              padding: '28px 24px 40px', marginTop: -16,
              display: 'flex', flexDirection: 'column',
            }}>
            <div style={{ flex: 1 }}>
              <h1 style={{
                fontSize: 26, fontWeight: 800, color: '#1d1d1f',
                margin: '0 0 12px', lineHeight: 1.25, letterSpacing: -0.5,
                whiteSpace: 'pre-line',
              }}>
                {slide.title}
              </h1>
              <p style={{ fontSize: 15, color: '#6e6e73', lineHeight: 1.65, margin: 0 }}>
                {slide.desc}
              </p>
            </div>

            {/* Progress dots */}
            <div style={{ display: 'flex', gap: 5, marginBottom: 24 }}>
              {slides.map((_, i) => (
                <div key={i} style={{
                  height: 4, borderRadius: 2, transition: 'all 0.3s ease',
                  width: i === current ? 24 : 8,
                  background: i === current ? '#6C5CE7' : '#e5e5e7',
                }} />
              ))}
            </div>

            {/* Actions */}
            {!isLast ? (
              <button className="ob-btn-primary" onClick={goNext}>Continuer</button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button className="ob-btn-primary" onClick={() => history.push('/register')}>
                  Créer un compte parent
                </button>
                <button className="ob-btn-secondary" onClick={() => history.push('/child-link')}>
                  Je suis un enfant
                </button>
                <button className="ob-btn-ghost" onClick={() => history.push('/login')}>
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
