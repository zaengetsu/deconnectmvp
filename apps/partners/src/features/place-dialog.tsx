'use client';
import type { Place } from '@rekonect/api-client';
import { Button, C, Field, Modal, Select, TextInput, useToast } from '@rekonect/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { usePartner, usePartnerApi } from '@/lib/partner';

interface AddressHit {
  label: string;
  name: string;
  postcode: string;
  city: string;
  lat: number;
  lng: number;
}

/** Géocodage via la Base adresse nationale (api-adresse.data.gouv.fr), service public sans clé. */
export async function searchAddress(q: string, fetchFn: typeof fetch = fetch): Promise<AddressHit[]> {
  if (q.trim().length < 4) return [];
  const res = await fetchFn(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=5`);
  if (!res.ok) return [];
  const body = (await res.json()) as { features?: { properties: { label: string; name: string; postcode: string; city: string }; geometry: { coordinates: [number, number] } }[] };
  return (body.features ?? []).map((f) => ({ label: f.properties.label, name: f.properties.name, postcode: f.properties.postcode, city: f.properties.city, lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
}

const EMPTY = { name: '', address: '', postalCode: '', city: '', latitude: '', longitude: '', managerName: '', managerEmail: '', accessLevel: 'delegated' };

/** Ajouter ou modifier un lieu. Une enseigne peut créer un magasin rattaché (avec son propre accès). */
export function PlaceDialog({ value, onClose }: { value: Place | 'new' | null; onClose: () => void }) {
  const api = usePartnerApi();
  const { partnerId, detail } = usePartner();
  const qc = useQueryClient();
  const toast = useToast();
  const isNew = value === 'new';
  const canCreateStore = detail?.kind === 'brand';
  const [asStore, setAsStore] = useState(canCreateStore);
  const [f, setF] = useState(EMPTY);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<AddressHit[]>([]);
  const set = (k: keyof typeof EMPTY, v: string) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    setAsStore(canCreateStore);
    setHits([]);
    setQuery('');
    if (value && value !== 'new')
      setF({ name: value.name, address: value.address ?? '', postalCode: value.postalCode ?? '', city: value.city ?? '', latitude: value.latitude?.toString() ?? '', longitude: value.longitude?.toString() ?? '', managerName: value.managerName ?? '', managerEmail: '', accessLevel: value.accessLevel });
    else setF(EMPTY);
  }, [value, canCreateStore]);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      void searchAddress(query).then((h) => alive && setHits(h)).catch(() => undefined);
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['places'] });
    void qc.invalidateQueries({ queryKey: ['partner'] });
    void qc.invalidateQueries({ queryKey: ['partner-accounts'] });
    void qc.invalidateQueries({ queryKey: ['audience'] });
  };
  const num = (v: string) => (v.trim() === '' ? undefined : Number(v.replace(',', '.')));
  const save = useMutation({
    mutationFn: async () => {
      const base = { name: f.name.trim(), address: f.address || undefined, postalCode: f.postalCode || undefined, city: f.city || undefined, latitude: num(f.latitude), longitude: num(f.longitude), managerName: f.managerName || undefined };
      if (isNew && asStore) return api.createStore(partnerId!, { ...base, managerEmail: f.managerEmail.trim() });
      if (isNew) return api.createPlace(partnerId!, { ...base, accessLevel: f.accessLevel as Place['accessLevel'] });
      return api.updatePlace(partnerId!, (value as Place).id, { ...base, accessLevel: f.accessLevel as Place['accessLevel'] });
    },
    onSuccess: () => {
      toast(isNew ? (asStore ? `Magasin créé · invitation envoyée à ${f.managerEmail}` : 'Lieu ajouté') : 'Lieu enregistré', 'success');
      refresh();
      onClose();
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const remove = useMutation({
    mutationFn: () => api.updatePlace(partnerId!, (value as Place).id, { isActive: false }),
    onSuccess: () => {
      toast('Lieu retiré', 'success');
      refresh();
      onClose();
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  return (
    <Modal
      open={!!value}
      title={isNew ? (asStore ? 'Ajouter un magasin' : 'Ajouter un lieu') : 'Modifier le lieu'}
      onClose={onClose}
      width={540}
      footer={
        <>
          {!isNew && (
            <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()} style={{ marginRight: 'auto' }}>
              Retirer ce lieu
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="dark" loading={save.isPending} disabled={f.name.trim().length < 2 || (isNew && asStore && !f.managerEmail.includes('@'))} onClick={() => save.mutate()}>
            {isNew ? 'Ajouter' : 'Enregistrer'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {isNew && canCreateStore && (
          <div role="tablist" style={{ display: 'flex', gap: 4, background: '#F1EEE9', padding: 4, borderRadius: 12 }}>
            {[
              [true, 'Magasin rattaché (avec accès)'],
              [false, 'Simple lieu'],
            ].map(([v, l]) => (
              <button key={String(v)} type="button" role="tab" aria-selected={asStore === v} onClick={() => setAsStore(v as boolean)} style={{ flex: 1, height: 34, borderRadius: 9, fontSize: 13, fontWeight: 700, textAlign: 'center', background: asStore === v ? '#fff' : 'transparent', color: asStore === v ? C.ink : C.muted }}>
                {l as string}
              </button>
            ))}
          </div>
        )}
        <Field label="Nom" htmlFor="place-name">
          <TextInput id="place-name" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Decathlon Lyon Part-Dieu" focusColor={C.coral} />
        </Field>
        <div style={{ position: 'relative' }}>
          <Field label="Rechercher l’adresse" htmlFor="place-search" hint="Remplit l’adresse et la position sur la carte">
            <TextInput id="place-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="17 rue du Dr Bouchut, Lyon" autoComplete="off" focusColor={C.coral} />
          </Field>
          {hits.length > 0 && (
            <div role="listbox" style={{ position: 'absolute', top: 74, left: 0, right: 0, zIndex: 5, background: '#fff', border: '1px solid rgba(22,24,43,.1)', borderRadius: 12, boxShadow: '0 20px 40px -16px rgba(22,24,43,.3)', padding: 4 }}>
              {hits.map((h) => (
                <button
                  key={h.label}
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="rk-row"
                  onClick={() => {
                    setF((s) => ({ ...s, address: h.name, postalCode: h.postcode, city: h.city, latitude: h.lat.toFixed(6), longitude: h.lng.toFixed(6) }));
                    setHits([]);
                    setQuery(h.label);
                  }}
                  style={{ width: '100%', padding: '9px 10px', borderRadius: 9, fontSize: 13, fontWeight: 600 }}
                >
                  {h.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.4fr', gap: 10 }}>
          <Field label="Adresse" htmlFor="place-address">
            <TextInput id="place-address" value={f.address} onChange={(e) => set('address', e.target.value)} />
          </Field>
          <Field label="Code postal" htmlFor="place-cp">
            <TextInput id="place-cp" value={f.postalCode} onChange={(e) => set('postalCode', e.target.value)} />
          </Field>
          <Field label="Ville" htmlFor="place-city">
            <TextInput id="place-city" value={f.city} onChange={(e) => set('city', e.target.value)} />
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Latitude" htmlFor="place-lat">
            <TextInput id="place-lat" inputMode="decimal" value={f.latitude} onChange={(e) => set('latitude', e.target.value)} />
          </Field>
          <Field label="Longitude" htmlFor="place-lng">
            <TextInput id="place-lng" inputMode="decimal" value={f.longitude} onChange={(e) => set('longitude', e.target.value)} />
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Responsable" htmlFor="place-manager">
            <TextInput id="place-manager" value={f.managerName} onChange={(e) => set('managerName', e.target.value)} placeholder="Karim B." />
          </Field>
          {isNew && asStore ? (
            <Field label="Email du responsable" htmlFor="place-email" hint="Il reçoit une invitation à son espace magasin">
              <TextInput id="place-email" type="email" value={f.managerEmail} onChange={(e) => set('managerEmail', e.target.value)} />
            </Field>
          ) : (
            <Field label="Accès" htmlFor="place-access">
              <Select id="place-access" value={f.accessLevel} onChange={(e) => set('accessLevel', e.target.value)}>
                <option value="delegated">Délégué</option>
                <option value="admin">Admin</option>
                <option value="read">Lecture</option>
                <option value="reception">Accueil (validation des bons)</option>
              </Select>
            </Field>
          )}
        </div>
      </div>
    </Modal>
  );
}
