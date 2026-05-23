-- Migration 018: Add Cuisine category + activities (from brief)
-- The brief explicitly lists Cuisine as a creative activity category

INSERT INTO activity_categories (name, slug, icon)
VALUES ('Cuisine', 'cuisine', '🍳')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO activities (title, description, points, duration_minutes, difficulty, category_id) VALUES
('Préparer un petit-déjeuner', 'Prépare ton propre petit-déjeuner ce matin', 15, 15, 'easy',
  (SELECT id FROM activity_categories WHERE slug='cuisine')),
('Faire une salade', 'Prépare une salade avec ce que tu trouves dans le frigo', 15, 20, 'easy',
  (SELECT id FROM activity_categories WHERE slug='cuisine')),
('Aider à préparer le dîner', 'Aide un parent à cuisiner le repas du soir', 20, 30, 'medium',
  (SELECT id FROM activity_categories WHERE slug='cuisine')),
('Faire des crêpes', 'Prépare une pâte à crêpes et cuisine-les', 25, 30, 'medium',
  (SELECT id FROM activity_categories WHERE slug='cuisine')),
('Préparer un goûter maison', 'Fais un goûter fait maison plutôt qu''un snack industriel', 15, 20, 'easy',
  (SELECT id FROM activity_categories WHERE slug='cuisine')),
('Décorer un gâteau', 'Décore un gâteau ou des biscuits avec de la crème ou des fruits', 20, 25, 'medium',
  (SELECT id FROM activity_categories WHERE slug='cuisine')),
('Préparer une recette seul(e)', 'Suis une recette simple de A à Z sans aide', 30, 45, 'hard',
  (SELECT id FROM activity_categories WHERE slug='cuisine'));
