require('dotenv').config();
const fs = require('fs');
const supabase = require('./supabaseClient');

async function main() {
  const email = 'tenant-b@example.com';
  const password = 'password456';

  await supabase.auth.signUp({ email, password });

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    console.error('Login failed:', error.message);
    return;
  }

  fs.writeFileSync('token-b.txt', data.session.access_token, 'utf-8');
  console.log('Tenant B token saved to token-b.txt');
  console.log('Tenant B user id:', data.user.id);
}

main();