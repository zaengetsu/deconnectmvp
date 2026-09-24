import { createClient } from '@supabase/supabase-js';

// Setup supabase client with Anon key
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://rkbeeqkohtiacqjtwngs.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Cw_4w7D1APzfZxqiA8PgLQ_YbFsLeVr';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testEndToEnd() {
  console.log('--- STARTING E2E TEST ---');

  // 1. Sign up a new user to test the whole flow
  const email = `test+${Date.now()}@deconnect.app`;
  const password = 'password123';
  
  console.log(`1. Signing up user: ${email}`);
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: 'Test Parent', role: 'parent' } }
  });

  if (authError) {
    console.error('Auth Error:', authError.message);
    if (authError.message.includes('rate limit')) {
      console.log('Rate limited! We need to login with an existing user instead.');
      return;
    }
    return;
  }
  
  const user = authData.user;
  console.log(`User created: ${user?.id}`);

  // 2. Log in to get session (if email confirmation is required, this will fail or not have session)
  const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  
  if (loginError) {
    console.error('Login Error (Email confirmation probably required):', loginError.message);
    // Let's check if the trigger created the profile anyway
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user?.id).single();
    console.log('Profile created despite no login?', profile);
    return;
  }
  
  console.log('Logged in successfully!');

  // 3. Create Child
  console.log('3. Creating Child...');
  const { data: child, error: childError } = await supabase.from('children').insert({
    parent_id: user?.id,
    display_name: 'Test Child',
    age: 10,
    avatar_url: '🦊'
  }).select().single();

  if (childError) {
    console.error('Child Creation Error:', childError);
  } else {
    console.log('Child created successfully!', child.id);
  }

  // 4. Create Reward
  console.log('4. Creating Reward...');
  const { data: reward, error: rewardError } = await supabase.from('rewards').insert({
    parent_id: user?.id,
    title: '1h de TV',
    required_points: 50
  }).select().single();

  if (rewardError) {
    console.error('Reward Creation Error:', rewardError);
  } else {
    console.log('Reward created successfully!', reward.id);
  }
}

testEndToEnd().catch(console.error);
