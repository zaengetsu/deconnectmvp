-- Migration 022: Allow all authenticated users to read catalog rewards
-- The existing policy "parent_rewards_select" only allows parent_id = auth.uid()
-- Catalog rewards have parent_id = NULL, so they need a separate policy

CREATE POLICY "catalog_rewards_select" ON rewards
  FOR SELECT
  USING (parent_id IS NULL AND reward_type = 'catalog');
