-- Script SQL para insertar usuarios de prueba
-- Ejecutar esto en el SQL Editor de Supabase

-- Primero, asegúrate de que la tabla users existe. Si no, créala con:
-- CREATE TABLE users (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   email TEXT UNIQUE NOT NULL,
--   password_hash TEXT NOT NULL,
--   created_at TIMESTAMPTZ DEFAULT NOW()
-- );

-- Insertar usuarios de prueba
-- Nota: Estos hashes fueron generados con bcrypt (cost factor 12)
-- Para generar nuevos hashes, usa: bcrypt.hashSync(password, 12)

-- Usuario: estefani / Password: 2122
INSERT INTO users (email, password_hash) 
VALUES (
  'estefani',
  '$2a$12$C2.K03jtfuCf4oWEPkZhtePGLfXY311Do0x6CpMSg9XTQfQebDu.G'
) ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash;

-- Usuario: roberto / Password: 54839627
INSERT INTO users (email, password_hash) 
VALUES (
  'roberto',
  '$2a$12$EYP4pyl4qPxulcbWjqWNc.R9KDzhdNGhdLvlqsC/ZigLQDaSkT0/6'
) ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash;

-- Usuario: condor / Password: x
INSERT INTO users (email, password_hash) 
VALUES (
  'condor',
  '$2a$12$5QgGp58GBgTy9QXLGaDu4OgrEJYy/zyaJ8CwQKZL30ebEljOjmuRi'
) ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash;

-- Usuario: JPROSALES / Password: JP_1992
INSERT INTO users (email, password_hash) 
VALUES (
  'JPROSALES',
  '$2a$12$AJ0QEOXfMcuXPcn.WD/0n.wqf3U1KGQSF253MkPJOoa13AIeeiFUa'
) ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash;

-- Usuario: ALSS / Password: ALSS*1*2*9_
INSERT INTO users (email, password_hash) 
VALUES (
  'ALSS',
  '$2a$12$tVZQmOsUlxn3bnuJ/osxxe2n.uoyIP41Gar82hgA0r9u0qc9XiJWG'
) ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash;

