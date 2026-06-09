/**
 * Deconnect — Reusable UI Components (Child Space)
 * Charte visuelle: /artifacts/visual_charter.md
 */
import React from 'react';

/* ─── Category config ─────────────────────────────────────── */
export const CATEGORY_STYLE: Record<string, { bg: string; accent: string; imgSrc: string }> = {
  sport:              { bg: 'var(--cat-sport-bg)',    accent: 'var(--cat-sport-accent)',    imgSrc: '/images/categories/track.png' },
  nature:             { bg: 'var(--cat-nature-bg)',   accent: 'var(--cat-nature-accent)',   imgSrc: '/images/categories/eco.png' },
  creativite:         { bg: 'var(--cat-creative-bg)', accent: 'var(--cat-creative-accent)', imgSrc: '/images/categories/watercolor.png' },
  famille:            { bg: 'var(--cat-family-bg)',   accent: 'var(--cat-family-accent)',   imgSrc: '/images/categories/family.png' },
  lecture:            { bg: 'var(--cat-reading-bg)',  accent: 'var(--cat-reading-accent)',  imgSrc: '/images/categories/books.png' },
  cuisine:            { bg: 'var(--cat-cooking-bg)',  accent: 'var(--cat-cooking-accent)',  imgSrc: '/images/categories/kung-pao-chicken.png' },
  'vie-quotidienne':  { bg: 'var(--dc-blue-light)',   accent: 'var(--dc-blue)',             imgSrc: '/images/categories/calendar.png' },
};

const DEFAULT_CATEGORY = { bg: '#F0F4FF', accent: '#6C5CE7', imgSrc: '/images/categories/emoji.png' };

export function getCategoryStyle(slug?: string | null) {
  if (!slug) return DEFAULT_CATEGORY;
  return CATEGORY_STYLE[slug.toLowerCase()] ?? DEFAULT_CATEGORY;
}

/* ─── PointsBadge ─────────────────────────────────────────── */
interface PointsBadgeProps {
  points: number;
  size?: 'sm' | 'md' | 'lg';
}
export const PointsBadge: React.FC<PointsBadgeProps> = ({ points, size = 'md' }) => {
  const fontSize = size === 'sm' ? 11 : size === 'lg' ? 15 : 12;
  const iconSize = size === 'sm' ? 10 : size === 'lg' ? 14 : 12;
  const padding  = size === 'sm' ? '2px 8px' : size === 'lg' ? '5px 14px' : '3px 10px';
  return (
    <span className="dc-points-badge" style={{ fontSize, padding }}>
      <img src="/images/menu/star.png" alt="pts" style={{ width: iconSize, height: iconSize, objectFit: 'contain', verticalAlign: 'middle' }} />
      {points} pts
    </span>
  );
};

/* ─── DifficultyBadge ─────────────────────────────────────── */
const DIFFICULTY_CFG: Record<string, { label: string; color: string; bg: string }> = {
  easy:   { label: 'Facile',  color: '#34C759', bg: '#E8F8ED' },
  medium: { label: 'Moyen',   color: '#F59E0B', bg: '#FEF3C7' },
  hard:   { label: 'Difficile', color: '#EF4444', bg: '#FEF2F2' },
};
export const DifficultyBadge: React.FC<{ difficulty: string }> = ({ difficulty }) => {
  const cfg = DIFFICULTY_CFG[difficulty] ?? DIFFICULTY_CFG.medium;
  return (
    <span className="dc-badge-pill" style={{ background: cfg.bg, color: cfg.color, fontSize: 11, padding: '2px 8px' }}>
      {cfg.label}
    </span>
  );
};

/* ─── ActivityCard (grille 2 colonnes) ────────────────────── */
interface ActivityCardProps {
  title: string;
  points: number;
  difficulty?: string;
  categorySlug?: string | null;
  durationMin?: number | null;
  onPress?: () => void;
  actionLabel?: string;
}
export const ActivityCard: React.FC<ActivityCardProps> = ({
  title, points, difficulty, categorySlug, onPress, actionLabel = 'Choisir',
}) => {
  const { bg, imgSrc } = getCategoryStyle(categorySlug);
  return (
    <div className="dc-activity-card dc-animate-in" onClick={onPress}>
      {/* Icon zone */}
      <div style={{
        width: '100%', height: 72, borderRadius: 14,
        background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <img src={imgSrc} alt="" style={{ width: 36, height: 36, objectFit: 'contain' }} />
      </div>
      {/* Content */}
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.3, marginBottom: 6, color: 'var(--dc-text)' }}>
          {title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <PointsBadge points={points} size="sm" />
          {difficulty && <DifficultyBadge difficulty={difficulty} />}
        </div>
      </div>
      {/* CTA */}
      {onPress && (
        <button
          className="dc-btn dc-btn-green dc-btn-full"
          style={{ height: 38, fontSize: 13, borderRadius: 50 }}
          onClick={e => { e.stopPropagation(); onPress(); }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};

/* ─── ActivityListItem (vue liste) ───────────────────────────*/
interface ActivityListItemProps {
  title: string;
  points: number;
  difficulty?: string;
  categorySlug?: string | null;
  status?: 'available' | 'selected' | 'submitted' | 'validated' | 'rejected';
  statusLabel?: string;
  onAction?: () => void;
  actionLabel?: string;
}
export const ActivityListItem: React.FC<ActivityListItemProps> = ({
  title, points, categorySlug, status, statusLabel, onAction, actionLabel,
}) => {
  const { bg, imgSrc } = getCategoryStyle(categorySlug);

  const statusColor = status === 'validated' ? 'var(--dc-green)'
    : status === 'submitted' ? 'var(--dc-gold)'
    : status === 'rejected'  ? 'var(--dc-danger)'
    : 'var(--dc-border)';

  return (
    <div className="dc-card dc-animate-in" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
      {/* Icon */}
      <div style={{ width: 44, height: 44, borderRadius: 12, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <img src={imgSrc} alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} />
      </div>
      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
          <PointsBadge points={points} size="sm" />
          {statusLabel && (
            <span style={{ fontSize: 11, color: statusColor, fontWeight: 600 }}>{statusLabel}</span>
          )}
        </div>
      </div>
      {/* Action */}
      {onAction && (
        <button className="dc-btn dc-btn-green" style={{ height: 36, padding: '0 14px', fontSize: 13 }} onClick={onAction}>
          {actionLabel || 'Action'}
        </button>
      )}
    </div>
  );
};

/* ─── StatCard ────────────────────────────────────────────── */
interface StatCardProps {
  value: string | number;
  label: string;
  gradient: string;
  icon?: React.ReactNode;
}
export const StatCard: React.FC<StatCardProps> = ({ value, label, gradient, icon }) => (
  <div style={{
    background: gradient, borderRadius: 'var(--dc-radius-lg)', padding: '16px 14px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
    boxShadow: 'var(--dc-shadow-md)',
  }}>
    {icon}
    <div style={{ fontSize: 26, fontWeight: 900, color: 'white', lineHeight: 1 }}>{value}</div>
    <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.85)', textAlign: 'center' }}>{label}</div>
  </div>
);

/* ─── HeroHeader ──────────────────────────────────────────── */
interface HeroHeaderProps {
  name: string;
  initials: string;
  avatarUrl?: string | null;
  levelName: string;
  levelColor: string;
  totalPoints: number;
  xpProgress: number;
}
export const HeroHeader: React.FC<HeroHeaderProps> = ({
  name, initials, avatarUrl, levelName, levelColor, totalPoints, xpProgress,
}) => (
  <div style={{
    background: `linear-gradient(135deg, var(--dc-blue) 0%, var(--dc-blue-mid) 100%)`,
    padding: '52px 24px 28px', color: 'white', position: 'relative', overflow: 'hidden',
    borderRadius: '0 0 28px 28px',
  }}>
    {/* Decorative orb */}
    <div style={{
      position: 'absolute', top: -30, right: -30, width: 160, height: 160, borderRadius: '50%',
      background: 'rgba(255,255,255,0.06)', pointerEvents: 'none',
    }} />
    <div style={{
      position: 'absolute', bottom: -20, left: -20, width: 100, height: 100, borderRadius: '50%',
      background: 'rgba(255,255,255,0.04)', pointerEvents: 'none',
    }} />

    {/* Avatar + Name */}
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
      {avatarUrl?.startsWith('/images/avatars/') ? (
        <div style={{
          width: 68, height: 68, borderRadius: '50%', overflow: 'hidden',
          border: '3px solid rgba(255,255,255,0.4)', flexShrink: 0, background: '#EDE7FF',
        }}>
          <img src={avatarUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </div>
      ) : (
        <div className="dc-avatar dc-avatar-lg" style={{
          background: `${levelColor}90`,
          border: '3px solid rgba(255,255,255,0.4)',
          fontSize: 26,
        }}>
          {initials}
        </div>
      )}
      <div>
        <p style={{ fontSize: 13, opacity: 0.75, margin: 0, fontWeight: 600 }}>Salut !</p>
        <h1 style={{ fontSize: 26, fontWeight: 900, margin: '2px 0 0', letterSpacing: -0.5 }}>{name}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <img src="/images/menu/trophy.png" alt="niveau" style={{ width: 14, height: 14, objectFit: 'contain' }} />
          <span style={{ fontSize: 13, fontWeight: 700, opacity: 0.9 }}>{levelName}</span>
        </div>
      </div>
    </div>


    {/* XP bar */}
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.8 }}>Progression</span>
        <span style={{ fontSize: 12, fontWeight: 800 }}>
          <img src="/images/menu/star.png" alt="pts" style={{ width: 12, height: 12, objectFit: 'contain', verticalAlign: 'middle', marginRight: 3 }} />
          {totalPoints} pts
        </span>
      </div>
      <div className="dc-xp-bar">
        <div className="dc-xp-fill" style={{ width: `${xpProgress}%` }} />
      </div>
    </div>
  </div>
);

/* ─── EncouragementCard ───────────────────────────────────── */
const MESSAGES = [
  "Tu es incroyable ! Continue comme ça !",
  "Chaque défi accompli te rend plus fort !",
  "Tu peux le faire, on croit en toi !",
  "Un pas à la fois — tu avances !",
  "Bravo pour hier, encore mieux aujourd'hui !",
];
export const EncouragementCard: React.FC = () => {
  const msg = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
  return (
    <div style={{
      background: 'white',
      borderRadius: 'var(--dc-radius-lg)', padding: '14px 18px',
      border: '1px solid var(--dc-border)',
      boxShadow: 'var(--dc-shadow)',
    }}>
      <p style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--dc-text)', lineHeight: 1.5 }}>
        {msg}
      </p>
    </div>
  );
};

/* ─── WeeklyTracker ───────────────────────────────────────── */
interface WeeklyDay {
  day: string;
  date: string;
  count: number;
  points: number;
  isToday: boolean;
}
interface WeeklyTrackerProps {
  days: WeeklyDay[];
}
export const WeeklyTracker: React.FC<WeeklyTrackerProps> = ({ days }) => {
  const maxCount = Math.max(1, ...days.map(d => d.count));
  const totalActivities = days.reduce((s, d) => s + d.count, 0);
  const totalPoints = days.reduce((s, d) => s + d.points, 0);
  const activeDays = days.filter(d => d.count > 0).length;

  return (
    <div style={{
      background: 'white', borderRadius: 20, padding: '18px 16px',
      boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--dc-text)' }}>
          Cette semaine
        </span>
        <div style={{ display: 'flex', gap: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--dc-green)' }}>
            {totalActivities} activité{totalActivities !== 1 ? 's' : ''}
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--dc-gold-dark)' }}>
            +{totalPoints} pts
          </span>
        </div>
      </div>

      {/* Day columns */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
        {days.map((d, i) => {
          const barHeight = d.count > 0 ? Math.max(12, (d.count / maxCount) * 48) : 4;
          const hasActivity = d.count > 0;
          return (
            <div key={i} style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            }}>
              {/* Bar */}
              <div style={{
                width: '100%', height: 52, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
              }}>
                <div style={{
                  width: '80%', maxWidth: 28, height: barHeight, borderRadius: 6,
                  background: hasActivity
                    ? d.isToday ? 'var(--dc-blue)' : 'var(--dc-green)'
                    : 'var(--dc-border)',
                  transition: 'height 0.4s ease',
                }} />
              </div>
              {/* Count */}
              {hasActivity && (
                <span style={{
                  fontSize: 11, fontWeight: 800,
                  color: d.isToday ? 'var(--dc-blue)' : 'var(--dc-green)',
                }}>
                  {d.count}
                </span>
              )}
              {/* Day label */}
              <span style={{
                fontSize: 11, fontWeight: d.isToday ? 900 : 600,
                color: d.isToday ? 'var(--dc-blue)' : 'var(--dc-text-muted)',
              }}>
                {d.day}
              </span>
              {/* Today dot */}
              {d.isToday && (
                <div style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: 'var(--dc-blue)', marginTop: -2,
                }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div style={{
        marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--dc-border)',
        textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--dc-text-light)',
      }}>
        {activeDays === 0
          ? 'Aucune activité cette semaine — c\'est le moment !'
          : `${activeDays}/7 jour${activeDays > 1 ? 's' : ''} actif${activeDays > 1 ? 's' : ''}`
        }
      </div>
    </div>
  );
};
