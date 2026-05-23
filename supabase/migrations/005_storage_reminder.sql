-- Migration 005: Supabase Storage bucket pour les preuves d'activité
-- Ce script crée aussi le bucket storage côté SQL (si supporté)

-- On s'assure que le bucket activity-proofs est créé via la fonction storage
-- (À compléter via le dashboard Supabase : Storage → New bucket → "activity-proofs" → Public)
-- La politique RLS pour le storage est gérée via le dashboard

-- Rien d'autre à migrer ici — le bucket se crée via dashboard ou API
SELECT 'Storage bucket must be created via Supabase Dashboard: Storage → New bucket → activity-proofs → Public' AS reminder;
