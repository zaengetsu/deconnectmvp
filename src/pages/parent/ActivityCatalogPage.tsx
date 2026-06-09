import React, { useEffect, useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { activitiesService } from '../../features/activities/activities.service';
import { getCategoryStyle, DifficultyBadge, PointsBadge } from '../../components/ui/ChildUIKit';
import { PlusCircle, Clock, ChevronRight, Search, User, Globe } from 'lucide-react';
import type { Activity, ActivityCategory } from '../../types/database.types';

type SourceFilter = 'all' | 'catalog' | 'custom';

const ActivityCatalogPage: React.FC = () => {
  const history = useHistory();
  const [activities, setActivities]         = useState<Activity[]>([]);
  const [categories, setCategories]         = useState<ActivityCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch]                 = useState('');
  const [sourceFilter, setSourceFilter]     = useState<SourceFilter>('all');

  useEffect(() => {
    activitiesService.getCategories().then(setCategories);
    activitiesService.getActivities().then(setActivities);
  }, []);

  const filtered = activities
    .filter(a => !activeCategory || a.category_id === activeCategory)
    .filter(a => !search || a.title.toLowerCase().includes(search.toLowerCase()))
    .filter(a => {
      if (sourceFilter === 'catalog') return a.activity_type === 'catalog';
      if (sourceFilter === 'custom') return a.activity_type === 'custom_parent';
      return true;
    });

  return (
    <IonPage>
      <IonContent fullscreen scrollY>

        {/* ── Header ── */}
        <div className="dc-page-header">
          <div className="dc-header-row">
            <img src="/images/menu/book.png" alt="catalogue" style={{ width: 26, height: 26, objectFit: 'contain' }} />
            <h1>Catalogue</h1>
          </div>
          <p>{activities.length} activité{activities.length !== 1 ? 's' : ''} disponible{activities.length !== 1 ? 's' : ''}</p>
        </div>

        <div style={{ padding: '16px 20px 100px' }}>
          {/* Search + Create */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <Search size={15} color="var(--dc-text-muted)" strokeWidth={2}
                style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder="Rechercher une activité..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width: '100%', padding: '11px 14px 11px 38px', borderRadius: 12,
                  border: '1.5px solid var(--dc-border)', background: 'white',
                  color: 'var(--dc-text)', fontSize: 14, outline: 'none', boxSizing: 'border-box',
                  fontFamily: 'inherit',
                }}
              />
            </div>
            <button
              onClick={() => history.push('/parent/create-activity')}
              className="dc-btn-icon"
              style={{ width: 44, height: 44, borderRadius: 12 }}
            >
              <PlusCircle size={18} color="var(--dc-primary)" strokeWidth={2} />
            </button>
          </div>
          {/* ── Category chips ── */}
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 20, scrollbarWidth: 'none' }}>
            <button
              onClick={() => setActiveCategory(null)}
              style={{
                flexShrink: 0, padding: '8px 16px', borderRadius: 50, fontSize: 13, fontWeight: 700,
                border: 'none', cursor: 'pointer', transition: 'all 0.18s',
                background: !activeCategory ? 'var(--dc-blue)' : 'white',
                color: !activeCategory ? 'white' : 'var(--dc-text-light)',
                boxShadow: !activeCategory ? '0 3px 12px rgba(21,101,192,0.3)' : 'var(--dc-shadow)',
              }}>
              Tout
            </button>
            {categories.map(c => {
              const { imgSrc, accent } = getCategoryStyle(c.slug);
              const isActive = activeCategory === c.id;
              return (
                <button key={c.id}
                  onClick={() => setActiveCategory(isActive ? null : c.id)}
                  style={{
                    flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 14px', borderRadius: 50, fontSize: 13, fontWeight: 700,
                    border: 'none', cursor: 'pointer', transition: 'all 0.18s',
                    background: isActive ? accent : 'white',
                    color: isActive ? 'white' : 'var(--dc-text)',
                    boxShadow: isActive ? `0 3px 12px ${accent}44` : 'var(--dc-shadow)',
                  }}>
                  <img src={imgSrc} alt="" style={{ width: 14, height: 14, objectFit: 'contain', filter: isActive ? 'brightness(10)' : 'none' }} />
                  {c.name}
                </button>
              );
            })}
          </div>

          {/* ── Source filter ── */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
            {([
              { key: 'all' as SourceFilter, label: 'Tout', icon: null },
              { key: 'catalog' as SourceFilter, label: 'Plateforme', icon: Globe },
              { key: 'custom' as SourceFilter, label: 'Mes créations', icon: User },
            ]).map(({ key, label, icon: FilterIcon }) => {
              const isActive = sourceFilter === key;
              return (
                <button key={key} onClick={() => setSourceFilter(key)} style={{
                  padding: '7px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                  border: `1.5px solid ${isActive ? 'var(--dc-primary)' : 'var(--dc-border)'}`,
                  background: isActive ? 'rgba(108,92,231,0.08)' : 'white',
                  color: isActive ? 'var(--dc-primary)' : 'var(--dc-text-light)',
                  cursor: 'pointer', transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  {FilterIcon && <FilterIcon size={12} strokeWidth={2} />}
                  {label}
                </button>
              );
            })}
          </div>

          {/* ── Activity list ── */}
          {filtered.length === 0 ? (
            <div className="dc-empty-state">
              <div style={{ width: 56, height: 56, borderRadius: 18, background: 'var(--dc-blue-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <Search size={26} color="var(--dc-blue)" strokeWidth={1.5} />
              </div>
              <h3>Aucune activité trouvée</h3>
              <p>{search ? `Aucun résultat pour « ${search} »` : sourceFilter === 'custom' ? 'Vous n\'avez pas encore créé d\'activité' : 'Créez votre première activité !'}</p>
              <button className="dc-btn dc-btn-primary" style={{ marginTop: 8 }}
                onClick={() => history.push('/parent/create-activity')}>
                <PlusCircle size={15} strokeWidth={2} /> Créer une activité
              </button>
            </div>
          ) : filtered.map(a => {
            const { bg, accent, imgSrc } = getCategoryStyle(a.category?.slug);
            return (
              <div key={a.id} className="dc-animate-in" style={{
                display: 'flex', alignItems: 'stretch', marginBottom: 12,
                background: 'white', borderRadius: 18,
                boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                overflow: 'hidden', border: '1.5px solid rgba(0,0,0,0.04)',
              }}>
                {/* Color accent stripe */}
                <div style={{ width: 5, background: accent, flexShrink: 0 }} />

                {/* Icon block */}
                <div style={{
                  width: 60, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: bg, flexShrink: 0,
                }}>
                  <img src={imgSrc} alt="" style={{ width: 28, height: 28, objectFit: 'contain' }} />
                </div>

                {/* Content */}
                <div style={{ flex: 1, padding: '12px 12px 12px 14px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <span style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.3, color: 'var(--dc-text)' }}>
                      {a.title}
                    </span>
                    {a.activity_type === 'custom_parent' && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
                        background: 'rgba(108,92,231,0.1)', color: 'var(--dc-primary)',
                        flexShrink: 0, letterSpacing: 0.3,
                      }}>
                        Perso
                      </span>
                    )}
                  </div>
                  {a.description && (
                    <div style={{
                      fontSize: 12, color: 'var(--dc-text-muted)', marginBottom: 8,
                      overflow: 'hidden', display: '-webkit-box',
                      WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    }}>
                      {a.description}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <PointsBadge points={a.points} size="sm" />
                    <DifficultyBadge difficulty={a.difficulty} />
                    {a.duration_minutes && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--dc-text-muted)', fontWeight: 600 }}>
                        <Clock size={10} strokeWidth={2} /> {a.duration_minutes}min
                      </span>
                    )}
                  </div>
                </div>

                {/* Arrow */}
                <div style={{ display: 'flex', alignItems: 'center', paddingRight: 12, color: 'var(--dc-text-muted)' }}>
                  <ChevronRight size={16} strokeWidth={2} />
                </div>
              </div>
            );
          })}
        </div>
      </IonContent>
    </IonPage>
  );
};

export default ActivityCatalogPage;
