# Legislazuli

Sistema de extracción de datos para documentos legales guatemaltecos mediante visión artificial con consenso multi-API.

## Características

- **Extracción de datos** de Patentes de Comercio guatemaltecas
- **Consenso multi-API** entre Claude Sonnet 4 y Gemini 2.5 para garantizar precisión
- **Procesamiento asíncrono** para PDFs grandes (>1MB) usando S3 + Textract async
- **Detección automática de orientación** mediante AWS Textract
- **Sistema de feedback ML** para evolución automática de prompts (usuario "condor")
- **Versionado de prompts** con métricas de rendimiento
- **Modo debug** para análisis detallado de extracciones
- Interfaz web moderna con Next.js 14 con seguimiento de progreso en tiempo real
- Autenticación con NextAuth.js
- Almacenamiento en Supabase y AWS S3
- Descarga de resultados en formato TXT y HTML

## Requisitos

- Node.js 18+
- Cuenta de Supabase
- API keys de Anthropic (Claude) y OpenAI
- Credenciales de AWS (para Textract)

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
- `GOOGLE_API_KEY`: API key de Google (para Gemini 2.5)
- `GEMINI_MODEL_ID`: ID del modelo de Gemini (opcional, por defecto: gemini-2.5-pro)
- `GEMINI_FALLBACK_MODEL_ID`: ID del modelo de fallback (opcional, por defecto: gemini-2.5-flash)

**Nota sobre Gemini Pro:** El sistema usa `gemini-2.5-pro` como modelo principal (mejor precisión) con `gemini-2.5-flash` como fallback automático si hay problemas de cuota o facturación. El sistema detecta automáticamente errores 429 (quota exceeded) y cambia al modelo fallback.
- `AWS_ACCESS_KEY_ID`: AWS Access Key ID (para Textract y S3)
- `AWS_SECRET_ACCESS_KEY`: AWS Secret Access Key (para Textract y S3)
- `AWS_REGION`: Región de AWS (opcional, por defecto: us-east-1)
- `AWS_S3_BUCKET_NAME`: Nombre del bucket S3 para procesamiento asíncrono (requerido para PDFs >1MB)
- `AWS_SNS_TOPIC_ARN`: ARN del topic SNS para webhooks (opcional, para notificaciones automáticas)
- `AWS_SNS_ROLE_ARN`: ARN del rol IAM para Textract → SNS (opcional, requerido si usas SNS)

3. Configura la base de datos en Supabase:

Ejecuta los siguientes scripts SQL en el SQL Editor de Supabase en orden:

**a) Schema base (obligatorio):**

Ejecuta el contenido de `scripts/create-database-schema.sql` o el siguiente SQL:

```sql
-- Usuarios
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Documentos subidos
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  detected_document_type TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Extracciones
CREATE TABLE IF NOT EXISTS extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  claude_result JSONB,
  gemini_result JSONB,
  consensus_result JSONB,
  confidence TEXT,
  discrepancies JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Campos extraídos
CREATE TABLE IF NOT EXISTS extracted_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_id UUID REFERENCES extractions(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  field_value TEXT,
  field_value_words TEXT,
  field_order INT,
  needs_review BOOLEAN DEFAULT FALSE
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_extractions_document_id ON extractions(document_id);
CREATE INDEX IF NOT EXISTS idx_extracted_fields_extraction_id ON extracted_fields(extraction_id);
CREATE INDEX IF NOT EXISTS idx_extractions_deleted_at ON extractions(deleted_at) WHERE deleted_at IS NULL;
```

**b) Schema ML Feedback System (opcional, para usuario "condor"):**

Si quieres usar el sistema de feedback ML, ejecuta:

```bash
# Ver el SQL de migración
npx tsx scripts/run-migration.ts
```

Luego copia y ejecuta el SQL mostrado en el SQL Editor de Supabase, o ejecuta directamente el contenido de `scripts/create-ml-feedback-schema.sql`.

**c) Schema Async Jobs (requerido para procesamiento asíncrono):**

Para procesar PDFs grandes de forma asíncrona, ejecuta:

```bash
# Ver el SQL de migración
npx tsx scripts/run-async-jobs-migration.ts
```

Luego copia y ejecuta el SQL mostrado en el SQL Editor de Supabase, o ejecuta directamente el contenido de `scripts/create-async-jobs-schema.sql`.

**d) Row Level Security (RLS) para tablas críticas (RECOMENDADO):**

Para proteger las tablas críticas (`golden_set_truths`, `prompt_versions`, `prompt_evolution_queue`) de acceso no autorizado, ejecuta:

```sql
-- Ver scripts/enable-rls-critical-tables.sql
```

**IMPORTANTE**: Este sistema usa NextAuth.js para autenticación. Las políticas RLS requieren Supabase Auth para funcionar completamente. Ver `docs/RLS_SECURITY.md` para más detalles sobre las opciones de configuración.

**OPCIONAL - Hardening Avanzado**: Para activar RLS sin migrar de NextAuth, implementa el "Bridge Token Pattern". Ver `docs/BRIDGE_TOKEN_PATTERN.md` para la guía de implementación completa.

4. Crea buckets de almacenamiento:

**Supabase Storage:**
- Ve a Storage en el panel de Supabase
- Crea un bucket llamado `documents`
- Configúralo como privado

**AWS S3 (requerido para PDFs >1MB):**
- Crea un bucket S3 en AWS
- Configura permisos para que tu aplicación pueda escribir
- El nombre del bucket debe coincidir con `AWS_S3_BUCKET_NAME` en tus variables de entorno

**AWS SNS (opcional, para webhooks):**
- Crea un topic SNS en AWS
- Suscribe tu endpoint webhook: `https://your-domain.com/api/textract/webhook`
- Protocolo: HTTPS
- Configura el rol IAM para que Textract pueda publicar a SNS

5. (Opcional) Inicializa el sistema de feedback ML:

Si instalaste el schema ML, inicializa las versiones de prompts:

```bash
node scripts/initialize-prompt-versions.js
```

Esto crea la versión 1 de todos los prompts para ambos tipos de documentos y modelos.

6. Crea un usuario de prueba:

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
│       ├── extract/       # Extracción de documentos
│       ├── jobs/          # Estado de trabajos asíncronos
│       ├── textract/      # Webhook de Textract
│       ├── feedback/      # Sistema de feedback ML
│       └── evolution/      # Evolución de prompts
├── components/            # Componentes React
│   ├── FileUpload.tsx    # Componente de subida de archivos
│   ├── JobStatus.tsx     # Componente de estado de trabajos asíncronos
│   ├── FieldFeedback.tsx # Componente de feedback
│   └── ExtractionResults.tsx # Resultados con debug
├── lib/                   # Utilidades y lógica
│   ├── ai/               # Integración con APIs de IA
│   │   ├── claude.ts     # Claude API
│   │   ├── gemini.ts     # Gemini API
│   │   ├── prompts.ts    # Prompts versionados
│   │   └── extract-with-prompts.ts # Extracción con versiones
│   ├── aws/              # Servicios AWS
│   │   ├── s3.ts         # Upload a S3
│   │   └── textract-async.ts # Textract async API
│   ├── jobs/             # Procesamiento de trabajos
│   │   └── extraction-processor.ts # Procesador de extracciones
│   ├── ml/               # Sistema ML
│   │   ├── prompt-versioning.ts # Versionado de prompts
│   │   └── prompt-evolution.ts  # Evolución de prompts
│   ├── db/               # Cliente de Supabase
│   └── utils/            # Utilidades generales
│       ├── normalize.ts  # Normalización (preserva acentos)
│       ├── pdf-to-image.ts # Conversión PDF a imagen
│       ├── expediente-parser.ts # Parser para número de expediente
│       ├── textract.ts   # Extracción de texto con AWS Textract
│       └── normalize-orientation.ts # Normalización de orientación
├── scripts/              # Scripts de utilidad
│   ├── create-database-schema.sql # Schema base
│   ├── create-async-jobs-schema.sql # Schema async jobs
│   ├── create-ml-feedback-schema.sql # Schema ML
│   ├── initialize-prompt-versions.js # Inicialización
│   ├── run-migration.ts  # Helper de migración ML
│   └── run-async-jobs-migration.ts # Helper de migración async
├── docs/                 # Documentación
│   ├── ASYNC_ARCHITECTURE.md # Arquitectura asíncrona
│   ├── TEXTRACT_API_FIX.md # Fix de API Textract
│   ├── VERCEL_PLAN_REQUIREMENTS.md # Requisitos de Vercel
│   └── ML_FEEDBACK_SYSTEM.md # Docs del sistema ML
└── types/                # Definiciones TypeScript
```

## Uso

### Extracción Básica

1. Inicia sesión con tus credenciales
2. Sube un documento (PDF, PNG o JPG) de una Patente de Comercio
   - **Nota**: AWS Textract detecta y corrige automáticamente la orientación de PDFs
   - **PDFs pequeños (≤1MB)**: Procesamiento inmediato
   - **PDFs grandes (>1MB)**: Procesamiento asíncrono (2-5 minutos)
3. Selecciona el tipo de documento
4. Espera a que se procese
   - Para archivos pequeños: procesamiento inmediato
   - Para archivos grandes: verás una barra de progreso con el estado
5. Revisa los resultados extraídos
   - Los campos con discrepancias se marcan con "⚠ Revisar"
6. Descarga los resultados en formato TXT o HTML

### Modo Debug (Usuario "condor" únicamente)

El usuario "condor" tiene acceso a información detallada:

- **Behind the Scenes**: Muestra los valores extraídos por Claude y OpenAI para cada campo
- **Feedback ML**: Permite marcar campos como correctos/incorrectos con explicaciones
- **Evolución de Prompts**: El sistema aprende automáticamente de los feedbacks

Para usar el sistema de feedback:
1. Ve a una extracción con campos marcados como "⚠ Revisar"
2. En la sección "Behind the Scenes", verás los valores de Claude y OpenAI
3. Marca cada valor como "✓ Correct" o "✗ Wrong"
4. Si está mal, proporciona una explicación breve (máx. 100 caracteres)
5. El sistema evolucionará los prompts automáticamente después de 50 feedbacks

Ver [docs/ML_FEEDBACK_SYSTEM.md](docs/ML_FEEDBACK_SYSTEM.md) para más detalles.

### Crear usuarios

Puedes crear usuarios usando el script incluido:

```bash
node scripts/create-user.js usuario@example.com contraseña123
```

## Características Avanzadas

### Detección Automática de Orientación de PDFs

El sistema utiliza AWS Textract para detectar y corregir automáticamente la orientación de PDFs:
- Textract tiene detección de orientación integrada y confiable
- Maneja automáticamente documentos en cualquier orientación (0°, 90°, 180°, 270°)
- Garantiza precisión óptima sin intervención manual
- Más confiable que la corrección manual de orientación

### Sistema de Feedback ML

Sistema de aprendizaje automático que mejora los prompts basándose en feedback:
- **Feedback de campo**: Marca campos individuales como correctos/incorrectos
- **Explicaciones**: Proporciona razones cuando un campo está mal
- **Evolución automática**: Los prompts se mejoran automáticamente usando LLM
- **Backtesting**: Las nuevas versiones se prueban antes de activarse
- **Versionado**: Todas las versiones de prompts se guardan con métricas

### Precisión Numérica Mejorada

- Prompts especializados para OpenAI con énfasis en precisión numérica
- Instrucciones detalladas para distinguir dígitos similares (0/O, 1/7, 6/8)
- Temperatura reducida (0.1) para resultados más determinísticos
- Modo de alta resolución para mejor OCR

### Manejo de Marcas de Agua y Texto Parcialmente Oculto

El sistema puede leer a través de marcas de agua y texto parcialmente oculto:
- **Lectura permisiva**: Infiere palabras cuando el 70%+ es visible
- **Inferencia contextual**: Usa contexto para completar texto parcialmente visible
- **Manejo de marcas de agua**: Lee a través de marcas decorativas (ej: "RM Registro MERCANTIL")
- **Inferencia de fechas**: Completa meses parcialmente visibles (ej: "Ma_o" → "Mayo")
- Solo marca como "[ILEGIBLE]" cuando menos del 50% es visible y no hay contexto

### Guía de Ubicación Espacial para Campos

Instrucciones específicas para localizar campos correctamente:
- **numero_patente**: Busca únicamente en la esquina superior derecha, etiquetado como "No:"
- Ignora números de sellos circulares y estampillas en la esquina superior izquierda
- Puntos de referencia visual claros para cada campo crítico

### Parsing de Número de Expediente

El sistema parsea "Número de Expediente" en componentes separados:
- **Número**: El número de expediente (ej: "28824")
- **Año**: El año del expediente (ej: "2019")
- Se muestran en líneas separadas con botones de copia individuales
- Combina automáticamente partes complementarias de diferentes modelos

## Tecnologías

- **Frontend**: Next.js 14, React, Tailwind CSS
- **Backend**: Next.js API Routes
- **Autenticación**: NextAuth.js
- **Base de datos**: Supabase (PostgreSQL)
- **Almacenamiento**: Supabase Storage, AWS S3
- **IA**: Anthropic Claude Sonnet 4, Google Gemini 2.5
- **OCR**: AWS Textract (para PDFs, con detección automática de orientación)
- **Procesamiento PDF**: pdf-lib, Puppeteer, Chromium
- **Notificaciones**: AWS SNS (opcional, para webhooks)

## Requisitos Legales Críticos

⚠️ **IMPORTANTE**: Este sistema procesa documentos legales guatemaltecos. 

- **Acentos españoles**: Los acentos (á, é, í, ó, ú, ñ, ü) DEBEN preservarse exactamente
- **Modificar acentos** hace que los documentos sean INVÁLIDOS bajo la ley guatemalteca
- Puede resultar en consecuencias legales, multas monetarias, y posiblemente tiempo en prisión

El sistema está diseñado para preservar acentos en todas las operaciones.

## Scripts Disponibles

### Crear usuarios
```bash
node scripts/create-user.js email@example.com contraseña123
```

### Ejecutar migración ML
```bash
# Muestra el SQL para ejecutar manualmente
npx tsx scripts/run-migration.ts
```

### Ejecutar migración Async Jobs
```bash
# Muestra el SQL para ejecutar manualmente
npx tsx scripts/run-async-jobs-migration.ts
```

### Inicializar versiones de prompts
```bash
node scripts/initialize-prompt-versions.js
```

## Documentación Adicional

- [Arquitectura Asíncrona](docs/ASYNC_ARCHITECTURE.md) - Procesamiento asíncrono para PDFs grandes
- [Sistema de Feedback ML](docs/ML_FEEDBACK_SYSTEM.md) - Documentación completa del sistema ML
- [Fix de API Textract](docs/TEXTRACT_API_FIX.md) - Corrección crítica de API Textract
- [Requisitos de Vercel](docs/VERCEL_PLAN_REQUIREMENTS.md) - Configuración de planes Vercel

## Licencia

ISC

