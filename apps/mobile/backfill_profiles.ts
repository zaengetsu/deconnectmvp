import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://rkbeeqkohtiacqjtwngs.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

if (!SERVICE_KEY) {
  console.error('Set SUPABASE_SERVICE_KEY env var');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function backfillProfiles() {
  console.log('Backfilling missing profiles...');

  // Get all users from auth.users who don't have a profile
  const { data: users, error } = await supabase.auth.admin.listUsers();
  if (error) { console.error('Error listing users:', error); return; }

  let created = 0;
  for (const u of users.users) {
    const { data: existing } = await supabase.from('profiles').select('id').eq('id', u.id).single();
    if (!existing) {
      const { error: insertErr } = await supabase.from('profiles').upsert({
        id: u.id,
        email: u.email ?? '',
        full_name: u.user_metadata?.full_name ?? u.email?.split('@')[0] ?? 'Utilisateur',
        role: u.user_metadata?.role ?? 'parent',
      }, { onConflict: 'id' });
      if (insertErr) {
        console.error(`Failed to create profile for ${u.id}:`, insertErr.message);
      } else {
        console.log(`Created profile for ${u.email} (${u.id})`);
        created++;
      }

      // Also create subscription if missing
      await supabase.from('subscriptions').upsert({
        parent_id: u.id,
        plan: 'free',
        status: 'active',
      }, { onConflict: 'parent_id' });
    }
  }
  console.log(`Done. ${created} profiles created.`);
}

backfillProfiles();
