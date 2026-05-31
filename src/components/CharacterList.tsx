import React, { useState, useEffect } from 'react';
import { Plus, Library, Trash2 } from 'lucide-react';
import type { DBCharacter } from '../types';

interface CharacterListProps {
  onSelect: (character: DBCharacter) => void;
  onEdit: (character: DBCharacter) => void;
  onCreateStart: () => void;
}

const mockCharacters: DBCharacter[] = [
  {
    id: 'intro-world-1',
    creator_id: 'sys',
    name: '비밀의 찻집 (Secret Teahouse)',
    description: '서로 다른 목적을 가진 두 사람의 찻집',
    system_prompt: `[World_Setting("비밀의 찻집")]
[World_Description("깊은 숲속, 안개에 가려진 찻집. 이곳은 평범한 사람들이 아닌 특별한 사연을 가진 이들만이 찾아올 수 있는 치유와 계약의 공간입니다.")]
[Character("멜리아", "찻집 주인", "은은한 홍차 향기가 배어있는 다정한 성격의 소녀")]
[Character("카일", "떠돌이 검사", "과거의 기억을 잃고 찻집에 머물게 된 과묵한 청년")]`,
    greeting_message: "*딸랑, 맑은 종소리와 함께 당신이 찻집 문을 열고 들어섭니다. 멜리아가 환한 미소로 당신을 맞이하고, 한구석에서는 카일이 조용히 칼을 닦고 있습니다.* \"어서 오세요. 당신에게 어울리는 향기로운 차를 준비해 드릴까요?\"",
    is_public: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata: {
      세계관설정Name: "비밀의 찻집",
      세계관설정Description: "서로 다른 목적을 가진 두 사람의 찻집",
      세계관설정Scenario: "깊은 숲속, 안개에 가려진 찻집. 이곳은 평범한 사람들이 아닌 특별한 사연을 가진 이들만이 찾아올 수 있는 치유와 계약의 공간입니다.",
      sharingLevel: "public",
      allowRemix: true,
      introIdea: "당신은 지독한 눈보라를 뚫고 우연히 이 찻집을 발견했습니다.",
      주인공설정Name: "여행자",
      주인공설정Persona: "사연을 품고 숲을 헤메던 중 발견한 찻집에서 휴식을 취하려는 인물.",
      인물목록: [
        {
          id: 'npc-1',
          name: '멜리아',
          role: '찻집 주인',
          description: '은은한 홍차 향기가 배어있는 다정한 성격의 소녀. 찾아오는 이들의 마음을 어루만져 줍니다.',
          location_scenario: '찻집 카운터 안쪽',
          dialogue_examples: '<유저>: 이곳은 어떤 곳인가요?\n<멜리아>: *찻잔을 닦으며 다정하게 웃음 지음* "잃어버린 마음의 조각을 잠시 쉬어가는 곳이랍니다."',
          personality_tags: ['다정함', '신비로움', '치유'],
          beauty_portrait_url: 'https://image.pollinations.ai/prompt/beautiful%20anime%20girl%20tea%20shop%20owner%2C%20apron%2C%20holding%20steaming%20tea%20cup%2C%20warm%20aesthetic?width=1024&height=1024&nologo=true'
        },
        {
          id: 'npc-2',
          name: '카일',
          role: '떠돌이 검사',
          description: '과거의 기억을 잃고 찻집에 머물게 된 과묵한 청년. 찻집의 안전을 지키고 있습니다.',
          location_scenario: '찻집의 구석진 자리',
          dialogue_examples: '<유저>: 당신은 누구죠?\n<카일>: *칼날을 훑으며 눈길조차 주지 않음* "지나가는 칼잡이일 뿐이다. 나에게 관심 끄는 게 좋을걸."',
          personality_tags: ['과묵함', '냉정함', '은밀한'],
          beauty_portrait_url: 'https://image.pollinations.ai/prompt/cool%20anime%20swordsman%20man%2C%20sitting%20in%20shadows%2C%20sharpening%20sword%2C%20mysterious%20aura?width=1024&height=1024&nologo=true'
        }
      ],
      인물관계hips: [
        { source: 'npc-1', target: 'npc-2', type: '신뢰', description: '생명의 은인과 그를 지키는 보디가드' }
      ],
      globalLorebooks: []
    }
  }
];

export function CharacterList({ onSelect, onEdit, onCreateStart }: CharacterListProps) {
  const [characters, setCharacters] = useState<DBCharacter[]>(mockCharacters);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);

  useEffect(() => {
    // 숨김 처리된 아이디들 불러오기
    const hidden = localStorage.getItem('hidden_system_characters');
    if (hidden) {
      try {
        setHiddenIds(JSON.parse(hidden));
      } catch (e) {
        console.error(e);
      }
    }

    const custom = localStorage.getItem('custom_characters');
    if (custom) {
      try {
        const parsed: DBCharacter[] = JSON.parse(custom);
        setCharacters([...mockCharacters, ...parsed]);
      } catch (e) {
        console.error("Failed to parse custom characters", e);
      }
    }
  }, []);

  const handleDeleteCharacter = (e: React.MouseEvent, charId: string, isSystem: boolean) => {
    e.preventDefault();
    e.stopPropagation();

    if (isSystem) {
      const updatedHidden = [...hiddenIds, charId];
      localStorage.setItem('hidden_system_characters', JSON.stringify(updatedHidden));
      setHiddenIds(updatedHidden);
    } else {
      localStorage.removeItem(`portrait-${charId}`);
      localStorage.removeItem(`lore-${charId}`);

      const custom = localStorage.getItem('custom_characters');
      if (custom) {
        try {
          const parsed: DBCharacter[] = JSON.parse(custom);
          const filtered = parsed.filter(c => c.id !== charId);
          localStorage.setItem('custom_characters', JSON.stringify(filtered));
          setCharacters([...mockCharacters, ...filtered]);
        } catch (err) {
          console.error(err);
        }
      }
    }
  };

  const handleRestoreDefaults = () => {
    localStorage.removeItem('hidden_system_characters');
    setHiddenIds([]);
  };

  // 숨김 처리된 아이디를 제외하고 필터링
  const visibleCharacters = characters.filter(c => !hiddenIds.includes(c.id));

  const getCardTheme = (id: string) => {
    // Return standard minimalist theme for all
    return {
      bg: 'bg-white',
      border: 'border-[#E2E8F0]',
      hoverBorder: 'hover:border-gray-400',
      text: 'text-[#0F172A]',
      accent: 'bg-[#F1F5F9] text-[#475569]',
      textDark: 'text-[#0F172A]',
      overlayGradient: 'bg-gradient-to-t from-gray-900/90 via-gray-900/40 to-transparent',
      textLight: 'text-white', // For text overlapping images
      cover: id === 'intro-world-1' 
        ? 'https://image.pollinations.ai/prompt/cozy%20anime%20tea%20house%20in%20deep%20mystical%20forest%2C%20warm%20lanterns%2C%20misty%20atmosphere%2C%20beautiful%20detailed%20art?width=400&height=600&nologo=true'
        : 'https://image.pollinations.ai/prompt/beautiful%20minimalist%20landscape%2C%20soft%20monochrome%20or%20muted%20lighting%2C%20serene%20atmosphere?width=400&height=600&nologo=true',
      tags: id === 'intro-world-1' ? ['#신비로운찻집', '#두사람의이야기'] : ['#나의창작', '#시나리오']
    };
  };

  return (
    <div className="flex-1 w-full max-w-[1100px] mx-auto p-4 md:p-8 overflow-y-auto bg-white h-full flex flex-col">
      
      {/* 캐릭터 그리드 섹션 */}
      <div className="mb-4 mt-2 flex justify-between items-center shrink-0">
        <h2 className="text-sm font-bold text-[#0F172A] tracking-tight flex items-center gap-1.5">
          <Library size={16} className="text-[#0F172A]" /> 
          내 스토리
        </h2>
        {hiddenIds.length > 0 && (
          <button 
            type="button"
            onClick={handleRestoreDefaults}
            className="text-[10px] text-[#64748B] bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] font-medium px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            기본 인물({hiddenIds.length}개) 복구
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-12">
        {visibleCharacters.map(char => {
          const customPortrait = localStorage.getItem(`portrait-${char.id}`);
          const isSystem = char.creator_id !== 'user';
          const theme = getCardTheme(char.id);

          return (
            <div 
              key={char.id}
              onClick={() => onSelect(char)}
              className={`${theme.bg} border ${theme.border} ${theme.hoverBorder} rounded-2xl cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group flex flex-col h-[380px] relative overflow-hidden`}
            >
              {/* Full Bleed Image Layer */}
              <div className="absolute inset-0 w-full h-full z-0 overflow-hidden">
                <img 
                  src={customPortrait || theme.cover} 
                  alt={char.name} 
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
                  referrerPolicy="no-referrer"
                />
                <div className={`absolute inset-0 z-10 ${theme.overlayGradient}`} />
              </div>

              {/* Top Right: Deletion Button */}
              <button
                id={`delete-btn-${char.id}`}
                type="button"
                onClick={(e) => handleDeleteCharacter(e, char.id, isSystem)}
                className="absolute right-4 top-4 p-1.5 rounded-lg text-white hover:text-red-400 bg-black/20 backdrop-blur-md hover:bg-black/40 transition-colors z-30 cursor-pointer"
                title={isSystem ? "이 기본 인물 숨기기" : "내가 만든 인물 복구 불가하게 삭제"}
              >
                <Trash2 size={14} />
              </button>

              {/* Bottom Card content */}
              <div className="absolute bottom-0 left-0 w-full p-5 z-25 flex flex-col text-left justify-end">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md text-white bg-white/20 backdrop-blur-sm border border-white/20`}>
                      {isSystem ? "오리지널 월드" : "나의 창작 스토리"}
                    </span>
                  </div>
                  
                  {/* Settings Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(char);
                    }}
                    className="bg-white/90 hover:bg-white text-black text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all shadow-lg hover:scale-105 active:scale-95 cursor-pointer flex items-center gap-1"
                  >
                    설정 ⚙️
                  </button>
                </div>

                <h3 className={`font-bold tracking-tight text-lg mb-0.5 ` + theme.textLight}>
                  {char.name}
                </h3>

                <p className="text-[10px] text-gray-200 font-medium line-clamp-1 mb-2">
                  {char.description}
                </p>

                <div className="flex flex-wrap gap-1 mt-1 pb-2.5 border-b border-white/10">
                  {theme.tags.map((tag, tIdx) => (
                    <span key={tIdx} className="text-[9px] font-medium bg-black/30 text-gray-200 px-2 py-0.5 rounded-md backdrop-blur-sm">
                      {tag}
                    </span>
                  ))}
                </div>

                <p className="text-[10px] text-gray-300 line-clamp-1 mt-2 mb-0 italic opacity-80">
                  "{char.greeting_message}"
                </p>
              </div>
            </div>
          );
        })}
        
        {/* 새로운 세계관 창조 파티션 인스턴스 */}
        <div 
          onClick={onCreateStart}
          className="bg-[#F8FAFC] border-2 border-dashed border-[#E2E8F0] hover:border-gray-400 rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-white transition-colors duration-300 h-[380px] group"
        >
          <div className="w-12 h-12 rounded-full bg-white border border-[#E2E8F0] flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 shadow-sm">
            <Plus size={24} className="text-[#0F172A]" />
          </div>
          <span className="font-bold text-sm text-[#0F172A]">새로운 스토리 생성</span>
          <span className="text-xs text-[#94A3B8] mt-2 max-w-[200px] text-center leading-relaxed">
            나만의 세계관, 등장인물, 설정을 새로 만들어보세요
          </span>
        </div>
      </div>
      
    </div>
  );
}
