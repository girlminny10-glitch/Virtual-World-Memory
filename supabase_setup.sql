-- ═══════════════════════════════════════════════════════════════════════
-- Virtual World 3D — Supabase Tables Setup
-- Execute este SQL no painel do Supabase: SQL Editor → New Query → Run
-- ═══════════════════════════════════════════════════════════════════════

-- Memórias de conversas dos NPCs
CREATE TABLE IF NOT EXISTS npc_memories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  npc_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_npc_memories_npc_id ON npc_memories(npc_id);
CREATE INDEX IF NOT EXISTS idx_npc_memories_created_at ON npc_memories(created_at);

-- Criações dos NPCs
CREATE TABLE IF NOT EXISTS npc_creations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  npc_id TEXT NOT NULL,
  description TEXT NOT NULL,
  type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_npc_creations_npc_id ON npc_creations(npc_id);

-- Aprendizados automáticos dos NPCs (auto-learning)
CREATE TABLE IF NOT EXISTS npc_learnings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  npc_id TEXT NOT NULL,
  learning TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(npc_id, learning)
);
CREATE INDEX IF NOT EXISTS idx_npc_learnings_npc_id ON npc_learnings(npc_id);

-- Relacionamentos entre NPCs (persistido como JSON)
CREATE TABLE IF NOT EXISTS npc_relationships (
  npc_id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversas entre pares de NPCs (memória de diálogos)
CREATE TABLE IF NOT EXISTS npc_pair_conversations (
  pair_key TEXT PRIMARY KEY,
  history JSONB NOT NULL DEFAULT '[]',
  topic TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Objetos do mundo (persistência permanente)
CREATE TABLE IF NOT EXISTS world_objects (
  id TEXT PRIMARY KEY,
  creator TEXT NOT NULL,
  creator_id TEXT NOT NULL,
  creator_color TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  position_x FLOAT NOT NULL,
  position_z FLOAT NOT NULL,
  color TEXT NOT NULL DEFAULT '#aaaaaa',
  scale FLOAT NOT NULL DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_world_objects_created_at ON world_objects(created_at);

-- Permissões de acesso (RLS desabilitado para API server)
ALTER TABLE npc_memories DISABLE ROW LEVEL SECURITY;
ALTER TABLE npc_creations DISABLE ROW LEVEL SECURITY;
ALTER TABLE npc_learnings DISABLE ROW LEVEL SECURITY;
ALTER TABLE npc_relationships DISABLE ROW LEVEL SECURITY;
ALTER TABLE npc_pair_conversations DISABLE ROW LEVEL SECURITY;
ALTER TABLE world_objects DISABLE ROW LEVEL SECURITY;

-- Execute no Supabase: SQL Editor → New Query → Cole isso → Run

CREATE TABLE IF NOT EXISTS npc_memories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  npc_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_npc_memories_npc_id ON npc_memories(npc_id);

CREATE TABLE IF NOT EXISTS npc_creations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  npc_id TEXT NOT NULL,
  description TEXT NOT NULL,
  type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS npc_learnings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  npc_id TEXT NOT NULL,
  learning TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(npc_id, learning)
);
CREATE INDEX IF NOT EXISTS idx_npc_learnings_npc_id ON npc_learnings(npc_id);

CREATE TABLE IF NOT EXISTS npc_relationships (
  npc_id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS npc_pair_conversations (
  pair_key TEXT PRIMARY KEY,
  history JSONB NOT NULL DEFAULT '[]',
  topic TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS world_objects (
  id TEXT PRIMARY KEY,
  creator TEXT NOT NULL,
  creator_id TEXT NOT NULL,
  creator_color TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  position_x FLOAT NOT NULL,
  position_z FLOAT NOT NULL,
  color TEXT NOT NULL DEFAULT '#aaaaaa',
  scale FLOAT NOT NULL DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE npc_memories DISABLE ROW LEVEL SECURITY;
ALTER TABLE npc_creations DISABLE ROW LEVEL SECURITY;
ALTER TABLE npc_learnings DISABLE ROW LEVEL SECURITY;
ALTER TABLE npc_relationships DISABLE ROW LEVEL SECURITY;
ALTER TABLE npc_pair_conversations DISABLE ROW LEVEL SECURITY;
ALTER TABLE world_objects DISABLE ROW LEVEL SECURITY;