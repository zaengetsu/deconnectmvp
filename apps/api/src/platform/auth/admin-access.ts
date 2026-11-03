/**
 * Administrateurs : les comptes de rôle `admin`, et ceux qui gardent un autre rôle (un parent de
 * l'équipe, par exemple) avec `is_admin`. Un compte n'a qu'un rôle : le rôle admin seul le couperait
 * des routes parent.
 */
export const ADMIN_USERS = { OR: [{ role: 'admin' }, { isAdmin: true }] };
