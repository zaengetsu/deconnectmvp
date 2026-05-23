-- Deconnect MVP — Seed Data (Categories, Activities, Badges)

-- Categories
INSERT INTO activity_categories (name, slug, icon) VALUES
('Sport', 'sport', '⚽'),
('Créativité', 'creativite', '🎨'),
('Nature', 'nature', '🌿'),
('Vie quotidienne', 'vie-quotidienne', '🏠'),
('Social', 'social', '🤝'),
('Lecture', 'lecture', '📚'),
('Famille', 'famille', '👨‍👩‍👧‍👦');

-- Activities (50+)
INSERT INTO activities (title, description, points, duration_minutes, difficulty, category_id) VALUES
-- Sport
('Faire 20 minutes de vélo', 'Enfourche ton vélo et roule !', 15, 20, 'easy', (SELECT id FROM activity_categories WHERE slug='sport')),
('Faire une promenade de 30 minutes', 'Marche et explore ton quartier', 15, 30, 'easy', (SELECT id FROM activity_categories WHERE slug='sport')),
('Faire 20 squats', 'Un petit exercice de musculation', 10, 5, 'easy', (SELECT id FROM activity_categories WHERE slug='sport')),
('Jouer au ballon dehors', 'Amuse-toi avec un ballon', 15, 30, 'easy', (SELECT id FROM activity_categories WHERE slug='sport')),
('Faire une séance d''étirements', 'Étire-toi bien', 10, 15, 'easy', (SELECT id FROM activity_categories WHERE slug='sport')),
('Faire 10 minutes de corde à sauter', 'Saute et amuse-toi', 15, 10, 'medium', (SELECT id FROM activity_categories WHERE slug='sport')),
('Faire un parcours d''obstacles', 'Crée et complète un parcours', 25, 30, 'hard', (SELECT id FROM activity_categories WHERE slug='sport')),
('Faire une course avec un ami', 'Défie un ami à la course', 20, 15, 'medium', (SELECT id FROM activity_categories WHERE slug='sport')),
-- Créativité
('Dessiner un animal imaginaire', 'Laisse libre cours à ton imagination', 15, 20, 'easy', (SELECT id FROM activity_categories WHERE slug='creativite')),
('Créer une carte pour quelqu''un', 'Fais plaisir à quelqu''un', 15, 25, 'easy', (SELECT id FROM activity_categories WHERE slug='creativite')),
('Écrire une petite histoire', 'Invente une histoire courte', 20, 30, 'medium', (SELECT id FROM activity_categories WHERE slug='creativite')),
('Construire quelque chose avec du papier', 'Origami ou autre', 15, 20, 'easy', (SELECT id FROM activity_categories WHERE slug='creativite')),
('Faire un origami simple', 'Plie du papier pour créer', 15, 20, 'medium', (SELECT id FROM activity_categories WHERE slug='creativite')),
('Colorier un mandala', 'Concentre-toi et colorie', 10, 20, 'easy', (SELECT id FROM activity_categories WHERE slug='creativite')),
('Fabriquer un bracelet', 'Crée un bijou fait main', 20, 30, 'medium', (SELECT id FROM activity_categories WHERE slug='creativite')),
('Inventer une chanson', 'Compose ta propre chanson', 25, 25, 'hard', (SELECT id FROM activity_categories WHERE slug='creativite')),
-- Nature
('Observer les nuages', 'Allonge-toi et regarde le ciel', 10, 15, 'easy', (SELECT id FROM activity_categories WHERE slug='nature')),
('Ramasser 5 feuilles différentes', 'Collectionne des feuilles', 15, 20, 'easy', (SELECT id FROM activity_categories WHERE slug='nature')),
('Faire une balade au parc', 'Profite de la nature', 15, 30, 'easy', (SELECT id FROM activity_categories WHERE slug='nature')),
('Arroser une plante', 'Prends soin d''une plante', 10, 5, 'easy', (SELECT id FROM activity_categories WHERE slug='nature')),
('Observer les oiseaux pendant 10 minutes', 'Écoute et observe', 15, 10, 'easy', (SELECT id FROM activity_categories WHERE slug='nature')),
('Planter une graine', 'Commence un petit jardin', 20, 15, 'medium', (SELECT id FROM activity_categories WHERE slug='nature')),
('Faire un herbier', 'Collectionne et identifie des plantes', 25, 45, 'hard', (SELECT id FROM activity_categories WHERE slug='nature')),
-- Vie quotidienne
('Ranger sa chambre', 'Mets de l''ordre dans ta chambre', 15, 20, 'easy', (SELECT id FROM activity_categories WHERE slug='vie-quotidienne')),
('Mettre la table', 'Aide à préparer le repas', 10, 10, 'easy', (SELECT id FROM activity_categories WHERE slug='vie-quotidienne')),
('Faire la vaisselle', 'Nettoie les assiettes', 15, 15, 'easy', (SELECT id FROM activity_categories WHERE slug='vie-quotidienne')),
('Préparer son sac', 'Prépare tes affaires pour demain', 10, 10, 'easy', (SELECT id FROM activity_categories WHERE slug='vie-quotidienne')),
('Trier ses vêtements', 'Range et trie ton armoire', 15, 20, 'easy', (SELECT id FROM activity_categories WHERE slug='vie-quotidienne')),
('Aider à préparer le repas', 'Cuisine avec un parent', 20, 30, 'medium', (SELECT id FROM activity_categories WHERE slug='vie-quotidienne')),
('Faire son lit', 'Commence bien la journée', 10, 5, 'easy', (SELECT id FROM activity_categories WHERE slug='vie-quotidienne')),
('Passer l''aspirateur', 'Aide au ménage', 15, 15, 'easy', (SELECT id FROM activity_categories WHERE slug='vie-quotidienne')),
-- Social
('Appeler un grand-parent', 'Prends des nouvelles', 15, 15, 'easy', (SELECT id FROM activity_categories WHERE slug='social')),
('Faire un compliment à quelqu''un', 'Fais plaisir à quelqu''un', 10, 5, 'easy', (SELECT id FROM activity_categories WHERE slug='social')),
('Aider un frère ou une sœur', 'Sois solidaire', 15, 15, 'easy', (SELECT id FROM activity_categories WHERE slug='social')),
('Jouer à un jeu de société', 'Amuse-toi en famille', 20, 45, 'easy', (SELECT id FROM activity_categories WHERE slug='social')),
('Écrire un mot gentil', 'Écris un petit message', 10, 10, 'easy', (SELECT id FROM activity_categories WHERE slug='social')),
('Organiser un jeu pour ses amis', 'Prépare une activité', 25, 30, 'medium', (SELECT id FROM activity_categories WHERE slug='social')),
('Aider un voisin', 'Rends un service', 20, 20, 'medium', (SELECT id FROM activity_categories WHERE slug='social')),
-- Lecture
('Lire 10 pages', 'Plonge dans un livre', 15, 15, 'easy', (SELECT id FROM activity_categories WHERE slug='lecture')),
('Lire une histoire à voix haute', 'Lis pour quelqu''un', 15, 15, 'easy', (SELECT id FROM activity_categories WHERE slug='lecture')),
('Résumer un chapitre', 'Raconte ce que tu as lu', 20, 10, 'medium', (SELECT id FROM activity_categories WHERE slug='lecture')),
('Choisir un livre pour la semaine', 'Explore la bibliothèque', 10, 15, 'easy', (SELECT id FROM activity_categories WHERE slug='lecture')),
('Lire pendant 15 minutes', 'Un moment calme de lecture', 15, 15, 'easy', (SELECT id FROM activity_categories WHERE slug='lecture')),
('Lire une BD complète', 'Lis une bande dessinée', 15, 30, 'easy', (SELECT id FROM activity_categories WHERE slug='lecture')),
-- Famille
('Faire une balade en famille', 'Sortez ensemble', 20, 45, 'easy', (SELECT id FROM activity_categories WHERE slug='famille')),
('Jouer à un jeu en famille', 'Amusez-vous ensemble', 20, 45, 'easy', (SELECT id FROM activity_categories WHERE slug='famille')),
('Cuisiner ensemble', 'Préparez un repas en famille', 25, 60, 'medium', (SELECT id FROM activity_categories WHERE slug='famille')),
('Raconter sa journée', 'Partage ton vécu', 10, 10, 'easy', (SELECT id FROM activity_categories WHERE slug='famille')),
('Faire un puzzle ensemble', 'Collaborez sur un puzzle', 20, 30, 'easy', (SELECT id FROM activity_categories WHERE slug='famille')),
('Regarder un album photo', 'Découvrez des souvenirs', 15, 15, 'easy', (SELECT id FROM activity_categories WHERE slug='famille')),
('Écrire une lettre à un proche', 'Prenez le temps d''écrire', 20, 20, 'medium', (SELECT id FROM activity_categories WHERE slug='famille'));

-- Badges
INSERT INTO badges (name, description, icon, condition_type, condition_value) VALUES
('Premier Pas', 'Termine ta première activité', '🌱', 'activities_validated', 1),
('Explorateur', 'Termine 5 activités', '🧭', 'activities_validated', 5),
('Aventurier', 'Termine 10 activités', '⛰️', 'activities_validated', 10),
('Champion', 'Termine 25 activités', '🏆', 'activities_validated', 25),
('Légende', 'Termine 50 activités', '👑', 'activities_validated', 50),
('Premiers Points', 'Gagne 50 points', '⭐', 'points_earned', 50),
('Collectionneur', 'Gagne 200 points', '💎', 'points_earned', 200),
('Super Star', 'Gagne 500 points', '🌟', 'points_earned', 500),
('Maître', 'Gagne 1000 points', '🔥', 'points_earned', 1000);
