import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Sparkles, BookOpen, ArrowLeft, Camera, Image as ImageIcon, LayoutDashboard, X, Pin, Cpu, Zap, Gauge, Settings2, Activity, Share2, GitBranch, Smartphone, Bell, Wifi, WifiOff, Clock, Menu, RotateCcw, Key, Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { Message, DBCharacter, NarrativeSnapshot } from '../types';

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

interface ChatRoomProps {
  character: DBCharacter;
  userPersona: string;
  onExit: () => void;
  initialMessages?: Message[];
  initialNarrativeState?: string;
  initialLocation?: string;
  initialPlotSummary?: string;
  onOpenApiKeySettings?: () => void;
  isApiKeyConfigured?: boolean;
}

export function ChatRoom({ 
  character, 
  userPersona, 
  onExit, 
  initialMessages, 
  initialNarrativeState, 
  initialLocation, 
  initialPlotSummary,
  onOpenApiKeySettings,
  isApiKeyConfigured 
}: ChatRoomProps) {
  const [localCharacter, setLocalCharacter] = useState<DBCharacter>(character);
  const [dashboardTab, setDashboardTab] = useState<'settings' | 'telemetry'>('settings');

  // 세계관 초기 설정값을 캐릭터 속성 및 로어북에서 정학히 파싱
  const initialSettings = (() => {
    let 세계관설정NameVal = character.name || '';
    let 세계관설정DescriptionVal = character.description || '';
    let 세계관설정ScenarioVal = '';
    
    const loreStr = localStorage.getItem(`lore-${character.id}`);
    if (loreStr) {
      try {
        const parsedLore = JSON.parse(loreStr);
        if (Array.isArray(parsedLore)) {
          const scenarioItem = parsedLore.find((item: any) => item.name === '세계관 배경 시나리오');
          if (scenarioItem) {
            세계관설정ScenarioVal = scenarioItem.description || '';
          }
        }
      } catch (e) {
        console.error(e);
      }
    }
    
    if (!세계관설정ScenarioVal && character.system_prompt) {
      const match = character.system_prompt.match(/\[World_Scenario\("([\s\S]*?)"\)\]/);
      if (match) {
        세계관설정ScenarioVal = match[1];
      }
    }
    
    let introIdeaVal = '';
    if (character.greeting_message) {
      if (character.greeting_message.startsWith('[AUTO_START_INTRO]')) {
        introIdeaVal = character.greeting_message.replace('[AUTO_START_INTRO]', '').trim();
      } else {
        introIdeaVal = character.greeting_message;
      }
    }

    return {
      세계관설정Name: 세계관설정NameVal,
      세계관설정Description: 세계관설정DescriptionVal,
      세계관설정Scenario: 세계관설정ScenarioVal,
      introIdea: introIdeaVal,
      sharingLevel: character.sharing_level || 'public',
      allowRemix: character.allow_remix !== false,
    };
  })();

  const [editWorldName, setEditWorldName] = useState(initialSettings.세계관설정Name);
  const [editWorldDescription, setEditWorldDescription] = useState(initialSettings.세계관설정Description);
  const [editWorldScenario, setEditWorldScenario] = useState(initialSettings.세계관설정Scenario);
  const [editIntroIdea, setEditIntroIdea] = useState(initialSettings.introIdea);
  const [editSharingLevel, setEditSharingLevel] = useState(initialSettings.sharingLevel);
  const [editAllowRemix, setEditAllowRemix] = useState(initialSettings.allowRemix);
  const [isSavedSuccessfully, setIsSavedSuccessfully] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const [messages, setMessages] = useState<Message[]>(() => 
    initialMessages && initialMessages.length > 0
      ? initialMessages
      : [
          {
            id: '1',
            role: 'model',
            text: character.greeting_message || '*환영합니다. 이야기가 시작됩니다.*'
          }
        ]
  );
  const [plotSummary, setPlotSummary] = useState(initialPlotSummary || '');
  const [narrativeState, setNarrativeState] = useState(initialNarrativeState || '');
  const [currentLocation, setCurrentLocation] = useState(initialLocation || '');
  const [driftWarning, setDriftWarning] = useState(false);
  const [input, setInput] = useState('');
  const [isDirectorMode, setIsDirectorMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [relevantMemories, setRelevantMemories] = useState<string[]>([]);

  const handleRemixCharacter = () => {
    const custom = localStorage.getItem('custom_characters');
    let customList: DBCharacter[] = [];
    if (custom) {
      try {
        customList = JSON.parse(custom);
      } catch (err) {
        console.error(err);
      }
    }

    const remixId = `custom-remix-${Date.now()}`;
    const remixedCharacter: DBCharacter = {
      ...character,
      id: remixId,
      creator_id: 'user',
      name: `${character.name} (Remix)`,
      original_creator_name: character.original_creator_name || character.name + ' 창작자',
      remix_count: (character.remix_count || 0) + 1,
      likes: 0,
      views: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      sharing_level: 'private',
      allow_remix: true
    };

    // 포트레이트 복사
    const portrait = localStorage.getItem(`portrait-${character.id}`);
    if (portrait) {
      localStorage.setItem(`portrait-${remixId}`, portrait);
    }
    // 로어북 지식 복사
    const lore = localStorage.getItem(`lore-${character.id}`);
    if (lore) {
      localStorage.setItem(`lore-${remixId}`, lore);
    }

    customList.push(remixedCharacter);
    localStorage.setItem('custom_characters', JSON.stringify(customList));

    onExit();
  };

  const handleClearHistory = () => {
    // 1. 로컬 스토리지 데이터 완전 삭제 (세션 및 버킷 데이터)
    localStorage.removeItem(`chatsession-${localCharacter.id}`);
    localStorage.removeItem(`bucket-${localCharacter.id}-B`);
    localStorage.removeItem(`bucket-${localCharacter.id}-C`);
    localStorage.removeItem(`bucket-${localCharacter.id}-E`);
    
    // 2. 인트로 메시지 정제 (태그 제거)
    let cleanGreeting = character.greeting_message || '*환영합니다. 이야기가 시작됩니다.*';
    if (cleanGreeting.startsWith('[AUTO_START_INTRO]')) {
      cleanGreeting = cleanGreeting.replace('[AUTO_START_INTRO]', '').trim();
    }

    // 3. 모든 상태를 초기(ABSOLUTE INITIAL) 상태로 강제 리셋
    setMessages([
      {
        id: `intro-${Date.now()}`,
        role: 'model',
        text: cleanGreeting
      }
    ]);
    
    setPlotSummary('');
    setNarrativeState('아직 기록된 서사가 없습니다.');
    setCurrentLocation('장소 설정 중');
    setRelationshipStage(1);
    setEmotionalTemperature(4);
    setInnerFeeling('냉정히 가라앉은 상태');
    setAnchorEvents([]);
    setWorldVariables([]);
    setInput('');
    setIsLoading(false);
    setRelevantMemories([]);
    hasScrolledToStart.current = false;
  };

  const getRelationshipStageName = (stage: number) => {
    const stages: Record<number, string> = {
      1: "1단계 — 완전한 불신과 경계 👁️",
      2: "2단계 — 냉소적 관찰 🥶",
      3: "3단계 — 경계적 탐색 🧭",
      4: "4단계 — 가벼운 이해관계 🤝",
      5: "5단계 — 의구심 섞인 호의 🕯️",
      6: "6단계 — 일상적 교류 💬",
      7: "7단계 — 점진적 유대 💞",
      8: "8단계 — 정신적 의존 🔗",
      9: "9단계 — 신뢰와 헌신 🧬",
      10: "10단계 — 운명적 결속 🌌"
    };
    return stages[stage] || `${stage}단계`;
  };

  const getEmotionalTemperatureName = (temp: number) => {
    const temps: Record<number, string> = {
      1: "1단계 — 얼어붙음 ❄️",
      2: "2단계 — 차가움 🌬️",
      3: "3단계 — 경계 🍃",
      4: "4단계 — 중립 🪵",
      5: "5단계 — 미지근함 ☕",
      6: "6단계 — 따뜻함 ☀️",
      7: "7단계 — 뜨거움 🔥"
    };
    return temps[temp] || `${temp}단계`;
  };

  const handleSaveWorldSettings = () => {
    if (!editWorldName.trim()) {
      setSettingsError('스토리의 이름을 입력해 주세요.');
      setTimeout(() => setSettingsError(null), 4000);
      return;
    }

    // 1. system_prompt 내의 설정값들을 정규식으로 안전하게 대체 조율
    let updatedPrompt = localCharacter.system_prompt || '';
    updatedPrompt = updatedPrompt.replace(/\[World_Setting\("([\s\S]*?)"\)\]/g, `[World_Setting("${editWorldName}")]`);
    updatedPrompt = updatedPrompt.replace(/\[World_Description\("([\s\S]*?)"\)\]/g, `[World_Description("${editWorldDescription}")]`);
    updatedPrompt = updatedPrompt.replace(/\[World_Scenario\("([\s\S]*?)"\)\]/g, `[World_Scenario("${editWorldScenario}")]`);

    // 2. greeting_message도 업데이트
    let updatedGreeting = editIntroIdea;
    if (editIntroIdea.trim() && !editIntroIdea.startsWith('[AUTO_START_INTRO]')) {
      updatedGreeting = `[AUTO_START_INTRO] ${editIntroIdea.trim()}`;
    }

    const updatedChar: DBCharacter = {
      ...localCharacter,
      name: editWorldName,
      description: editWorldDescription || `${editWorldName}의 이야기 세계관`,
      system_prompt: updatedPrompt,
      greeting_message: updatedGreeting,
      sharing_level: editSharingLevel,
      allow_remix: editAllowRemix,
      updated_at: new Date().toISOString()
    };

    setLocalCharacter(updatedChar);

    // Local Storage - custom_characters 에 있다면 함께 업데이트 반영
    const custom = localStorage.getItem('custom_characters');
    if (custom) {
      try {
        const parsed: DBCharacter[] = JSON.parse(custom);
        const updatedList = parsed.map(c => c.id === localCharacter.id ? updatedChar : c);
        localStorage.setItem('custom_characters', JSON.stringify(updatedList));
      } catch (err) {
        console.error("Failed to update custom character inside list:", err);
      }
    }

    // Local Storage - lore-${id} 세부 시나리오 설정도 반영
    const loreStr = localStorage.getItem(`lore-${localCharacter.id}`);
    if (loreStr) {
      try {
        const parsedLore = JSON.parse(loreStr);
        if (Array.isArray(parsedLore)) {
          const updatedLore = parsedLore.map(item => {
            if (item.name === '세계관 배경 시나리오') {
              return { ...item, description: editWorldScenario };
            }
            return item;
          });
          localStorage.setItem(`lore-${localCharacter.id}`, JSON.stringify(updatedLore));
        }
      } catch (e) {
        console.error("Failed to update lore- scenario info:", e);
      }
    } else {
      // 로어가 없는 시스템 캐릭터 경우 신규 생성 작성
      const initialLore = [
        { name: '세계관 배경 시나리오', description: editWorldScenario }
      ];
      localStorage.setItem(`lore-${localCharacter.id}`, JSON.stringify(initialLore));
    }

    setIsSavedSuccessfully(true);
    setTimeout(() => setIsSavedSuccessfully(false), 3000);
  };

  // 5대 버킷 구조 (BUCKET_A~E) 상태 선언 및 로컬 스토리지 연동
  const [relationshipStage, setRelationshipStage] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(`bucket-${character.id}-B`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed.relationshipStage === 'number') {
          return parsed.relationshipStage;
        }
      }
    } catch (e) {
      console.error(e);
    }
    return 1;
  });

  const [emotionalTemperature, setEmotionalTemperature] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(`bucket-${character.id}-B`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed.emotionalTemperature === 'number') {
          return parsed.emotionalTemperature;
        }
      }
    } catch (e) {
      console.error(e);
    }
    return 4;
  });

  const [innerFeeling, setInnerFeeling] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(`bucket-${character.id}-B`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.innerFeeling) {
          return parsed.innerFeeling;
        }
      }
    } catch (e) {
      console.error(e);
    }
    return "아직 확실하게 마음을 터놓지 못한 낯섦";
  });

  const [anchorEvents, setAnchorEvents] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`bucket-${character.id}-C`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error(e);
    }
    return [];
  });

  const [worldVariables, setWorldVariables] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`bucket-${character.id}-E`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error(e);
    }
    return [];
  });

  // BUCKET_A는 localCharacter 자체로 관리하며, 설정 변경 시 자동 동기화
  useEffect(() => {
    localStorage.setItem(`bucket-${localCharacter.id}-A`, JSON.stringify(localCharacter));
  }, [localCharacter]);

  // BUCKET_B가 변할 시 로컬 스토리지에 자동 보존
  useEffect(() => {
    localStorage.setItem(`bucket-${localCharacter.id}-B`, JSON.stringify({
      relationshipStage,
      emotionalTemperature,
      innerFeeling
    }));
  }, [relationshipStage, emotionalTemperature, innerFeeling, localCharacter.id]);

  // BUCKET_C가 변할 시 로컬 스토리지에 자동 보존
  useEffect(() => {
    localStorage.setItem(`bucket-${localCharacter.id}-C`, JSON.stringify(anchorEvents));
  }, [anchorEvents, localCharacter.id]);

  // BUCKET_E가 변할 시 로컬 스토리지에 자동 보존
  useEffect(() => {
    localStorage.setItem(`bucket-${localCharacter.id}-E`, JSON.stringify(worldVariables));
  }, [worldVariables, localCharacter.id]);

  const tokenDietEnabled = true;
  const structureFormatMode = 'plist';
  const memoryTierMode = 'multi';
  const l1CacheSize = 5;

  const [inferenceEngine, setInferenceEngine] = useState<'vllm' | 'llamacpp' | 'cloud'>('vllm');
  const [quantization, setQuantization] = useState<'fp16' | 'q8' | 'q6' | 'q4'>('q8');
  const [spotwriteMode, setSpotwriteMode] = useState<boolean>(true);
  const [lastTTFT, setLastTTFT] = useState<number | null>(null);
  const [lastStepTime, setLastStepTime] = useState<number | null>(null);
  const [lastSpeed, setLastSpeed] = useState<number | null>(null);

  const [currentExpression, setCurrentExpression] = useState<'joy' | 'blush' | 'serious' | 'shaking'>('joy');
  const [screenShake, setScreenShake] = useState<boolean>(false);

  const [isTemporalGraphActive] = useState<boolean>(true);
  const [temporalTimeline, setTemporalTimeline] = useState<Array<{ id: number; time: string; role: string; desc: string; factRelation: string }>>([
    { id: 0, time: "6달 전", role: "설탕 과수원 견습생", desc: "말랑 성벽 외곽 지대의 젤리 수확 보조", factRelation: "구역 출입 권한 없음" },
    { id: 1, time: "3달 전", role: "수비대 임시 척후병", desc: "쿠키 침공 시 보급 지원대", factRelation: "임시 초소 사수 허가" },
    { id: 2, time: "현재 (최신 정합)", role: "말랑성벽 정예 가문 기사", desc: "공유 월드북 수호 기사 작위 수여 완료", factRelation: "사물 조작 및 거절 주권 보유" }
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleFeedback = (msgId: string, value: 'good' | 'bad') => {
    setMessages(prev => 
      prev.map(msg => 
        msg.id === msgId ? { ...msg, feedback: value } : msg
      )
    );
  };

  const handleExportDataset = () => {
    const formattedDataset = messages.map((msg, index) => {
      if (msg.role !== 'model') return null;
      const prevUser = messages.slice(0, index).reverse().find(m => m.role === 'user');
      return {
        instruction: {
          w_plus_plus_meta: `[Character: ${localCharacter.name}]\n[Persona: ${localCharacter.system_prompt}]\n[User_Persona: ${userPersona}]\n[Location: ${currentLocation || 'Unknown'}]`,
          user_input: prevUser ? prevUser.text : "(대화 시작)",
        },
        opencharacter_g_response: msg.text,
        evaluation: msg.feedback || 'not_rated',
        rewritten_status: msg.feedback === 'good' ? 'OpenCharacter-R Approved' : 'Requires Alignment'
      };
    }).filter(Boolean);

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(formattedDataset, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `${localCharacter.name}_slm_tuning_dataset.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const lastMessageRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const hasScrolledToStart = useRef(false);

  useEffect(() => {
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      
      if (lastMsg.role === 'model') {
        if (isLoading && !hasScrolledToStart.current) {
          // Just started responding: scroll to the start of the message
          setTimeout(() => {
            lastMessageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 100);
          hasScrolledToStart.current = true;
        } else if (!isLoading) {
          // Finished: ensure we see the result
          hasScrolledToStart.current = false;
        }
      } else {
        // Human message or system - scroll to bottom for natural feel
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        hasScrolledToStart.current = false;
      }
    }
  }, [messages, isLoading]);

  useEffect(() => {
    if (messages.length > 0) {
      const sessionData = {
        messages,
        narrativeState,
        currentLocation,
        plotSummary,
        relationshipStage,
        emotionalTemperature,
        innerFeeling,
        anchorEvents,
        worldVariables,
        userPersona // PERSISTENCE FIX: Include userPersona
      };
      localStorage.setItem(`chatsession-${localCharacter.id}`, JSON.stringify(sessionData));
    }
  }, [messages, narrativeState, currentLocation, plotSummary, relationshipStage, emotionalTemperature, innerFeeling, anchorEvents, worldVariables, localCharacter.id, userPersona]);

  const renderMessageContent = (msg: Message) => {
    if (msg.role === 'system') {
      return (
        <div className="max-w-2xl mx-auto py-8 px-4" key={`msg-system-${msg.id}`}>
          <div className="bg-[#FFFFFF]/50 backdrop-blur-sm border border-dashed border-[#EBE6DB] rounded-2xl p-6 text-center">
            {msg.imageUrl && (
              <div className="mb-4 relative w-full h-auto rounded-xl overflow-hidden shadow-sm">
                <img src={msg.imageUrl} alt={msg.text} className="w-full object-cover max-h-[250px]" referrerPolicy="no-referrer" />
              </div>
            )}
            <p className="text-[12px] text-[#A6A6AA] tracking-[0.1em] font-medium leading-relaxed italic">
              {msg.text}
            </p>
            {(msg as any).isError && (msg as any).errorType === 'auth' && onOpenApiKeySettings && (
              <div className="mt-4">
                <button 
                  type="button"
                  onClick={onOpenApiKeySettings}
                  className="px-4 py-2 bg-[#E59A9A] text-white text-[11px] font-bold rounded-lg hover:bg-[#D48989] transition-all shadow-sm cursor-pointer"
                >
                  <Key size={12} className="inline mr-1" /> API 키 설정
                </button>
              </div>
            )}
          </div>
        </div>
      );
    }

    if (msg.role === 'user') {
      return (
        <div className="max-w-2xl mx-auto py-4 px-6" key={`msg-user-${msg.id}`}>
          <div className="relative group">
            <div className="absolute -left-4 top-0 bottom-0 w-[3px] bg-[#D6E0F0] rounded-full opacity-60 group-hover:opacity-100 transition-opacity" />
            <div className="pl-3">
              <span className="flex items-center gap-2 text-[#96A7C1] opacity-70 text-[10px] font-black uppercase tracking-[0.2em] mb-2 select-none">
                {msg.text.startsWith('[지시]') ? <Cpu size={12} className="text-[#A69E93]" /> : <User size={12} />}
                {msg.text.startsWith('[지시]') ? '감독의 지시' : '나의 행동'}
              </span>
              <p className="text-[15px] md:text-[16px] text-[#4A4A4F] leading-relaxed font-bold tracking-tight opacity-90">
                {msg.text.replace('[지시]', '').trim()}
              </p>
            </div>
          </div>
        </div>
      );
    }

    const text = msg.text;
    const blocks: Array<{ 
      type: 'narration' | 'character'; 
      speakerName?: string;
      content: Array<{ type: 'narration' | 'dialogue' | 'thought'; text: string }> 
    }> = [];

    const chunks = text.split(/(\[화자:\s*[^\]]+\])/g);
    
    let lastCharName: string | undefined = undefined;

    chunks.forEach((chunk) => {
      const speakerMatch = chunk.match(/\[화자:\s*([^\]]+)\]/);
      if (speakerMatch) {
        lastCharName = speakerMatch[1].trim();
      } else if (chunk.trim()) {
        const innerElements: Array<{ type: 'narration' | 'dialogue' | 'thought'; text: string }> = [];
        const lines = chunk.split('\n');
        
        lines.forEach(line => {
          if (!line.trim()) {
            innerElements.push({ type: 'narration', text: '\n' });
            return;
          }
          
          const tokens = line.split(/("[^"]*"|'[^']*'|\*[^*]*\*)/g);
          
          tokens.forEach(token => {
            if (!token.trim()) return;
            if (token.startsWith('"') && token.endsWith('"')) {
              innerElements.push({ type: 'dialogue', text: token.slice(1, -1) });
            } else if (token.startsWith('\'') && token.endsWith('\'')) {
              innerElements.push({ type: 'thought', text: token.slice(1, -1) });
            } else if (token.startsWith('*') && token.endsWith('*')) {
              innerElements.push({ type: 'narration', text: token.slice(1, -1) });
            } else {
              innerElements.push({ type: 'narration', text: token.trim() });
            }
          });
        });

        if (innerElements.length > 0) {
          blocks.push({
            type: lastCharName ? 'character' : 'narration',
            speakerName: lastCharName,
            content: innerElements
          });
        }
      }
    });

    return (
      <div className="max-w-2xl mx-auto py-6 md:py-10 px-6 md:px-0 font-serif" key={`msg-ai-${msg.id}`}>
        <div className="space-y-6">
          {blocks.map((block, bIdx) => (
            <div key={bIdx} className="w-full">
              {block.type === 'character' && block.speakerName && (
                <div className="mb-2">
                  <span className="text-[12px] font-black text-[#847365] tracking-[0.2em] uppercase opacity-40">
                    {block.speakerName}
                  </span>
                </div>
              )}
              
              <div className="space-y-1.5">
                {block.content.map((el, eIdx) => {
                  if (el.type === 'dialogue') {
                    return (
                      <p key={eIdx} className="text-[19px] md:text-[21px] leading-relaxed text-[#1A1A1E] font-bold tracking-tight drop-shadow-sm">
                        {el.text}
                      </p>
                    );
                  } else if (el.type === 'thought') {
                    return (
                      <p key={eIdx} className="text-[15px] md:text-[16px] text-[#847365] italic leading-relaxed opacity-80 pl-4 border-l-[1.5px] border-[#EBE6DB] py-0.5">
                        {el.text}
                      </p>
                    );
                  } else {
                    if (el.text === '\n') return <div key={eIdx} className="h-1" />;
                    return (
                      <p key={eIdx} className="text-[16px] md:text-[17px] text-[#3D3D42] leading-relaxed font-medium opacity-90 tracking-wide">
                        {el.text}
                      </p>
                    );
                  }
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const hasAutoStarted = useRef(false);

  useEffect(() => {
    if (messages.length === 1 && messages[0].text.startsWith('[AUTO_START_INTRO]') && !hasAutoStarted.current) {
      hasAutoStarted.current = true;
      const introIdea = messages[0].text.replace('[AUTO_START_INTRO]', '').trim();
      const messageId = messages[0].id;
      
      setMessages([{ id: messageId, role: 'model', text: '' }]);
      setIsLoading(true);

      const submitStartTime = performance.now();
      let measuredTTFT: number | null = null;
      let assistantMessage = '';

      const userApiKey = localStorage.getItem('gemini_user_api_key') || '';
      const userModel = localStorage.getItem('gemini_user_model') || 'gemini-3.5-flash';
      const prompt = `[시스템 지시: 사용자가 이 세계관의 첫 시작 인트로 아이디어를 제공했습니다: "${introIdea}". 이 아이디어에 서사적 살을 붙여, 플레이어가 이 세계관에 방금 깨어나거나 진입했을 때의 상황을 묘사하는 실감나는 프롤로그 문장과 첫 대사를 작성하세요. 이것은 채팅의 첫 번째 메시지입니다.]`;

      fetch('/api/chat', {
        method: 'POST',
        headers: getSafeHeaders(userApiKey, userModel),
        body: JSON.stringify({
          message: prompt,
          history: [],
          character: character,
          persona: userPersona,
          
          // 5대 버킷 동적 파라미터 전달 (v2.0)
          relationshipStage,
          emotionalTemperature,
          innerFeeling,
          anchorEvents,
          worldVariables
        })
      })
      .then(async (response) => {
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || '인트로 생성 실패');
        }
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        
        let pendingBuffer = '';
        let assistantMessage = '';
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            pendingBuffer += chunk;
            const lines = pendingBuffer.split('\n');
            
            pendingBuffer = lines.pop() || '';
            
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              if (trimmed.startsWith('data: ')) {
                const data = trimmed.slice(6).trim();
                if (data === '[DONE]') break;
                let parsed: any = null;
                try {
                  parsed = JSON.parse(data);
                  if (parsed.text) {
                    if (measuredTTFT === null) {
                      measuredTTFT = performance.now() - submitStartTime;
                      setLastTTFT(Math.round(measuredTTFT));
                    }
                    assistantMessage += parsed.text;
                  } else if (parsed.narrativeState) {
                    setNarrativeState(parsed.narrativeState);
                  } else if (parsed.currentLocation) {
                    setCurrentLocation(parsed.currentLocation);
                  }
                } catch (e) {}
              }
            }
          }
        }
        setMessages([{ id: messageId, role: 'model', text: assistantMessage }]);
        setIsLoading(false);
      })
      .catch((error) => {
        console.error(error);
        setIsLoading(false);
        const isAuthError = error.message.includes('API') || error.message.includes('키');
        setMessages(prev => [...prev.filter(m => m.id !== messageId), {
          id: `system-err-${Date.now()}`,
          role: 'system',
          text: `*시스템(System): 서사 인트로 로딩에 실패했습니다. (${error.message})*`,
          isError: true,
          errorType: isAuthError ? 'auth' : 'network'
        }]);
      });
    }
  }, [messages, character, userPersona]);

  const [selectedZoomImage, setSelectedZoomImage] = useState<string | null>(null);

  const getNPCByName = (name: string) => {
    const npcs = character.metadata?.인물목록;
    if (!npcs || !Array.isArray(npcs)) return null;
    return npcs.find((n: any) => n.name === name);
  };

  const getMessageSpeakerInfo = (text: string) => {
    const match = text.match(/\[화자:\s*([^\]]+)\]/);
    if (match) {
      const name = match[1].trim();
      const npc = getNPCByName(name);
      return { name, profileImage: npc?.profileImage };
    }
    // Default to the first NPC if no speaker tag but role is model
    const firstNpc = character.metadata?.인물목록?.[0];
    return { name: firstNpc?.name || character.name, profileImage: firstNpc?.profileImage };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;

    const isDirector = trimmedInput.startsWith('!');
    const actualText = isDirector ? trimmedInput.slice(1).trim() : input;
    
    if (isDirector && !actualText) return;

    const now = Date.now();
    const userMsgId = `user-${now}`;
    const formattedText = isDirector ? `[지시] ${actualText}` : input;
    const newMessage: Message = { id: userMsgId, role: 'user', text: formattedText };
    
    let currentHistory = messages.map(m => ({ role: m.role, text: m.text }));
    if (tokenDietEnabled) {
      const cacheLimit = Number(l1CacheSize) || 5;
      if (currentHistory.length > cacheLimit) {
        currentHistory = currentHistory.slice(-cacheLimit);
      }
    }
    
    setMessages(prev => [...prev, newMessage]);
    setInput('');
    setIsDirectorMode(false);
    setIsLoading(true);

    const submitStartTime = performance.now();
    let measuredTTFT: number | null = null;
    const messageId = `ai-${now}`;

    try {
      const userApiKey = localStorage.getItem('gemini_user_api_key') || '';
      const userModel = localStorage.getItem('gemini_user_model') || 'gemini-3.5-flash';
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: getSafeHeaders(userApiKey, userModel),
        body: JSON.stringify({
          message: formattedText,
          history: currentHistory,
          character: localCharacter,
          persona: userPersona,
          summary: plotSummary,
          narrativeState: narrativeState,
          currentLocation: currentLocation,
          inferenceEngine: inferenceEngine,
          quantization: quantization,
          spotwriteMode: spotwriteMode,
          
          // 토큰 다이어트 고효율 제어 지연 전송 데이터
          tokenDietEnabled,
          structureFormatMode,
          memoryTierMode,
          l1CacheSize,

          // 5대 버킷 동적 파라미터 전달 (v2.0)
          relationshipStage,
          emotionalTemperature,
          innerFeeling,
          anchorEvents,
          worldVariables,
          
          // 32단계 파라미터 전달
          isTemporalGraphActive,
          temporalTimelineStr: temporalTimeline.map(evt => `[${evt.time}] ${evt.role}: ${evt.desc} (규칙: ${evt.factRelation})`).join(" | "),
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Network response was not ok');
      }
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';
      
      // Initialize AI message placeholder for streaming
      setMessages(prev => [...prev, { id: messageId, role: 'model', text: '' }]);

      let pendingBuffer = '';
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          pendingBuffer += chunk;
          const lines = pendingBuffer.split('\n');
          
          pendingBuffer = lines.pop() || '';
          
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            if (trimmed.startsWith('data: ')) {
              const data = trimmed.slice(6).trim();
              if (data === '[DONE]') break;
              
              let parsed: any = null;
              try {
                parsed = JSON.parse(data);
                if (parsed.text) {
                  if (measuredTTFT === null) {
                    measuredTTFT = performance.now() - submitStartTime;
                    setLastTTFT(Math.round(measuredTTFT));
                  }
                  assistantMessage += parsed.text;
                  // Update current AI message incrementally
                  setMessages(prev => {
                    const last = prev[prev.length - 1];
                    if (last && last.id === messageId) {
                      return [...prev.slice(0, -1), { ...last, text: assistantMessage }];
                    }
                    return prev;
                  });
                } else if (parsed.summary) {
                  setPlotSummary(parsed.summary);
                } else if (parsed.narrativeState) {
                  setNarrativeState(parsed.narrativeState);
                } else if (parsed.currentLocation) {
                  setCurrentLocation(parsed.currentLocation);
                } else if (parsed.driftWarning !== undefined) {
                  setDriftWarning(parsed.driftWarning);
                } else if (parsed.relationshipStage !== undefined) {
                  setRelationshipStage(parsed.relationshipStage);
                } else if (parsed.emotionalTemperature !== undefined) {
                  setEmotionalTemperature(parsed.emotionalTemperature);
                } else if (parsed.innerFeeling) {
                  setInnerFeeling(parsed.innerFeeling);
                } else if (parsed.newAnchorEvent) {
                  setAnchorEvents(prev => {
                    if (prev.includes(parsed.newAnchorEvent)) return prev;
                    return [...prev, parsed.newAnchorEvent];
                  });
                } else if (parsed.worldStatusChange) {
                  setWorldVariables(prev => {
                    if (prev.includes(parsed.worldStatusChange)) return prev;
                    return [...prev, parsed.worldStatusChange];
                  });
                } else if (parsed.relevantMemories) {
                  setRelevantMemories(parsed.relevantMemories);
                } else if (parsed.error) {
                  throw new Error(parsed.error);
                }
              } catch (e: any) {
                if (e instanceof Error && e.message === parsed?.error) throw e;
                console.error("Error parsing stream data", e);
              }
            }
          }
        }
        
        setIsLoading(false); 
        
        const totalDuration = (performance.now() - submitStartTime) / 1000;
        setLastStepTime(parseFloat(totalDuration.toFixed(2)));
        if (assistantMessage.length > 0) {
          setLastSpeed(parseFloat((assistantMessage.length / totalDuration).toFixed(1)));
        }

        // 한국어 감정 키워드 트리거 분석하여 표정 설정
        let detectedExpr: 'joy' | 'blush' | 'serious' | 'shaking' = 'joy';
        if (assistantMessage.includes('!') || assistantMessage.includes('기쁨') || assistantMessage.includes('좋아') || assistantMessage.includes('웃음') || assistantMessage.includes('사랑')) {
          detectedExpr = 'joy';
        } else if (assistantMessage.includes('...') || assistantMessage.includes('부끄') || assistantMessage.includes('설레') || assistantMessage.includes('단맛') || assistantMessage.includes('수줍')) {
          detectedExpr = 'blush';
        } else if (assistantMessage.includes('전투') || assistantMessage.includes('무기') || assistantMessage.includes('방어') || assistantMessage.includes('수비대') || assistantMessage.includes('기사')) {
          detectedExpr = 'serious';
        } else if (assistantMessage.includes('쿠키') || assistantMessage.includes('습격') || assistantMessage.includes('흔들') || assistantMessage.includes('놀람') || assistantMessage.includes('폭발') || assistantMessage.includes('위험')) {
          detectedExpr = 'shaking';
          setScreenShake(true);
          setTimeout(() => setScreenShake(false), 2400); // 2.4초 후 진동 진정
        }
        setCurrentExpression(detectedExpr);
      }
    } catch (error: any) {
      console.error("Error:", error);
      setIsLoading(false);
      const isAuthError = error.message.includes('API') || error.message.includes('키');
      setMessages(prev => [...prev.filter(m => m.id !== messageId), { 
        id: `ai-err-${Date.now()}`, 
        role: 'system', 
        text: `*시스템(System): 메시지 전송에 실패했습니다. (${error.message})*`,
        isError: true,
        errorType: isAuthError ? 'auth' : 'network'
      }]);
    }
  };

  return (
    <motion.div 
      id="chat-room-viewport-pane"
      animate={screenShake ? { 
        x: [-6, 6, -6, 6, -3, 3, -1, 1, 0],
        y: [-3, 3, -2, 2, -2, 2, 0]
      } : {}}
      transition={{ duration: 0.5 }}
      className="flex-1 flex flex-col h-full bg-[#FAF9F5] relative overflow-hidden"
    >
      {/* Header Panel (Minimalist Novel Header) */}
      <div className="w-full py-4 px-6 bg-[#FAF9F5]/80 backdrop-blur-md z-30 shrink-0 flex items-center justify-between">
        
        {/* Left Section: Back Button */}
        <div className="flex items-center shrink-0">
          <button 
            type="button"
            onClick={onExit} 
            className="flex items-center gap-2 text-[#847365] hover:text-[#0F172A] transition-all text-[11px] font-bold px-3 py-1.5 rounded-full border border-[#EBE6DB] bg-white/50 cursor-pointer"
          >
            <ArrowLeft size={14} /> 목록으로
          </button>
        </div>

        {/* Center Section: Book Title Style */}
        <div className="flex flex-col items-center text-center justify-center min-w-0">
          <h2 className="text-[13px] font-serif font-black text-[#1A1A1E] tracking-widest uppercase truncate max-w-[200px] md:max-w-[400px]">
            {localCharacter.name}
          </h2>
          <div className="flex items-center gap-2 mt-1 select-none">
            <span className="w-1 h-1 rounded-full bg-[#96A7C1]/30" />
            <span className="text-[9px] font-bold text-[#847365]/60 tracking-tighter uppercase italic">
              {currentLocation || '장소 불명'}
            </span>
            <span className="w-1 h-1 rounded-full bg-[#96A7C1]/30" />
          </div>
        </div>

        {/* Right Section: Mini Story Status */}
        <div className="flex items-center gap-2">
          <button 
            type="button"
            onClick={() => setIsDashboardOpen(!isDashboardOpen)}
            className={`px-3 py-1.5 flex items-center gap-2 rounded-full border transition-all cursor-pointer text-[11px] font-bold ${
              isDashboardOpen ? 'bg-[#96A7C1] text-white border-[#96A7C1]' : 'bg-white/50 text-[#847365] border-[#EBE6DB] hover:bg-white'
            }`}
          >
            <BookOpen size={13} /> 내러티브
          </button>
          
          <div className="relative">
            <button 
              type="button"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className={`w-8 h-8 flex items-center justify-center rounded-full border transition-all cursor-pointer ${
                isMenuOpen ? 'bg-[#5A5A61] text-white border-[#5A5A61]' : 'bg-white/50 text-[#847365] border-[#EBE6DB] hover:bg-white'
              }`}
            >
              <Menu size={14} />
            </button>

            <AnimatePresence>
              {isMenuOpen && (
                <>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setIsMenuOpen(false)}
                    className="fixed inset-0 z-40"
                  />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="absolute right-0 mt-3 w-52 bg-white border border-[#EBE6DB] rounded-2xl shadow-2xl overflow-hidden p-2 z-50"
                    style={{ top: '100%' }}
                  >
                    <button
                      type="button"
                      onClick={() => setShowResetConfirm(true)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-[11px] font-bold text-[#E59A9A] hover:bg-[#FFF0F2] rounded-xl transition-colors text-left cursor-pointer"
                    >
                      <RotateCcw size={14} /> 대화 초기화
                    </button>
                  
                  {onOpenApiKeySettings && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenApiKeySettings();
                        setIsMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-[11px] font-bold text-[#5A5A61] hover:bg-[#FAF9F5] rounded-xl transition-colors text-left"
                    >
                      <Key size={14} /> API 키 관리
                    </button>
                  )}

                  <div className="h-px bg-[#F3F1EA] my-1" />

                  <button
                    type="button"
                    onClick={() => {
                      setIsDashboardOpen(!isDashboardOpen);
                      setIsMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-[11px] font-bold rounded-xl transition-colors text-left ${
                      isDashboardOpen ? 'bg-[#F3F1EA] text-[#4C4C54]' : 'text-[#75757C] hover:bg-[#FAF9F5]'
                    }`}
                  >
                    <LayoutDashboard size={14} /> {isDashboardOpen ? '대시보드 닫기' : '대시보드 보기'}
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-10 space-y-2 pt-6 pb-20 custom-scrollbar">
        <AnimatePresence initial={false}>
          {messages.map((msg, index) => (
            <motion.div
              key={msg.id}
              ref={index === messages.length - 1 ? lastMessageRef : null}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full"
            >
              {renderMessageContent(msg)}
            </motion.div>
          ))}
        </AnimatePresence>
        
        {isLoading && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            className="flex flex-col items-center gap-4 w-full py-16"
          >
            <div className="flex items-center gap-4 text-[#A69E93] opacity-40">
              <div className="w-12 h-[1px] bg-gradient-to-r from-transparent to-current" />
              <motion.div
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="text-[10px] font-serif italic tracking-widest"
              >
                새로운 문장을 엮어내는 중...
              </motion.div>
              <div className="w-12 h-[1px] bg-gradient-to-l from-transparent to-current" />
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Narrative Dashboard Overlay */}
      <AnimatePresence>
        {isDashboardOpen && (
          <motion.div 
            initial={{ opacity: 0, x: 100 }} 
            animate={{ opacity: 1, x: 0 }} 
            exit={{ opacity: 0, x: 100 }}
            className="absolute top-0 right-0 h-full w-[340px] md:w-[400px] bg-[#FAF9F5] border-l border-[#EBE6DB] shadow-2xl z-[60] flex flex-col"
          >
            <div className="p-4 border-b border-[#EBE6DB] flex justify-between items-center bg-white shrink-0">
              <h3 className="font-serif font-black text-[#1A1A1E] text-[13px] flex items-center gap-2 tracking-widest uppercase">
                <LayoutDashboard size={16} className="text-[#96A7C1]" /> 집필 설정 및 기록
              </h3>
              <button onClick={() => setIsDashboardOpen(false)} className="text-[#9A9A9E] hover:text-[#0F172A] transition-colors p-1 rounded-md hover:bg-[#FAF9F5] cursor-pointer">
                <X size={16} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              <div className="space-y-4 text-left">
                <h4 className="text-[11px] font-black text-[#847365] tracking-widest uppercase opacity-60 mb-2">기본 집필 설정</h4>
                
                {isSavedSuccessfully && (
                  <div className="bg-[#EEF8F4] border border-[#D5EFEB] text-[#428F79] p-3 rounded-xl text-[11px] font-bold">
                    설정이 성공적으로 반영되었습니다.
                  </div>
                )}

                {settingsError && (
                  <div className="bg-[#FFECEC] border border-[#FECACA] text-[#D32F2F] p-3 rounded-xl text-[11px] font-bold">
                    ⚠️ {settingsError}
                  </div>
                )}

                <div className="space-y-1 text-left">
                  <label className="text-[10px] font-bold text-[#5A5A61] uppercase tracking-tighter">작품 제목</label>
                  <input
                    type="text"
                    value={editWorldName}
                    onChange={(e) => setEditWorldName(e.target.value)}
                    className="w-full bg-white border border-[#EBE6DB] focus:border-[#96A7C1] rounded-xl text-xs p-3 outline-none transition-all text-[#1A1A1E]"
                  />
                </div>

                <div className="space-y-1 text-left">
                  <label className="text-[10px] font-bold text-[#5A5A61] uppercase tracking-tighter">작품 요약</label>
                  <input
                    type="text"
                    value={editWorldDescription}
                    onChange={(e) => setEditWorldDescription(e.target.value)}
                    className="w-full bg-white border border-[#EBE6DB] focus:border-[#96A7C1] rounded-xl text-xs p-3 outline-none transition-all text-[#1A1A1E]"
                  />
                </div>

                <div className="space-y-1 text-left">
                  <label className="text-[10px] font-bold text-[#5A5A61] uppercase tracking-tighter">세부 서사 설정</label>
                  <textarea
                    rows={5}
                    value={editWorldScenario}
                    onChange={(e) => setEditWorldScenario(e.target.value)}
                    className="w-full bg-white border border-[#EBE6DB] focus:border-[#96A7C1] rounded-xl text-xs p-3 outline-none resize-none transition-all text-[#1A1A1E] leading-relaxed"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSaveWorldSettings}
                  className="w-full py-3 bg-[#96A7C1] text-white hover:bg-[#8596B0] transition-all font-bold text-[12px] rounded-xl shadow-md active:scale-95 cursor-pointer uppercase tracking-widest"
                >
                  설정 내용 반영하기
                </button>
              </div>

              <div className="pt-6 border-t border-[#EBE6DB] space-y-6 text-left">
                <h4 className="text-[11px] font-black text-[#847365] tracking-widest uppercase opacity-60 mb-2">현재 서사 상태 (Records)</h4>
                
                {/* Narrative State & Location */}
                <div className="bg-[#FFFFFF] p-4 rounded-xl border border-[#EBE6DB] shadow-sm text-left">
                  <div className="space-y-3">
                    <div className="text-xs text-[#5A5A61] leading-relaxed font-sans">
                      <span className="font-bold text-[#1A1A1E] block mb-1">🎭 정립된 관계 서사:</span> 
                      <div className="bg-[#FAF9F5] p-2 rounded-lg border border-[#EBE6DB]">{narrativeState || '아직 기록된 서사가 없습니다.'}</div>
                    </div>
                    <div className="text-xs text-[#5A5A61] leading-relaxed font-sans">
                      <span className="font-bold text-[#1A1A1E] block mb-1">📍 현재 무대 배경:</span> 
                      <div className="bg-[#FAF9F5] p-2 rounded-lg border border-[#EBE6DB]">{currentLocation || '장소 설정 중'}</div>
                    </div>
                  </div>
                </div>

                {/* 💞 실시간 관계 및 감정 스펙트럼 */}
                <div className="bg-[#FFFFFF] p-4 rounded-xl border border-[#EBE6DB] shadow-sm text-left space-y-4">
                  <h4 className="text-[10px] font-black text-[#1A1A1E] flex items-center gap-1.5 uppercase tracking-wider">
                    💞 인물간 상호작용 지표
                  </h4>
                  
                  {/* 관계 레벨 */}
                  <div className="space-y-2.5">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="font-bold text-[#5A5A61]">친밀도 레벨</span>
                      <span className="font-black text-[#96A7C1]">{relationshipStage} / 10</span>
                    </div>
                    <div className="w-full h-1.5 bg-[#F1F0EC] rounded-full overflow-hidden">
                      <div className="h-full bg-[#96A7C1] transition-all duration-1000 ease-out" style={{ width: `${(relationshipStage / 10) * 100}%` }} />
                    </div>
                    <p className="text-[9px] text-[#847365] italic tracking-tight opacity-70">{getRelationshipStageName(relationshipStage)}</p>
                  </div>

                  {/* 감정 온도 */}
                  <div className="space-y-2.5">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="font-bold text-[#5A5A61]">감정적 온도</span>
                      <span className="font-black text-[#4A7BB0]">{emotionalTemperature} / 7</span>
                    </div>
                    <div className="w-full h-1.5 bg-[#F1F0EC] rounded-full overflow-hidden">
                      <div className="h-full bg-[#4A7BB0] transition-all duration-1000 ease-out" style={{ width: `${(emotionalTemperature / 7) * 100}%` }} />
                    </div>
                    <p className="text-[9px] text-[#847365] italic tracking-tight opacity-70">{getEmotionalTemperatureName(emotionalTemperature)}</p>
                  </div>

                  {/* 그녀의 속마음 */}
                  <div className="bg-[#FAF9F5] border border-[#EBE6DB] p-3 rounded-lg">
                    <span className="text-[8px] font-black text-[#96A7C1] tracking-widest uppercase block mb-1">
                      심층 심리 상태 (Inner)
                    </span>
                    <p className="text-[11px] text-[#1A1A1E] leading-relaxed font-bold italic">
                      "{innerFeeling || '냉정히 가라앉은 상태'}"
                    </p>
                  </div>
                </div>
                
                {/* Plot Summary */}
                <div className="bg-[#FFFFFF] p-4 rounded-xl border border-[#EBE6DB] shadow-sm text-left">
                  <h4 className="text-[10px] font-black text-[#1A1A1E] mb-2 uppercase tracking-wider">
                    📝 현재까지의 줄거리 줄기
                  </h4>
                  <div className="text-[11px] text-[#5A5A61] leading-[2.0] font-serif italic p-3.5 bg-[#FAF9F5] rounded-lg border border-[#EBE6DB]">
                    {plotSummary || '서사의 흐름이 기록되고 있습니다.'}
                  </div>
                </div>                
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input Form (Novel Pen Style) */}
      <div className="py-8 md:py-12 px-6 md:px-0 max-w-2xl mx-auto w-full bg-transparent shrink-0 z-10 transition-all duration-500">
        <form onSubmit={handleSubmit} className="relative w-full">
          {isDirectorMode && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 px-4 py-2 bg-[#FAF9F5] border border-[#EBE6DB] text-[#847365] text-[10px] font-black tracking-widest uppercase rounded-full w-max mx-auto mb-4"
            >
              <Cpu size={12} className="animate-pulse" /> 감독의 연출 (Director Mode)
            </motion.div>
          )}
 
          <div className="relative w-full flex flex-col items-center gap-4">
            <input
              type="text"
              value={input}
              onChange={(e) => {
                const val = e.target.value;
                setInput(val);
                setIsDirectorMode(val.trim().startsWith('!'));
              }}
              autoFocus
              placeholder={
                isDirectorMode 
                  ? "다음 장면을 연출하세요..." 
                  : "펜을 들어 다음 이야기를 적어보세요..."
              }
              className="w-full bg-transparent border-b border-[#EBE6DB] focus:border-[#96A7C1] py-4 md:py-6 text-[16px] md:text-[18px] text-center font-serif italic outline-none transition-all placeholder:text-[#9A9A9E]/60 text-[#1A1A1E]"
              disabled={isLoading}
            />
            
            <div className="flex items-center gap-6">
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className={`p-3 rounded-full transition-all duration-300 ${
                  input.trim() && !isLoading
                    ? 'text-[#96A7C1] hover:scale-110 active:scale-95'
                    : 'text-[#EBE6DB]'
                }`}
              >
                <Zap size={24} fill={input.trim() && !isLoading ? "currentColor" : "none"} />
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Image Zoom Modal */}
      <AnimatePresence>
        {selectedZoomImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedZoomImage(null)}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 cursor-zoom-out"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-4xl w-full aspect-square bg-[#FAF9F5] rounded-3xl overflow-hidden shadow-2xl border-4 border-white"
              onClick={(e) => e.stopPropagation()}
            >
              <img 
                src={selectedZoomImage} 
                alt="Enlarged profile" 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              <button
                onClick={() => setSelectedZoomImage(null)}
                className="absolute top-4 right-4 w-10 h-10 bg-black/20 hover:bg-black/40 text-white rounded-full flex items-center justify-center transition-colors backdrop-blur-md"
              >
                <X size={24} />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom Reset Confirmation Modal */}
      <AnimatePresence>
        {showResetConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-[#1A1A1E]/40 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl border border-[#EBE6DB] text-center space-y-6"
            >
              <div className="w-16 h-16 bg-[#FFF0F2] text-[#E59A9A] rounded-full flex items-center justify-center mx-auto mb-2">
                <RotateCcw size={32} />
              </div>
              <div className="space-y-2">
                <h3 className="text-[18px] font-black text-[#1A1A1E]">대화 초기화</h3>
                <p className="text-[13px] text-[#847365] leading-relaxed">
                  정말로 모든 대화 기록과 서사 데이터를<br />
                  처음 상태로 되돌리시겠습니까?<br />
                  <span className="text-[#E59A9A] font-bold">(이 작업은 취소할 수 없습니다)</span>
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="flex-1 py-3.5 bg-[#FAF9F5] text-[#847365] text-[13px] font-bold rounded-2xl hover:bg-[#F1F0EC] transition-colors cursor-pointer"
                >
                  취소
                </button>
                <button
                  onClick={() => {
                    handleClearHistory();
                    setShowResetConfirm(false);
                    setIsMenuOpen(false);
                  }}
                  className="flex-1 py-3.5 bg-[#E59A9A] text-white text-[13px] font-bold rounded-2xl hover:bg-[#D48181] shadow-lg shadow-rose-100 transition-all active:scale-95 cursor-pointer"
                >
                  초기화 실행
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
