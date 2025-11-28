# Legislazuli - Software Design Document
## Sistema de Extracción de Datos para Documentos Legales Guatemaltecos

**Versión:** 0.0.0.alpha  
**Fecha:** 2025-11-22
**Alcance inicial:** Patente de Comercio (Empresa y Sociedad)

---

## 1. Resumen Ejecutivo

Aplicación web para extracción de campos de documentos legales guatemaltecos mediante visión artificial con consenso multi-API para garantizar 100% de precisión.

**Flujo principal:**
```
Upload (PDF/PNG/JPG) → OCR Multi-API → Consenso → Revisión → Output → Descarga
```

---

## 2. Arquitectura

### 2.1 Stack Tecnológico

| Capa | Tecnología | Justificación |
|------|------------|---------------|
| Frontend | Next.js 14 + Tailwind | SSR, rápido, UI minimalista |
| Backend | Next.js API Routes | Simplicidad, mismo deploy |
| Auth | NextAuth.js + credentials | Simple user/pass, extensible |
| Database | Supabase (PostgreSQL) | Gratis tier, storage incluido, escalable |
| AI - Primary | Claude API (claude-sonnet-4-20250514) | Vision nativa, español excelente |
| AI - Secondary | OpenAI API (gpt-4o) | Vision robusta, comparación |
| Storage | Supabase Storage | Documentos originales |
| Hosting | Vercel | Zero-config, edge functions |

### 2.2 Diagrama de Componentes

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────────┐    │
│  │  Login   │  │   Upload     │  │   Results Viewer       │    │
│  │  Page    │  │   Component  │  │   + Copy Buttons       │    │
│  └──────────┘  └──────────────┘  └────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API ROUTES                                 │
│  /api/auth/*    /api/extract    /api/extractions    /api/download│
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐   ┌──────────────┐
        │  Claude  │   │  OpenAI  │   │   Supabase   │
        │  Vision  │   │  GPT-4o  │   │  DB+Storage  │
        └──────────┘   └──────────┘   └──────────────┘
              │               │
              └───────┬───────┘
                      ▼
              ┌──────────────┐
              │  Consensus   │
              │   Engine     │
              └──────────────┘
```

---

## 3. Modelo de Datos

### 3.1 Tablas (Supabase/PostgreSQL)

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
  file_path TEXT NOT NULL,  -- Supabase storage path
  doc_type TEXT NOT NULL,   -- 'patente_empresa', 'patente_sociedad', etc.
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Extracciones
CREATE TABLE extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id),
  claude_result JSONB,      -- Raw response
  openai_result JSONB,      -- Raw response
  consensus_result JSONB,   -- Final merged result
  confidence TEXT,          -- 'full', 'partial', 'review_required'
  discrepancies JSONB,      -- Fields where APIs disagreed
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Campos extraídos (desnormalizado para queries)
CREATE TABLE extracted_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_id UUID REFERENCES extractions(id),
  field_name TEXT NOT NULL,
  field_value TEXT,
  field_value_words TEXT,   -- Numeric in words if applicable
  field_order INT,          -- Display order
  needs_review BOOLEAN DEFAULT FALSE
);
```

### 3.2 Esquema de Campos - Patente de Comercio

```typescript
interface PatenteComercionFields {
  // Header
  tipo_patente: string;           // "Empresa" | "Sociedad"
  numero_patente: string;
  titular: string;
  
  // Identificación
  nombre_entidad: string;
  numero_registro: string;
  folio: string;
  libro: string;
  numero_expediente: string;
  categoria: string;
  
  // Ubicación
  direccion_comercial: string;
  direccion_propietario?: string;
  direccion_entidad?: string;
  
  // Actividad
  objeto: string;
  clase_establecimiento?: string;
  
  // Fechas
  fecha_inscripcion: {
    numeric: string;        // "17/09/2024"
    words: string;          // "diecisiete de septiembre de dos mil veinticuatro"
  };
  fecha_emision: {
    numeric: string;
    words: string;
  };
  inscripcion_provisional?: {
    numeric: string;
    words: string;
  };
  inscripcion_definitiva?: {
    numeric: string;
    words: string;
  };
  
  // Personas
  nombre_propietario: string;
  nacionalidad: string;
  documento_identificacion?: string;
  representante?: string;
  hecho_por: string;
}
```

---

## 4. API Endpoints

### 4.1 Autenticación

```
POST /api/auth/login
Body: { email, password }
Response: { token, user }

POST /api/auth/logout
Response: { success }
```

### 4.2 Extracción

```
POST /api/extract
Headers: Authorization: Bearer {token}
Body: FormData { file: File, doc_type: string }
Response: {
  extraction_id: string,
  confidence: "full" | "partial" | "review_required",
  fields: ExtractedField[],
  discrepancies?: string[]
}
```

### 4.3 Historial

```
GET /api/extractions
Response: Extraction[]

GET /api/extractions/:id
Response: Extraction with fields

DELETE /api/extractions/:id
Response: { success }
```

### 4.4 Descarga

```
GET /api/download/:extraction_id?format=txt
Response: Plain text file

GET /api/download/:extraction_id?format=html
Response: HTML with copy buttons
```

---

## 5. Motor de Consenso

### 5.1 Lógica de Comparación

```typescript
interface ConsensusResult {
  field_name: string;
  claude_value: string;
  openai_value: string;
  final_value: string;
  match: boolean;
  confidence: number;  // 0-1
}

function compareResults(claude: Fields, openai: Fields): ConsensusResult[] {
  const results: ConsensusResult[] = [];
  
  for (const field of ALL_FIELDS) {
    const c = normalize(claude[field]);
    const o = normalize(openai[field]);
    
    if (c === o) {
      // Perfect match
      results.push({ ...field, final_value: c, match: true, confidence: 1.0 });
    } else if (fuzzyMatch(c, o) > 0.95) {
      // Minor difference (whitespace, punctuation)
      results.push({ ...field, final_value: c, match: true, confidence: 0.95 });
    } else {
      // Discrepancy - flag for review
      results.push({ ...field, final_value: null, match: false, confidence: 0 });
    }
  }
  
  return results;
}

function normalize(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:]+$/, '');
}
```

### 5.2 Confidence Levels

| Level | Condition | Action |
|-------|-----------|--------|
| `full` | 100% fields match | Auto-approve |
| `partial` | >90% match, minor discrepancies | Show warnings |
| `review_required` | <90% match OR critical field mismatch | Block download until review |

### 5.3 Critical Fields (always require match)

- `numero_registro`
- `numero_patente`
- `nombre_entidad`
- `fecha_inscripcion`
- `fecha_emision`

---

## 6. Prompts de Extracción

### 6.1 System Prompt (ambas APIs)

```
Eres un extractor de datos especializado en documentos legales guatemaltecos.

TAREA: Extraer TODOS los campos de una Patente de Comercio del Registro Mercantil de Guatemala.

REGLAS CRÍTICAS:
1. Extrae EXACTAMENTE lo que dice el documento. No interpretes ni corrijas.
2. Si un campo está vacío, en blanco, o con asteriscos (****), responde: "[VACÍO]"
3. Si un campo no existe en el documento, responde: "[NO APLICA]"
4. Si no puedes leer un campo con certeza, responde: "[ILEGIBLE]"
5. Para fechas, extrae día, mes y año por separado.
6. Respeta mayúsculas y minúsculas del documento original.
7. No agregues puntuación que no esté en el original.

FORMATO DE RESPUESTA (JSON estricto):
{
  "tipo_patente": "Empresa|Sociedad",
  "numero_patente": "",
  "titular": "",
  "nombre_entidad": "",
  "numero_registro": "",
  "folio": "",
  "libro": "",
  "numero_expediente": "",
  "categoria": "",
  "direccion_comercial": "",
  "objeto": "",
  "fecha_inscripcion_dia": "",
  "fecha_inscripcion_mes": "",
  "fecha_inscripcion_ano": "",
  "nombre_propietario": "",
  "nacionalidad": "",
  "documento_identificacion": "",
  "direccion_propietario": "",
  "clase_establecimiento": "",
  "representante": "",
  "fecha_emision_dia": "",
  "fecha_emision_mes": "",
  "fecha_emision_ano": "",
  "hecho_por": ""
}
```

### 6.2 Conversión Numérica a Palabras

```typescript
// Biblioteca: numero-a-letras (npm) adaptada para Guatemala
import { NumerosALetras } from 'numero-a-letras';

function dateToWords(dia: string, mes: string, ano: string): string {
  const d = NumerosALetras(parseInt(dia));
  const meses = {
    '01': 'enero', '02': 'febrero', '03': 'marzo',
    '04': 'abril', '05': 'mayo', '06': 'junio',
    '07': 'julio', '08': 'agosto', '09': 'septiembre',
    '10': 'octubre', '11': 'noviembre', '12': 'diciembre',
    'enero': 'enero', 'febrero': 'febrero', // handle text months
    // ... etc
  };
  const m = meses[mes.toLowerCase()] || mes.toLowerCase();
  const a = NumerosALetras(parseInt(ano));
  
  return `${d} de ${m} de ${a}`.toLowerCase();
}

// Example: "17", "septiembre", "2024" 
// → "diecisiete de septiembre de dos mil veinticuatro"
```

---

## 7. UI/UX Specifications

### 7.1 Pantallas

#### Login (`/login`)
```
┌─────────────────────────────────────┐
│           LEGISLAZULI               │
│                                     │
│   ┌─────────────────────────────┐   │
│   │ Correo electrónico          │   │
│   └─────────────────────────────┘   │
│   ┌─────────────────────────────┐   │
│   │ Contraseña                  │   │
│   └─────────────────────────────┘   │
│                                     │
│        [ Ingresar ]                 │
│                                     │
└─────────────────────────────────────┘
```

#### Dashboard (`/`)
```
┌─────────────────────────────────────────────────────────────┐
│  LEGISLAZULI                              [Usuario ▼]       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  │     Arrastra tu archivo aquí                       │   │
│  │     PDF, PNG o JPG                                 │   │
│  │                                                     │   │
│  │     [ Seleccionar archivo ]                        │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Tipo de documento: [Patente de Comercio ▼]                │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  Extracciones recientes                                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 📄 patente_001.pdf   17/09/2024   ✓ Completo  [Ver]│   │
│  │ 📄 patente_002.jpg   16/09/2024   ⚠ Revisar   [Ver]│   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Resultados (`/extraction/:id`)
```
┌─────────────────────────────────────────────────────────────┐
│  ← Volver                                    [Descargar ▼]  │
├─────────────────────────────────────────────────────────────┤
│  Confianza: ✓ COMPLETA (100% consenso)                     │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ TIPO DE PATENTE                                     │   │
│  │ Empresa                                        [📋] │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ NÚMERO DE PATENTE                                   │   │
│  │ 508342                                         [📋] │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ NOMBRE DE LA ENTIDAD                                │   │
│  │ PURIFICADORA EL QUETZAL, SOCIEDAD ANONIMA     [📋] │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ FECHA DE INSCRIPCIÓN                                │   │
│  │ 17/09/2024                                     [📋] │   │
│  │ diecisiete de septiembre de dos mil veinticuatro[📋]│   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ ⚠ OBJETO (revisar)                                  │   │
│  │ Distribución y venta de agua purificada...     [📋] │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [ Aprobar y Guardar ]                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 Copy Button Component

```tsx
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <button 
      onClick={handleCopy}
      className="p-1 hover:bg-gray-100 rounded"
      title="Copiar"
    >
      {copied ? '✓' : '📋'}
    </button>
  );
}
```

---

## 8. Seguridad

### 8.1 Autenticación
- Passwords hasheados con bcrypt (cost factor 12)
- JWT tokens con expiración de 24h
- HTTPOnly cookies para tokens

### 8.2 Autorización
- Row Level Security (RLS) en Supabase
- Usuarios solo ven sus propios documentos

### 8.3 Storage
- Documentos en bucket privado de Supabase
- URLs firmadas con expiración para descarga
- No información confidencial per requirements

### 8.4 API Keys
- Variables de entorno en Vercel
- Nunca expuestas al cliente

---

## 9. Estructura de Archivos

```
legislazuli/
├── app/
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx
│   ├── (dashboard)/
│   │   ├── page.tsx              # Upload + recent extractions
│   │   └── extraction/
│   │       └── [id]/
│   │           └── page.tsx      # Results view
│   ├── api/
│   │   ├── auth/
│   │   │   └── [...nextauth]/
│   │   │       └── route.ts
│   │   ├── extract/
│   │   │   └── route.ts          # Main extraction endpoint
│   │   ├── extractions/
│   │   │   ├── route.ts          # List all
│   │   │   └── [id]/
│   │   │       └── route.ts      # Get/delete one
│   │   └── download/
│   │       └── [id]/
│   │           └── route.ts
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── ui/
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Card.tsx
│   │   └── CopyButton.tsx
│   ├── FileUpload.tsx
│   ├── ExtractionResults.tsx
│   └── ExtractionList.tsx
├── lib/
│   ├── ai/
│   │   ├── claude.ts             # Claude API wrapper
│   │   ├── openai.ts             # OpenAI API wrapper
│   │   ├── consensus.ts          # Comparison logic
│   │   └── prompts.ts            # Extraction prompts
│   ├── db/
│   │   └── supabase.ts           # Supabase client
│   ├── utils/
│   │   ├── numbers-to-words.ts   # Numeric conversion
│   │   └── normalize.ts          # Text normalization
│   └── auth.ts                   # NextAuth config
├── types/
│   └── index.ts                  # TypeScript interfaces
├── .env.local
├── package.json
└── README.md
```

---

## 10. Estimaciones

### 10.1 Costos por Extracción

| Servicio | Costo estimado |
|----------|----------------|
| Claude Sonnet (vision) | ~$0.01-0.03 per doc |
| GPT-4o (vision) | ~$0.01-0.02 per doc |
| Supabase | Free tier (sufficient) |
| Vercel | Free tier (sufficient) |
| **Total por documento** | **~$0.02-0.05** |

### 10.2 Timeline de Desarrollo

| Fase | Duración | Entregable |
|------|----------|------------|
| Setup & Auth | 2-3 horas | Login funcional |
| Upload & Storage | 2-3 horas | Subida de archivos |
| AI Integration | 4-6 horas | Extracción dual-API |
| Consensus Engine | 2-3 horas | Comparación y merge |
| Results UI | 3-4 horas | Vista con copy buttons |
| Download | 1-2 horas | Export TXT/HTML |
| Testing & Polish | 2-3 horas | QA completo |
| **Total** | **16-24 horas** | MVP funcional |

---

## 11. Roadmap Futuro

### v1.1 - Más Documentos
- Escrituras públicas
- Actas notariales
- Testimonios
- DPI extraction

### v1.2 - Multi-tenant
- Organizaciones
- Roles (admin, user)
- Billing per organization

### v1.3 - Inteligencia
- Templates por tipo de documento
- Auto-detection de tipo
- Sugerencias de corrección
- OCR fallback para documentos de baja calidad

### v1.4 - Integraciones
- API pública
- Webhook para sistemas legales
- Export a Word con formato

---

## 12. Decisiones de Diseño

| Decisión | Alternativa rechazada | Razón |
|----------|----------------------|-------|
| Dual-API consensus | Single API | 100% accuracy requirement |
| Supabase | Firebase, PlanetScale | Free tier generous, storage included |
| Next.js | Separate FE/BE | Deployment simplicity, SSR |
| JWT in HTTPOnly cookie | localStorage | Security best practice |
| Copy buttons | Triple-click selection | Better UX, fewer errors |
| Store raw AI responses | Only final result | Debugging, audit trail |

---

## Aprobación

| Rol | Nombre | Fecha |
|-----|--------|-------|
| Product Owner | | |
| Tech Lead | | |
| Legal Review | | |