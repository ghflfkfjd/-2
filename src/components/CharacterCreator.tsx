import React, { useState, useEffect } from 'react';
import { ArrowLeft, Sparkles, Wand2, Plus, Trash2, BookOpen, MessageSquare, Tag, Eye, Info, RefreshCw, User, Users, Link, HelpCircle, ChevronDown, ChevronUp, Filter } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { DBCharacter } from '../types';

const cleanHeaderValue = (val: string | null | undefined): string => {
  if (!val) return '';
  return val.replace(/[^\x20-\x7E]/g, '').trim();
};

const getSafeHeaders = (userApiKey?: string | null, userModel?: string | null): Record<string, string> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const key = cleanHeaderValue(userApiKey);
  const model = cleanHeaderValue(userModel);
  if (key) {
    headers['x-user-api-key'] = key;
  }
  if (model) {
    headers['x-user-model'] = model;
  }
  return headers;
};

interface CharacterCreatorProps {
  onBack: () => void;
  onSave: (character: DBCharacter) => void;
  editCharacter?: DBCharacter;
}

export interface LorebookEntry {
  id: string;
  title: string;
  keywords: string;
  content: string;
  isOpen: boolean;
}

interface WorldNPC {
  id: string;
  name: string;
  role: string;
  greeting_message: string;
  location_scenario: string;
  sharing_level: 'public' | 'link' | 'private';
  allow_remix: boolean;
  dialogue_examples: string;
  lore_entries: string;
  로어북설정s: LorebookEntry[];
  imagePrompt: string;
  profileImage: string | null;
}

interface RelationshipLine {
  id: string;
  from: string;
  to: string;
  type: string;
  description: string;
}

const createEmptyNpc = (index: number): WorldNPC => ({
  id: `npc-${Date.now()}-${index}`,
  name: '',
  role: '',
  greeting_message: '',
  location_scenario: '',
  sharing_level: 'private',
  allow_remix: true,
  dialogue_examples: '',
  lore_entries: '',
  로어북설정s: [],
  imagePrompt: '',
  profileImage: null
});



export function CharacterCreator({ onBack, onSave, editCharacter }: CharacterCreatorProps) {
  // 1. World Scenario states
  const [세계관설정Name, setWorldName] = useState('');
  const [세계관설정Description, setWorldDescription] = useState('');
  const [세계관설정Scenario, setWorldScenario] = useState('');
  const [sharingLevel, setSharingLevel] = useState<'public' | 'link' | 'private'>('private');
  const [allowRemix, setAllowRemix] = useState(true);
  const [introIdea, setIntroIdea] = useState('');

  // 2. Playable Character - Protagonist state (나의 캐릭터)
  const [주인공설정Name, setPlayerName] = useState('');
  const [주인공설정Persona, setPlayerPersona] = useState('');

  // 3. Multi-NPC lists (이 세계의 NPC 캐릭터들) - Starts with exactly 1 empty NPC
  const [인물목록, setNpcs] = useState<WorldNPC[]>(() => [createEmptyNpc(0)]);

  // Selected NPC active sub-tab (Matches image tabs: basic, wPlus, fewShot, 로어북설정)
  const [npcActiveSubTab, setNpcActiveSubTab] = useState<'basic' | 'wPlus' | 'fewShot' | '로어북설정'>('basic');

  // 4. Character Relationship map state (인물 간 관계망)
  const [인물관계hips, setRelationships] = useState<RelationshipLine[]>([]);
  const [relationFilterCharId, setRelationFilterCharId] = useState<string>('all');
  const [expandedPairs, setExpandedPairs] = useState<Record<string, boolean>>({});

  // AI assistant states
  const [draftKeywords, setDraftKeywords] = useState('');
  const [isDrafting, setIsDrafting] = useState(false);
  const [activeTab, setActiveTab] = useState<'세계관설정' | '주인공설정' | '인물목록' | '인물관계' | '로어북설정'>('세계관설정');
  const [globalLorebooks, setGlobalLorebooks] = useState<LorebookEntry[]>([]);

  useEffect(() => {
    if (editCharacter && editCharacter.metadata) {
      const meta = editCharacter.metadata;
      if (meta.세계관설정Name !== undefined) setWorldName(meta.세계관설정Name);
      if (meta.세계관설정Description !== undefined) setWorldDescription(meta.세계관설정Description);
      if (meta.세계관설정Scenario !== undefined) setWorldScenario(meta.세계관설정Scenario);
      if (meta.sharingLevel !== undefined) setSharingLevel(meta.sharingLevel);
      if (meta.allowRemix !== undefined) setAllowRemix(meta.allowRemix);
      if (meta.introIdea !== undefined) setIntroIdea(meta.introIdea);
      if (meta.주인공설정Name !== undefined) setPlayerName(meta.주인공설정Name);
      if (meta.주인공설정Persona !== undefined) setPlayerPersona(meta.주인공설정Persona);
      if (meta.인물목록 !== undefined) setNpcs(meta.인물목록);
      if (meta.인물관계hips !== undefined) setRelationships(meta.인물관계hips);
      if (meta.globalLorebooks !== undefined) setGlobalLorebooks(meta.globalLorebooks);
    }
  }, [editCharacter]);

  // Currently selected NPC for illustration/image rendering view
  const [selectedNpcId, setSelectedNpcId] = useState<string>('');
  
  // Translating state tracking for each NPC's illustration prompt
  const [translatingNpcId, setTranslatingNpcId] = useState<string | null>(null);

  // New AI states
  const [isGeneratingFull, setIsGeneratingFull] = useState(false);
  const [aiFeedbackMessage, setAiFeedbackMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [autofillLoading, setAutofillLoading] = useState<Record<string, boolean>>({});

  const handleGenerateFullScenario = async () => {
    setIsGeneratingFull(true);
    setAiFeedbackMessage(null);
    try {
      const userApiKey = localStorage.getItem('gemini_user_api_key') || '';
      const userModel = localStorage.getItem('gemini_user_model') || 'gemini-3.5-flash';

      const response = await fetch('/api/generate-full-scenario', {
        method: 'POST',
        headers: getSafeHeaders(userApiKey, userModel),
        body: JSON.stringify({
          세계관설정Name,
          세계관설정Description,
          세계관설정Scenario,
          introIdea,
          주인공설정Name,
          주인공설정Persona,
          npcs: 인물목록,
          relationships: 인물관계hips,
        }),
      });

      if (!response.ok) throw new Error('AI 전체 시나리오 생성 실패');
      const data = await response.json();

      if (data.세계관설정Name) setWorldName(data.세계관설정Name);
      if (data.세계관설정Description) setWorldDescription(data.세계관설정Description);
      if (data.세계관설정Scenario) setWorldScenario(data.세계관설정Scenario);
      if (data.introIdea) setIntroIdea(data.introIdea);
      if (data.주인공설정Name) setPlayerName(data.주인공설정Name);
      if (data.주인공설정Persona) setPlayerPersona(data.주인공설정Persona);

      if (data.npcs && data.npcs.length > 0) {
        const mappedNpcs = data.npcs.map((n: any, idx: number) => {
          const existingNpc = 인물목록[idx];
          return {
            id: existingNpc?.id || n.id || `npc-${Date.now()}-${idx}`,
            name: n.name || '',
            role: n.role || '',
            greeting_message: n.greeting_message || '',
            location_scenario: n.location_scenario || '',
            sharing_level: 'private',
            allow_remix: true,
            dialogue_examples: n.dialogue_examples || '',
            lore_entries: '',
            로어북설정s: existingNpc?.로어북설정s || [],
            imagePrompt: n.imagePrompt || '',
            profileImage: existingNpc?.profileImage || null
          };
        });
        setNpcs(mappedNpcs);
        if (mappedNpcs.length > 0) {
          setSelectedNpcId(mappedNpcs[0].id);
        }
      }

      if (data.relationships) {
        setRelationships(data.relationships.map((r: any, idx: number) => ({
          id: r.id || `rel-${Date.now()}-${idx}`,
          from: r.from || '주인공설정',
          to: r.to || '주인공설정',
          type: r.type || '',
          description: r.description || ''
        })));
      }

      setAiFeedbackMessage('✨ AI 일괄 작성이 완료되었습니다! 각 탭에서 생성된 아름다운 소설 설정을 확인해 보세요.');
      setTimeout(() => {
        setAiFeedbackMessage(null);
      }, 5000);

    } catch (error) {
      console.error("Generate full scenario failure:", error);
      setAiFeedbackMessage('❌ AI 전체 생성 도중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setIsGeneratingFull(false);
    }
  };

  const handleAutofillField = async (fieldName: string, npcId?: string) => {
    const loaderKey = npcId ? `${fieldName}-${npcId}` : fieldName;
    setAutofillLoading(prev => ({ ...prev, [loaderKey]: true }));
    try {
      let currentValue = '';
      if (fieldName === '세계관설정Name') currentValue = 세계관설정Name;
      else if (fieldName === '세계관설정Description') currentValue = 세계관설정Description;
      else if (fieldName === '세계관설정Scenario') currentValue = 세계관설정Scenario;
      else if (fieldName === 'introIdea') currentValue = introIdea;
      else if (fieldName === '주인공설정Name') currentValue = 주인공설정Name;
      else if (fieldName === '주인공설정Persona') currentValue = 주인공설정Persona;
      else if (npcId) {
        const npc = 인물목록.find(n => n.id === npcId);
        if (npc) {
          if (fieldName === 'npcName') currentValue = npc.name;
          else if (fieldName === 'npcRole') currentValue = npc.role;
          else if (fieldName === 'npcDescription') currentValue = npc.location_scenario;
          else if (fieldName === 'npcDialogue') currentValue = npc.dialogue_examples;
        }
      }

      const worldContext = {
        세계관설정Name,
        세계관설정Description,
        세계관설정Scenario,
        introIdea,
        주인공설정Name,
        주인공설정Persona,
        npcs: 인물목록.map(n => ({ name: n.name, role: n.role, description: n.location_scenario })),
      };

      const userApiKey = localStorage.getItem('gemini_user_api_key') || '';
      const userModel = localStorage.getItem('gemini_user_model') || 'gemini-3.5-flash';

      const response = await fetch('/api/autofill-field', {
        method: 'POST',
        headers: getSafeHeaders(userApiKey, userModel),
        body: JSON.stringify({
          fieldName: npcId ? `NPC-${fieldName}` : fieldName,
          currentValue,
          worldContext,
        }),
      });

      if (!response.ok) throw new Error('AI 자동 채우기 실패');
      const data = await response.json();
      const resultText = data.text;

      if (resultText) {
        if (fieldName === '세계관설정Name') setWorldName(resultText);
        else if (fieldName === '세계관설정Description') setWorldDescription(resultText);
        else if (fieldName === '세계관설정Scenario') setWorldScenario(resultText);
        else if (fieldName === 'introIdea') setIntroIdea(resultText);
        else if (fieldName === '주인공설정Name') setPlayerName(resultText);
        else if (fieldName === '주인공설정Persona') setPlayerPersona(resultText);
        else if (npcId) {
          setNpcs(prev =>
            prev.map(n => {
              if (n.id === npcId) {
                if (fieldName === 'npcName') return { ...n, name: resultText };
                if (fieldName === 'npcRole') return { ...n, role: resultText };
                if (fieldName === 'npcDescription') return { ...n, location_scenario: resultText };
                if (fieldName === 'npcDialogue') return { ...n, dialogue_examples: resultText };
              }
              return n;
            })
          );
        }
      }
    } catch (error) {
      console.error("Autofill failure:", error);
    } finally {
      setAutofillLoading(prev => ({ ...prev, [loaderKey]: false }));
    }
  };

  const renderAutofillButton = (fieldName: string, npcId?: string) => {
    const loaderKey = npcId ? `${fieldName}-${npcId}` : fieldName;
    const isLoading = autofillLoading[loaderKey];
    return (
      <button
        type="button"
        onClick={() => handleAutofillField(fieldName, npcId)}
        disabled={isLoading}
        className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold text-[#D97706] bg-[#FFFBEB] hover:bg-[#FEF3C7] active:bg-[#FDE68A] border border-[#FCD34D] rounded-md transition-colors cursor-pointer disabled:opacity-50 font-sans"
      >
        <Sparkles size={9} className={`${isLoading ? 'animate-spin' : ''} text-[#D97706]`} />
        {isLoading ? '생성 중...' : '자동 채우기'}
      </button>
    );
  };

  // Auto prompt translator supporting Korean input & instant preset enhancement
  const translateNpcPrompt = async (npcId: string, textToTranslate: string): Promise<string> => {
    if (!textToTranslate || !textToTranslate.trim()) return "";
    
    // Check if contains Korean char
    const hasKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(textToTranslate);
    if (!hasKorean) return textToTranslate;

    setTranslatingNpcId(npcId);
    try {
      const userApiKey = localStorage.getItem('gemini_user_api_key') || '';
      const userModel = localStorage.getItem('gemini_user_model') || 'gemini-3.5-flash';
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: getSafeHeaders(userApiKey, userModel),
        body: JSON.stringify({ text: textToTranslate })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.translated) {
          // Instantly replace input text with translated elegant english terms
          setNpcs(prev =>
            prev.map(n => n.id === npcId ? { ...n, imagePrompt: data.translated } : n)
          );
          return data.translated;
        }
      }
    } catch (e) {
      console.error("Image prompt translation failed:", e);
    } finally {
      setTranslatingNpcId(null);
    }
    return textToTranslate;
  };

  // Profile image painter using Pollinations AI
  const handleRenderNpcImage = async (npcId: string) => {
    const targetNpc = 인물목록.find(n => n.id === npcId);
    if (!targetNpc || !targetNpc.imagePrompt.trim()) return;

    let finalPrompt = targetNpc.imagePrompt;
    const hasKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(finalPrompt);
    
    // Auto translate prior to sending if Korean is detected
    if (hasKorean) {
      finalPrompt = await translateNpcPrompt(npcId, finalPrompt);
    }

    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?width=400&height=400&nologo=true`;
    setNpcs(prev =>
      prev.map(n => n.id === npcId ? { ...n, profileImage: url } : n)
    );
  };

  const handleAiDraft = async () => {
    if (!draftKeywords.trim()) return;
    setIsDrafting(true);
    try {
      const userApiKey = localStorage.getItem('gemini_user_api_key') || '';
      const userModel = localStorage.getItem('gemini_user_model') || 'gemini-3.5-flash';
      const response = await fetch('/api/draft-character', {
        method: 'POST',
        headers: getSafeHeaders(userApiKey, userModel),
        body: JSON.stringify({ keywords: draftKeywords })
      });

      if (!response.ok) throw new Error('세계관 초안 로드 실패');
      
      const data = await response.json();
      
      // Elevate data from 1:1 format into gorgeous multi-character World
      setWorldName(data.name ? `${data.name}의 이야기` : draftKeywords + " 중심의 스토리");
      setWorldDescription(data.description || "포근한 파스텔톤 감성이 고루 담긴 가상 이야기 무대");
      setWorldScenario(data.scenario || "푸른 언덕 아래 꽃들이 아늑하게 피어난 평화롭고 조용한 장소");
      setPlayerName("여행자(나)");
      setPlayerPersona("낯선 마을에 잠시 들른 조용한 여행자. 이곳에서 알게 된 사람들과 아늑하고 잔잔한 이야기를 쌓아가기 시작합니다.");

      const aiNpc: WorldNPC = {
        id: `npc-${Date.now()}`,
        name: data.name || '알 수 없는 조우자',
        role: data.job || '세계의 중추적 열쇠',
        greeting_message: data.greeting_message || '*조용히 다가와 손을 건넵니다.* "이곳의 바람 냄새가 나네요. 환영해요."',
        location_scenario: `${data.scenario || '하늘빛 구름이 고이 포개어진 소박한 뒤뜰'} - ${data.job || '지식의 수호자'}, ${data.personality || '비밀 가득함, 도도하지만 속정이 따스함'}`,
        sharing_level: 'public',
        allow_remix: true,
        dialogue_examples: `<유저>: 넌 어디서 온 거야?\n<${data.name || '알 수 없는 조우자'}>: *조용히 하늘을 가리키며 활짝 웃습니다.* "저 멀리 보이는 아기자기한 구름 너머에서 불어온 포근한 바람을 타고 왔답니다."`,
        lore_entries: '',
        로어북설정s: [],
        imagePrompt: data.image_prompt || 'anime fantasy visual character, pastel theme, masterpiece',
        profileImage: data.image_prompt 
          ? `https://image.pollinations.ai/prompt/${encodeURIComponent(data.image_prompt)}?width=400&height=400&nologo=true`
          : null
      };

      const baseCompanion: WorldNPC = {
        id: `npc-companion-${Date.now()}`,
        name: '엘리나 (Elina)',
        role: '이 마을 최고의 디저트 파티시에',
        greeting_message: '*수줍게 마들렌 빵을 조심스레 꺼내 한 입 깨물곤 제안합니다.* "혹시 촉촉한 마력 쿠키 요리법을 아시나요?"',
        location_scenario: '달콤한 은박지 리본으로 포장된 아기자기한 오두막 주방. 디저트 파티시에이자 숨은 마법 촉매 연구가. 고상하면서도 은근히 엉뚱함, 다정한 수다쟁이. 깊은 초코 브라운 롱 트윈테일. 행복은 맛있는 단맛에서 탄생한다는 신조.',
        sharing_level: 'public',
        allow_remix: true,
        dialogue_examples: `<유저>: 제일 좋아하는 과자는 뭐야?\n<엘리나>: *눈을 반짝이며 양손으로 얼굴을 아리땁게 감쌉니다.* "그건 당연히 갓 오븐에서 꺼내 슈가파우더를 눈꽃처럼 소복이 뿌린 커스터드 카스텔라죠!"`,
        lore_entries: '',
        로어북설정s: [],
        imagePrompt: 'anime mysterious wizard girl, purple dress, carrying sweet pastries, aesthetic, pastel colors',
        profileImage: 'https://image.pollinations.ai/prompt/anime%20mysterious%20wizard%20girl%2C%20purple%20dress%2C%20carrying%20sweet%20pastries%2C%20aesthetic%2C%20pastel%20colors?width=400&height=400&nologo=true'
      };

      setGlobalLorebooks([
        {
          id: `lore-1-${Date.now()}`,
          title: '포근한 구름 향수',
          keywords: '포근한 구름 향수,물병,향수',
          content: '주변에 싱그러운 꽃내음을 퍼뜨려 마음에 행복을 주는 작은 물병.',
          isOpen: false
        },
        {
          id: `lore-2-${Date.now()}`,
          title: '슈가 파우더 양초',
          keywords: '슈가 파우더 양초,양초,보살핌',
          content: '양초의 향을 맡으면 마음이 포근하게 달래지며 피로가 사르르 녹아내리는 엘리나만의 특별한 보살핌 촉매.',
          isOpen: false
        }
      ]);

      setNpcs([aiNpc, baseCompanion]);
      setSelectedNpcId(aiNpc.id);

      setRelationships([
        {
          id: 'rel-1',
          from: aiNpc.name,
          to: '관측자(나)',
          type: '소중한 인연',
          description: `${aiNpc.name}(은)는 처음에 다소 낯설어하지만 은근히 플레이어의 친근함에 따스함을 느끼기 시작합니다`
        },
        {
          id: 'rel-2',
          from: '엘리나 (Elina)',
          to: '관측자(나)',
          type: '호기심과 먹방 동맹',
          description: '플레이어 고향 속 달콤한 디저트 비법에 호기심이 많습니다.'
        },
        {
          id: 'rel-3',
          from: aiNpc.name,
          to: '엘리나 (Elina)',
          type: '오랜 친구',
          description: '마을을 지켜며 어려움을 함께 극복해 나가는 조화롭고 신뢰 어린 깊은 우정을 이룹니다.'
        }
      ]);

      // Drafting success state can be indicated silently in UI
    } catch (error) {
      console.error(error);
    } finally {
      setIsDrafting(false);
    }
  };



  // Manage NPCs List - Min 1, Max 5
  const handleAddNpc = () => {
    if (인물목록.length >= 5) {
      return;
    }
    const newNpc = createEmptyNpc(인물목록.length);
    setNpcs([...인물목록, newNpc]);
    setSelectedNpcId(newNpc.id);
  };

  const handleUpdateNpc = (npcId: string, field: keyof WorldNPC, value: any) => {
    setNpcs(prev =>
      prev.map(n => n.id === npcId ? { ...n, [field]: value } : n)
    );
  };

  const handleRemoveNpc = (npcId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (인물목록.length <= 1) {
      // Create empty npc instead of blocking
      setNpcs([createEmptyNpc(0)]);
      setRelationships([]); // Clear relationships since we have only 1 empty npc
      return;
    }
    const filtered = 인물목록.filter(n => n.id !== npcId);
    setNpcs(filtered);
    setRelationships(prev => prev.filter(r => r.from !== npcId && r.to !== npcId));
    if (selectedNpcId === npcId) {
      setSelectedNpcId(filtered.length > 0 ? filtered[0].id : '');
    }
  };

  const handleAddGlobalLorebook = () => {
    const newLorebook: LorebookEntry = {
      id: `lore-${Date.now()}`,
      title: '',
      keywords: '',
      content: '',
      isOpen: true
    };
    setGlobalLorebooks([...globalLorebooks, newLorebook]);
  };

  const handleUpdateGlobalLorebook = (loreId: string, field: keyof LorebookEntry, value: any) => {
    setGlobalLorebooks(globalLorebooks.map(lore => 
      lore.id === loreId ? { ...lore, [field]: value } : lore
    ));
  };

  const handleRemoveGlobalLorebook = (loreId: string) => {
    setGlobalLorebooks(globalLorebooks.filter(lore => lore.id !== loreId));
  };

  // Manage Relationships via ID pairs to survive renaming
  const getCharacterNameById = (id: string) => {
    if (id === '주인공설정') return 주인공설정Name.trim() || '플레이어(나)';
    const npc = 인물목록.find(n => n.id === id);
    return npc ? (npc.name.trim() || '이름 없음') : '알 수 없는 인물';
  };

  const handleAddRelationship = () => {
    const newRel: RelationshipLine = {
      id: `rel-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      from: '주인공설정',
      to: 인물목록.length > 0 ? 인물목록[0].id : '주인공설정',
      type: '',
      description: ''
    };
    setRelationships(prev => [...prev, newRel]);
    setExpandedPairs(prev => ({ ...prev, [newRel.id]: true }));

  };

  const handleRemoveRelationship = (id: string) => {
    setRelationships(prev => prev.filter(r => r.id !== id));
  };

  const handleUpdateRelationship = (id: string, field: 'from' | 'to' | 'type' | 'description', value: string) => {
    setRelationships(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  // Compiling the entire multi-NPC universe into systematic DBCharacter structure
  const handleSubmit = () => {
    if (!세계관설정Name.trim()) {
      setAiFeedbackMessage('❌ 스토리의 이름을 입력해 주세요.');
      return;
    }

    if (인물목록.length === 0) {
      setAiFeedbackMessage('❌ 이야기를 완성하려면 최소 한 명 이상의 등장 인물이 필요합니다. 등장인물 추가 버튼을 눌러보세요.');
      return;
    }

    const hasUnnamed = 인물목록.some(n => !n.name.trim());
    if (hasUnnamed) {
      setAiFeedbackMessage('❌ 모든 등장인물의 이름을 적어주세요. 이름이 비어 있는 등장인물이 있습니다.');
      return;
    }

    setIsSaving(true);
    setAiFeedbackMessage('✅ 스토리 정보가 성공적으로 저장되었습니다. 리스트로 이동합니다...');

    // 1. Build hyper-meticulous W++ system prompt containing the whole 세계관설정 network
    const wPlusPrompt = `[World_Setting("${세계관설정Name}")]
[World_Description("${세계관설정Description}")]
[World_Scenario("${세계관설정Scenario}")]

[My_Character_Protagonist]
- Name: "${주인공설정Name}"
- Persona/Background: "${주인공설정Persona}"

[World_NPC_List]
${인물목록.map((npc, idx) => `
NPC_${idx + 1}("${npc.name}"):
- Short Biography/Role: "${npc.role || '소개 없음'}"
- General Setup/Description: "${npc.location_scenario || '소개 없음'}"
- Few-shot Dialogue Examples:
${npc.dialogue_examples || '대화 예시 없음'}
- Sharing Authority Settings: "${npc.sharing_level}" (Remix Allowed: ${npc.allow_remix})
`).join('\n')}

[Character_Relationship_Network_Map]
${인물관계hips
  .filter(rel => {
    const nameA = getCharacterNameById(rel.from);
    const nameB = getCharacterNameById(rel.to);
    return nameA !== '알 수 없는 인물' && nameB !== '알 수 없는 인물' && rel.type.trim() && rel.description.trim();
  })
  .map(rel => {
    const nameFrom = getCharacterNameById(rel.from);
    const nameTo = getCharacterNameById(rel.to);
    return `- "${nameFrom}" ──[관계: ${rel.type}]──> "${nameTo}": "${rel.description}"`;
  })
  .join('\n')}

[World_Lorebook]
${globalLorebooks.length > 0 ? globalLorebooks.map(l => `[Lore_Entry]\n- Name: ${l.title}\n- Trigger Keywords: [${l.keywords}]\n- Content: ${l.content}`).join('\n\n') : '설정 지식 없음'}

[Roleplay Absolute Rules]
- 당신(AI)은 위 [World_NPC_List] 중 현재 사용자의 말에 응답할 최적의 캐릭터들을 선정하여 대화하십시오.
- 대화 입력마다 여러 NPC들이 자율적으로 대화와 상호작용 지문(*...*)을 통해 살아숨쉬듯 번갈아 발화할 수 있습니다. 
- 대사는 큰따옴표(" ")에, 행동과 물리적 sceneries 변화는 별표(* *)에 엄격하게 가두어 한글로 아름답게 연출하십시오.
`;

    // 2. Compose unique script-styled theatrical greeting message combining NPC words
    let compiledFirstGreeting = `*감미로운 파스텔빛 노을이 옅게 흩날리는 평화로운 세계가 펼쳐집니다. 이 포근한 ${세계관설정Name}에서 당신(${주인공설정Name || '플레이어'})은 따스하게 불어오는 미풍과 함께 조용히 눈을 뜹니다.*`;
    if (introIdea.trim()) {
      compiledFirstGreeting = introIdea.trim();
    }

    const newChar: DBCharacter = {
      id: editCharacter?.id || `custom-world-${Date.now()}`,
      creator_id: 'user',
      name: 세계관설정Name,
      description: 세계관설정Description,
      system_prompt: wPlusPrompt,
      greeting_message: compiledFirstGreeting,
      is_public: sharingLevel === 'public',
      created_at: editCharacter?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      sharing_level: sharingLevel,
      allow_remix: allowRemix,
      original_creator_name: '사용자',
      remix_count: editCharacter?.remix_count || 0,
      likes: editCharacter?.likes || 0,
      views: editCharacter?.views || 0,
      metadata: {
        세계관설정Name,
        세계관설정Description,
        세계관설정Scenario,
        sharingLevel,
        allowRemix,
        introIdea,
        주인공설정Name,
        주인공설정Persona,
        인물목록,
        인물관계hips: 인물관계hips.filter(rel => {
          const npcFromExists = rel.from === '주인공설정' || 인물목록.some(n => n.id === rel.from);
          const npcToExists = rel.to === '주인공설정' || 인물목록.some(n => n.id === rel.to);
          return npcFromExists && npcToExists;
        }),
        globalLorebooks
      }
    };

    // Find deleted NPCs comparing with editCharacter (if any) to prevent traces from remaining in dynamic story memory
    const deletedNpcNames: string[] = [];
    if (editCharacter && editCharacter.metadata && editCharacter.metadata.인물목록) {
      const oldNpcs = editCharacter.metadata.인물목록;
      oldNpcs.forEach((oldNpc: any) => {
        const stillExists = 인물목록.some(n => n.id === oldNpc.id);
        if (!stillExists && oldNpc.name.trim()) {
          deletedNpcNames.push(oldNpc.name.trim());
        }
      });
    }

    // Find deleted lorebooks comparing with editCharacter (if any) to prevent traces from remaining in dynamic story memory
    const deletedLoreWords: string[] = [];
    if (editCharacter && editCharacter.metadata && editCharacter.metadata.globalLorebooks) {
      const oldLores = editCharacter.metadata.globalLorebooks;
      oldLores.forEach((oldLore: any) => {
        const stillExists = globalLorebooks.some(l => l.id === oldLore.id);
        if (!stillExists) {
          if (oldLore.title.trim()) deletedLoreWords.push(oldLore.title.trim());
          if (oldLore.keywords.trim()) {
            oldLore.keywords.split(',').forEach((kw: string) => {
              const kwTrimmed = kw.trim();
              if (kwTrimmed && !deletedLoreWords.includes(kwTrimmed)) {
                deletedLoreWords.push(kwTrimmed);
              }
            });
          }
        }
      });
    }

    // Store custom portrait in local storage meta using the first NPC's beauty portrait or spark
    const featuredPortrait = 인물목록.find(n => n.profileImage)?.profileImage || 인물목록[0]?.profileImage;
    if (featuredPortrait) {
      localStorage.setItem(`portrait-${newChar.id}`, featuredPortrait);
    }

    // Save custom 로어북설정 explicitly for search/retrieval reference representing World elements
    const compiledWorldLorebook = [
      { name: '세계관 배경 시나리오', description: 세계관설정Scenario },
      ...인물목록.map(n => ({
        name: n.name,
        description: `[인물 수첩] 역할: ${n.role}. 설정: ${n.location_scenario}. 대화 예시: ${n.dialogue_examples}.`
      })),
      { name: '로어북 (세계관 설정 지식)', description: globalLorebooks.length > 0 ? globalLorebooks.map(l => `설정명: ${l.title}\n키워드: [${l.keywords}]\n내용: ${l.content}`).join('\n\n') : '설정 없음'}
    ];
    localStorage.setItem(`lore-${newChar.id}`, JSON.stringify(compiledWorldLorebook));

    // Sanitization of active chatsession and BUCKET_B, C, E due to deleted entities
    if (deletedNpcNames.length > 0 || deletedLoreWords.length > 0) {
      const sessionKey = `chatsession-${newChar.id}`;
      const savedSession = localStorage.getItem(sessionKey);
      if (savedSession) {
        try {
          const session = JSON.parse(savedSession);
          if (session) {
            let dirty = false;
            
            // Clean history (messages) that mention or relate to deleted characters/lore
            if (session.messages && Array.isArray(session.messages)) {
              const originalLength = session.messages.length;
              session.messages = session.messages.filter((msg: any) => {
                const mentionsDeletedNpc = deletedNpcNames.some(name => msg.text.includes(name));
                const mentionsDeletedLore = deletedLoreWords.some(word => msg.text.includes(word));
                const speakerIsDeletedNpc = msg.speakerName && deletedNpcNames.includes(msg.speakerName);
                return !mentionsDeletedNpc && !mentionsDeletedLore && !speakerIsDeletedNpc;
              });
              if (session.messages.length !== originalLength) {
                dirty = true;
              }
            }

            // Clean plotSummary to make sure no bleed of deleted items affects subsequent responses
            if (session.plotSummary && typeof session.plotSummary === 'string') {
              const originalSummary = session.plotSummary;
              const sentences = session.plotSummary.split(/[.!?\n]/).map((s: string) => s.trim()).filter(Boolean);
              const cleanSentences = sentences.filter((s: string) => {
                const mentionsDeletedNpc = deletedNpcNames.some(name => s.includes(name));
                const mentionsDeletedLore = deletedLoreWords.some(word => s.includes(word));
                return !mentionsDeletedNpc && !mentionsDeletedLore;
              });
              session.plotSummary = cleanSentences.join('. ');
              if (session.plotSummary !== originalSummary) {
                dirty = true;
              }
            }

            // Clean narrativeState
            if (session.narrativeState && typeof session.narrativeState === 'string') {
              const mentionsDeletedNpc = deletedNpcNames.some(name => session.narrativeState.includes(name));
              const mentionsDeletedLore = deletedLoreWords.some(word => session.narrativeState.includes(word));
              if (mentionsDeletedNpc || mentionsDeletedLore) {
                session.narrativeState = '이전 설정 내용이 정리된 후 새 흐름으로 조율 중';
                dirty = true;
              }
            }

            if (dirty) {
              localStorage.setItem(sessionKey, JSON.stringify(session));
            }
          }
        } catch (err) {
          console.error("Sanitizer fail for chat session", err);
        }
      }

      // Clean BUCKET_C: Anchor events (memories)
      const bucketCKey = `bucket-${newChar.id}-C`;
      const savedC = localStorage.getItem(bucketCKey);
      if (savedC) {
        try {
          const events = JSON.parse(savedC);
          if (Array.isArray(events)) {
            const cleanEvents = events.filter((evt: string) => {
              const mentionsDeletedNpc = deletedNpcNames.some(name => evt.includes(name));
              const mentionsDeletedLore = deletedLoreWords.some(word => evt.includes(word));
              return !mentionsDeletedNpc && !mentionsDeletedLore;
            });
            if (cleanEvents.length !== events.length) {
              localStorage.setItem(bucketCKey, JSON.stringify(cleanEvents));
            }
          }
        } catch (e) {
          console.error(e);
        }
      }

      // Clean BUCKET_E: World variables
      const bucketEKey = `bucket-${newChar.id}-E`;
      const savedE = localStorage.getItem(bucketEKey);
      if (savedE) {
        try {
          const variables = JSON.parse(savedE);
          if (Array.isArray(variables)) {
            const cleanVariables = variables.filter((v: string) => {
              const mentionsDeletedNpc = deletedNpcNames.some(name => v.includes(name));
              const mentionsDeletedLore = deletedLoreWords.some(word => v.includes(word));
              return !mentionsDeletedNpc && !mentionsDeletedLore;
            });
            if (cleanVariables.length !== variables.length) {
              localStorage.setItem(bucketEKey, JSON.stringify(cleanVariables));
            }
          }
        } catch (e) {
          console.error(e);
        }
      }

      // Clean BUCKET_B: psychological state / inner feeling
      const bucketBKey = `bucket-${newChar.id}-B`;
      const savedB = localStorage.getItem(bucketBKey);
      if (savedB) {
        try {
          const bData = JSON.parse(savedB);
          if (bData && bData.innerFeeling) {
            const mentionsDeletedNpc = deletedNpcNames.some(name => bData.innerFeeling.includes(name));
            const mentionsDeletedLore = deletedLoreWords.some(word => bData.innerFeeling.includes(word));
            if (mentionsDeletedNpc || mentionsDeletedLore) {
              bData.innerFeeling = "설정이 정리된 직후의 고요한 심경";
              localStorage.setItem(bucketBKey, JSON.stringify(bData));
            }
          }
        } catch (e) {
          console.error(e);
        }
      }
    }

    setTimeout(() => {
      onSave(newChar);
      setIsSaving(false);
    }, 1200);
  };

  const selectedNpc = 인물목록.find(n => n.id === selectedNpcId) || 인물목록[0] || null;

  return (
    <div className="flex-1 w-full max-w-[1100px] mx-auto p-4 md:p-6 overflow-y-auto bg-white h-full flex flex-col">
      
      {/* 1. Upper Navigation & Title (깔끔하고 시원한 툴바 스타일) */}
      <div key="creator-header" className="flex items-center justify-between gap-4 mb-6 shrink-0 pb-4 border-b border-[#ECE9E0]">
        <div className="flex items-center gap-3">
          <button 
            id="back-list-btn"
            type="button"
            onClick={onBack}
            className="p-2 hover:bg-[#ECE9E0] rounded-lg transition-colors text-[#75757C] cursor-pointer"
            title="뒤로 가기"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-base font-bold text-[#0F172A] tracking-tight">
              새 스토리 작성
            </h1>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            id="ai-full-gen-btn"
            type="button"
            onClick={handleGenerateFullScenario}
            disabled={isGeneratingFull}
            className="bg-[#ECEEFE] text-[#4F46E5] hover:bg-[#DFE1FD] border border-[#D2D6FC] font-bold text-xs py-2 px-4 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-70"
          >
            {isGeneratingFull ? (
              <RefreshCw size={14} className="animate-spin text-[#4F46E5]" />
            ) : (
              <Wand2 size={14} className="text-[#4F46E5]" />
            )}
            {isGeneratingFull ? 'AI 전체 작성 중...' : '전체 시나리오 AI 생성'}
          </button>

          <button
            id="compile-세계관설정-btn"
            type="button"
            onClick={handleSubmit}
            disabled={isSaving}
            className="bg-[#ECFDF5] hover:bg-[#D1FAE5] text-[#047857] border border-[#A7F3D0] font-bold text-xs py-2 px-5 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-70"
          >
            {isSaving ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />} 
            {isSaving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>

      {aiFeedbackMessage && (
        <div className={`p-4 mb-4 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-sm shrink-0 border ${
          aiFeedbackMessage.startsWith('❌') 
            ? 'bg-[#FEE2E2] text-[#EF4444] border-[#FECACA]' 
            : 'bg-[#ECFDF5] text-[#10B981] border-[#A7F3D0]'
        }`}>
          <span>{aiFeedbackMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 items-start min-h-0 overflow-y-auto">
        
        {/* Left Input Section */}
        <div key="main-editor-column" className={`${activeTab === '인물목록' ? 'lg:col-span-8' : 'lg:col-span-12'} space-y-6`}>
          
          {/* Core Configuration Tabs Panel */}
          <div className="bg-white border border-[#EBE6DB] rounded-2xl shadow-sm overflow-hidden flex flex-col">
            
            {/* Tab Selectors */}
            <div className="flex border-b border-[#ECE9E0] bg-[#FAF9F5] overflow-x-auto shrink-0">
              {[
                { id: '세계관설정', label: '1. 배경 설정', icon: <BookOpen size={12} />, color: 'border-gray-900 text-[#0F172A]' },
                { id: '주인공설정', label: '2. 나의 캐릭터', icon: <User size={12} />, color: 'border-gray-900 text-[#0F172A]' },
                { id: '인물목록', label: '3. 등장 인물', icon: <Users size={12} />, color: 'border-gray-900 text-[#0F172A]' },
                { id: '인물관계', label: '4. 인물 관계망', icon: <Link size={12} />, color: 'border-gray-900 text-[#0F172A]' },
                { id: '로어북설정', label: '5. 로어북', icon: <BookOpen size={12} />, color: 'border-gray-900 text-[#0F172A]' }
              ].map((tab) => (
                <button
                  id={`tab-btn-${tab.id}`}
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-5 py-3 text-xs font-bold transition-all border-b-2 whitespace-nowrap cursor-pointer ${
                    activeTab === tab.id
                      ? `${tab.color} bg-white`
                      : 'border-transparent text-[#0F172A] hover:text-[#5A5A61] hover:bg-[#ECE9E0]'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Contents Frame */}
            <div className="p-6 min-h-[380px]">
              <AnimatePresence mode="wait">
                
                {/* 1. World Settings Tab */}
                {activeTab === '세계관설정' && (
                  <motion.div
                    key="tab-세계관설정"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="space-y-4"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="block text-[11px] font-bold text-[#9A9A9E] uppercase tracking-wide">세계관 이름 (World Name) *</label>
                          {renderAutofillButton('세계관설정Name')}
                        </div>
                        <AutoResizeTextarea id="세계관설정-name-field" value={세계관설정Name} onChange={(e) => setWorldName(e.target.value)} placeholder="💡 예시: 이곳은 어떤 이름의 무대인가요? (예: 파스텔 동화 마을)" className={"resize-none py-3 min-h-[44px] " + "w-full bg-white border border-[#EBE6DB] rounded-xl px-4 py-2.5 text-xs text-[#0F172A] font-semibold focus:ring-1 focus:ring-gray-300 focus:outline-none placeholder:text-gray-400"} />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="block text-[11px] font-bold text-[#9A9A9E] uppercase tracking-wide">세계관 핵심 요약 (Theme SLG)</label>
                          {renderAutofillButton('세계관설정Description')}
                        </div>
                        <AutoResizeTextarea id="세계관설정-desc-field" value={세계관설정Description} onChange={(e) => setWorldDescription(e.target.value)} placeholder="💡 예시: 소설의 분위기를 한 줄로 설명해 주세요. (예: 아늑한 찻집에서 치유받는 일상)" className={"resize-none py-3 min-h-[44px] " + "w-full bg-white border border-[#EBE6DB] rounded-xl px-4 py-2.5 text-xs text-[#0F172A] font-semibold focus:ring-1 focus:ring-gray-300 focus:outline-none placeholder:text-gray-400"} />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-[11px] font-bold text-[#9A9A9E] uppercase tracking-wide">기존 전설 및 세부 공간 시나리오 (World Scenario)</label>
                        {renderAutofillButton('세계관설정Scenario')}
                      </div>
                      <AutoResizeTextarea
                        id="세계관설정-scenario-field"
                        value={세계관설정Scenario}
                        onChange={(e) => setWorldScenario(e.target.value)}
                        placeholder={`💡 설명: NPC들과 플레이어가 물리적으로 발 딛고 대치하게 될 장소 공간과 시각적 분위기의 디테일을 묘사하세요.\n\n예시: 백 년간 버려진 도서관 지붕 위로 파스텔 분홍빛 밤비가 보슬보슬 내리는 평온한 시간 수풀 속.`}
                        className="w-full bg-white border border-[#EBE6DB] rounded-xl p-4 text-xs text-[#0F172A] font-semibold outline-none focus:ring-1 focus:ring-gray-300 h-36 resize-none leading-relaxed placeholder:text-gray-400"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-[11px] font-bold text-[#0F172A] uppercase tracking-wide">시작 스토리 인트로 아이디어 (결정적 순간)</label>
                        {renderAutofillButton('introIdea')}
                      </div>
                      <AutoResizeTextarea
                        id="세계관설정-intro-idea-field"
                        value={introIdea}
                        onChange={(e) => setIntroIdea(e.target.value)}
                        placeholder={`💡 설명: 여기에 적은 짧은 아이디어를 바탕으로 이야기가 시작될 때 AI가 실감나는 도입부(프롤로그)를 자동으로 작성해 줍니다.\n\n예시: 오늘 밤 잠을 자다가 갑자기 벼락에 맞고 이세계로 떨어졌다.`}
                        className="w-full bg-white border border-[#EBE6DB] rounded-xl p-4 text-xs text-[#0F172A] font-semibold outline-none focus:ring-1 focus:ring-gray-300 resize-none leading-relaxed placeholder:text-gray-400"
                      />
                    </div>
                  </motion.div>
                )}

                {/* 2. My Persona settings (Playable Character) */}
                {activeTab === '주인공설정' && (
                  <motion.div
                    key="tab-주인공설정"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="space-y-4"
                  >
                    <div className="bg-[#FAF9F5] border border-[#EBE6DB] p-4 rounded-xl flex items-center gap-3">
                      <User className="text-[#0F172A] shrink-0" size={18} />
                      <div className="text-[10px] text-[#0F172A] font-bold">
                        [나의 설정] 가상 세계에 직접 참여하여 등장인물들과 자유롭게 상호작용할 나의 고유한 정체성과 배경 성향입니다.
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-[11px] font-bold text-[#9A9A9E] uppercase tracking-wide">나의 이름 / 아바타 명칭 *</label>
                        {renderAutofillButton('주인공설정Name')}
                      </div>
                      <AutoResizeTextarea id="주인공설정-name-field" value={주인공설정Name} onChange={(e) => setPlayerName(e.target.value)} placeholder="💡 예시: 소설 속 주인공이 될 나의 이름을 정해 주세요. (예: 루나, 여행자)" className={"resize-none py-3 min-h-[44px] " + "w-full bg-white border border-[#EBE6DB] rounded-xl px-4 py-2.5 text-xs text-[#0F172A] font-semibold focus:ring-1 focus:ring-gray-300 focus:outline-none placeholder:text-gray-400"} />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-[11px] font-bold text-[#9A9A9E] mb-1.5 uppercase tracking-wide">나의 인격/성향/외모 및 이 세계로 오게 된 사연 (My Persona Details)</label>
                        {renderAutofillButton('주인공설정Persona')}
                      </div>
                      <AutoResizeTextarea
                        id="주인공설정-persona-field"
                        value={주인공설정Persona}
                        onChange={(e) => setPlayerPersona(e.target.value)}
                        placeholder={`💡 설명: NPC들이 플레이어의 신분, 장비, 과거 전사를 바탕으로 입체적인 대화 피드백을 제공합니다.\n\n예시: 우연히 조용하고 작고 외딴 숲속 오두막에 살게 된 비밀수련생. 다정하지만 속마음을 잘 드러내지 않습니다.`}
                        className="w-full bg-white border border-[#EBE6DB] rounded-xl p-4 text-xs text-[#0F172A] font-semibold outline-none focus:ring-1 focus:ring-gray-300 h-40 resize-none leading-relaxed placeholder:text-gray-400"
                      />
                    </div>
                  </motion.div>
                )}

                {/* 3. NPCs editor list */}
                {activeTab === '인물목록' && (
                  <motion.div
                    key="tab-인물목록"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="space-y-4"
                  >
                    <div className="flex justify-between items-center bg-[#FAF9F5] border border-[#EBE6DB] p-3 rounded-xl">
                      <span className="text-[10px] text-[#0F172A] font-bold flex items-center gap-1">
                        <Users size={12} /> 함께하는 등장인물 인물 수첩 ({인물목록.length}명 대기, 최대 5명)
                      </span>
                      {인물목록.length < 5 ? (
                        <button
                          id="add-npc-btn"
                          type="button"
                          onClick={handleAddNpc}
                          className="bg-[#F3E8FF] hover:bg-[#E9D5FF] text-[#6B21A8] border border-[#D8B4FE] font-bold text-[9px] py-1.5 px-3.5 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <Plus size={10} /> 인물 추가
                        </button>
                      ) : (
                        <span className="text-[9px] text-[#9A9A9E] font-bold bg-white border border-[#EBE6DB] px-2.5 py-1.5 rounded-lg">
                          최대 5명 제한 도달
                        </span>
                      )}
                    </div>

                    {인물목록.length === 0 ? (
                      <div className="text-center py-12 bg-[#FAF9F5] border border-dashed border-[#EBE6DB] rounded-2xl p-6 space-y-3">
                        <div className="w-12 h-12 bg-white border border-[#EBE6DB] rounded-full mx-auto flex items-center justify-center text-[#0F172A]">
                          <Users size={20} />
                        </div>
                        <h4 className="text-xs font-bold text-[#0F172A]">등록된 인물이 존재하지 않습니다.</h4>
                        <p className="text-[10px] text-[#9A9A9E] leading-relaxed max-w-[420px] mx-auto">
                          세계를 완벽하게 연출하기 위해서는 최소 한 명 이상의 인물 설정이 필요합니다.<br />
                          우측 상단 [인물 추가] 버튼을 눌러보세요.
                        </p>
                        <button
                          id="first-npc-add-btn"
                          type="button"
                          onClick={handleAddNpc}
                          className="bg-white hover:bg-[#FAF9F5] text-[#0F172A] border border-[#EBE6DB] font-bold text-[10px] py-2 px-5 rounded-lg transition-colors inline-flex items-center gap-1 cursor-pointer mt-1"
                        >
                          <Plus size={11} /> 첫 번째 만남 인물 수동 추가
                        </button>
                      </div>
                    ) : (
                      <>
                        {/* NPC selector chips */}
                        <div className="flex gap-2 overflow-x-auto pb-2 border-b border-[#ECE9E0]">
                          {인물목록.map((npc, idx) => {
                            const isSelected = selectedNpc && selectedNpc.id === npc.id;
                            return (
                              <button
                                id={`npc-chip-${npc.id}`}
                                key={npc.id}
                                type="button"
                                onClick={() => {
                                  setSelectedNpcId(npc.id);
                                }}
                                className={`px-3 py-2 text-xs font-bold rounded-xl border transition-colors flex items-center gap-1.5 cursor-pointer ${
                                  isSelected
                                    ? 'bg-[#EBF8FF] text-[#2B6CB0] border-[#90CDF4]'
                                    : 'bg-white text-[#9A9A9E] border-[#EBE6DB] hover:bg-[#FAF9F5]'
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-[#2B6CB0]' : 'bg-gray-300'}`}></span>
                                {npc.name.trim() || `새 인물 #${idx + 1}`}
                                {인물목록.length > 1 && (
                                  <span 
                                    onClick={(e) => handleRemoveNpc(npc.id, e)}
                                    className="ml-1 p-0.5 rounded-md hover:bg-red-500 hover:text-white font-sans transition-colors"
                                    title="삭제"
                                  >
                                    ×
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>

                        {selectedNpc && (
                          <div className="space-y-4 pt-2 text-left">
                            {/* Inner Sub tabs for Selected NPC, matching screenshot */}
                            <div className="flex border-b border-[#ECE9E0] bg-[#FAF9F5] rounded-t-xl p-1 gap-1">
                              {[
                                { id: 'basic', label: '① 캐릭터 설정' },
                                { id: 'fewShot', label: '② 대화 예시 (Few-shot)' }
                              ].map((subtab) => (
                                <button
                                  id={`subtab-${subtab.id}-${selectedNpc.id}`}
                                  key={subtab.id}
                                  type="button"
                                  onClick={() => setNpcActiveSubTab(subtab.id as any)}
                                  className={`px-4 py-2 text-[11px] font-bold tracking-wide rounded-lg transition-colors cursor-pointer ${
                                    npcActiveSubTab === subtab.id
                                      ? 'bg-white border border-[#EBE6DB] text-[#0F172A] shadow-sm'
                                      : 'text-[#9A9A9E] hover:text-[#0F172A] hover:bg-[#ECE9E0]'
                                  }`}
                                >
                                  {subtab.label}
                                </button>
                              ))}
                            </div>

                            {/* Inner Sub tab content card */}
                            <div className="bg-white border border-[#EBE6DB] rounded-b-xl p-5 space-y-4">
                              <AnimatePresence mode="wait">
                                
                                {/* A. 기본 설명 */}
                                {npcActiveSubTab === 'basic' && (
                                  <motion.div
                                    key="sub-basic"
                                    initial={{ opacity: 0, y: 2 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -2 }}
                                    className="space-y-4 text-left"
                                  >
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      <div>
                                        <div className="flex items-center justify-between mb-1">
                                          <label className="block text-[11px] font-bold text-[#9A9A9E]">이름 (Name) *</label>
                                          {renderAutofillButton('npcName', selectedNpc.id)}
                                        </div>
                                        <input
                                          id={`npc-name-${selectedNpc.id}`}
                                          type="text"
                                          value={selectedNpc.name}
                                          onChange={(e) => handleUpdateNpc(selectedNpc.id, 'name', e.target.value)}
                                          placeholder="💡 설명: 인물의 이름을 입력하세요. (예: 아리스, 제니아)"
                                          className="w-full bg-white border border-[#EBE6DB] focus:border-gray-400 rounded-xl px-3.5 py-2 text-xs text-[#0F172A] font-semibold focus:outline-none focus:ring-1 focus:ring-gray-300 placeholder:text-gray-400"
                                        />
                                      </div>
                                      <div>
                                        <div className="flex items-center justify-between mb-1">
                                          <label className="block text-[11px] font-bold text-[#9A9A9E]">한 줄 설명 (Short Bio)</label>
                                          {renderAutofillButton('npcRole', selectedNpc.id)}
                                        </div>
                                        <input
                                          id={`npc-role-${selectedNpc.id}`}
                                          type="text"
                                          value={selectedNpc.role}
                                          onChange={(e) => handleUpdateNpc(selectedNpc.id, 'role', e.target.value)}
                                          placeholder="💡 설명: 인물의 역할이나 직업을 적어주세요. (예: 숲의 정령, 비밀 기사)"
                                          className="w-full bg-white border border-[#EBE6DB] focus:border-gray-400 rounded-xl px-3.5 py-2 text-xs text-[#0F172A] font-semibold focus:outline-none focus:ring-1 focus:ring-gray-300 placeholder:text-gray-400"
                                        />
                                      </div>
                                    </div>

                                    <div>
                                      <div className="flex items-center justify-between mb-1.5">
                                        <label className="block text-[11px] font-bold text-[#9A9A9E] font-sans">상대 캐릭터 설정 (Character Description)</label>
                                        {renderAutofillButton('npcDescription', selectedNpc.id)}
                                      </div>
                                      <AutoResizeTextarea
                                        id={`npc-bg-scene-${selectedNpc.id}`}
                                        value={selectedNpc.location_scenario || ''}
                                        onChange={(e) => handleUpdateNpc(selectedNpc.id, 'location_scenario', e.target.value)}
                                        placeholder={`💡 설명: 이 캐릭터의 주요 특징이나 전반적인 설정 묘사를 자유롭게 적어주세요.\n\n예시: 비밀을 가득 품고 있는 수수께끼의 소녀. 어딘가 차가워 보이지만 속은 따뜻하다.`}
                                        className="w-full bg-white border border-[#EBE6DB] focus:border-gray-400 rounded-xl p-3.5 text-xs text-[#0F172A] font-semibold outline-none focus:ring-1 focus:ring-gray-300 resize-none leading-relaxed placeholder:text-gray-400"
                                      />
                                    </div>

                                    {/* Portrait Generator */}
                                    <div className="grid grid-cols-1 gap-4 pt-4 border-t border-[#ECE9E0] items-start">
                                      <div>
                                        <div className="flex items-center justify-between mb-1.5 font-sans">
                                          <label className="block text-[11px] font-bold text-[#9A9A9E] font-sans">묘사 프롬프트 (초상화용)</label>
                                          <div className="flex gap-1.5 font-sans">
                                            <button
                                              type="button"
                                              disabled={translatingNpcId === selectedNpc.id}
                                              onClick={() => translateNpcPrompt(selectedNpc.id, selectedNpc.imagePrompt)}
                                              className="bg-[#FAF9F5] hover:bg-[#ECE9E0] text-[#0F172A] font-bold text-[9px] px-3 py-1.5 rounded-lg transition-colors border border-[#EBE6DB] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                            >
                                              {translatingNpcId === selectedNpc.id ? (
                                                <RefreshCw size={10} className="animate-spin text-[#0F172A]" />
                                              ) : (
                                                <span>🇰🇷➡️🇺🇸 번역</span>
                                              )}
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleRenderNpcImage(selectedNpc.id)}
                                              className="bg-[#FFF5F5] hover:bg-[#FED7D7] text-[#C53030] border border-[#FEB2B2] font-bold text-[9px] px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow-sm"
                                            >
                                              🎨 초상화 생성
                                            </button>
                                          </div>
                                        </div>
                                        <input
                                          id={`npc-prompt-${selectedNpc.id}`}
                                          type="text"
                                          value={selectedNpc.imagePrompt}
                                          onChange={(e) => handleUpdateNpc(selectedNpc.id, 'imagePrompt', e.target.value)}
                                          placeholder="예: 분홍색 트윈테일을 한 귀여운 마법사 소녀, 아늑한 도서관 속, 파스텔 톤"
                                          className="w-full bg-white border border-[#EBE6DB] focus:border-gray-400 rounded-xl px-3.5 py-2 text-xs text-[#0F172A] font-semibold focus:outline-none focus:ring-1 focus:ring-gray-300 placeholder:text-[#0F172A]"
                                        />
                                      </div>
                                    </div>
                                  </motion.div>
                                )}

                                {/* C. 대화 예시 (Few-shot) */}
                                {npcActiveSubTab === 'fewShot' && (
                                  <motion.div
                                    key="sub-fewshot"
                                    initial={{ opacity: 0, y: 2 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -2 }}
                                    className="space-y-3 text-left"
                                  >
                                    <div>
                                      <div className="flex items-center justify-between mb-1.5 font-sans">
                                        <label className="block text-[11px] font-bold text-[#9A9A9E] mb-0.5 font-sans">상대방 대화 예시 (Few-shot Examples)</label>
                                        {renderAutofillButton('npcDialogue', selectedNpc.id)}
                                      </div>
                                      <AutoResizeTextarea
                                        value={selectedNpc.dialogue_examples || ''}
                                        onChange={(e) => handleUpdateNpc(selectedNpc.id, 'dialogue_examples', e.target.value)}
                                        placeholder={`💡 설명: 상대방이 질문하거나 상황을 건넸을 때, 이 인물이 대답할 목소리와 톤앤매너의 정형화된 견본 세트입니다.\n\n예시:\n<유저>: 안녕, 오늘은 무슨 책을 읽고 있어?\n<상대방>: *들려오던 책장을 멈추고 쌀쌀맞게 힐끗 쳐다보며* "특별히 당신에게 들려줄 이야기는 없어요."`}
                                        className="w-full bg-white border border-[#EBE6DB] focus:border-gray-400 rounded-xl p-4 text-xs text-[#0F172A] font-mono h-56 outline-none focus:ring-1 focus:ring-gray-300 resize-none leading-relaxed placeholder:text-gray-400"
                                      />
                                    </div>
                                  </motion.div>
                                )}
                                
                              </AnimatePresence>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </motion.div>
                )}

                {/* 4. Relationship Map Tab */}
                {activeTab === '인물관계' && (
                  <motion.div
                    key="tab-인물관계"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="space-y-5"
                  >
                    {/* Header info */}
                    <div className="bg-[#FAF9F5] border border-[#EBE6DB] p-5 rounded-2xl text-left space-y-2">
                      <div className="flex items-center gap-1.5 text-xs text-[#5A5A61] font-black">
                        <Link size={13} className="text-[#9A9A9E]" /> 
                        <span>등장인물 간 관계 설계</span>
                        <span className="text-[9px] bg-[#EBE6DB] text-[#5A5A61] px-2.5 py-0.5 rounded-full font-bold">
                          현재 설정된 관계: {인물관계hips.length}개
                        </span>
                      </div>
                      <p className="text-[10.5px] text-[#75757C] leading-relaxed font-semibold">
                        주안점이 되는 등장인물(From)과 인연 대상(To)을 지정하여 그들 간의 독특한 관계를 편리하게 조율하십시오.
                        조합을 자동으로 전부 채울 필요 없이, 이야기 전개에 중요한 핵심 핵심 인물 간의 관계만 자유롭게 추가해 나가면 됩니다.
                      </p>
                    </div>

                    {/* Add relation button */}
                    <div className="flex justify-between items-center bg-white p-3.5 rounded-xl border border-[#EBE6DB]">
                      <span className="text-[10.5px] text-[#9A9A9E] font-bold ml-1">나 또는 다양한 등장인물들 간의 인연을 정의하세요.</span>
                      <button
                        type="button"
                        onClick={handleAddRelationship}
                        className="bg-[#8E8E9B] hover:bg-[#727280] text-white font-black text-[10px] py-1.5 px-3.5 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <Plus size={11} /> 인물 간 인연 추가 (주체/대상)
                      </button>
                    </div>


                        {(() => {
                          const characterOptions = [
                            { id: '주인공설정', name: `나 (${주인공설정Name.trim() || '플레이어'})` },
                            ...인물목록.map((n, idx) => ({
                              id: n.id,
                              name: n.name.trim() || `인물 ${idx + 1}`
                            }))
                          ];
                          
                          const filteredRelations = 인물관계hips.filter(rel => 
                            relationFilterCharId === 'all' || 
                            rel.from === relationFilterCharId || 
                            rel.to === relationFilterCharId
                          );

                          return (
                            <div className="space-y-4 max-h-[550px] overflow-y-auto pr-1">
                              <div className="flex justify-start items-center gap-2 mb-2 bg-[#FAF9F5] p-2.5 rounded-xl border border-[#EBE6DB]">
                                <span className="text-[10px] font-bold text-[#75757C] flex items-center gap-1.5"><Link size={12} /> 인물별로 모아보기:</span>
                                <select
                                  value={relationFilterCharId}
                                  onChange={(e) => setRelationFilterCharId(e.target.value)}
                                  className="bg-white border border-[#EBE6DB] rounded-lg px-2 py-1 text-[10px] font-semibold text-[#4C4C54] outline-none focus:border-[#9A9A9E] transition-all cursor-pointer"
                                >
                                  <option value="all">전체 인연 보기</option>
                                  {characterOptions.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                  ))}
                                </select>
                              </div>

                              {filteredRelations.length === 0 ? (
                                <div className="text-center py-6 text-xs text-[#9A9A9E] font-bold">
                                  해당 인물에 대한 관계가 없습니다.
                                </div>
                              ) : (
                                filteredRelations.map((rel, index) => {
                                  const relationPresets = [
                                    { name: "💗 우정 & 동료", type: "우호 동료", desc: "서로의 등 뒤를 전적으로 신뢰하고 지탱하며, 위기가 올 때 가장 먼저 도움을 건네는 따뜻한 동반자입니다." },
                                    { name: "💖 애정 & 호감", type: "은밀한 호감", desc: "시선이 닿으면 얼굴을 붉히고 조심스레 챙겨주려 하며, 겉으로는 틱틱대도 내면에 그윽한 마음을 품고 있습니다." },
                                    { name: "⚔️ 라이벌", type: "경쟁 상대", desc: "서로 다른 가치관으로 투닥거리며 경쟁하지만, 타인이 상대방을 무시하는 것은 용납하지 않는 라이벌 관계입니다." },
                                    { name: "🤝 비밀 동맹", type: "비밀 계약/동맹", desc: "둘만의 남모를 비밀이나 아련한 과거사를 공유하고 있으며, 결정적인 순간에 완벽하게 동조합니다." },
                                    { name: "🛡️ 수호자", type: "수호자", desc: "평소 가깝게 지내지 않아도 위기가 오면 목숨 바쳐 은밀히 보호하고 지켜내는 믿음의 연결고리입니다." }
                                  ];

                                  const isExpanded = expandedPairs[rel.id];
                                  const toggleExpand = () => setExpandedPairs(prev => ({ ...prev, [rel.id]: !prev[rel.id] }));
                                  
                                  const nameFrom = getCharacterNameById(rel.from);
                                  const nameTo = getCharacterNameById(rel.to);

                                  return (
                                    <div 
                                      key={rel.id} 
                                      className="bg-white p-3 md:p-4 rounded-xl border border-[#EBE6DB] text-left flex flex-col gap-3 relative transition-all hover:border-[#DFDBCF]"
                                    >
                                      {/* Header row (Summary) */}
                                      <div className="flex justify-between items-center w-full cursor-pointer" onClick={toggleExpand}>
                                        <div className="flex items-center gap-3 flex-1 overflow-hidden">
                                          <div className="text-[10.5px] font-bold text-[#0F172A] truncate max-w-[100px] text-right">{nameFrom}</div>
                                          <div className="flex-1 flex flex-col justify-center items-center gap-1 shrink-0 px-2 min-w-[80px]">
                                              <span className="text-[9px] font-black bg-[#ECE9E0] text-[#75757C] px-2 py-0.5 rounded-full border border-[#EBE6DB] whitespace-nowrap">
                                                {rel.type ? rel.type : '관계 미지정'}
                                              </span>
                                              <div className="w-full h-px border-t border-dashed border-[#DFDBCF]"></div>
                                          </div>
                                          <div className="text-[10.5px] font-bold text-[#0F172A] truncate max-w-[100px]">{nameTo}</div>
                                        </div>
                                        
                                        <div className="flex items-center gap-1.5 ml-3 pl-3 border-l border-[#ECE9E0]">
                                          <button
                                            type="button"
                                            className="text-[#9A9A9E] hover:text-[#0F172A] bg-[#FAF9F5] p-1.5 rounded-md border border-[#EBE6DB] transition-colors"
                                          >
                                            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); handleRemoveRelationship(rel.id); }}
                                            className="text-[#9A9A9E] hover:text-red-500 bg-[#FAF9F5] p-1.5 rounded-md border border-[#EBE6DB] transition-colors"
                                            title="이 관계 삭제"
                                          >
                                            <Trash2 size={12} />
                                          </button>
                                        </div>
                                      </div>

                                      {/* Expanded Body */}
                                      {isExpanded && (
                                        <div className="pt-3 border-t border-[#FAF9F5] mt-1 space-y-3.5" onClick={(e) => e.stopPropagation()}>
                                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-3 border-b border-[#FAF9F5]">
                                            <div className="text-left">
                                              <label className="block text-[9px] font-black text-[#0F172A] tracking-wide mb-1">인물 A (관계 주체)</label>
                                              <select
                                                value={rel.from}
                                                onChange={(e) => handleUpdateRelationship(rel.id, 'from', e.target.value)}
                                                className="w-full bg-[#FFFFFF] border border-[#EBE6DB] rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#4C4C54] outline-none focus:border-[#9A9A9E] transition-all cursor-pointer"
                                              >
                                                {characterOptions.map(c => (
                                                  <option key={c.id} value={c.id}>{c.name}</option>
                                                ))}
                                              </select>
                                            </div>
                                            <div className="text-left">
                                              <label className="block text-[9px] font-black text-[#0F172A] tracking-wide mb-1">인물 B (관계 대상)</label>
                                              <select
                                                value={rel.to}
                                                onChange={(e) => handleUpdateRelationship(rel.id, 'to', e.target.value)}
                                                className="w-full bg-[#FFFFFF] border border-[#EBE6DB] rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#4C4C54] outline-none focus:border-[#9A9A9E] transition-all cursor-pointer"
                                              >
                                                {characterOptions.map(c => (
                                                  <option key={c.id} value={c.id}>{c.name}</option>
                                                ))}
                                              </select>
                                            </div>
                                          </div>

                                          <div className="space-y-1.5 text-left">
                                            <label className="block text-[8px] font-black text-[#0F172A]">⚡ 간편 관계 대입 (클릭 시 자동 반영)</label>
                                            <div className="flex flex-wrap gap-1.5">
                                              {relationPresets.map((preset) => (
                                                <button
                                                  key={preset.name}
                                                  type="button"
                                                  onClick={() => {
                                                    handleUpdateRelationship(rel.id, 'type', preset.type);
                                                    handleUpdateRelationship(rel.id, 'description', preset.desc);
                                                  }}
                                                  className="bg-[#FFFFFF] border border-[#EBE6DB] hover:bg-[#EBE6DB] text-[#5A5A61] font-bold text-[8.5px] px-2.5 py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap"
                                                >
                                                  {preset.name}
                                                </button>
                                              ))}
                                            </div>
                                          </div>

                                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 bg-[#FAF9F5] p-3 rounded-xl border border-[#EBE6DB]">
                                            <div>
                                              <label className="block text-[8.5px] font-black text-[#9A9A9E] mb-1">분류 및 관계 명칭</label>
                                              <AutoResizeTextarea value={rel.type} onChange={(e) => handleUpdateRelationship(rel.id, 'type', e.target.value)} placeholder="예: 든든한 동료" className={"resize-none py-3 min-h-[44px] " + "w-full bg-white border border-[#EBE6DB] focus:border-[#9A9A9E] rounded-lg px-2.5 py-1.5 text-xs text-[#4C4C54] font-bold focus:outline-none"} />
                                            </div>
                                            <div>
                                              <label className="block text-[8.5px] font-black text-[#9A9A9E] mb-1">상세 관계 설명</label>
                                              <AutoResizeTextarea value={rel.description} onChange={(e) => handleUpdateRelationship(rel.id, 'description', e.target.value)} placeholder="예: 서로 오래 아껴두며 믿고 의지하는 오랜 친구입니다." className={"resize-none py-3 min-h-[44px] " + "w-full bg-white border border-[#EBE6DB] focus:border-[#9A9A9E] rounded-lg px-2.5 py-1.5 text-[11px] text-[#5A5A61] focus:outline-none font-semibold leading-relaxed"} />
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          );
                        })()}

                  </motion.div>
                )}   

                {/* 4. Global Lorebook */}
                {activeTab === '로어북설정' && (
                  <motion.div
                    key="tab-로어북설정"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="space-y-4"
                  >
                    <div className="flex justify-between items-center bg-[#FAF9F5] p-3 rounded-xl border border-[#EBE6DB]">
                      <span className="text-[10px] text-[#9A9A9E] font-bold ml-2">세계관 로어북 항목 총 {globalLorebooks.length}/20개</span>
                      <button
                        type="button"
                        onClick={handleAddGlobalLorebook}
                        disabled={globalLorebooks.length >= 20}
                        className="bg-[#0F172A] hover:bg-[#1E293B] text-white font-bold text-[10px] py-1.5 px-3 rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50 cursor-pointer shadow-sm"
                      >
                        <Plus size={10} /> 설정 단어 추가
                      </button>
                    </div>

                    <div className="space-y-3">
                    {globalLorebooks.map((lore, index) => (
                      <div key={lore.id} className="border border-[#EBE6DB] rounded-xl overflow-hidden bg-white text-[#0F172A] shadow-sm">
                        <div
                          onClick={() => handleUpdateGlobalLorebook(lore.id, 'isOpen', !lore.isOpen)}
                          className="w-full bg-[#FAF9F5] hover:bg-[#ECE9E0] px-4 py-3 flex items-center justify-between transition-colors cursor-pointer border-b border-transparent"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-[#0F172A] text-[10px]">{lore.isOpen ? 'ᐱ' : 'ᐯ'}</span>
                            <span className="text-xs font-bold text-[#0F172A] font-sans">항목 {index + 1} - {lore.title || "새 항목"}</span>
                          </div>
                          <div 
                            onClick={(e) => { e.stopPropagation(); handleRemoveGlobalLorebook(lore.id); }}
                            className="p-1.5 hover:bg-red-50 rounded-md transition-colors text-[#0F172A] hover:text-red-500 cursor-pointer"
                          >
                            <Trash2 size={14} />
                          </div>
                        </div>

                        {lore.isOpen && (
                          <div className="p-4 space-y-4 bg-white border-t border-[#ECE9E0]">
                            <div>
                              <label className="block text-[11px] font-bold text-[#0F172A] mb-1.5">설정 단어 (제목)</label>
                              <div className="relative">
                                <AutoResizeTextarea value={lore.title} onChange={(e) => handleUpdateGlobalLorebook(lore.id, 'title', e.target.value.slice(0, 20))} placeholder="설정 단어를 입력하세요 (예: 전설의 명검)" className={"resize-none py-3 min-h-[44px] " + "w-full bg-white border border-[#EBE6DB] rounded-xl px-3 py-2.5 text-xs text-[#0F172A] font-semibold focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 placeholder:text-[#0F172A]"} />
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[#0F172A] font-mono">
                                  {lore.title.length}/20
                                </div>
                              </div>
                            </div>

                            <div>
                              <div className="flex items-center justify-between mb-1.5">
                                <label className="block text-[11px] font-bold text-[#0F172A]">
                                  <span className="text-[#9A9A9E] mr-0.5">*</span>인식 트리거 키워드
                                </label>
                                <div className="flex items-center gap-1 text-[10px] text-[#0F172A] font-bold">
                                  <HelpCircle size={12} className="text-[#0F172A]" />
                                </div>
                              </div>
                              <div className="border border-[#EBE6DB] rounded-xl p-3 bg-white">
                                <AutoResizeTextarea
                                  value={lore.keywords}
                                  onChange={(e) => handleUpdateGlobalLorebook(lore.id, 'keywords', e.target.value)}
                                  placeholder={`💡 설명: 대화 중 인식될 키워드를 쉼표(,)로 구분해서 입력해주세요. 입력한 매칭 단어가 사용자나 NPC 입에서 언급되면 이 설정이 반영됩니다.\n\n예: 성검, 명검, 전설의 검`}
                                  className="w-full bg-transparent text-xs text-[#0F172A] font-semibold outline-none resize-none placeholder:text-gray-400 h-20 leading-relaxed"
                                />
                                <div className="text-right text-[10px] text-[#0F172A] mt-1 font-mono">
                                  각 20자 이내, {lore.keywords.split(',').filter(k => k.trim()).length}/5개
                                </div>
                              </div>
                            </div>

                            <div>
                              <label className="block text-[11px] font-bold text-[#0F172A] mb-1.5">
                                <span className="text-[#9A9A9E] mr-0.5">*</span>설정 지식 본문
                              </label>
                              <div className="border border-[#EBE6DB] rounded-xl p-3 bg-white relative">
                                <AutoResizeTextarea
                                  value={lore.content}
                                  onChange={(e) => handleUpdateGlobalLorebook(lore.id, 'content', e.target.value.slice(0, 500))}
                                  placeholder={`💡 설명: AI가 이 키워드를 바탕으로 어떻게 세계관을 그려 나갈지 서술하세요.\n\n예시: 이 검은 고대 왕국의 유산으로, 진정한 용사만이 뽑을 수 있으며 착용 시 빛의 속도로 움직일 수 있게 됩니다.`}
                                  className="w-full bg-transparent text-xs text-[#0F172A] font-semibold outline-none resize-none placeholder:text-gray-400 mb-4 leading-relaxed"
                                />
                                <div className="absolute right-3 bottom-2 text-[10px] text-[#0F172A] font-mono">
                                  {lore.content.length}/500
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    </div>
                  </motion.div>
                )}

              </AnimatePresence>
            </div>

          </div>
        </div>

        {/* Right Preview Side - Shown only when setting counterpart characters (activeTab === '인물목록') */}
        {activeTab === '인물목록' && (
          <div key="preview-sidebar-column" className="lg:col-span-4 space-y-6">
            
            {/* A. Live NPC Visual Portrait Card */}
            <div className="bg-[#FAF9F5] border border-[#EBE6DB] p-5 rounded-2xl space-y-4">
              <h3 className="text-xs font-bold text-[#0F172A] flex items-center gap-1.5 border-b border-[#EBE6DB] pb-2">
                <Eye size={13} className="text-[#0F172A]" /> 인물 초상화
              </h3>

              <div className="relative aspect-square w-full rounded-xl bg-white border border-[#EBE6DB] overflow-hidden flex flex-col items-center justify-center shadow-sm group">
                {selectedNpc && selectedNpc.profileImage ? (
                  <>
                    <img
                      src={selectedNpc.profileImage}
                      alt={selectedNpc.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute top-2 left-2 bg-black/45 text-white text-[8px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm">
                      {selectedNpc.name}
                    </div>
                  </>
                ) : (
                  <div className="text-center p-6 space-y-2">
                    <div className="w-12 h-12 bg-[#FAF9F5] border border-[#EBE6DB] rounded-full mx-auto flex items-center justify-center text-[#0F172A] mb-1">
                      <Users size={20} />
                    </div>
                    <div className="text-[10px] font-bold text-[#0F172A]">{selectedNpc ? `[${selectedNpc.name}] 초상화 미정` : '선택된 등장인물 없음'}</div>
                    <div className="text-[8.5px] text-[#9A9A9E]">
                      '초상화 즉시 생성' 버튼을 눌러보세요.
                    </div>
                  </div>
                )}
              </div>

              {selectedNpc && (
                <div className="bg-[#FAF9F5] p-3.5 rounded-xl border border-[#EBE6DB] text-left space-y-1">
                  <div className="text-[11px] font-bold text-[#0F172A] flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-[#0F172A] rounded-full inline-block"></span>
                    {selectedNpc.name}
                  </div>
                  <div className="text-[9.5px] text-[#9A9A9E] font-semibold truncate">한 줄 설명: {selectedNpc.role}</div>
                  <div className="text-[9.5px] text-[#9A9A9E] font-semibold truncate leading-relaxed">캐릭터 설정: {selectedNpc.location_scenario || '설정 필요'}</div>
                </div>
              )}
            </div>

          </div>
        )}

      </div>

    </div>
  );
}
const AutoResizeTextarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = `${ref.current.scrollHeight}px`;
    }
  }, [props.value]);
  return <textarea ref={ref} {...props} style={{ ...props.style, overflow: 'hidden' }} rows={props.rows || 1} />;
};


