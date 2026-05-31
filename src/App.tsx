/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CharacterList } from './components/CharacterList';
import { ChatRoom } from './components/ChatRoom';
import { CharacterCreator } from './components/CharacterCreator';
import { ApiKeyManager } from './components/ApiKeyManager';
import { signInAsGuest } from './lib/supabase/auth';
import { createChatSession } from './lib/supabase/db';
import type { DBCharacter, NarrativeSnapshot } from './types';

type ViewState = 'character_list' | 'chat' | 'character_creator' | 'social_feed';

export default function App() {
  const [view, setView] = useState<ViewState>('character_list');
  const [selectedCharacter, setSelectedCharacter] = useState<DBCharacter | null>(null);
  const [userPersona, setUserPersona] = useState<string>('');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(true);

  // Api Key Config States
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [userApiKey, setUserApiKey] = useState(() => localStorage.getItem('gemini_user_api_key') || '');
  const [userModel, setUserModel] = useState(() => localStorage.getItem('gemini_user_model') || 'gemini-3.5-flash');
  const [tempModel, setTempModel] = useState('');
  const [tempApiKey, setTempApiKey] = useState('');

  // Branched snapshot injection states
  const [initialMessages, setInitialMessages] = useState<any[] | undefined>(undefined);
  const [initialNarrativeState, setInitialNarrativeState] = useState<string>('');
  const [initialLocation, setInitialLocation] = useState<string>('');
  const [initialPlotSummary, setInitialPlotSummary] = useState<string>('');

  useEffect(() => {
    setTempApiKey(userApiKey);
    setTempModel(userModel);
  }, [userApiKey]);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const user = await signInAsGuest();
        if (user) {
          console.log('Guest Auth Success:', user.id);
          setCurrentUser(user);
        }
      } catch (err) {
        console.error('Auth initialization failed:', err);
      } finally {
        setIsAuthenticating(false);
      }
    };
    initAuth();
  }, []);

  const handleSelectCharacter = async (character: DBCharacter) => {
    setSelectedCharacter(character);
    
    // Check if there's an existing session in local storage
    const saved = localStorage.getItem(`chatsession-${character.id}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // If we have a persona and messages, go straight to chat
        if (parsed && parsed.userPersona) {
          setUserPersona(parsed.userPersona);
          if (currentUser) {
            if (parsed.messages) setInitialMessages(parsed.messages);
            setInitialNarrativeState(parsed.narrativeState || '');
            setInitialLocation(parsed.currentLocation || '');
            setInitialPlotSummary(parsed.plotSummary || '');

            const sessionId = await createChatSession(currentUser.id, character.id, parsed.userPersona);
            setChatSessionId(sessionId);
          }
          setView('chat');
          return;
        }
      } catch (err) {
        console.error("Failed to parse existing chat session", err);
      }
    }
    
    // No existing session, set default persona and jump straight to chat
    const defaultPersona = "여행자";
    setUserPersona(defaultPersona);
    if (currentUser) {
      const sessionId = await createChatSession(currentUser.id, character.id, defaultPersona);
      setChatSessionId(sessionId);
    }
    setView('chat');
  };

  const handleEditCharacter = (character: DBCharacter) => {
    setSelectedCharacter(character);
    setView('character_creator');
  };

  const handleStartChat = async (persona: string, isContinue?: boolean) => {
    setUserPersona(persona);
    if (currentUser && selectedCharacter) {
      if (isContinue) {
        const saved = localStorage.getItem(`chatsession-${selectedCharacter.id}`);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (parsed) {
              if (parsed.messages) setInitialMessages(parsed.messages);
              if (parsed.narrativeState) setInitialNarrativeState(parsed.narrativeState);
              if (parsed.currentLocation) setInitialLocation(parsed.currentLocation);
              if (parsed.plotSummary) setInitialPlotSummary(parsed.plotSummary);
            }
          } catch (err) {
            console.error(err);
          }
        }
      } else {
        // Not continue, make sure we erase previous
        setInitialMessages(undefined);
        setInitialNarrativeState('');
        setInitialLocation('');
        setInitialPlotSummary('');
      }

      const sessionId = await createChatSession(currentUser.id, selectedCharacter.id, persona);
      setChatSessionId(sessionId);
    }
    setView('chat');
  };

  const handleExit = () => {
    setView('character_list');
    setSelectedCharacter(null);
    setUserPersona('');
    setChatSessionId(null);
    setInitialMessages(undefined);
    setInitialNarrativeState('');
    setInitialLocation('');
    setInitialPlotSummary('');
  };

  const handleSaveApiKey = () => {
    const trimmed = tempApiKey.trim();
    if (trimmed) {
      localStorage.setItem('gemini_user_api_key', trimmed);
      setUserApiKey(trimmed);
    } else {
      localStorage.removeItem('gemini_user_api_key');
      setUserApiKey('');
    }
    
    if (tempModel) {
      localStorage.setItem('gemini_user_model', tempModel);
      setUserModel(tempModel);
    }
    
    setIsApiKeyModalOpen(false);
  };

  const handleBranchPlay = (snapshot: NarrativeSnapshot) => {
    // 뼈대 캐릭터 가져오기
    const characterPreset: DBCharacter = {
      id: snapshot.character_id,
      creator_id: 'system',
      name: snapshot.character_name,
      description: `${snapshot.character_name} 설정을 계승한 새로운 이야기`,
      system_prompt: `[Character("${snapshot.character_name}")]\n[Original_Author("${snapshot.creator_name}")]`,
      greeting_message: snapshot.messages[0]?.text || '',
      is_public: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      original_creator_name: snapshot.creator_name || '원작자 불명'
    };

    setSelectedCharacter(characterPreset);
    setUserPersona(snapshot.user_persona || '익명의 추적자');
    setInitialMessages(snapshot.messages);
    setInitialNarrativeState(snapshot.narrative_state);
    setInitialLocation(snapshot.current_location);
    setInitialPlotSummary(snapshot.summary);
    setView('chat');
  };

  const handleSaveCustomCharacter = (newChar: DBCharacter) => {
    const existing = localStorage.getItem('custom_characters');
    let customList: DBCharacter[] = [];
    if (existing) {
      try {
        customList = JSON.parse(existing);
      } catch (e) {
        console.error(e);
      }
    }
    
    const index = customList.findIndex(c => c.id === newChar.id);
    if (index >= 0) {
      customList[index] = newChar;
    } else {
      customList.push(newChar);
    }
    
    localStorage.setItem('custom_characters', JSON.stringify(customList));
    setSelectedCharacter(null);
    setView('character_list');
  };

  return (
    <div className="min-h-screen bg-[#FAF9F5] flex flex-col items-center justify-start p-0 md:p-8 font-sans text-[#333] overflow-hidden">
      <div className="w-full max-w-[1024px] bg-white shadow-sm md:shadow-md md:rounded-2xl overflow-hidden flex flex-col h-[100dvh] md:h-[88vh] border-0 md:border border-[#EBE6DB] relative">
        
        {/* Header (Clean Minimalist Tone) */}
        {view !== 'chat' && (
          <header className={`h-14 shrink-0 border-b border-[#EBE6DB] bg-white flex items-center justify-between px-6 z-20`}>
            <div className="flex items-center gap-3">
              <button 
                onClick={handleExit}
                className="w-8 h-8 hover:bg-gray-100 rounded-lg flex items-center justify-center text-[#4C4C54] transition-colors cursor-pointer"
                title="대시보드로 가기 (홈)"
              >
                <Sparkles size={16} />
              </button>
              <h1 
                className="text-[#0F172A] text-base font-bold tracking-tight cursor-pointer hover:opacity-80 select-none"
                onClick={handleExit}
              >
                소설 속 레시피 <span className="text-gray-300 font-normal mx-2 inline-block">|</span> <span className="text-[#5A5A61] font-medium">동화 극장</span>
              </h1>
            </div>

            <div className="flex items-center gap-3">
              {/* API Key Modal Button */}
              <button
                onClick={() => {
                  setTempApiKey(localStorage.getItem('gemini_user_api_key') || '');
                  setTempModel(localStorage.getItem('gemini_user_model') || 'gemini-3.5-flash');
                  setIsApiKeyModalOpen(true);
                }}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#ECE9E0] text-[#5A5A61] border border-[#EBE6DB] hover:bg-gray-100 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${userApiKey ? 'bg-green-500' : 'bg-gray-300'}`}></span>
                {userApiKey ? "개인 API 키 적용됨" : "나만의 API 키 설정"}
              </button>

              {/* Back Button (이전버튼) - If not on dashboard */}
              {view !== 'character_list' && (
                <button
                  onClick={handleExit}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white text-[#4C4C54] border border-[#EBE6DB] hover:bg-[#ECE9E0] transition-colors flex items-center gap-1 cursor-pointer"
                >
                  ← 리스트로 복귀
                </button>
              )}

              <div className="hidden md:flex flex-col items-end border-l border-[#EBE6DB] pl-4 ml-1">
                <span className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold mb-0.5">감성 이야기 엔진</span>
                <span className="text-xs font-bold text-[#4C4C54]">따뜻한 동행</span>
              </div>
            </div>
          </header>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-hidden flex flex-col relative w-full h-full bg-white">
          <AnimatePresence mode="wait">
            {isAuthenticating && view === 'character_list' ? (
              <motion.div 
                key="loading-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col items-center justify-center"
              >
                <div className="w-10 h-10 rounded-xl bg-[#ECE9E0] text-gray-400 flex items-center justify-center animate-spin border border-[#EBE6DB]">
                  <Sparkles size={18} />
                </div>
                <p className="mt-4 text-gray-400 text-xs font-semibold uppercase tracking-widest animate-pulse">로딩 중...</p>
              </motion.div>
            ) : view === 'character_list' ? (
              <motion.div 
                key="character-list-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col h-full overflow-hidden"
              >
                <CharacterList 
                  onSelect={handleSelectCharacter} 
                  onEdit={handleEditCharacter}
                  onCreateStart={() => {
                    setSelectedCharacter(null);
                    setView('character_creator');
                  }}
                />
              </motion.div>
            ) : view === 'character_creator' ? (
              <motion.div 
                key="character-creator-view"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex-1 flex flex-col h-full overflow-hidden"
              >
                <CharacterCreator 
                  onBack={() => {
                    setSelectedCharacter(null);
                    setView('character_list');
                  }}
                  onSave={handleSaveCustomCharacter}
                  editCharacter={selectedCharacter || undefined}
                />
              </motion.div>
            ) : view === 'chat' && selectedCharacter ? (
              <motion.div 
                key="chat-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col h-full overflow-hidden"
              >
                <ChatRoom
                  character={selectedCharacter}
                  userPersona={userPersona}
                  onExit={handleExit}
                  initialMessages={initialMessages}
                  initialNarrativeState={initialNarrativeState}
                  initialLocation={initialLocation}
                  initialPlotSummary={initialPlotSummary}
                  onOpenApiKeySettings={() => setIsApiKeyModalOpen(true)}
                  isApiKeyConfigured={!!userApiKey}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {/* Beautiful Minimalist API Key Config Modal */}
        <AnimatePresence>
          {isApiKeyModalOpen && (
            <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="w-full max-w-md bg-white border border-[#EBE6DB] rounded-2xl p-6 shadow-xl flex flex-col relative"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 bg-[#ECE9E0] rounded-lg flex items-center justify-center text-[#4C4C54] border border-[#EBE6DB]">
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-[#0F172A]">나만의 Gemini API 키 등록</h2>
                    <p className="text-[10px] text-[#5A5A61] font-medium mt-0.5">서버 측에서 암호학적 임시 교환 처리가 수반됩니다.</p>
                  </div>
                </div>

                <div className="space-y-4 mb-5">
                  <div className="text-xs text-[#5A5A61] leading-relaxed bg-[#FAF9F5] p-3.5 rounded-xl border border-[#EBE6DB] flex gap-3">
                    <div className="shrink-0 w-5 h-5 bg-[#96A7C1]/10 rounded-full flex items-center justify-center text-[#96A7C1] mt-0.5">
                      <Sparkles size={10} />
                    </div>
                    <p>
                      안전한 추론 인프라를 위해 개인 Gemini API 키를 등록하세요. 
                      여러 개 등록 시 <span className="text-[#96A7C1] font-bold">할당량이 소진되면 자동으로 다음 키로 전환</span>됩니다. 
                      데이터는 로컬에만 보관됩니다.
                    </p>
                  </div>

                  <ApiKeyManager apiKeys={tempApiKey} onUpdate={setTempApiKey} />

                  <div className="pt-2 border-t border-[#F1F0EC]">
                    <label className="text-[10px] font-semibold text-[#5A5A61] uppercase tracking-wider block mb-1.5">선호하는 AI 엔진</label>
                    <div className="relative">
                      <select
                        value={tempModel}
                        onChange={(e) => setTempModel(e.target.value)}
                        className="w-full px-4 py-2.5 bg-[#FAF9F5] border border-[#EBE6DB] rounded-xl text-xs font-bold outline-none focus:border-[#96A7C1] focus:ring-1 focus:ring-[#96A7C1] transition-all appearance-none cursor-pointer text-[#4C4C54]"
                      >
                        <option value="gemini-3.5-flash">Gemini 3.5 Flash (플래시 - 응답속도 최적)</option>
                        <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite (플래시 라이트 - 초고속)</option>
                        <option value="gemini-3.1-pro">Gemini 3.1 Pro (프로 - 강력한 서사 인지능력)</option>
                      </select>
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none text-[#A69E93]">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setIsApiKeyModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-white border border-[#EBE6DB] hover:bg-[#FAF9F5] text-[#5A5A61] transition-colors cursor-pointer"
                  >
                    닫기
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveApiKey}
                    className="px-6 py-2 rounded-xl text-xs font-bold bg-[#96A7C1] hover:bg-[#8596B0] text-white transition-colors cursor-pointer shadow-sm"
                  >
                    설정 저장
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}

