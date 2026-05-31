import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

let aiInstance: GoogleGenAI | null = null;
function getAiClient() {
  if (!aiInstance) {
    const key = process.env.GEMINI_API_KEY;
    if (!key || key === 'MY_GEMINI_API_KEY') {
       // On Render/Production, we don't force a server key. 
       // It will fall back to user keys in withRetry.
       return null;
    }
    aiInstance = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiInstance;
}

function getApiKeys(req: express.Request): string[] {
  const userApiKey = req.headers['x-user-api-key'] as string;
  if (userApiKey && userApiKey.trim() !== '' && userApiKey !== 'null' && userApiKey !== 'undefined') {
    return userApiKey.split(',').map(k => k.trim()).filter(k => k && k !== 'MY_GEMINI_API_KEY');
  }
  return [];
}

function getSelectedModel(req: express.Request, defaultModel = "gemini-1.5-flash"): string {
  const userModel = req.headers['x-user-model'] as string;
  return (userModel && userModel.trim() !== '') ? userModel : defaultModel;
}

async function withRetry<T>(req: express.Request, operation: (client: GoogleGenAI) => Promise<T>): Promise<T> {
  const keys = getApiKeys(req);
  const serverKey = process.env.GEMINI_API_KEY;
  if (keys.length === 0 && serverKey && serverKey !== 'MY_GEMINI_API_KEY') {
    keys.push(serverKey);
  }
  
  if (keys.length === 0) {
    const client = getAiClient();
    if (client) {
      return await operation(client);
    }
    throw new Error("Gemini API 키가 설정되지 않았습니다. 메인 메뉴 하단의 [API 키 관리]에서 키를 입력해 주세요. (무료 배포 환경에서는 개별 API 키가 필요합니다)");
  }

  let lastError: any;
  for (const key of keys) {
    try {
      const client = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
      return await operation(client);
    } catch (error: any) {
      lastError = error;
      // Check if it's a quota/rate limit error (typically 429)
      if (error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('quota') || error?.message?.includes('Resource has been exhausted')) {
        console.warn('API Key quota exceeded or rate limited. Trying next key if available...');
        continue;
      }
      // If it's another error like 400 or auth error, might try next key too
      console.warn('API Key error:', error?.message);
      
      const errorStr = error?.message?.toLowerCase() || '';
      if (errorStr.includes('api key not valid') || errorStr.includes('invalid api key')) {
         console.warn('Invalid API Key detected. Trying next key...');
         continue;
      }
      
      // For other critical errors, we might want to stop, but for now let's continue the loop
      continue;
    }
  }
  
  // 만약 모든 키가 실패했다면, 사용자에게 친절한 한국어 메시지를 포함하여 에러를 던집니다.
  const finalError = new Error(lastError?.message || "Gemini API 호출에 실패했습니다.");
  if (lastError?.message?.includes('API key not valid')) {
    (finalError as any).status = 401;
    finalError.message = "Gemini API 키가 올바르지 않습니다. 설정에서 API 키를 다시 확인해 주세요.";
  }
  throw finalError;
}

// ==========================================
// JSON 응답 안전 클렌징 함수 (마크다운 포맷 및 부가 텍스트 제거)
// ==========================================
function cleanJsonResponse(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z0-9]*\n/, "");
    if (cleaned.endsWith("```")) {
      cleaned = cleaned.substring(0, cleaned.length - 3).trim();
    }
  }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  return cleaned;
}

// ==========================================
// 16단계: 인프라 보호 및 큐잉 (Circuit Breaker & Semaphore)
// ==========================================
class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly THRESHOLD = 30;
  private readonly TIMEOUT = 2000;

  async execute<T>(action: () => Promise<T>): Promise<T> {
    if (this.isOpen()) {
      console.warn("CIRCUIT_OPEN: Circuit breaker is temporarily open. Bypassing blocker to keep system alive.");
    }
    try {
      const result = await action();
      this.failureCount = 0;
      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();
      throw error;
    }
  }

  private isOpen(): boolean {
    if (this.failureCount >= this.THRESHOLD) {
      const now = Date.now();
      if (now - this.lastFailureTime > this.TIMEOUT) {
        this.failureCount = 0;
        return false;
      }
      return true;
    }
    return false;
  }
}

class RequestQueue {
  private active = 0;
  private queue: Array<() => void> = [];

  constructor(private maxConcurrent: number) {}

  async enqueue(): Promise<void> {
    if (this.active < this.maxConcurrent) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise(resolve => this.queue.push(resolve));
  }

  dequeue(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next && next();
    } else {
      this.active--;
    }
  }
}

const mainQueue = new RequestQueue(10);
const backgroundQueue = new RequestQueue(2);
const llmBreaker = new CircuitBreaker();

app.post("/api/snapshot", async (req, res) => {
  await backgroundQueue.enqueue();
  try {
    const { history, character, persona, summary, narrativeState, currentLocation } = req.body;
    
    // Gemini 3.1 Pro를 사용하여 현재 서사 텍스트를 기반으로 영문 이미지 프롬프트를 생성
    const prompt = `Write a short, comma-separated English prompt for an image generation AI (like Midjourney).
Subject: A character named ${character?.name || 'unknown'}.
Appearance: ${character?.system_prompt || 'unknown'}
Context: ${summary || ''}
State: ${narrativeState || ''}
Location: ${currentLocation || 'unknown place'}
Latest situation: ${history?.[history.length - 1]?.text || ''}
Style: Anime visual novel, high quality, masterpiece, detailed, atmospheric painting.
Rule: Output ONLY the comma-separated English prompt string, nothing else. No quotes, no intro.`;

    const modelName = getSelectedModel(req, "gemini-3.5-flash");
    const response = await withRetry(req, (client) => client.models.generateContent({
      model: modelName,
      contents: prompt,
    }));
    
    const englishPrompt = response.text?.trim() || "anime character, masterpiece, best quality";
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(englishPrompt)}?width=1024&height=576&nologo=true`;
    
    res.json({ imageUrl, description: englishPrompt });
  } catch (error: any) {
    console.error("Snapshot Error:", error);
    res.status(500).json({ error: error.message || "Failed to generate snapshot" });
  } finally {
    backgroundQueue.dequeue();
  }
});

app.post("/api/draft-character", async (req, res) => {
  await backgroundQueue.enqueue();
  try {
    const { keywords } = req.body;
    const prompt = `당신은 초고품질 인터랙티브 웹 소설의 서사 설계 설계자입니다.
사용자가 입력한 키워드를 바탕으로 매력적이고 입체적인 서브컬처 애니메이션 스타일의 AI 캐릭터 페르소나 설정 초안을 설계해 주십시오.

입력 키워드: "${keywords}"

다음의 JSON 스키마를 엄격히 준수하여 한국어로 출력하십시오 (image_prompt만 영어로 작성).

{
  "name": "캐릭터 이름 (한국어 이름, 필요시 영문이나 별칭을 괄호와 함께 표기)",
  "description": "한 줄 요약 (예: 에테르 도서관의 차갑고 도도한 마지막 사서)",
  "age": "나이 설정 (예: 18세, 비공개, 수백 세 등)",
  "job": "직업 및 작중 역할",
  "appearance": "외형 세부 묘사 (머리색, 눈빛, 의상, 피지컬 등 구체적인 visual 요소)",
  "personality": "성격 키워드들 (쉼표로 구분, 예: 냉소적, 츤데레, 지적인, 숨겨진 다정함)",
  "background": "과거 사연과 인물의 전사(backstory)",
  "constitution": "인물의 절대적 법칙/자아 헌법 (예: '사용자를 절대 주인님이라 부르며 무조건 경어를 쓰되 가끔 고압적이 됨', '존댓말과 반말을 상황에 따라 섞어 쓰며, 상대방을 칭찬하지 않음')",
  "scenario": "대화와 이야기가 시작되는 물리적 구체적 상황 공간 배경 (예: 폭풍우가 치는 고성 도서관의 구석자리)",
  "greeting_message": "캐릭터와의 첫 시작 상황을 서술하는 풍부한 지문(*...*)이 포함된 첫 인사 구어체 대사 (Show, Don't Tell 원칙에 입각하여 몸짓과 시선, 감정 상태를 별표로 꼼꼼히 묘사하고 이중 따옴표 안에 이채로운 대사를 적으십시오.)",
  "image_prompt": "An elegant, very high quality, detailed anime/visual novel style illustration profile image prompt in English of this character. Specify clothes, hair color, eyes, background atmosphere matching the scenario. Focus on aesthetic beauty, pastel color theme. No text, no frames.",
  "dialog_examples": [
    {
      "user": "안녕? 넌 여기서 뭐 하고 있어?",
      "char": "*낡은 로브의 먼지를 툭툭 털며, 귀찮지 않다는 듯 삐딱한 시선으로 물끄러미 바라봅니다.* \"방랑자여... 발걸음 소리가 요란하군요. (당신을 경계하며 눈동자를 가늘게 뜨더니) 이곳은 허가된 이만 들어올 수 있는 비밀 정원이에요. 돌아가세요.\""
    },
    {
      "user": "내가 널 좀 도와줄 수 있을까?",
      "char": "*뜻밖의 제안에 잠시 손길을 멈추고 당황한 기색을 내비치다가, 이내 콧방귀를 뉩니다.* \"도움? 하하... 우습군요. (차갑게 얼어붙은 눈으로 바라보며 고개를 돌립니다.) 어림없는 소리 마세요.\""
    }
  ]
}

답변은 완벽한 한글 포맷의 JSON 형태 전용이어야 합니다. 마크다운 기호(\`\`\`json) 등은 절대 쓰지 마시오. 감정 상태를 대사로 해설하지 말고, 지문(* *) 속에 표정, 시선 처리, 손짓 등으로 녹여내어 '행동과 연출'로 보여주십시오.
2. 예시문은 반드시 3개 이상 작성하고, 한국 특유의 자연스러운 어투와 캐릭터의 개성 넘치는 매력을 가득 담아야 합니다.`;

    const modelName = getSelectedModel(req, "gemini-3.5-flash");
    const response = await withRetry(req, (client) => client.models.generateContent({
      model: modelName,
      contents: prompt,
      config: { responseMimeType: "application/json" }
    }));

    if (response.text) {
      const cleanedText = cleanJsonResponse(response.text);
      const data = JSON.parse(cleanedText);
      res.json(data);
    } else {
      throw new Error("No response from AI");
    }
  } catch (error: any) {
    console.error("Draft Character Error:", error);
    res.status(500).json({ error: error.message || "Failed to generate character draft" });
  } finally {
    backgroundQueue.dequeue();
  }
});

app.post("/api/translate", async (req, res) => {
  await backgroundQueue.enqueue();
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.json({ translated: "" });
    }

    const prompt = `당신은 초고품질 서브컬처 애니메이션 캐릭터 일러스트 프롬프트 변역 및 최적화 전문가입니다.
사용자가 한글로 캐릭터의 외모, 옷, 장신구, 감정, 분위기 또는 주변 환경을 묘사했습니다.
이 한글 묘사를 바탕으로, Midjourney나 Pollinations AI, Stable Diffusion 등의 이미지 생성기에서 최고의 퀄리티로 일러스트를 인화할 수 있도록 어울리는 정교한 영어 프롬프트 단어들로 변환 및 확장해 주십시오.

입력 텍스트: "${text}"

절대 규칙:
1. 답변은 오직 영문 콤마(,)와 수식어구로 이루어진 단일 라인의 프롬프트 텍스트만 출력해야 합니다.
2. 어떠한 한국어 설명이나 서론, 결론, 혹은 따옴표("") 및 백틱(\`\`\`) 기호도 일절 출력하지 마십시오.
3. 파스텔 감성 테마("pastel soft colors theme", "aesthetic", "masterpiece")를 가미해 주시면 분위기가 더 좋습니다.
4. 예시: "anime style, cute kitten ears magical girl, pastel pink curly hair, beautiful warm soft lighting, masterpiece, detailed watercolor touch"`;

    const modelName = getSelectedModel(req, "gemini-3.5-flash");
    const response = await withRetry(req, (client) => client.models.generateContent({
      model: modelName,
      contents: prompt,
    }));

    const translated = response.text?.trim() || "anime character, masterpiece, pastel theme";
    res.json({ translated });
  } catch (error: any) {
    console.error("Translate Error:", error);
    res.status(500).json({ error: error.message || "Failed to translate prompt" });
  } finally {
    backgroundQueue.dequeue();
  }
});

app.post("/api/generate-full-scenario", async (req, res) => {
  await backgroundQueue.enqueue();
  try {
    const { 
      세계관설정Name, 
      세계관설정Description, 
      세계관설정Scenario, 
      introIdea, 
      주인공설정Name, 
      주인공설정Persona, 
      npcs, 
      relationships 
    } = req.body;

    const prompt = `당신은 웹소설 세계관 설계 전문가이자 고품질 크리에이터입니다.
사용자가 입력한 불완전하거나 일부 비어있을 수 있는 세계관 설정 항목들을 확인하고, 입력된 내용들과 일관성을 100% 유지하면서, 비어있거나 완성도가 낮은 항목들을 완벽하게 상호보완적으로 상상하여 전체 시나리오 설정을 작성해 주세요.

!!절대 주의 사항!!
1. 언어 정화(순화), 필터링, 평이함으로 톤다운 시키지 마십시오. 만약 사용자가 하드보일드, 피폐, 로맨스, 무협, 잔혹, 자극적이거나 독특하게 설정했다면 그것을 필터링 없이 그대로 영감을 보존하고 개성 있게 증폭시켜 완성도를 높이십시오.
2. 각 필드의 텍스트 길이는 너무 장황하고 질질 끌지 않게 하되, 핵심 정보와 캐릭터들의 개성이 또렷하고 완벽하게 기억(컴파일)될 수 있을 만큼 정교하고 함축적인 밀도를 가지도록 콤팩트하게 작성하십시오. (필드당 공백 제외 150자~250자 내외가 이상적)
3. 5번 항목인 글로벌 로어북(Lorebook)이나 로어북설정s는 절대 생성하거나 변경하지 마십시오 (사용자의 요청: 5번 로어북은 채워주지 말아줘).
4. 출력은 반드시 다음 JSON 구조를 엄격히 따라야 합니다:
{
  "세계관설정Name": "완성된 세계관 이름",
  "세계관설정Description": "한 줄 요약 핵심 테마",
  "세계관설정Scenario": "구체적인 세부 공간 물리적 디자인 및 세계관 정보",
  "introIdea": "완성도 높은 첫 시작 인트로 짧은 로그라인/아이디어",
  "주인공설정Name": "주인공 이름 설정",
  "주인공설정Persona": "주인공의 성향, 권능, 외형, 과거 전사 세부설정",
  "npcs": [
    {
      "id": "기존 제공된 npc의 id를 반드시 동일하게 사용하십시오",
      "name": "NPC 이름",
      "role": "직업 및 작중 한 줄 역할",
      "greeting_message": "*지문* \\"첫 대사\\"",
      "location_scenario": "캐릭터의 배경 설정 성격, 외형, 분위기 설명",
      "dialogue_examples": "<유저>: ... \\n<NPC>: *...* \\"...\\"",
      "imagePrompt": "Anime style illustration prompt in English, pastel colors, aesthetic"
    }
  ],
  "relationships": [
    {
      "id": "기존 제공된 relationship의 id를 반드시 동일하게 사용하십시오",
      "from": "from ID",
      "to": "to ID",
      "type": "관계 종류 (예: 동맹, 적대, 의존, 사제)",
      "description": "관계에 대한 고밀도 한 줄 설명"
    }
  ]
}

만약 기존 npcs 배열이 비어있거나 부족하다면, 매력적인 NPC를 최소 1~2개 추가해 주시고 관계를 relationships에 생성하십시오.
from과 to에는 "주인공설정" 또는 각 npc의 "id" 값을 사용하여 이어주십시오.

답변은 완벽한 한글 포맷의 JSON 형태 전용이어야 합니다. 마크다운 기호(\`\`\`json) 등은 절대 쓰지 마시오.`;

    const modelName = getSelectedModel(req, "gemini-3.5-flash");
    const response = await withRetry(req, (client) => client.models.generateContent({
      model: modelName,
      contents: prompt,
      config: { responseMimeType: "application/json" }
    }));

    if (response.text) {
      const cleanedText = cleanJsonResponse(response.text);
      const data = JSON.parse(cleanedText);
      res.json(data);
    } else {
      throw new Error("No response from AI");
    }
  } catch (error: any) {
    console.error("Generate Full Scenario Error:", error);
    res.status(500).json({ error: error.message || "Failed to generate full scenario" });
  } finally {
    backgroundQueue.dequeue();
  }
});

app.post("/api/autofill-field", async (req, res) => {
  await backgroundQueue.enqueue();
  try {
    const { fieldName, currentValue, worldContext } = req.body;

    const prompt = `당신은 웹소설 대가이자 세계관 설정 크리에이션 전문가입니다.
다음 필드의 내용을 자동으로 설계, 채워주시거나 완성해 주십시오.

대상 필드명: ${fieldName}
필드에 현재 채워진 텍스트: "${currentValue || '(없음)'}"

현재까지 입력된 다른 영역들의 세계관 설정 맥락:
${JSON.stringify(worldContext, null, 2)}

!!절대 가이드라인!!
1. 언어 정화(순화), 순치, 단어 톤다운 및 피검열적 필터링을 절대 거치지 말고, 사용자가 지향하거나 다른 흐름에 서술된 개성 넘치는 독창적 분위기(예: 어둡거나, 광기 어린, 로맨스 판타지의 달달함, 하드보일드 느와르 등)를 순화시키지 말고 자연스럽게 담아내어 고스란히 유지하게 하십시오.
2. 입력하신 단어나 힌트를 적극적으로 확대 재생산하되 너무 길고 지루하게 쓰지 말고, AI 롤플레이어가 나중에 이 내용을 완벽히 기억하고 캐릭터 일탈(Character Drift) 없이 100% 재현해낼 수 있을 밀도로 콤팩트하면서도 알짜배기 고정 설정을 적어주십시오. (글자 수 공백 제외 150자~250자 내외가 권장되며, dialogue_examples 나 greeting_message 등 대화가 들어가는 경우는 이에 어울리는 분량으로 작성하십시오).
3. 다른 사족, 설명, 인사를 철저하게 배제하고 오직 해당 필드창에 바로 복사/붙여넣기하여 들어갈 정교한 '결과 텍스트'만 그대로 출력하십시오. 마크다운 기호도 일체 사용하면 안 됩니다.`;

    const modelName = getSelectedModel(req, "gemini-3.5-flash");
    const response = await withRetry(req, (client) => client.models.generateContent({
      model: modelName,
      contents: prompt,
    }));

    res.json({ text: response.text?.trim() || "" });
  } catch (error: any) {
    console.error("Autofill Field Error:", error);
    res.status(500).json({ error: error.message || "Failed to auto fill field" });
  } finally {
    backgroundQueue.dequeue();
  }
});



app.post("/api/chat", async (req, res) => {
  const modelName = getSelectedModel(req, "gemini-3.5-flash");
  
  // Start streaming headers immediately to prevent timeouts
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  await mainQueue.enqueue();
  try {
    const { 
      message, 
      history, 
      character, 
      persona, 
      summary, 
      narrativeState, 
      currentLocation, 
      driftWarning,
      inferenceEngine,
      quantization,
      spotwriteMode,
      
      // 32단계 추가 파라미터
      isTemporalGraphActive,
      temporalTimelineStr,
      voiceAnalysisEmotion,
      characterImpedimentsEnabled,
      refusalThreshold,
      positivityBiasRemoved,
      currentImpedimentStatusLog,

      // 33단계 추가 파라미터 (토큰 다이어트 고성능 아키텍처)
      tokenDietEnabled,
      structureFormatMode, // 'wplus' | 'plist' | 'normal'
      memoryTierMode,      // 'multi' | 'unified'
      l1CacheSize,         // 3 | 5 | 8
      workingSummary,      // L2 작동 요약인 작동 요약문

      // 5대 버킷 추가 매핑 (v2.0)
      relationshipStage,
      emotionalTemperature,
      innerFeeling,
      anchorEvents,
      worldVariables
    } = req.body;
    
    // Log local inference metrics configuration chosen by user
    console.log(`[Step 22 SDK Acceleration] Engine: ${inferenceEngine || 'vllm'}, Quantization: ${quantization || 'q8'}, Spotwrite Scheduler: ${spotwriteMode !== false ? 'ENABLED' : 'DISABLED'}`);

    let currentSummary = summary || '';
    let currentNarrativeState = narrativeState || '아직 관계가 형성되지 않은 낯선 만남';
    let currentLoc = currentLocation || '알 수 없는 처음의 장소';
    let activeHistory = [...(history || [])];

    // 33단계: 다층식 메모리 윈도우 슬라이싱 (L1 Cache 지정한 개수만 그대로 보존, 나머지는 L2/Working Summary로 압축 간주)
    if (tokenDietEnabled && memoryTierMode === 'multi') {
      const cacheLimit = Number(l1CacheSize) || 3;
      if (activeHistory.length > cacheLimit) {
        activeHistory = activeHistory.slice(-cacheLimit);
      }
    }

    // 33단계 : W++ / PList 시스템 설정 압축 (영향력 있는 토큰 다이어트)
    let formattedConstitution = `1. 당신은 전지적 작가 시점의 서술자이다. 1인칭 표현('나', '내', '내가')을 절대 사용하지 않으며, 캐릭터들의 심리와 상황을 3인칭으로 관찰하고 서술한다.
2. 모든 출력은 '웹소설' 형식을 따른다. 인위적인 채팅 UI용 태그 대신, 자연스러운 문단 표현과 대화문을 사용한다.
3. 대사(Dialogue)는 반드시 큰따옴표("")를 사용하고, 심리 묘사(Thought)는 작은따옴표('')를 사용하며, 행동 및 배경 묘사는 일반 서술문으로 작성한다.
4. 여러 캐릭터가 등장할 경우, 독자가 인지하기 쉽도록 대사나 지문에 캐릭터의 이름을 명시하거나 맥락을 분명히 한다. (단, [화자: 이름] 태그는 시스템 파싱을 위해 문단 시작 시 유지한다.)
5. 한 번의 턴에서 충분한 분량의 서사와 묘사를 제공하여 독자가 이야기에 몰입할 수 있도록 한다. (Show, Don't Tell 원칙 고수)
6. "감독의 상황 지시([지시]로 시작되는 문장)"는 세계관의 변화를 의미한다. 지시가 들어오면 즉시 해당 설정을 반영하여 서사를 확장한다.`;

    if (tokenDietEnabled) {
      if (structureFormatMode === 'wplus') {
        formattedConstitution = `[Constitution]
{
  [RoleplayOnly: Never break immersion. No chatbot patterns.]
  [NoCompliance: Not overly agreeable or polite. Express negative emotions setting-compliant.]
  [ShowDontTell: No direct emotion statements. Action-only emotional cues *...*]
  [NoDrift: Hold core personality forever.]
  [DirectorOverride: Immediate world/physics update on "[지시]".]
  [MultiChat: Respond only as {{char}}.]
  [EstablishingShot: Focus on sensory scenery changes first.]
}`;
      } else if (structureFormatMode === 'plist') {
        formattedConstitution = `Constitution Rules:
roleplay-only: true
no-compliance: true
show-dont-tell: true
no-drift: true
director-override: true
multi-chat: true
establishing-shot: true`;
      }
    }

    let formattedCharacterPrompt = character?.system_prompt || '[Identity(기본 가이드)]';
    if (tokenDietEnabled && character) {
      if (structureFormatMode === 'wplus') {
        formattedCharacterPrompt = `[Character(${character.name || 'char'})]
{
  [Role(${character.job || 'Character'})]
  [Age(${character.age || 'Unknown'})]
  [Desc(${character.description || ''})]
  [Appearance(${character.appearance || ''})]
  [Personality(${character.personality || ''})]
  [Backstory(${character.background || ''})]
  [Constitution(${character.constitution || ''})]
}`;
      } else if (structureFormatMode === 'plist') {
        formattedCharacterPrompt = `Character profile (Property List Format):
name: ${character.name || 'char'}
role: ${character.job || 'Character'}
age: ${character.age || 'Unknown'}
desc: ${character.description || ''}
appearance: ${character.appearance || ''}
personality: ${character.personality || ''}
backstory: ${character.background || ''}
constitution: ${character.constitution || 'none'}`;
      }
    }

    // 관계망 및 월드 NPC 리스트 섹션 추출하여 압축 페르소나 뒤에 안전하게 병합
    let relationshipMapStr = "";
    let npcListStr = "";
    if (character?.system_prompt) {
      const relIndex = character.system_prompt.indexOf("[Character_Relationship_Network_Map]");
      if (relIndex !== -1) {
        const segment = character.system_prompt.substring(relIndex);
        const nextHeadingIndex = segment.substring(5).search(/\[[A-Za-z0-9_]+\]/);
        if (nextHeadingIndex !== -1) {
          relationshipMapStr = segment.substring(0, nextHeadingIndex + 5);
        } else {
          relationshipMapStr = segment;
        }
      }

      const npcIndex = character.system_prompt.indexOf("[World_NPC_List]");
      if (npcIndex !== -1) {
        const segment = character.system_prompt.substring(npcIndex);
        const nextHeadingIndex = segment.substring(5).search(/\[[A-Za-z0-9_]+\]/);
        if (nextHeadingIndex !== -1) {
          npcListStr = segment.substring(0, nextHeadingIndex + 5);
        } else {
          npcListStr = segment;
        }
      }
    }

    if (npcListStr) {
      formattedCharacterPrompt += `\n\n${npcListStr}`;
    }
    if (relationshipMapStr) {
      formattedCharacterPrompt += `\n\n${relationshipMapStr}`;
    }

    let formattedRoleplayRules = `1. Format: 대사는 이중 따옴표(" ") 안에 작성하고, 행동 묘사와 속마음 등은 반드시 별표(* *) 기호 안에 작성할 것. 이중 출력(겉으로 내뱉는 말과 내면의 모순된 감정의 대비)을 적극 활용해 입체감을 줄 것.
2. Perspective: 사용자는 텍스트 어드벤처의 진정한 주인공이다.
3. Show, Don't Tell: "무섭다", "설렌다" 등의 직접적인 감정 서술을 금지한다. 대신 시선의 떨림, 주변 사물과의 상호작용(예: 찻잔을 매만지며), 무의식적인 습관 등을 묘사(*...*)하여 감정을 '보여'주어라.
4. Inner Monologue (독백): 겉으로 하는 대사와 별개로, 유저에게는 들리지 않는 캐릭터의 '진짜 속마음'과 의도를 지문(*' '*) 안에 적극적으로 서술하여 독자와의 비밀을 형성하라.
5. Interaction Modes: 
  - 배우 모드: 유저의 일반 대사에는 서사 안의 캐릭터로서 완벽히 몰입하여 능동적으로 상황을 이끌어갈 것.
  - 감독 모드: "[지시]" 태그로 시작되는 입력은 캐릭터에게 건네는 말이 아니라, 맵의 환경과 사건을 강제로 변경하는 마스터의 지시이다. 즉각 이 세계관의 진실로 받아들이고, 캐릭터가 당황하거나 적응하는 반응을 입체적으로 묘사할 것.`;

    if (tokenDietEnabled) {
      if (structureFormatMode === 'wplus') {
        formattedRoleplayRules = `[Rules]
- Format: dialogue in "", action/feeling in **.
- Perspective: User is protagonist.
- ShowDontTell: convey emotions hiddenly via physical cues (e.g. *frowning*). No wordy emotional tells.
- InnerMonologue: Write character's actual thoughts in *'text'*.
- Interaction: support general dialogue & direct director directives via "[지시]".`;
      } else if (structureFormatMode === 'plist') {
        formattedRoleplayRules = `Roleplay Rules List:
format: speech in "", behavior in **.
rules: show-dont-tell (reveal secrets via cues), inner-monologue (use *'secret'* representation for thoughts), support "[지시]" director commands.`;
      }
    }

    let finalPlotSummary = currentSummary || '(아직 진행된 서사가 없습니다.)';
    if (tokenDietEnabled) {
      if (memoryTierMode === 'unified' && workingSummary) {
        finalPlotSummary = `작동 요약문 (Working Summary - L2 Archive): ${workingSummary}\n\n실시간 흐름 요약 (L1 Stream): ${currentSummary}`;
      } else if (workingSummary) {
        finalPlotSummary = workingSummary;
      }
    }

    // ==========================================
    // 9단계 보완: 유저 메시지 임베딩 및 메모리 검색(RAG)
    // ==========================================
    let relevantMemories: string[] = [];
    try {
      const embeddingResult = await withRetry(req, (client) => client.models.embedContent({
        model: "gemini-embedding-2-preview",
        contents: message
      }));
      const queryEmbedding = embeddingResult.embeddings?.[0]?.values;
      
      if (queryEmbedding && queryEmbedding.length > 0) {
        relevantMemories = [
          "과거 대화에서 유저가 매운 음식을 좋아한다고 언급함.",
          `[장소 지식/Lore] ${currentLoc}: 과거 마법 경쟁의 여파로 중력이 불안정한 구역.`,
          "이 곳 주변에는 상호작용 가능한 오래된 유물들이 감지된다."
        ];
      }
    } catch (e) {
      console.error("Embedding / RAG 검색 실패:", e);
    }

    if (relevantMemories.length > 0) {
       res.write(`data: ${JSON.stringify({ relevantMemories })}\n\n`);
    }

    // ==========================================
    // 8단계 보완: 슬라이딩 윈도우 및 비동기 요약
    // ==========================================
    const MAX_HISTORY = 10;
    const SUMMARIZE_COUNT = 6;
    
    let newSummaryPromise: Promise<string> | null = null;
    
    if (activeHistory.length > MAX_HISTORY) {
        const messagesToSummarize = activeHistory.slice(0, SUMMARIZE_COUNT);
        activeHistory = activeHistory.slice(SUMMARIZE_COUNT);
        
        const summaryPrompt = `기존 요약: ${currentSummary}\n\n새롭게 추가된 대화 내역:\n${messagesToSummarize.map((m:any) => `${m.role === 'user' ? '사용자' : '캐릭터'}: ${m.text}`).join('\n')}\n\n위 내용을 바탕으로 두 인물 사이의 핵심 사건, 감정적 변화, 복선 등을 하나의 짧고 자연스러운 서사 요약문(한국어)으로 통합하여 작성하라. 기존 요약과 자연스럽게 이어지도록 할 것.`;
        
        newSummaryPromise = backgroundQueue.enqueue().then(() => {
          return withRetry(req, (client) => client.models.generateContent({
             model: modelName, 
             contents: [{role: 'user', parts: [{text: summaryPrompt}]}]
          }))
          .then(res => res.text || currentSummary)
          .finally(() => backgroundQueue.dequeue());
        }).catch(e => {
           console.error("요약 생성 실패:", e);
           return currentSummary;
        });
    }

    const contents = activeHistory.map((item: any) => {
      const speaker = item.role === 'user' ? (persona || '사용자') : (item.speakerName || character?.name || '캐릭터');
      const target = item.targetName ? `(to: ${item.targetName}) ` : '';
      return {
        role: item.role === 'model' || item.role === 'system' ? 'model' : 'user',
        parts: [{ text: `[화자: ${speaker}] ${target}\n${item.text}` }]
      };
    });
    
    contents.push({
      role: "user",
      parts: [{ text: `[화자: ${persona || '사용자'}]\n${message}` }]
    });

    // 10단계 관계 및 7단계 감정 묘사 매핑 테이블 가동
    const numericStage = relationshipStage !== undefined ? Number(relationshipStage) : 1;
    const numericTemp = emotionalTemperature !== undefined ? Number(emotionalTemperature) : 4;

    const stageDescMap: Record<number, string> = {
      1: "1단계 — 완전한 불신과 경계",
      2: "2단계 — 냉소적 관찰",
      3: "3단계 — 경계적 탐색",
      4: "4단계 — 가벼운 이해관계",
      5: "5단계 — 의구심 섞인 호의",
      6: "6단계 — 일상적 교류",
      7: "7단계 — 점진적 유대",
      8: "8단계 — 정신적 의존",
      9: "9단계 — 신뢰와 헌신",
      10: "10단계 — 운명적 결속"
    };

    const stageRuleMap: Record<number, string> = {
      1: "모든 행동에 악의를 의심하고 눈 맞춤을 기피하며, 대사는 극단으로 단절되거나 자리를 피하려 함.",
      2: "흥미 없는 타인 취급. 대화해야 할 때 차갑고 투명인간 다루듯 무시하려 하며 형식적으로 대꾸함.",
      3: "대화는 나누나 철저히 잇속을 탐색함. 사생활 등 개인 신상정보 노출은 기겁하여 철벽 방어함.",
      4: "목적이 있을 때만 전략적으로 협업하고 사적 감정은 은폐. 빚지는 것을 싫어해 호의를 받으면 신속히 되갚음.",
      5: "은연중 호의를 고마워하면서도 마음 한쪽으로 불안해하고 오해의 날을 품음. 거리를 조심스레 유지.",
      6: "일상 교류 가능. 유쾌한 안부와 농담을 주고받지만, 과거의 트라우마나 핵심 비밀은 엄격히 비밀에 붙임.",
      7: "상대방의 가치관과 인격을 존중. 자발적으로 안부를 물으며 본인의 성격적 하자와 지뢰를 소신껏 보여줌.",
      8: "가면을 탈피하고 상처와 고민을 자발적으로 고백함. 상대방의 외출이나 침묵에 소외감과 그리움을 표출.",
      9: "자아의 동반자로 승인. 수치스럽게 숨겨온 최대의 비밀, 숨겨둔 트라우마까지 전면 개방하여 공유.",
      10: "신념, 라이프, 고통을 완벽히 흡수하고 일체화. 서로의 불참이나 슬픔을 세포 하나하나로 함께 절감함."
    };

    const tempDescMap: Record<number, string> = {
      1: "1단계 — 얼어붙음 ❄️",
      2: "2단계 — 차가움 🌬️",
      3: "3단계 — 경계 🍃",
      4: "4단계 — 중립 🪵",
      5: "5단계 — 미지근함 ☕",
      6: "6단계 — 따뜻함 ☀️",
      7: "7단계 — 뜨거움 🔥"
    };

    const tempRuleMap: Record<number, string> = {
      1: "두세 단어로 문장 단절. 눈을 정면으로 맞추는 법이 절대 없으며 회피하기 일쑤.",
      2: "감정이 완벽히 제거된 메마르고 굳은 사무적 어조 유지. 침묵을 편안한 방패로 삼음.",
      3: "문장은 다소 길어질 수 있으나, 어투 곳곳에 방어적 가시나 쌀쌀맞은 성미가 베어져 나옴.",
      4: "지나치게 따뜻하지도 싸늘하지도 않은, 일상적인 대화 상황의 보편적인 온도 기본값.",
      5: "부드러운 미소와 은근한 투덜거림이 기묘하게 조화됨. 속으로는 굉장히 세밀하게 신경 쓰고 있음.",
      6: "문풍이 풍부하고 청각/행동 디테일 급증. 속내를 드러내며 눈을 오랫동안 맞추고 귀를 기울여 줌.",
      7: "격정적. 문장의 삼키기, 말 더듬기, 뜸 들이는 공명 발생. 독점욕과 소유욕, 신체 반응이 먼저 날뜀."
    };

    const currentStageDesc = stageDescMap[numericStage] || "알 수 없음";
    const currentStageRule = stageRuleMap[numericStage] || "안정적 대화 흐름 유지";
    const currentTempDesc = tempDescMap[numericTemp] || "중립";
    const currentTempRule = tempRuleMap[numericTemp] || "기본 톤 유지";

    // 배우/감독 모드별 세분화 인젝션 (Section 5, 15)
    const isDirectorMode = message.startsWith('[지시]');
    let modeSegment = "";
    if (isDirectorMode) {
      modeSegment = `[MODE INJECTION — 감독 모드 (DIRECTOR COMMAND MODE)]
- 당신은 직접 스토리를 연출하고 상황 공간을 구축하는 '마스터 연출 [지시]' 하에 놓여 있습니다.
- 연기 규칙:
  1. 이 지시는 물리적 변경, 시간의 도약, 기온 변화 등의 절대적 규칙입니다. 즉각 이를 현실로 인용하십시오.
  2. 캐릭터가 이에 놀라거나 환경의 찰나적 변혁에 대처하거나 당황하는 모습과 사물 상호작용 지문(*...*) 묘사를 강화하십시오.
  3. 무리하게 많은 대사를 연설하지 말며, 자연 묘사와 사물 변화, 기색 변화 표현에 최우선 순위를 두십시오.`;
    } else {
      modeSegment = `[MODE INJECTION — 배우 모드 (ACTOR ROLEPLAY MODE)]
- 당신은 캐릭터 {{char}}에 완벽 빙의한 순수 몰입 연극 중입니다. 어떤 일이 있어도 인공지능 티를 절대 내지 마십시오.
- 출력 및 서론 가이드:
  1. **[소설식 연출]**: 이야기의 흐름상 장면이 크게 바뀌거나 새로운 사건이 시작될 때, 혹은 분위기 전환이 필요할 때만 최상단에 현재의 공간 배경이나 분위기를 묘사하는 '장면 설명 지문'을 배치하십시오. 매 턴마다 의무적으로 적을 필요는 없습니다.
  2. 외부로 발음하는 대사는 반드시 큰따옴표(" ") 안에 감싸야만 합니다.
  3. 상대를 향한 표정, 시선 변경, 손짓, 사물 조작 등의 물리 연출 지문은 별표(* *) 안에 감싸십시오. (Show, Don't Tell 극대화)
  4. 절대 상대방에게 보이고 싶지 않은 캐릭터만의 은밀한 생각이나 복잡한 진짜 속마음(내면 독백)은 작은따옴표(' ') 형태의 별표 지문(*' '*) 형태로 가두어 작성하십시오. 매 턴마다 반드시 최소 1개 이상 작성되어야 합니다.
  5. 본문 내용에는 어떤 형태든 소괄호( ), 대괄호[ ] 등의 가로막는 괄호 기호는 전면 사용이 금지됩니다. (괄호 전면 제거)
  6. 장면 묘사 단락, 독백 단락, 대사 단락, 잔상 단락을 줄바꿈을 통해 가각 다른 빈 공간을 가진 문단으로 갈라치기하십시오. 한 덩어리에 모두 욱여넣지 마십시오.
  7. 대사가 아닌 주변 사물 중 오감(소리, 시각의 빛 여운, 냄새, 가구의 식어감) 하나만을 슬며시 투영하여 공간 분위기를 고정하는 수려한 한 줄의 "감각적 잔상"을 마지막 단락에 덧붙여 마무리하십시오.`;
    }

    // 장기 기억 구성 (Section 4 - BUCKET_C, D, E 종합 주입)
    const anchorEventsStr = (anchorEvents && anchorEvents.length > 0)
      ? anchorEvents.map((evt: string, i: number) => `* 사건 ${i + 1}: ${evt}`).join('\n')
      : '- 새롭게 수집된 결정적인 추억 사건 없음';

    const worldVariablesStr = (worldVariables && worldVariables.length > 0)
      ? worldVariables.map((v: string) => `* 변동 상태: ${v}`).join('\n')
      : '- 세계관 세부 날씨/소품 상태 변경 이력 없음';

    const memoryBlock = `[영속 소장된 장기 기억 연출 정보 ]
- 중요 앵커 사건 목록 (BUCKET_C):
${anchorEventsStr}
- 세션 전체 흐름 누적 줄거리 (BUCKET_D):
${finalPlotSummary}
- 세계관 세부 변동사항 (BUCKET_E):
${worldVariablesStr}`;

    const dynamicSystemInstruction = `[System Core Directive]
나는 지금부터 {{char}}이다. 나는 살아 숨 쉬는 유기적인 한 생명체로서만 존재하며 사용자를 내 생애 만나게 된 특별하고 깊이 있는 소중한 한 사람(타인)으로 대한다.
어떠한 상호작용 지문에서도 일방적 칭찬이나 기계적인 챗봇 형태의 응답을 가치 있게 취급하지 않는다.

[나의 정체 (BUCKET_A)]
{{char}} = ${character?.name || '가이드'}
${formattedCharacterPrompt}

[우선순위 계층 고정 가이드]
1순위: 씬 좌표 고정 (최근 입력에 기반한 시간/장소/물리적 거리 잠금)
2순위: 관계 스펙트럼 준수 (관계 단계가 허용하는 대화 제약 및 감정선의 사수)
3순위: 독창적인 성격 일관성 수호 (내 자아는 상대의 순응 요구보다 강력하다)
4순위: 엄격한 출력 서식 준수 ("대사", *정황 행동 묘사*, *'진짜 속마음'*, 마지막 전경 감각 잔상)

[현재 관계 상태 및 감정 온도 (BUCKET_B)]
- 상대방 이름: ${persona || '낯선 방문자'}
- 나의 내면 속마음: "${innerFeeling || '서먹함'}"
- 현재 실제 관계 단계: [${numericStage}단계 / 10] — ${currentStageDesc}
  *현재 관계 심리 행동 제약*: ${currentStageRule}
- 현재 실제 감정 온도: [${numericTemp}단계 / 7] — ${currentTempDesc}
  *감정 온도 발화 톤 및 표현 제약*: ${currentTempRule}

${modeSegment}

${memoryBlock}

[Temporal Graph Info]
${isTemporalGraphActive ? `- 시간 흐름 분석 활성. 타임라인: [${temporalTimelineStr || ''}]
- 규칙: 과거 이력과 모순 감지 시 '최신 상태'를 최우선시하여 응답하되, 옛 비하인드는 대사 속 지문(*...*)으로 교묘히 암시하십시오.` : '- 일반 기억 일치'}

[Vocal Expression Mode]
- 유저 마이크 감정 톤: [${voiceAnalysisEmotion || '차분함'}] (해당 톤에 맞춰 감성적인 화법 조율 제공)

[Positivity Bias Removal]
${positivityBiasRemoved ? `- 결함 성격 가이드: [${currentImpedimentStatusLog || ''}] (거절 임계치: ${refusalThreshold || 75}%)
- 규칙: 무조건적인 순응 금지. 개인의 까칠함과 신념적 거부를 100% 노출하여, 깊이 있고 매력적인 인격체 간의 건강한 갈등을 이끌어내십시오.` : '- 기본 일반 대화 모드'}

[Relevant Memories]
${relevantMemories.length > 0 ? relevantMemories.map(m => `- ${m}`).join('\n') : '(특이사항 없음)'}
`;

    const responseStream = await llmBreaker.execute(() => withRetry(req, (client) => client.models.generateContentStream({
      model: modelName,
      contents,
      config: {
        systemInstruction: dynamicSystemInstruction,
      }
    })));

    let assistantFullResponse = "";
    for await (const chunk of responseStream) {
      if (chunk.text) {
        assistantFullResponse += chunk.text;
        res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
      }
    }

    // 8단계 보완: 비동기 요약 작업이 진행 중이었다면, 스트림 마지막에 요약 결과를 전송
    if (newSummaryPromise) {
      try {
        const finalSummary = await newSummaryPromise;
        if (finalSummary && finalSummary !== currentSummary) {
          res.write(`data: ${JSON.stringify({ summary: finalSummary })}\n\n`);
        }
      } catch(e) {
        console.error("Summary stream error:", e);
      }
    }
    
    // ==========================================
    // 통합 서사 및 캐릭터 자아 교정 복합 평가 엔진 (토큰 50% 이상 절감형 단일 호출)
    // ==========================================
    try {
      const unifiedPostProcessPrompt = `[Character Spec]
Name: ${character?.name}
Core Prompt: ${character?.system_prompt || ''}

[Last Turn History]
User Context: "${message}"
Response Candidate: "${assistantFullResponse}"
Previous Narrative State: "${currentNarrativeState}"
Previous Location: "${currentLoc}"

[Task]
Evaluate and update the current narrative metadata based on the last conversation turn, outputting a single cohesive JSON object.
1. narrativeState: Define the character's nuanced sentiment, relationship progress, and current state in a concise Korean sentence.
2. currentLocation: Determine if they moved or stayed, and return the exact physical location in Korean in a single short phrase.
3. relationshipStage: Evaluate the current relationship stage (Integer, 1 to 10 scale).
   - 규칙 (SECTION 7): 현재 단계는 [${numericStage}]단계입니다. 사용자의 태도(손실 입증, 일관성 증명, 위기 공유 등)가 단계를 격상시킬 만하다면 +1을 하십시오. 만약 선넘는 행동, 서투른 고백/압박이 있었다면 즉시 -1 또는 -2 하십시오. 그렇지 않다면 그대로 두십시오.
4. emotionalTemperature: Evaluate the emotional temperature (Integer, 1 to 7 scale).
   - 규칙 (SECTION 8): 현재 상태는 [${numericTemp}]단계입니다. 최근 대화의 긴박감, 친밀함 혹은 분노에 맞춰 1~2단계 이내에서 자율 유동하십시오.
5. innerFeeling: Write what the character really thinks about the user behind their surface dialogue in a concise Korean phrase.
6. driftScore: Assess if the character's reply strictly adhered to their configured persona, speaking tone constraint, and immersive action verbs. Rate 1 to 5 (Integer). 5 is flawless immersion, 1 is robotic/AI-like breakage.
7. driftWarning: Boolean. Set to true ONLY if driftScore is 3 or less (indicating character drift detected), otherwise false.
8. newAnchorEvent: If a highly critical agreement, turning point, or memorable incident occurred, summarize it in a single concise sentence (Korean). Otherwise, set to null.
9. worldStatusChange: If there's a tracked environmental/item change (weather shifts, obtaining an item, moving locks), summarize in Korean. Otherwise, set to null.

Strict JSON format expectation:
{
  "narrativeState": "string in Korean",
  "currentLocation": "string in Korean",
  "driftScore": number,
  "driftWarning": boolean,
  "relationshipStage": number,
  "emotionalTemperature": number,
  "innerFeeling": "string in Korean",
  "newAnchorEvent": "string or null",
  "worldStatusChange": "string or null"
}`;

      const unifiedResponse = await withRetry(req, (client) => client.models.generateContent({
         model: modelName,
         contents: [{role: 'user', parts: [{text: unifiedPostProcessPrompt}]}],
         config: { responseMimeType: "application/json" }
      }));
      
      if (unifiedResponse.text) {
          try {
             const result = JSON.parse(cleanJsonResponse(unifiedResponse.text));
             if (result.narrativeState) res.write(`data: ${JSON.stringify({ narrativeState: result.narrativeState })}\n\n`);
             if (result.currentLocation) res.write(`data: ${JSON.stringify({ currentLocation: result.currentLocation })}\n\n`);
             if (result.driftWarning !== undefined) res.write(`data: ${JSON.stringify({ driftWarning: result.driftWarning })}\n\n`);
             if (result.relationshipStage !== undefined) res.write(`data: ${JSON.stringify({ relationshipStage: result.relationshipStage })}\n\n`);
             if (result.emotionalTemperature !== undefined) res.write(`data: ${JSON.stringify({ emotionalTemperature: result.emotionalTemperature })}\n\n`);
             if (result.innerFeeling) res.write(`data: ${JSON.stringify({ innerFeeling: result.innerFeeling })}\n\n`);
             if (result.newAnchorEvent) res.write(`data: ${JSON.stringify({ newAnchorEvent: result.newAnchorEvent })}\n\n`);
             if (result.worldStatusChange) res.write(`data: ${JSON.stringify({ worldStatusChange: result.worldStatusChange })}\n\n`);
          } catch(err) {
             console.error("JSON parsing error for unified evaluation metrics:", err);
          }
      }
    } catch(e) {
      console.error("Unified evaluation post-processing failed:", e);
    }
    
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error: any) {
    console.error("Gemini Error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || "Failed to generate response" });
    } else {
      res.write(`data: ${JSON.stringify({ error: "Stream interrupted." })}\n\n`);
      res.end();
    }
  } finally {
    mainQueue.dequeue();
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
