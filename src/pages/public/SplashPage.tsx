import React from 'react';

const SplashPage: React.FC = () => (
  <div style={{
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--dc-bg)',
    overflow: 'hidden',
    position: 'relative',
  }}>
    <style>{`
      @keyframes splash-ring {
        0%   { transform: scale(0.6); opacity: 0.6; }
        100% { transform: scale(2.4); opacity: 0; }
      }
      @keyframes splash-logo-in {
        0%   { opacity: 0; transform: translateY(14px) scale(0.9); }
        100% { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes splash-tagline-in {
        0%   { opacity: 0; transform: translateY(8px); }
        100% { opacity: 1; transform: translateY(0); }
      }
      @keyframes splash-bar {
        0%   { width: 0%; }
        60%  { width: 70%; }
        100% { width: 100%; }
      }
    `}</style>

    {/* Decorative orbs */}
    <div style={{
      position: 'absolute', top: '10%', left: '-5%',
      width: 260, height: 260, borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(108,92,231,0.12) 0%, transparent 65%)',
      pointerEvents: 'none',
    }} />
    <div style={{
      position: 'absolute', bottom: '15%', right: '-8%',
      width: 200, height: 200, borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(21,101,192,0.08) 0%, transparent 65%)',
      pointerEvents: 'none',
    }} />

    {/* Pulsing rings */}
    {[1, 2, 3].map(i => (
      <div key={i} style={{
        position: 'absolute',
        width: 130, height: 130,
        borderRadius: '50%',
        border: `1.5px solid rgba(108,92,231,${0.35 - i * 0.08})`,
        animation: `splash-ring ${1.8 + i * 0.4}s ease-out infinite`,
        animationDelay: `${i * 0.3}s`,
      }} />
    ))}

    {/* Logo */}
    <div style={{
      width: 80, height: 80, borderRadius: 24,
      background: 'linear-gradient(135deg, #6C5CE7, #A29BFE)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 8px 32px rgba(108,92,231,0.3)',
      animation: 'splash-logo-in 0.6s ease both',
      animationDelay: '0.1s',
      marginBottom: 24,
      zIndex: 1,
    }}>
      <span style={{
        fontSize: 40, fontWeight: 900, color: 'white',
        fontFamily: 'Nunito, -apple-system, sans-serif',
        letterSpacing: -1,
        userSelect: 'none',
      }}>D</span>
    </div>

    {/* App name */}
    <h1 style={{
      color: 'var(--dc-text)', fontSize: 30, fontWeight: 900,
      margin: 0, letterSpacing: -0.8,
      animation: 'splash-logo-in 0.6s ease both',
      animationDelay: '0.25s',
      zIndex: 1,
    }}>
      Deconnect
    </h1>

    {/* Tagline */}
    <p style={{
      color: 'var(--dc-text-muted)', fontSize: 14,
      marginTop: 8, fontWeight: 600, letterSpacing: '0.04em',
      animation: 'splash-tagline-in 0.6s ease both',
      animationDelay: '0.4s',
      zIndex: 1,
    }}>
      Vis la vraie vie
    </p>

    {/* Loading bar */}
    <div style={{
      position: 'absolute', bottom: 56,
      width: 120, height: 3,
      background: 'var(--dc-border)',
      borderRadius: 3, overflow: 'hidden',
      zIndex: 1,
    }}>
      <div style={{
        height: '100%',
        background: 'linear-gradient(90deg, #6C5CE7, #A29BFE)',
        borderRadius: 3,
        animation: 'splash-bar 2s cubic-bezier(0.4,0,0.2,1) both',
        animationDelay: '0.3s',
      }} />
    </div>
  </div>
);

export default SplashPage;
