-- Migration 017: Location fields on profiles
-- Used for local activity suggestions, events, and partner proximity

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'FR',
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS region text;
-- country: ISO 3166-1 alpha-2 (FR, BE, CH, CA...)
-- city: free text (Paris, Lyon...)
-- postal_code: for proximity matching
-- region: département / canton / province
