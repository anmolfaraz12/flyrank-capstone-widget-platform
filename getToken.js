const fs = require('fs');

require('dotenv').config();
const supabase = require('./supabaseClient');

async function main() {
  const email = 'test@example.com';
  const password = 'password123';

  await supabase.auth.signUp({ email, password });

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    console.error('Login failed:', error.message);
    return;
  }

  fs.writeFileSync('token.txt', data.session.access_token, 'utf-8');
  console.log('Token saved to token.txt');
}

main();