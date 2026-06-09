import React from 'react';

const SplashPage: React.FC = () => (
  <div style={{
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0f0e17',
    overflow: 'hidden',
    position: 'relative',
  }}>
    <style>{`
      @keyframes splash-ring-1 {
        0%   { transform: scale(0.6); opacity: 0.7; }
        100% { transform: scale(2.2); opacity: 0; }
      }
      @keyframes splash-ring-2 {
        0%   { transform: scale(0.6); opacity: 0.5; }
        100% { transform: scale(2.2); opacity: 0; }
      }
      @keyframes splash-ring-3 {
        0%   { transform: scale(0.6); opacity: 0.3; }
        100% { transform: scale(2.2); opacity: 0; }
      }
      @keyframes splash-logo-in {
        0%   { opacity: 0; transform: translateY(12px); }
        100% { opacity: 1; transform: translateY(0); }
      }
      @keyframes splash-tagline-in {
        0%   { opacity: 0; transform: translateY(8px); }
        100% { opacity: 1; transform: translateY(0); }
      }
      @keyframes splash-bar {
        0%   { width: 0%; }
        60%  { width: 75%; }
        100% { width: 100%; }
      }
      @keyframes splash-dot {
        0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; }
        40%            { transform: scale(1);   opacity: 1; }
      }
    `}</style>

    {/* Pulsing rings behind logo */}
    {[1, 2, 3].map(i => (
      <div key={i} style={{
        position: 'absolute',
        width: 120, height: 120,
        borderRadius: '50%',
        border: `1px solid rgba(108,92,231,${0.5 - i * 0.12})`,
        animation: `splash-ring-${i} ${1.8 + i * 0.4}s ease-out infinite`,
        animationDelay: `${i * 0.3}s`,
      }} />
    ))}

    {/* Logo mark — geometric D */}
    <div style={{
      width: 72, height: 72, borderRadius: 20,
      background: 'linear-gradient(135deg, #6C5CE7, #A29BFE)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 0 40px rgba(108,92,231,0.45)',
      animation: 'splash-logo-in 0.6s ease both',
      animationDelay: '0.1s',
      marginBottom: 28,
      zIndex: 1,
    }}>
      <span style={{
        fontSize: 36, fontWeight: 900, color: 'white',
        fontFamily: 'Nunito, -apple-system, sans-serif',
        letterSpacing: -1,
        userSelect: 'none',
      }}>D</span>
    </div>

    {/* App name */}
    <h1 style={{
      color: 'white', fontSize: 28, fontWeight: 800,
      margin: 0, letterSpacing: -0.8,
      animation: 'splash-logo-in 0.6s ease both',
      animationDelay: '0.25s',
      zIndex: 1,
    }}>
      Deconnect
    </h1>

    {/* Tagline */}
    <p style={{
      color: 'rgba(255,255,255,0.45)', fontSize: 13,
      marginTop: 8, fontWeight: 500, letterSpacing: '0.06em',
      textTransform: 'uppercase',
      animation: 'splash-tagline-in 0.6s ease both',
      animationDelay: '0.4s',
      zIndex: 1,
    }}>
      Vis la vraie vie
    </p>

    {/* Loading bar */}
    <div style={{
      position: 'absolute', bottom: 52,
      width: 120, height: 2,
      background: 'rgba(255,255,255,0.1)',
      borderRadius: 2, overflow: 'hidden',
      zIndex: 1,
    }}>
      <div style={{
        height: '100%',
        background: 'linear-gradient(90deg, #6C5CE7, #A29BFE)',
        borderRadius: 2,
        animation: 'splash-bar 2s cubic-bezier(0.4,0,0.2,1) both',
        animationDelay: '0.3s',
      }} />
    </div>

    {/* Subtle background gradient orbs */}
    <div style={{
      position: 'absolute', top: '15%', left: '10%',
      width: 200, height: 200, borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(108,92,231,0.15) 0%, transparent 70%)',
      pointerEvents: 'none',
    }} />
    <div style={{
      position: 'absolute', bottom: '20%', right: '8%',
      width: 160, height: 160, borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(162,155,254,0.12) 0%, transparent 70%)',
      pointerEvents: 'none',
    }} />
  </div>
);

export default SplashPage;
