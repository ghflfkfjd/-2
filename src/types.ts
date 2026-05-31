export interface Message {
  id: string;
  role: 'user' | 'model' | 'system';
  text: string;
  imageUrl?: string;
  speakerName?: string;
  targetName?: string;
  feedback?: 'good' | 'bad';
}

// ==============================================
// Supabase Database Entity Types (Phase 3)
// ==============================================

export interface DBProfile {
  id: string;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface DBCharacter {
  id: string;
  creator_id: string;
  name: string;
  description: string | null;
  system_prompt: string | null;
  greeting_message: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  sharing_level?: 'public' | 'link' | 'private';
  allow_remix?: boolean;
  original_creator_name?: string;
  remix_count?: number;
  likes?: number;
  views?: number;
  metadata?: any;
}

export interface NarrativeSnapshot {
  id: string;
  character_id: string;
  character_name: string;
  creator_name: string;
  narrative_state: string;
  current_location: string;
  messages: Message[];
  created_at: string;
  likes: number;
  user_persona: string;
  summary: string;
}

export interface DBChatSession {
  id: string;
  user_id: string;
  character_id: string;
  user_persona_in_chat: string | null;
  last_message_at: string;
  created_at: string;
}

export interface DBChatMessage {
  id: string;
  chat_id: string;
  sender: 'user' | 'character' | 'system';
  content: string;
  created_at: string;
}

export interface DBCharacterEmbedding {
  id: string;
  chat_id: string;
  content: string;
  embedding: number[]; // pgvector Array
  created_at: string;
}

// ==============================================
// 29단계: 협력적 세계관(Lorebook) 및 글로벌 이벤트 관련 타입
// ==============================================

export interface LoreEntry {
  id: string;
  keyword: string;     // 고유 명사 또는 트리거 단어
  category: 'historical' | 'geography' | 'magic' | 'faction';
  content: string;     // 상세 정의 본문 (RAG 조각)
  suggestion_by?: string; // 제안한 유저 이름
  status: 'approved' | 'pending'; // 협력 위키용 보드 상태
}

export interface SharedWorld {
  id: string;
  name: string;
  creator_name: string;
  description: string;
  lorebook: LoreEntry[];
  subscribed_count: number;
  remix_coins_rewarded: number; // 원작자 누적 보상금
}

export interface LiveNarrativeEvent {
  id: string;
  title: string;
  description: string;
  global_status: string; // "진행중", "작전성공", "패각전"
  progress_percent: number; // 전체 기여도 게이지
  injected_state: string; // 대화방에 주입되는 공통 문맥 상태
  user_contribution_points: number; // 현재 유저의 누적 참여도
}

