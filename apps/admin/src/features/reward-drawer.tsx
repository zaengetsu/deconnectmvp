'use client';
import { type CatalogReward, formatNumber } from '@rekonect/api-client';
import { Button, C, Drawer, Field, Select, TextArea, TextInput, ToggleRow, useToast } from '@rekonect/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useAdmin } from '@/lib/api';
import { REWARD_CATEGORY } from '@/lib/labels';

/** Création / édition d'une idée de récompense native. */
export function RewardDrawer({ id, reward, onClose }: { id: string | null; reward: CatalogReward | null; onClose: () => void }) {
  const api = useAdmin();
  const qc = useQueryClient();
  const toast = useToast();
  const isNew = id === 'new';
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [points, setPoints] = useState('80');
  const [category, setCategory] = useState('privilege');
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (isNew || !reward) {
      setTitle('');
      setDescription('');
      setPoints('80');
      setCategory('privilege');
      setActive(true);
    } else {
      setTitle(reward.title);
      setDescription(reward.description ?? '');
      setPoints(String(reward.requiredPoints));
      setCategory(reward.rewardCategory ?? 'privilege');
      setActive(reward.isActive);
    }
  }, [isNew, reward]);

  const save = useMutation({
    mutationFn: () => {
      const body = { title: title.trim(), description: description.trim() || undefined, requiredPoints: Number(points), rewardCategory: category };
      if (body.title.length < 2) throw new Error('Titre trop court');
      if (!Number.isInteger(body.requiredPoints) || body.requiredPoints < 0) throw new Error('Nombre de points invalide');
      return isNew ? api.createReward(body) : api.updateReward(id!, { ...body, isActive: active });
    },
    onSuccess: () => {
      toast(isNew ? 'Récompense ajoutée au catalogue' : 'Récompense enregistrée', 'success');
      void qc.invalidateQueries({ queryKey: ['catalog-rewards'] });
      onClose();
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  return (
    <Drawer
      open={!!id && (isNew || !!reward)}
      kicker={isNew ? 'NOUVELLE RÉCOMPENSE NATIVE' : 'RÉCOMPENSE NATIVE'}
      onClose={onClose}
      footer={
        <>
          <Button height={44} block shadow={false} loading={save.isPending} onClick={() => save.mutate()} style={{ flex: 1, fontSize: 14 }}>
            Enregistrer
          </Button>
          <Button variant="outline" height={44} onClick={onClose} style={{ width: 110, padding: 0, fontSize: 14 }}>
            Annuler
          </Button>
        </>
      }
    >
      {reward && !isNew && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 24 }}>
          <div style={{ background: '#F6F4F1', borderRadius: 14, padding: 12 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{formatNumber(reward.families)}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Familles l’utilisant</div>
          </div>
          <div style={{ background: '#F6F4F1', borderRadius: 14, padding: 12 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{formatNumber(reward.exchanges30d)}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Échanges (30 j)</div>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Titre" htmlFor="rew-title">
          <TextInput id="rew-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Choisir le film du samedi" />
        </Field>
        <Field label="Description (facultative)" htmlFor="rew-desc">
          <TextArea id="rew-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 10 }}>
          <Field label="Points suggérés" htmlFor="rew-points">
            <TextInput id="rew-points" type="number" min={0} weight={700} value={points} onChange={(e) => setPoints(e.target.value)} />
          </Field>
          <Field label="Catégorie" htmlFor="rew-cat">
            <Select id="rew-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
              {Object.entries(REWARD_CATEGORY).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {!isNew && (
          <div style={{ border: '1px solid rgba(22,24,43,.08)', borderRadius: 14, overflow: 'hidden' }}>
            <ToggleRow label="Visible par les familles" checked={active} onChange={setActive} last />
          </div>
        )}
      </div>
    </Drawer>
  );
}
