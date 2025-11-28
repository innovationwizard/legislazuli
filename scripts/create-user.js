// Script para crear usuarios en la base de datos
// Uso: node scripts/create-user.js <email> <password>

const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY deben estar configurados en .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createUser(email, password) {
  if (!email || !password) {
    console.error('Uso: node scripts/create-user.js <email> <password>');
    process.exit(1);
  }

  try {
    const hash = await bcrypt.hash(password, 12);
    const { data, error } = await supabase
      .from('users')
      .insert({ email, password_hash: hash })
      .select()
      .single();
    
    if (error) {
      console.error('Error al crear usuario:', error.message);
      process.exit(1);
    } else {
      console.log('✓ Usuario creado exitosamente:');
      console.log('  Email:', data.email);
      console.log('  ID:', data.id);
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

const [,, email, password] = process.argv;
createUser(email, password);

