import React, { useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useSwipe } from '../../hooks/useSwipe';

/** Onboarding — porté de la maquette Rekonect (écrans ob1 / ob2 / ob3), texte pour texte. */

const SLIDES = [
  {
    title: <>Le temps d'écran<br />devient du temps vécu</>,
    body: 'Vous proposez des activités, votre enfant les choisit et les réalise. Chaque effort compte.',
    caption: 'enfant qui pose son téléphone et sort jouer',
  },
  {
    title: <>Chaque effort<br />ouvre une porte</>,
    body: 'Les points gagnés se transforment en récompenses que vous définissez : une sortie, un privilège, un moment ensemble.',
    caption: 'points, niveaux et récompense débloquée',
  },
  {
    title: <>Toute la famille,<br />au même endroit</>,
    body: 'Invitez un co-parent ou un éducateur. Chacun voit les progrès et peut valider.',
    caption: 'parents et enfants autour du même tableau',
  },
];

const OnboardingPage: React.FC = () => {
  const history = useHistory();
  const [step, setStep] = useState(0);
  const slide = SLIDES[step];
  const last = step === SLIDES.length - 1;

  const next = () => setStep(s => Math.min(s + 1, SLIDES.length - 1));
  const prev = () => setStep(s => Math.max(s - 1, 0));
  const swipe = useSwipe({
    onLeft:  () => (last ? false : (next(), true)),
    onRight: () => (step === 0 ? false : (prev(), true)),
  });

  const cta: React.CSSProperties = {
    width: '100%', height: 54, borderRadius: 999, background: 'var(--rk-indigo)',
    color: 'var(--rk-indigofg)', fontSize: 15, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };

  return (
    <IonPage><IonContent fullscreen>
      <div className="rk-app rk-screen" style={{
        minHeight: '100%', background: 'var(--rk-bg)',
        display: 'flex', flexDirection: 'column',
      }} {...swipe}>
        <div style={{
          padding: 'calc(env(safe-area-inset-top) + 16px) 26px 0',
          flex: 1, display: 'flex', flexDirection: 'column',
        }}>
          {/* En-tête : logo (ob1) ou ← Retour (ob2/ob3) ; « Passer » sauf sur le dernier */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, minHeight: 30 }}>
            {step === 0 ? (
              <div style={{ width: 30, height: 30, position: 'relative' }}>
                <div style={{ position: 'absolute', left: 0, top: 7, width: 17, height: 17, borderRadius: '50%', border: '2.5px solid var(--rk-indigo)' }} />
                <div style={{ position: 'absolute', left: 11, top: 7, width: 17, height: 17, borderRadius: '50%', border: '2.5px solid var(--rk-accent)' }} />
              </div>
            ) : (
              <button onClick={prev} style={{ fontSize: 13, fontWeight: 600, color: 'var(--rk-text3)' }}>← Retour</button>
            )}
            {!last && (
              <button onClick={() => history.push('/login')} style={{
                height: 30, padding: '0 13px', borderRadius: 999, background: 'var(--rk-surface2)',
                fontSize: 12, fontWeight: 700, color: 'var(--rk-text3)',
                display: 'flex', alignItems: 'center',
              }}>Passer</button>
            )}
          </div>

          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 230 }}>
            <div style={{
              width: '100%', height: 230, borderRadius: 24, background: 'var(--rk-surface)',
              border: '1px solid var(--rk-border)',
              backgroundImage: 'repeating-linear-gradient(115deg, var(--rk-line) 0 1px, transparent 1px 12px)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 7,
            }}>
              <div style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 11, color: 'var(--rk-text3)' }}>
                illustration {step + 1}/3
              </div>
              <div style={{
                fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 10, color: 'var(--rk-text3)',
                textAlign: 'center', maxWidth: '22ch', lineHeight: 1.6,
              }}>{slide.caption}</div>
            </div>
          </div>
        </div>

        <div style={{
          background: 'var(--rk-surface)', borderRadius: '30px 30px 0 0',
          padding: `28px 26px calc(${last ? 36 : 40}px + env(safe-area-inset-bottom))`,
          borderTop: '1px solid var(--rk-border)',
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '.14em',
            color: 'var(--rk-text3)', marginBottom: 14,
          }}>0{step + 1} / 03</div>

          <h1 style={{
            fontSize: 29, fontWeight: 800, letterSpacing: '-.035em',
            lineHeight: 1.15, margin: 0, color: 'var(--rk-text)',
          }}>{slide.title}</h1>

          <p style={{
            fontSize: 15, color: 'var(--rk-text2)', lineHeight: 1.6,
            margin: '14px 0 0', textWrap: 'pretty',
          }}>{slide.body}</p>

          <div style={{ display: 'flex', gap: 5, margin: last ? '24px 0 18px' : '26px 0 20px' }}>
            {SLIDES.map((_, i) => (
              <div key={i} style={{
                height: 4, width: i === step ? 28 : 8, borderRadius: 2,
                background: i === step ? 'var(--rk-indigo)' : 'var(--rk-border)',
                transition: 'width .2s',
              }} />
            ))}
          </div>

          {!last ? (
            <button onClick={next} style={cta}>Continuer</button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <button onClick={() => history.push('/register')} style={cta}>Créer un compte parent</button>
              <button onClick={() => history.push('/child-link')} style={{
                width: '100%', height: 52, borderRadius: 999, border: '1.5px solid var(--rk-border)',
                color: 'var(--rk-text)', fontSize: 15, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>Je suis un enfant</button>
              <button onClick={() => history.push('/login')} style={{
                width: '100%', height: 40, fontSize: 14, fontWeight: 600, color: 'var(--rk-text3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>J'ai déjà un compte</button>
            </div>
          )}
        </div>
      </div>
    </IonContent></IonPage>
  );
};

export default OnboardingPage;
