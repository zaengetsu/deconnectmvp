-- Migration 023: Remove emojis from category icons and badge icons
-- The frontend uses getCategoryStyle() with Lucide icons — DB icons are unused

-- Categories: replace emojis with slug-based identifiers
UPDATE activity_categories SET icon = 'sport'           WHERE slug = 'sport';
UPDATE activity_categories SET icon = 'creativite'      WHERE slug = 'creativite';
UPDATE activity_categories SET icon = 'nature'          WHERE slug = 'nature';
UPDATE activity_categories SET icon = 'vie-quotidienne' WHERE slug = 'vie-quotidienne';
UPDATE activity_categories SET icon = 'social'          WHERE slug = 'social';
UPDATE activity_categories SET icon = 'lecture'          WHERE slug = 'lecture';
UPDATE activity_categories SET icon = 'famille'         WHERE slug = 'famille';
UPDATE activity_categories SET icon = 'cuisine'         WHERE slug = 'cuisine';

-- Badges: replace emojis with text identifiers
UPDATE badges SET icon = 'seedling'    WHERE icon = '🌱';
UPDATE badges SET icon = 'compass'     WHERE icon = '🧭';
UPDATE badges SET icon = 'mountain'    WHERE icon = '⛰️';
UPDATE badges SET icon = 'trophy'      WHERE icon = '🏆';
UPDATE badges SET icon = 'crown'       WHERE icon = '👑';
UPDATE badges SET icon = 'star'        WHERE icon = '⭐';
UPDATE badges SET icon = 'gem'         WHERE icon = '💎';
UPDATE badges SET icon = 'sparkle'     WHERE icon = '🌟';
UPDATE badges SET icon = 'flame'       WHERE icon = '🔥';
