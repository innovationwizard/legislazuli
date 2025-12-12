// Script para consultar usuarios en la base de datos
// Uso: node scripts/query-users.js [email]

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load .env.local file manually
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf8');
  envFile.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      process.env[key] = value;
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY deben estar configurados en .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function queryUsers(emailFilter = null) {
  try {
    let query = supabase.from('users').select('id, email, created_at');
    
    if (emailFilter) {
      query = query.eq('email', emailFilter);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error al consultar usuarios:', error.message);
      process.exit(1);
    }
    
    if (!data || data.length === 0) {
      console.log('No se encontraron usuarios.');
      return;
    }
    
    console.log(`\n✓ Se encontraron ${data.length} usuario(s):\n`);
    data.forEach((user, index) => {
      console.log(`${index + 1}. Email: ${user.email}`);
      console.log(`   ID: ${user.id}`);
      console.log(`   Creado: ${new Date(user.created_at).toLocaleString()}`);
      console.log('');
    });
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

const [,, emailFilter] = process.argv;
queryUsers(emailFilter || null);

