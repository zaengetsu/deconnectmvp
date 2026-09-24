// Applique les migrations SQL sur une base vide sans le moteur Prisma (CI, bac à sable).
// En temps normal : `pnpm prisma:migrate` (prisma migrate deploy), qui lit les mêmes fichiers.
import { applyMigrations } from '../test/support/migrate';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL manquant');
applyMigrations(url).then(() => console.log('Migrations appliquées'));
