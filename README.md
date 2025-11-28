# Legislazuli

Sistema de extracción de datos para documentos legales guatemaltecos mediante visión artificial con consenso multi-API.

## Características

- Extracción de datos de Patentes de Comercio guatemaltecas
- Consenso entre Claude Sonnet 4 y GPT-4o para garantizar precisión
- Interfaz web moderna con Next.js 14
- Autenticación con NextAuth.js
- Almacenamiento en Supabase
- Descarga de resultados en formato TXT y HTML

## Requisitos

- Node.js 18+
- Cuenta de Supabase
- API keys de Anthropic (Claude) y OpenAI

## Instalación

1. Instala las dependencias:
```bash
npm install
```

2. Configura las variables de entorno:
```bash
cp .env.local.example .env.local
```

Edita `.env.local` con tus credenciales:
- `NEXTAUTH_SECRET`: Genera una clave secreta (puedes usar `openssl rand -base64 32`)
- `NEXT_PUBLIC_SUPABASE_URL`: URL de tu proyecto Supabase
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Clave anónima de Supabase
- `SUPABASE_SERVICE_ROLE_KEY`: Clave de servicio de Supabase
- `ANTHROPIC_API_KEY`: API key de Anthropic
- `OPENAI_API_KEY`: API key de OpenAI

3. Configura la base de datos en Supabase:

Ejecuta el siguiente SQL en el SQL Editor de Supabase:

```sql
-- Usuarios
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Documentos subidos
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Extracciones
CREATE TABLE extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id),
  claude_result JSONB,
  openai_result JSONB,
  consensus_result JSONB,
  confidence TEXT,
  discrepancies JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Campos extraídos
CREATE TABLE extracted_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_id UUID REFERENCES extractions(id),
  field_name TEXT NOT NULL,
  field_value TEXT,
  field_value_words TEXT,
  field_order INT,
  needs_review BOOLEAN DEFAULT FALSE
);

-- Nota: La autorización se maneja en las API routes de Next.js usando NextAuth
-- Por lo tanto, RLS puede estar deshabilitado o configurado para permitir todo
-- ya que las API routes verifican la autenticación antes de acceder a los datos
```

4. Crea un bucket de almacenamiento en Supabase:
- Ve a Storage en el panel de Supabase
- Crea un bucket llamado `documents`
- Configúralo como privado

5. Crea un usuario de prueba:

Necesitarás hashear una contraseña con bcrypt. Puedes usar Node.js:

```javascript
const bcrypt = require('bcryptjs');
const hash = bcrypt.hashSync('tu_contraseña', 12);
console.log(hash);
```

Luego inserta el usuario en Supabase:

```sql
INSERT INTO users (email, password_hash) 
VALUES ('test@example.com', 'tu_hash_aqui');
```

O usa este script de Node.js para crear usuarios:

```javascript
// scripts/create-user.js
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createUser(email, password) {
  const hash = await bcrypt.hash(password, 12);
  const { data, error } = await supabase
    .from('users')
    .insert({ email, password_hash: hash })
    .select();
  
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Usuario creado:', data);
  }
}

createUser('test@example.com', 'test123');
```

## Desarrollo

Ejecuta el servidor de desarrollo:

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

## Estructura del Proyecto

```
legislazuli/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Rutas de autenticación
│   ├── (dashboard)/       # Rutas del dashboard
│   └── api/               # API routes
├── components/            # Componentes React
├── lib/                   # Utilidades y lógica
│   ├── ai/               # Integración con APIs de IA
│   ├── db/               # Cliente de Supabase
│   └── utils/            # Utilidades generales
└── types/                # Definiciones TypeScript
```

## Uso

1. Inicia sesión con tus credenciales
2. Sube un documento (PDF, PNG o JPG) de una Patente de Comercio
   - **Nota**: Para PDFs, se recomienda convertirlos a imágenes (PNG/JPG) para mejor compatibilidad con las APIs de visión
3. Selecciona el tipo de documento
4. Espera a que se procese (puede tomar unos segundos)
5. Revisa los resultados extraídos
6. Descarga los resultados en formato TXT o HTML

### Crear usuarios

Puedes crear usuarios usando el script incluido:

```bash
node scripts/create-user.js usuario@example.com contraseña123
```

## Tecnologías

- **Frontend**: Next.js 14, React, Tailwind CSS
- **Backend**: Next.js API Routes
- **Autenticación**: NextAuth.js
- **Base de datos**: Supabase (PostgreSQL)
- **Almacenamiento**: Supabase Storage
- **IA**: Anthropic Claude Sonnet 4, OpenAI GPT-4o

## Licencia

ISC

