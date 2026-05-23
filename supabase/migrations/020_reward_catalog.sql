-- Migration 020: Catalogue de récompenses (brief — 5 catégories)
-- Ajoute reward_category et seed 55 récompenses pré-remplies

-- 1. Ajouter la colonne reward_category
ALTER TABLE rewards
  ADD COLUMN IF NOT EXISTS reward_category text;

-- 2. Seed des récompenses catalog (parent_id = NULL → globales, visibles par tous)
--    Les parents pourront les "activer" pour leurs enfants

-- ═══ Expériences ═══
INSERT INTO rewards (parent_id, child_id, title, description, required_points, reward_type, reward_category) VALUES
  (NULL, NULL, 'Sortie choisie', 'Parc, forêt, musée ludique — tu choisis la destination', 150, 'catalog', 'experience'),
  (NULL, NULL, 'Mini-aventure ou jeu de piste', 'Un parcours surprise préparé par tes parents', 200, 'catalog', 'experience'),
  (NULL, NULL, 'Atelier cuisine ou pâtisserie', 'Préparer un plat ou un gâteau de ton choix', 100, 'catalog', 'experience'),
  (NULL, NULL, 'Atelier bricolage / construction', 'Construire quelque chose avec tes mains', 100, 'catalog', 'experience'),
  (NULL, NULL, 'Découverte nature', 'Observer les animaux, les étoiles ou explorer un sentier', 120, 'catalog', 'experience'),
  (NULL, NULL, 'Sortie sportive douce', 'Piscine, bowling, escalade ou autre sortie active', 150, 'catalog', 'experience'),
  (NULL, NULL, 'Journée explorateur surprise', 'Une journée entière organisée en secret par tes parents', 300, 'catalog', 'experience'),
  (NULL, NULL, 'Nuit spéciale', 'Tente dans le jardin, pyjama party ou nuit à thème', 250, 'catalog', 'experience'),
  (NULL, NULL, 'Projet créatif sur un week-end', 'Un grand projet artistique ou manuel sur 2 jours', 200, 'catalog', 'experience'),
  (NULL, NULL, 'Sortie extérieure avec un ami', 'Inviter un copain pour une activité dehors', 180, 'catalog', 'experience');

-- ═══ Privilèges ═══
INSERT INTO rewards (parent_id, child_id, title, description, required_points, reward_type, reward_category) VALUES
  (NULL, NULL, 'Choisir une activité hors écran', 'Décider de l''activité du jour pour toute la famille', 50, 'catalog', 'privilege'),
  (NULL, NULL, 'Choisir le menu ou le dessert', 'Tu décides ce qu''on mange ce soir', 40, 'catalog', 'privilege'),
  (NULL, NULL, 'Choisir la musique ou l''ambiance', 'DJ officiel de la maison pour la soirée', 30, 'catalog', 'privilege'),
  (NULL, NULL, 'Heure calme personnelle', 'Un moment rien que pour toi, sans interruption', 50, 'catalog', 'privilege'),
  (NULL, NULL, 'Se coucher un peu plus tard', 'Exceptionnel — 30 minutes de plus ce soir', 80, 'catalog', 'privilege'),
  (NULL, NULL, 'Décorer un espace personnel', 'Personnaliser ta chambre ou ton coin à toi', 60, 'catalog', 'privilege'),
  (NULL, NULL, 'Choisir le thème de la journée', 'Journée pirates, journée science, journée nature...', 70, 'catalog', 'privilege'),
  (NULL, NULL, 'Organiser un moment famille', 'Toi qui décides du programme familial', 100, 'catalog', 'privilege'),
  (NULL, NULL, 'Choisir l''ordre des tâches', 'Aujourd''hui tu organises ton planning comme tu veux', 40, 'catalog', 'privilege'),
  (NULL, NULL, 'Inviter un ami', 'Organiser un après-midi avec un copain ou une copine', 120, 'catalog', 'privilege');

-- ═══ Responsabilités valorisantes ═══
INSERT INTO rewards (parent_id, child_id, title, description, required_points, reward_type, reward_category) VALUES
  (NULL, NULL, 'Responsable des plantes ou animaux', 'Prendre soin d''un être vivant pendant une semaine', 80, 'catalog', 'responsibility'),
  (NULL, NULL, 'Chef de projet d''une activité', 'Organiser une activité de A à Z', 100, 'catalog', 'responsibility'),
  (NULL, NULL, 'Aide-parent officielle', 'Devenir l''assistant(e) numéro 1 pour une journée', 60, 'catalog', 'responsibility'),
  (NULL, NULL, 'Mentor d''un plus jeune', 'Aider un petit frère, une petite sœur ou un voisin', 90, 'catalog', 'responsibility'),
  (NULL, NULL, 'Responsable du planning', 'Gérer l''emploi du temps familial pour une journée', 70, 'catalog', 'responsibility'),
  (NULL, NULL, 'Gestion d''un petit budget', 'Un petit montant à gérer pour un achat ou un projet', 120, 'catalog', 'responsibility'),
  (NULL, NULL, 'Responsable météo / sortie', 'Vérifier la météo et proposer une activité adaptée', 50, 'catalog', 'responsibility'),
  (NULL, NULL, 'Créateur de jeu ou défi', 'Inventer un nouveau jeu pour la famille', 80, 'catalog', 'responsibility'),
  (NULL, NULL, 'Responsable bien-être', 'S''assurer que tout le monde va bien à la maison', 70, 'catalog', 'responsibility'),
  (NULL, NULL, 'Ambassadeur sans écran', 'Montrer l''exemple pendant toute une journée', 100, 'catalog', 'responsibility');

-- ═══ Récompenses symboliques ═══
INSERT INTO rewards (parent_id, child_id, title, description, required_points, reward_type, reward_category) VALUES
  (NULL, NULL, 'Badge ou autocollant', 'Un badge spécial à coller ou afficher', 25, 'catalog', 'symbolic'),
  (NULL, NULL, 'Titre honorifique', 'Champion du jour, Héros de la semaine...', 30, 'catalog', 'symbolic'),
  (NULL, NULL, 'Certificat de progression', 'Un diplôme officiel signé par tes parents', 50, 'catalog', 'symbolic'),
  (NULL, NULL, 'Mur des réussites', 'Ajouter ta réussite au tableau familial', 20, 'catalog', 'symbolic'),
  (NULL, NULL, 'Message de fierté personnalisé', 'Un message spécial écrit par ton parent', 30, 'catalog', 'symbolic'),
  (NULL, NULL, 'Médaille symbolique', 'Une médaille faite maison ou imprimée', 40, 'catalog', 'symbolic'),
  (NULL, NULL, 'Journal des réussites', 'Ajouter une entrée dans ton carnet de succès', 20, 'catalog', 'symbolic'),
  (NULL, NULL, 'Photo souvenir', 'Immortaliser ta réussite en photo', 15, 'catalog', 'symbolic'),
  (NULL, NULL, 'Tampon ou sticker de validation', 'Un tampon dans ton passeport aventure', 15, 'catalog', 'symbolic'),
  (NULL, NULL, 'Carte fierté à conserver', 'Une carte collector à garder précieusement', 25, 'catalog', 'symbolic');

-- ═══ Moments familiaux ═══
INSERT INTO rewards (parent_id, child_id, title, description, required_points, reward_type, reward_category) VALUES
  (NULL, NULL, 'Temps exclusif avec un parent', '30 minutes rien que pour toi avec maman ou papa', 100, 'catalog', 'family'),
  (NULL, NULL, 'Soirée jeux famille', 'Jeux de société, jeux de cartes ou jeux inventés', 80, 'catalog', 'family'),
  (NULL, NULL, 'Repas à thème choisi', 'Un repas spécial autour d''un thème que tu choisis', 90, 'catalog', 'family'),
  (NULL, NULL, 'Rituel hebdomadaire sans écran', 'Instaurer un rendez-vous familial régulier', 120, 'catalog', 'family'),
  (NULL, NULL, 'Discussion spéciale', 'Un moment de conversation privilégiée avec un parent', 60, 'catalog', 'family'),
  (NULL, NULL, 'Activité co-créée', 'Inventer une activité ensemble en famille', 100, 'catalog', 'family'),
  (NULL, NULL, 'Projet familial commun', 'Un grand projet à réaliser tous ensemble', 150, 'catalog', 'family'),
  (NULL, NULL, 'Soirée souvenirs', 'Regarder des photos, raconter des histoires de famille', 70, 'catalog', 'family'),
  (NULL, NULL, 'Temps calme partagé', 'Lire ensemble, dessiner ou simplement être ensemble', 50, 'catalog', 'family'),
  (NULL, NULL, 'Défi famille', 'Un challenge que toute la famille relève ensemble', 100, 'catalog', 'family');
