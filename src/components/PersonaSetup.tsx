import React, { useState, useEffect } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Sparkles, ChevronDown, ChevronUp, User, Tag, Heart } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { DBCharacter } from '../types';

interface PersonaSetupProps {
  character: DBCharacter;
  onBack: () => void;
  onStart: (persona: string, isContinue?: boolean) => void;
}

export function PersonaSetup({ character, onBack, onStart }: PersonaSetupProps) {
  const [hasHistory, setHasHistory] = useState(false);
  const [sessionData, setSessionData] = useState<any>(null);
  const [portrait, setPortrait] = useState<string | null>(null);
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);

  useEffect(() => {
    // 세션 기록 불러오기
    const saved = localStorage.getItem(`chatsession-${character.id}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.messages && parsed.messages.length > 1) {
          setHasHistory(true);
          setSessionData(parsed);
        }
      } catch (e) {
        console.error(e);
      }
    }

    // 초상화 로드
    const savedPortrait = localStorage.getItem(`portrait-${character.id}`);
    if (savedPortrait) {
      setPortrait(savedPortrait);
    }
  }, [character.id]);

  // 프롬프트 명세 파서
  const parsePromptSection = (prompt: string, sectionName: string): string[] => {
    if (!prompt) return [];
    try {
      const regex = new RegExp(`\\[${sectionName}\\((.*?)\\)\\]`, 'is');
      const match = prompt.match(regex);
      if (match && match[1]) {
        const content = match[1];
        // 쉼표로 분리하되 쌍따옴표 내부의 쉼표는 스킵
        const items = content.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        return items.map(item => item.replace(/"/g, '').trim()).filter(Boolean);
      }
    } catch (e) {
      console.error(`Error parsing section ${sectionName}:`, e);
    }
    return [];
  };

  // 배경텍스트(Background) 파서
  const parseBackground = (prompt: string): string => {
    if (!prompt) return '';
    try {
      const match = prompt.match(/\[Background\((.*?)\)\]/is);
      if (match && match[1]) {
        return match[1].replace(/"/g, '').trim();
      }
    } catch (e) {
      console.error('Error parsing Background:', e);
    }
    return '';
  };

  // 외모 명세(Appearance) 파서
  const parseAppearance = (prompt: string): { label: string; value: string }[] => {
    const list: { label: string; value: string }[] = [];
    if (!prompt) return list;
    try {
      const match = prompt.match(/\[Appearance\((.*?)\)\]/is);
      if (match && match[1]) {
        const content = match[1];
        const subParts = content.match(/(\w+)\((.*?)\)/g);
        if (subParts) {
          subParts.forEach(part => {
            const keyMatch = part.match(/^(\w+)/);
            const valMatch = part.match(/\((.*?)\)/);
            if (keyMatch && valMatch) {
              const key = keyMatch[1];
              const val = valMatch[1].replace(/"/g, '').replace(/,/g, ', ');
              const labelMap: Record<string, string> = {
                hair: '머리 모양',
                eyes: '눈무리 / 눈빛',
                skin: '피부',
                attire: '의상 / 소품',
                body: '신체 특징'
              };
              list.push({
                label: labelMap[key] || key,
                value: val
              });
            }
          });
        }
      }
    } catch (e) {
      console.error('Error parsing Appearance:', e);
    }
    return list;
  };

  // 가치관 및 금기(Mind) 파서
  const parseMind = (prompt: string): { label: string; value: string }[] => {
    const list: { label: string; value: string }[] = [];
    if (!prompt) return list;
    try {
      const match = prompt.match(/\[Mind\((.*?)\)\]/is);
      if (match && match[1]) {
        const content = match[1];
        const subParts = content.match(/(\w+)\("?(.*?)"?\)/g);
        if (subParts) {
          subParts.forEach(part => {
            const keyMatch = part.match(/^(\w+)/);
            const valMatch = part.match(/\("?(.*?)"?\)/);
            if (keyMatch && valMatch) {
              const key = keyMatch[1];
              const val = valMatch[1].replace(/"/g, '');
              const labelMap: Record<string, string> = {
                가치관: '핵심 가치관',
                금기: '피해야 할 금기사항'
              };
              list.push({
                label: labelMap[key] || key,
                value: val
              });
            }
          });
        }
      }
    } catch (e) {
      console.error('Error parsing Mind:', e);
    }
    return list;
  };

  // 각 파트 추출
  const systemPrompt = character.system_prompt || '';
  const parsedRoles = parsePromptSection(systemPrompt, 'Role');
  const parsedPersonalities = parsePromptSection(systemPrompt, 'Personality');
  const parsedBackground = parseBackground(systemPrompt) || character.description;
  const parsedAppearanceList = parseAppearance(systemPrompt);
  const parsedMindList = parseMind(systemPrompt);

  const introText = character.greeting_message?.startsWith('[AUTO_START_INTRO]')
    ? character.greeting_message.replace('[AUTO_START_INTRO]', '').trim()
    : character.greeting_message;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }} 
      animate={{ opacity: 1, y: 0 }} 
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="flex flex-col items-center justify-start w-full h-full bg-[#FAF9F5] px-4 py-8 md:p-10 overflow-y-auto"
    >
      <div className="w-full max-w-3xl bg-white rounded-[32px] border border-[#EBE6DB] overflow-hidden shadow-xs relative flex flex-col">
        
        {/* 상단 파스텔 피치 데코 바 */}
        <div className="h-2.5 w-full bg-gradient-to-r from-[#FADCD9] via-[#FCEAE6] to-[#E9ECF5]" />
        
        <div className="p-6 md:p-10 flex flex-col">
          
          {/* 뒤로가기 버튼 */}
          <button 
            type="button"
            onClick={onBack} 
            className="group text-[#8A7968] hover:text-[#524538] transition-all mb-8 flex items-center gap-1.5 text-xs font-bold bg-[#F8F7F2] border border-[#EFECE4] px-4 py-2 rounded-xl w-fit cursor-pointer hover:bg-[#EFECE4] active:scale-95"
          >
            <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" /> 목록으로 돌아가기
          </button>

          {/* 메인 2열 그리드 배치로 공간을 시원시원하게 활용 */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
            
            {/* 왼쪽 열 - 인물 기본 카드 프로필 (4/12) */}
            <div className="md:col-span-4 flex flex-col items-center text-center">
              
              {/* 이미지 프레임 */}
              <div className="w-36 h-48 md:w-full md:aspect-[3/4] rounded-2xl overflow-hidden bg-[#FAF6F0] border border-[#EBE6DB] shadow-xs flex flex-col items-center justify-center relative group p-1.5 shrink-0">
                {portrait ? (
                  <img 
                    src={portrait} 
                    alt={character.name} 
                    className="w-full h-full object-cover rounded-xl transition-all group-hover:scale-102"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-[#F6F5F2] text-[#8C8476] rounded-xl border border-dashed border-[#E3DEC9]">
                    <BookOpen size={36} className="text-[#B9B0A2] stroke-[1.5]" />
                    <span className="text-[11px] font-bold text-[#A69E91]">도서 이야기 카드</span>
                  </div>
                )}
                <div className="absolute top-3 right-3 bg-white/95 backdrop-blur-xs w-6 h-6 rounded-full flex items-center justify-center text-rose-300 border border-[#EBE6DB] shadow-xs">
                  <Heart size={11} className="fill-current" />
                </div>
              </div>

              {/* 기본 설명 이름 */}
              <div className="mt-4 w-full">
                <span className="inline-block bg-[#FAF3EF] text-[#A36C5A] text-[10px] font-bold px-2.5 py-1 rounded-md border border-[#F6EBE5] mb-2">
                  스토리 세계관
                </span>
                <h2 className="text-xl font-extrabold text-[#0F172A] leading-tight tracking-tight">
                  {character.name}
                </h2>
                <p className="text-xs text-[#8A847C] font-semibold mt-1 px-2 line-clamp-2">
                  {character.description}
                </p>
              </div>

            </div>

            {/* 오른쪽 열 - 상세 설정 카드 묶음 (8/12) */}
            <div className="md:col-span-8 flex flex-col gap-5 w-full">
              
              {/* 1. 배경 설명 카드 (연한 파스텔 올리브/베이지) */}
              <div className="bg-[#FAF7F2] border border-[#ECE7DA] rounded-2xl p-5 shadow-xs">
                <h4 className="text-xs font-black text-[#8A7968] flex items-center gap-1.5 mb-2 select-none">
                  <Sparkles size={13} className="text-[#C2A385]" /> 배경 세계관 설명
                </h4>
                <p className="text-xs md:text-[13px] text-[#4C4C54] leading-relaxed font-medium whitespace-pre-wrap">
                  {parsedBackground}
                </p>
              </div>

              {/* 2. 주 인물 명세 카드 (연한 라벤더) */}
              <div className="bg-[#F8F6FD] border border-[#EDE7F4] rounded-2xl p-5 shadow-xs">
                <h4 className="text-xs font-black text-[#7D6B90] flex items-center gap-1.5 mb-3 select-none">
                  <User size={13} className="text-[#A291B8]" /> 캐릭터 정체성 설정
                </h4>
                
                <div className="flex flex-col gap-3">
                  {/* 역할 태그 목록 */}
                  <div>
                    <span className="text-[11px] font-bold text-[#9682AC] block mb-1.5">대표 역할</span>
                    <div className="flex flex-wrap gap-1.5">
                      {parsedRoles.length > 0 ? (
                        parsedRoles.map((role, idx) => (
                          <span key={idx} className="bg-[#FFFFFF]/90 text-[11px] text-[#634E7C] border border-[#EAE1F5] px-2.5 py-1 rounded-lg font-bold">
                            🎭 {role}
                          </span>
                        ))
                      ) : (
                        <span className="bg-[#FFFFFF]/90 text-[11px] text-gray-500 border border-[#E9ECEF] px-2.5 py-1 rounded-lg font-bold">
                          일반 출연 인물
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 성격 유형 태그 목록 */}
                  <div className="mt-1">
                    <span className="text-[11px] font-bold text-[#9682AC] block mb-1.5">성향 및 특징</span>
                    <div className="flex flex-wrap gap-1.5">
                      {parsedPersonalities.length > 0 ? (
                        parsedPersonalities.map((item, idx) => (
                          <span key={idx} className="bg-[#FFFFFF]/90 text-[11px] text-[#557F60] border border-[#DDF0E2] px-2.5 py-1 rounded-lg font-bold">
                            🌱 {item}
                          </span>
                        ))
                      ) : (
                        <span className="bg-[#FFFFFF]/90 text-[11px] text-gray-500 border border-[#E9ECEF] px-2.5 py-1 rounded-lg font-semibold">
                          유형 미분류
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. 명세 분석 디테일 (가치관 / 외양 정보 있을때만 출력) */}
              {(parsedAppearanceList.length > 0 || parsedMindList.length > 0) && (
                <div className="bg-[#F4F8FA] border border-[#E4EEF2] rounded-2xl p-5 shadow-xs grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {parsedAppearanceList.length > 0 && (
                    <div className="flex flex-col">
                      <span className="text-[11px] font-bold text-[#4B7993] mb-1.5 select-none">✨ 외양 묘사 정보</span>
                      <div className="space-y-1.5 text-[11px] text-[#4C535C] font-semibold bg-[#FFFFFF]/70 p-3 rounded-xl border border-[#E2EFF5]">
                        {parsedAppearanceList.map((app, idx) => (
                          <div key={idx} className="flex justify-between border-b border-[#F0F6FA] last:border-0 pb-1 last:pb-0">
                            <span className="text-[#6EA8C7]">{app.label}</span>
                            <span className="text-right truncate max-w-[120px]" title={app.value}>{app.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {parsedMindList.length > 0 && (
                    <div className="flex flex-col">
                      <span className="text-[11px] font-bold text-[#4B7993] mb-1.5 select-none">🔮 심리 헌법 정보</span>
                      <div className="space-y-1.5 text-[11px] text-[#4C535C] font-semibold bg-[#FFFFFF]/70 p-3 rounded-xl border border-[#E2EFF5]">
                        {parsedMindList.map((mind, idx) => (
                          <div key={idx} className="flex flex-col gap-0.5 pb-1 border-b border-[#F0F6FA] last:border-0 last:pb-0">
                            <span className="text-[#6EA8C7] text-[9.5px] font-bold">{mind.label}</span>
                            <span className="text-[10px] text-[#555C66] line-clamp-1" title={mind.value}>{mind.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 4. 감성 프롤로그 인트로 (연한 피치/살구빛 분위기 있는 인용구 스타일) */}
              {introText && (
                <div className="bg-[#FFF5F2] border border-[#FFE1D8] rounded-2xl p-5 shadow-xs relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-[#FFE8E1] rounded-full filter blur-xl opacity-40 translate-x-6 -translate-y-6" />
                  
                  <h4 className="text-xs font-black text-[#B05C43] flex items-center gap-1.5 mb-2.5 select-none relative z-10">
                    <BookOpen size={13} className="text-[#CFA496]" /> 이야기의 서두
                  </h4>
                  <div className="relative z-10 text-xs md:text-[13px] text-[#6E493E] font-medium leading-relaxed italic bg-white/50 p-4 rounded-xl border border-[#FFE7DF]">
                    {introText}
                  </div>
                </div>
              )}

            </div>

          </div>

          {/* Collapsible 전체 시스템 프롬프트 명세 (깔끔한 접이식 아코디언 제공) */}
          <div className="mt-8 border-t border-[#F2ECE0] pt-6 flex flex-col w-full">
            <button
              type="button"
              onClick={() => setIsPromptExpanded(!isPromptExpanded)}
              className="flex items-center justify-between text-[#8A7968] hover:text-[#524538] text-xs font-bold bg-[#FBF9F6] border border-[#EFECE4] px-4 py-3 rounded-xl w-full cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2">
                <Tag size={13} className="text-[#B5A593]" />
                <span>스토리 엔진의 세부 지시 명세 (시스템 프롬프트 원문 보기)</span>
              </div>
              {isPromptExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            <AnimatePresence>
              {isPromptExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 p-4 bg-[#FAF9F5] border border-[#EBE6DB] rounded-xl text-[11px] font-mono whitespace-pre-wrap text-[#6B655B] leading-relaxed max-h-[250px] overflow-y-auto">
                    {systemPrompt}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 이전 기록 안내 배너 */}
          {hasHistory && (
            <div className="mt-8 bg-[#FEF9E6] border border-[#FBE6B5] p-3.5 rounded-2xl flex items-center gap-2 text-xs text-[#8A6723] font-bold shadow-2xs select-none">
              <span className="text-base">💡</span>
              <div>
                이 캐릭터와 나눈 대화가 남아있습니다. 바로 <span className="underline decoration-wavy decoration-[#D9A341]">이야기를 이어서</span> 플레이할 수 있습니다.
              </div>
            </div>
          )}

          {/* 하단 제어 액션 영역 */}
          <div className="mt-8 pt-6 border-t border-[#F2ECE0] flex flex-col sm:flex-row gap-3 sm:justify-end w-full">
            
            {hasHistory && (
              <button
                type="button"
                onClick={() => {
                  if (confirm("정말로 새로운 이야기로 시작하시겠습니까?\n처음부터 다시 시작하면 이전의 대화 기록과 서사 흐름은 모두 삭제됩니다.")) {
                    localStorage.removeItem(`chatsession-${character.id}`);
                    onStart('내 캐릭터', false);
                  }
                }}
                className="flex items-center justify-center gap-1.5 bg-[#FAF4F5] text-[#9F5A66] border border-[#FFE1E6] px-5 py-3.5 rounded-xl font-bold text-xs hover:bg-[#FFE1E6] hover:text-[#7A3E48] transition-all cursor-pointer active:scale-95"
              >
                처음부터 새로 시작
              </button>
            )}

            <button
              type="button"
              onClick={() => onStart('내 캐릭터', hasHistory)}
              className="flex items-center justify-center gap-2 bg-[#0F172A] hover:bg-[#1E293B] text-white px-8 py-3.5 rounded-xl font-black text-xs shadow-xs hover:shadow-md transition-all transform hover:-translate-y-0.5 active:scale-95 cursor-pointer"
            >
              {hasHistory ? '이야기 이어나가기' : '모험 시작하기'} <ArrowRight size={14} />
            </button>

          </div>

        </div>

      </div>
      <div className="h-10 shrink-0" />
    </motion.div>
  );
}
