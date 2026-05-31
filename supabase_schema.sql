-- ==============================================================================
-- [Zeta Interactive Fiction] Supabase Database Schema & RLS Policies (Phase 3)
-- ==============================================================================

-- 0. RLS 및 확장을 위한 준비
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

-- 커스텀 updated_at 트리거 함수 (자동 업데이트용)
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- ==============================================================================
-- 1. 사용자 프로필 테이블 (Profiles)
-- ==============================================================================
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
-- [보완] 완벽한 RLS 정책: 타인의 프로필은 읽기만 가능, 본인 프로필만 수정 가능
CREATE POLICY "Public profiles are viewable by everyone." ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile." ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile." ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE TRIGGER update_profiles_modtime BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

-- ==============================================================================
-- 2. 캐릭터 정보 테이블 (Characters)
-- ==============================================================================
CREATE TABLE characters (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT, -- 캐릭터의 기본 페르소나
  system_prompt TEXT, -- [보완] 헌법(Constitution) 및 내면의 가치관을 분리하여 프롬프트로 관리
  greeting_message TEXT, -- [보완] 방 생성 시 첫 시나리오/인사말 (사용자 몰입 극대화)
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE characters ENABLE ROW LEVEL SECURITY;
-- [보완] 퍼블릭 캐릭터는 누구나 조회 가능, 프라이빗은 생성자만. 수정/삭제는 생성자만.
CREATE POLICY "Public/Owned characters viewable." ON characters FOR SELECT 
  USING (is_public = true OR auth.uid() = creator_id);
CREATE POLICY "Users can insert own characters." ON characters FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "Users can update own characters." ON characters FOR UPDATE USING (auth.uid() = creator_id);
CREATE POLICY "Users can delete own characters." ON characters FOR DELETE USING (auth.uid() = creator_id);
CREATE TRIGGER update_characters_modtime BEFORE UPDATE ON characters FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

-- ==============================================================================
-- 3. 대화방(세계) 테이블 (Chats)
-- ==============================================================================
CREATE TABLE chats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  character_id UUID REFERENCES characters(id) ON DELETE CASCADE,
  user_persona_in_chat TEXT, -- 이 세계관에서의 사용자 고유 설정 (예: '기사단장', '기억을 잃은 여행자')
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
-- [보완] 철저한 세션 독립성 보장: 자신의 방에만 접근 가능
CREATE POLICY "Users can view own chats." ON chats FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own chats." ON chats FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own chats." ON chats FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own chats." ON chats FOR DELETE USING (auth.uid() = user_id);

-- ==============================================================================
-- 4. 메시지 로그 테이블 (Messages)
-- ==============================================================================
CREATE TABLE messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('user', 'character', 'system')), -- [보완] 감독 모드나 시스템 알림을 위한 'system' 타입 추가
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
-- [보완] 조인 검증(EXISTS)을 통해 자신이 속한 방의 메시지만 CRUD 가능토록 제한
CREATE POLICY "Users can view messages of own chats." ON messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM chats WHERE chats.id = messages.chat_id AND chats.user_id = auth.uid())
);
CREATE POLICY "Users can insert messages to own chats." ON messages FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM chats WHERE chats.id = messages.chat_id AND chats.user_id = auth.uid())
);

-- ==============================================================================
-- 5. 벡터 기억 저장소 (Character Embeddings - RAG용)
-- ==============================================================================
CREATE TABLE character_embeddings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(768), -- Gemini Text Embedding-004 모델 기준 768 차원
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- [보완] HNSW(Hierarchical Navigable Small World) 인덱스 추가
-- 수십만 건의 대화 기억 파편이 발생하더라도 근사 최근접 이웃(ANN) 탐색을 매우 빠르게 수행합니다.
CREATE INDEX on character_embeddings USING hnsw (embedding vector_cosine_ops);

ALTER TABLE character_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view embeddings of own chats." ON character_embeddings FOR SELECT USING (
  EXISTS (SELECT 1 FROM chats WHERE chats.id = character_embeddings.chat_id AND chats.user_id = auth.uid())
);
CREATE POLICY "Users can insert embeddings to own chats." ON character_embeddings FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM chats WHERE chats.id = character_embeddings.chat_id AND chats.user_id = auth.uid())
);
CREATE POLICY "Users can delete embeddings of own chats." ON character_embeddings FOR DELETE USING (
  EXISTS (SELECT 1 FROM chats WHERE chats.id = character_embeddings.chat_id AND chats.user_id = auth.uid())
);
