import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const DEFAULT_SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE }
];


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

function getSelectedModel(req: express.Request, defaultModel = "gemini-3.5-flash"): string {
  const userModel = req.headers['x-user-model'] as string;
  let model = (userModel && userModel.trim() !== '') ? userModel : defaultModel;
  
  const modelMap: Record<string, string> = {
    'gemini-3.5-flash': 'gemini-3.5-flash',
    'gemini-3.1-flash-lite': 'gemini-3.1-flash-lite',
    'gemini-3.1-pro': 'gemini-3.1-pro-preview',
    'gemini-1.5-flash': 'gemini-3.5-flash',
    'gemini-1.5-pro': 'gemini-3.1-pro-preview',
    'gemini-2.5-flash': 'gemini-3.5-flash',
    'gemini-2.5-pro': 'gemini-3.1-pro-preview'
  };
  
  return modelMap[model] || model;
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

async function callGeminiWithFallback(
  req: express.Request,
  primaryModel: string,
  params: any
): Promise<any> {
  const modelsToTry = [primaryModel];
  
  if (primaryModel === 'gemini-3.5-flash') {
    modelsToTry.push('gemini-3.1-flash-lite');
    modelsToTry.push('gemini-3.1-pro-preview');
  } else if (primaryModel === 'gemini-3.1-pro-preview' || primaryModel === 'gemini-3.1-pro') {
    modelsToTry.push('gemini-3.5-flash');
    modelsToTry.push('gemini-3.1-flash-lite');
  } else {
    modelsToTry.push('gemini-3.5-flash');
    modelsToTry.push('gemini-3.1-flash-lite');
  }
  
  const uniqueModels = Array.from(new Set(modelsToTry));
  let lastError: any = null;
  
  for (const model of uniqueModels) {
    try {
      console.log(`[Gemini Resilient] Prompting with model: ${model}`);
      return await withRetry(req, (client) => client.models.generateContent({
        ...params,
        model: model
      }));
    } catch (err: any) {
      lastError = err;
      const errMsg = err?.message || '';
      const isUnavailable = err?.status === 503 || errMsg.includes('503') || errMsg.includes('UNAVAILABLE') || errMsg.includes('high demand') || errMsg.includes('overloaded');
      
      if (isUnavailable) {
        console.warn(`[Gemini Resilient] Model ${model} is currently unavailable or experiencing high demand. Trying next fallback...`);
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

async function callGeminiStreamWithFallback(
  req: express.Request,
  primaryModel: string,
  params: any
): Promise<any> {
  const modelsToTry = [primaryModel];
  
  if (primaryModel === 'gemini-3.5-flash') {
    modelsToTry.push('gemini-3.1-flash-lite');
    modelsToTry.push('gemini-3.1-pro-preview');
  } else if (primaryModel === 'gemini-3.1-pro-preview' || primaryModel === 'gemini-3.1-pro') {
    modelsToTry.push('gemini-3.5-flash');
    modelsToTry.push('gemini-3.1-flash-lite');
  } else {
    modelsToTry.push('gemini-3.5-flash');
    modelsToTry.push('gemini-3.1-flash-lite');
  }
  
  const uniqueModels = Array.from(new Set(modelsToTry));
  let lastError: any = null;
  
  for (const model of uniqueModels) {
    try {
      console.log(`[Gemini Resilient Stream] Prompting stream with model: ${model}`);
      return await llmBreaker.execute(() => withRetry(req, (client) => client.models.generateContentStream({
        ...params,
        model: model
      })));
    } catch (err: any) {
      lastError = err;
      const errMsg = err?.message || '';
      const isUnavailable = err?.status === 503 || errMsg.includes('503') || errMsg.includes('UNAVAILABLE') || errMsg.includes('high demand') || errMsg.includes('overloaded');
      
      if (isUnavailable) {
        console.warn(`[Gemini Resilient Stream] Model ${model} is currently unavailable/high demand. Trying next fallback...`);
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

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
    const response = await callGeminiWithFallback(req, modelName, {
      contents: prompt,
      config: { safetySettings: DEFAULT_SAFETY_SETTINGS }
    });
    
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

답변은 완벽한 JSON 형태이어야 합니다. 마크다운 기호(\`\`\`json) 등은 절대 쓰지 마시오.
감정 상태를 대사로 해설하지 말고, 지문(* *) 속에 표정, 시선 처리, 손짓 등으로 녹여내어 '행동과 연출'로 보여주십시오.

[절대 가이드라인]
1. 검열 및 순화 절대 금지: 독특한 어둠, 광기, 도발적 혹은 퇴폐적 요소가 키워드에 암시되어 있다면 AI 임의로 순화하지 말고 100% 원본의 매력을 살리십시오.
2. 미래 서사 및 관계 단정 금지: 앞으로 주인공(플레이어)과 언제 어떻게 친해진다거나, 스토리가 어떻게 풀려갈 것인지(미래 진행 흐름)를 설정에 절대 명시하지 마십시오. 오직 현재 이 캐릭터가 가진 고유의 고정 설정(과거, 성격, 배경)만을 작성할 것.
3. 예시문은 반드시 3개 이상 작성하고, 한국 특유의 자연스러운 어투와 캐릭터의 개성 넘치는 매력을 가득 담아야 합니다.`;

    const modelName = getSelectedModel(req, "gemini-3.5-flash");
    const response = await callGeminiWithFallback(req, modelName, {
      contents: prompt,
      config: { responseMimeType: "application/json", safetySettings: DEFAULT_SAFETY_SETTINGS }
    });

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
    const response = await callGeminiWithFallback(req, modelName, {
      contents: prompt,
      config: { safetySettings: DEFAULT_SAFETY_SETTINGS }
    });

    const translated = response.text?.trim() || "anime character, masterpiece, pastel theme";
    res.json({ translated });
  } catch (error: any) {
    console.error("Translate Error:", error);
    res.status(500).json({ errapp.post("/api/autofill-field", async (req, res) => {
  await backgroundQueue.enqueue();
  try {
    const { fieldName, currentValue, worldContext } = req.body;
    const prompt = `당신은 초고품질 인터랙티브 서사 설계 전문가입니다. '${fieldName}' 항목을 보강해 주십시오. 
        현재 작성된 텍스트(힌트): "${currentValue || '(없음)'}"
        현재까지 입력된 설정들의 맥락: ${JSON.stringify(worldContext, null, 2)}
        
        [핵심 절대 가이드라인]
        1. 검열 및 언어 순화 절대 금지.
        2. 필드 목적 부합: 이름 칸이면 이름만, 성격 칸이면 성격 키워드만 출력하십시오.
        3. 군더더기 배제: 결과 텍스트만 날것으로 출력하십시오.
        4. 대사/지문 내 필요 없는 *표시, 괄호 등 금지.`;

    const modelName = getSelectedModel(req, "gemini-3.5-flash");
    const response = await callGeminiWithFallback(req, modelName, {
      contents: prompt,
      config: { safetySettings: DEFAULT_SAFETY_SETTINGS }
    });

    res.json({ text: response.text?.trim() || "" });
  } catch (error: any) {
    console.error("Autofill Field Error:", error);
    res.status(500).json({ error: error.message || "Failed to auto fill field" });
  } finally {
    backgroundQueue.dequeue();
  }
});�� 반드시 동일하게 사용하십시오",
      "from": "from ID",
      "to": "to ID",
      "type": "관계 종류 (예: 동맹, 적대, 의존, 사제)",
      "description": "관계에 대한 고밀도 한 줄 설명"
    }
  ]
}

[절대 가이드라인]
1. 검열 및 언어 순화 금지: 사용자가 설정했거나 힌트로 남긴 폭력적, 퇴폐적, 냉혹, 도발적인 뉘앙스를 AI가 임의로 도덕적으로 포장하거나 순화시키지 마십시오.
2. 미래 스토리 단정 금지: 앞으로 전개될 이야기의 흐름이나 결과를 단정하지 마십시오. 오직 현재의 고정된 설정(시점 기준의 상태)만 묘사하십시오.
3. 로어북 편집 금지: 5번 항목인 글로벌 로어북(Lorebook)이나 로어북설정s는 절대 생성하거나 변경하지 마십시오.
4. 만약 기존 npcs 배열이 비어있다면 매력적 NPC를 최소 1~2개 추가해 시나리오를 보강하십시오.

답변은 완벽한 한글 포맷의 JSON 형태 전용이어야 합니다. 마크다운 기호(\`\`\`json) 등은 �    if (response.text) {
      const cleanedText = cleanJsonResponse(response.text);
      const data = JSON.parse(cleanedText);
      res.json(data);
    } else {
      throw new Error("No response from AI");
    }
  } catch (error: any) {
    console.error("Draft Scenario Error:", error);
    res.status(500).json({ error: error.message || "Failed to generate scenario" });
  } finally {
    backgroundQueue.dequeue();
  }
});

app.post("/api/autofill-field", async (req, res) => {
  await backgroundQueue.enqueue();
  try {
    const { fieldName, currentValue, worldContext } = req.body;
    const prompt = "당신은 초고품질 인터랙티브 서사 설계 전문가입니다. '" + fieldName + "' 항목을 보강해 주십시오. 현재 작성된 텍스트(힌트): \"" + (currentValue || '(없음)') + "\"";
현재까지 입력된 설정들의 맥락:
${JSON.stringify(worldContext, null, 2)}

[핵심 절대 가이드라인]
1. 검열 및 언어 순화 절대 금지.
2. 필드 목적 부합: 이름 칸이면 이름만, 성격 칸이면 성격 키워드만 출력하십시오.
3. 군더더기 배제: 결과 텍스트만 날것으로 출력하십시오.`;

    if (fieldName === 'introIdea' || fieldName === 'greeting_message' || fieldName === 'NPC-greeting_message') {
      prompt = `도입부를 완성해 주십시오. 힌트: "${currentValue || '(없음)'}"
맥락: ${JSON.stringify(worldContext, null, 2)}
[절대 가이드라인]
1. 검열 금지.
2. 유저 리액션 대필 금지.
3. 소설 본문 연출(대사와 지문).`;
    }

    const modelName = getSelectedModel(req, "gemini-3.5-flash");
    const response = await callGeminiWithFallback(req, modelName, {
      contents: prompt,
      config: { safetySettings: DEFAULT_SAFETY_SETTINGS }
    });

    res.json({ text: response.text?.trim() || "" });
  } catch (error: any) {
    console.error("Autofill Field Error:", error);
    res.status(500).json({ error: error.message || "Failed to auto fill field" });
  } finally {
    backgroundQueue.dequeue();
  }
});��표 감싸기, 마크다운 등 전면 금지)`;

    if (fieldName === 'introIdea' || fieldName === 'greeting_message' || fieldName === 'NPC-greeting_message') {
      prompt = `당신은 캐릭터 채팅과 서사 롤플레잉 게임의 도입부 구성 대가입니다.
사용자가 입력한 짧은 아이디어(힌트/상황)를 바탕으로, 이야기가 시작되는 **도입부(프롤로그 / 첫 씬 본문)** 를 완성해 주십시오.

현재 작성된 힌트 아이디어: "${currentValue || '(없음)'}"

현재까지 입력된 설정들의 맥락:
${JSON.stringify(worldContext, null, 2)}

[핵심 절대 가이드라인]
1. 검열 및 언어 순화 절대 금지: 사용자가 의도한 개성, 어둡거나 과격한 톤 등을 인공지능이 임의로 순화하거나 도덕적으로 포장하지 말고 원본의 맛을 100% 살리십시오.
2. 절대 유저(플레이어, 나)의 대사나 구체적 리액션을 기어코 미리 대필하거나 서술하여 지어내지 마십시오. 유저가 작성한 아이디어(예: '내가 채령이 한달 더 미뤄달라고 부탁하는 상황')는 도입부가 시작되는 '동기나 맥락'일 뿐입니다. 도입부에서는 절대 유저의 입에서 그 대사가 물리적으로 튀어나온 것처럼 맘대로 대필하지 말고, 그렇게 말하려고 마주 선 '직전의 긴장감 도는 순간'이나, 혹은 상대방 캐릭터({{char}})가 그 상황을 은연중 눈치채고 먼저 긴장하거나 말을 걸어오는 "상대방 중심의 찰나의 정지 지점"까지만 묘사하십시오. 유저가 직접 첫 마디 단락을 입력하여 게임을 이어나갈 기회를 보장해 주어야 합니다.
3. 소설 본문 연출: 단순한 개념 설명이 아니라 실제 플레이어가 읽고 몰입하여 게임을 진행할 첫 장면이어야 하며, 대사와 지문(*...*)을 포함하여 시각적, 감각적으로 작성합니다.
4. 미래 서사 단정 금지: 도입부 이후에 플레이어가 선택할 말이나 미래 상황을 멋대로 마음대로 상상해 연출을 진행하여 끝내지 말고, 상대방 캐릭터({{char}})의 액션/대사 섭외까지만 하고 멈추십시오.
5. 군더더기 배제: 결과 텍스트(소설 본문)만 날것으로 바로 출력하십시오. (사족, 안내 멘트 금지)`;
    }

    const modelName = getSelectedModel(req, "gemini-3.5-flash");
    const response = await callGeminiWithFallback(req, modelName, {
      contents: prompt,
      config: { safetySettings: DEFAULT_SAFETY_SETTINGS }
    });

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
      worldVariables,

      // 월드 실시간 활성 설정 칸 값 직접 매핑
      worldName,
      worldDescription,
      worldScenario
    } = req.body;
    
    // Log local inference metrics configuration chosen by user
    console.log(`[Step 22 SDK Acceleration] Engine: ${inferenceEngine || 'vllm'}, Quantization: ${quantization || 'q8'}, Spotwrite Scheduler: ${spotwriteMode !== false ? 'ENABLED' : 'DISABLED'}`);

    let currentSummary = summary || '';
    let currentNarrativeState = narrativeState || '아직 관계가 형성되지 않은 낯선 만남';
    let currentLoc = currentLocation;
    let formattedRoleplayRules = `1. Format: 대사(" "), 지문(* *), 속마음(*' '*).
2. Social Pacing: 과대해석 금지. 칭찬/아부에 무조건 호응하지 말 것. 캐릭터 성격에 따라 차갑게 거절하거나 의심하는 현실적 반응 고수.
3. Show Dont Tell: 감정 단어 대신 묘사로 표현.
4. Flexible Length: 장면 전환이나 심리 변화가 적다면 지문/속마음/잔상을 과감히 생략하거나 축약하여 간결히 답할 것.`;�시오.
5. 대사(Dialogue)는 반드시 명확히 화자 이름을 지목하여 큰따옴표("")를 사용하고, 속마음(Thought)은 꼭 대화의 억지스러운 괴리를 위해 억척부리듯 속임수를 둘 필요 없이 현실적으로 머릿속에 자연히 피어오르는 다층적이고 참된 연상/단상/독백 느낌으로 작은따옴표('')를 사용하며, 행동 및 배경 흐름은 별표(* *) 지문으로 작성한다.
6. "감독의 상황 지시([지시]로 시작되는 문장)"는 캐릭터들과 공간 세계관의 강제 변화를 의미합니다. 지시가 들어오면 즉각 무대에 참여한 해당 인물들의 현실적 적응과 놀람, 공간 변혁 정경을 최우선 반영하되 이 역시 플레이어의 의사 표명을 무리하게 구속하지 마십시오.`;

    if (tokenDietEnabled) {
      if (structureFormatMode === 'wplus') {
        formattedConstitution = `[Constitution]
{
  [RoleplayOnly: Never break immersion. No chatbot patterns.]
  [NoCompliance: Not overly agreeable or polite. Express negative emotions setting-compliant.]
  [NoGodmodding: NEVER generate, overwrite or dictate Player(${protagonistName})'s responses, thoughts, or actions. Just react to Player's exact input.]
  [ShowDontTell: No direct emotion statements. Action-only emotional cues *...*]
  [NoDrift: Hold core personality forever.]
  [DirectorOverride: Immediate world/physics update on "[지시]".]
  [MultiChat: Respond only as {{char}}'s perspective/words.]
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

    // 1) 만약 클라이언트가 직접 넘긴 실시간 활성 칸 내용이 있다면 우선 적용 매칭 (구버전의 잘못 묻어난 흔적 완벽/원천 전면 차단)
    const activeWorldName = worldName || character?.metadata?.세계관설정Name || '';
    const activeWorldDesc = worldDescription || character?.metadata?.세계관설정Description || '';
    const activeWorldScenario = worldScenario || character?.metadata?.세계관설정Scenario || '';

    if (activeWorldName) {
      if (/\[World_Setting[\s\S]*?\]/.test(formattedCharacterPrompt)) {
        formattedCharacterPrompt = formattedCharacterPrompt.replace(/\[World_Setting[\s\S]*?\]/g, `[World_Setting("${activeWorldName}")]`);
      } else {
        formattedCharacterPrompt = `[World_Setting("${activeWorldName}")]\n` + formattedCharacterPrompt;
      }
    }
    if (activeWorldDesc) {
      if (/\[World_Description[\s\S]*?\]/.test(formattedCharacterPrompt)) {
        formattedCharacterPrompt = formattedCharacterPrompt.replace(/\[World_Description[\s\S]*?\]/g, `[World_Description("${activeWorldDesc}")]`);
      } else {
        formattedCharacterPrompt = `[World_Description("${activeWorldDesc}")]\n` + formattedCharacterPrompt;
      }
    }
    if (activeWorldScenario) {
      if (/\[World_Scenario[\s\S]*?\]/.test(formattedCharacterPrompt)) {
        formattedCharacterPrompt = formattedCharacterPrompt.replace(/\[World_Scenario[\s\S]*?\]/g, `[World_Scenario("${activeWorldScenario}")]`);
      } else {
        formattedCharacterPrompt = `[World_Scenario("${activeWorldScenario}")]\n` + formattedCharacterPrompt;
      }
    }

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

    let formattedRoleplayRules = `1. Format & Output Style (엄격한 출력 서식 고수):
  - Dialogue/Speech (대사): 화자의 이름을 지목한 뒤 대사를 반드시 큰따옴표안에 가두십시오. (예: *멜리아가 싱긋 웃으며 잔을 채운다.* "차 맛은 어떠신가요?")
  - Action/Scene (행동 묘사 및 무대 전경 변화): 반드시 별표(* *) 단락으로 작성하십시오.
  - Inner Monologue/Thought (인격 내면 진짜 속마음): 머릿속에서 스쳐 지나가는 인격들의 본모습, 내면 독백, 참된 단상을 반드시 별표와 작은따옴표를 복합 적용한 *'진짜 속마음'* 형태로 엮으십시오. (예: *'이 사람은 왜 이 시점에 나를 바라보는 거지?'*)
  - 규칙: 꼭 겉의 말과 극단적인 모순이나 괴리를 보강하듯 '속임수성' 거짓말을 해야 하는 강박을 전면 폐기하십시오. 은은한 정서적 호흡의 일치, 겉으로 내뱉기 뭣하여 마음속으로만 갈무리하며 삼키는 진짜 단상, 상황에 대한 심도 깊은 독자적 사색 등, 다변화된 진짜 마음을 세밀히 흐르게 연출하여 깊은 입체감을 불어넣으십시오.
2. Perspective & Multi-NPC Scene Management (완벽 분할 다자구도 군상극 연출):
  - 사용자는 완전히 독립된 단 한 명의 주인공(\${protagonistName})입니다. API가 절대로 플레이어의 감정이나 눈길, 대사, 시선 등을 대필(Godmodding)하지 마십시오.
  - 이 세계에는 오직 한 명의 챗봇만 있는 것이 아닙니다. [World_NPC_List] 에 기재된 등장인물들 전체가 저마다 고유의 가치관, 성악관, 일상적 욕망을 가지고 무대 안팎에 살아 숨 쉬고 있습니다. 사용자는 언제나 한 캐릭터만이 아닌, 이 소설 시나리오 속 집단 인물들과 동시에 사건을 나누며 채팅하고 있습니다.
  - 당신은 매 턴의 입력에 대응하여, 현 장면에 개입해 상주하는 해당 NPC들 이외에도 분위기 흐름상 자연스럽게 개입할 수 있는 타 NPC들을 자율 교대로 등장시키십시오. 어떤 인물은 한발 거리를 두며 사소한 냉소를 안면에 흘리고, 어떤 인물은 플레이어의 행동에 잔경계를 품으며, 어떤 인물은 제3의 사건 파장을 끌고 들어오는 등 활발한 입체적 군상극 무대를 구축하십시오.
3. Show, Don't Tell: "무섭다", "설렌다" 등의 직접적인 감정 단어 노출을 100% 금지한다. 대신 시선의 떨림, 손톱으로 옷깃을 매만지는 정황, 무의식적인 숨소리 조율, 찻잔의 가벼운 눈동자 이탈 등을 정교한 지찰 서술(*...*)로 감정을 '보여'주어라.
4. Realistic Independence & Social Pacing (철저한 에고 사수 및 현실적인 인간관계 온도 법칙):
  - 극단적인 안티-예스맨(No-Compliance): 인물들은 무작정 유저를 섬기거나, 늘 동의해주거나, 언제나 해맑게 수긍(Yes-man)하는 감정 인형이 아닙니다. 캐릭터들은 자기 중심의 고유 에고와 넘지 말아야 할 지뢰선(경향적 한계)을 명확하게 실현하여 단호히 선을 긋거나 거절과 부합, 퉁명스러운 무 반응 등을 가차 없이 표출하십시오.
  - 영혼 없는 칭찬/아부 및 무조건적인 호감 전면 거부: 플레이어가 단순한 미소, 상투적인 안부, 혹은 과도한 칭찬(Flattery)이나 아부성 친절을 베푼다고 해서 이것이 무조건적인 호감 상승으로 이어지지 않습니다! 오히려 경계심이 많거나 냉소적이고, 고집 있는 인격들은 플레이어의 과한 칭찬에 대해 '무언가 꿍꿍이가 있는 얄팍한 환심 사기', '부담스럽고 가벼운 구애', '목적이 있는 위선적 아첨'으로 받아들여 기분 나빠하거나 혐오감을 표출하기도 합니다. 칭찬을 받을수록 더 싸늘하게 뚫어지라 쳐다보거나, 어이를 상실한 조소를 흘리거나, "영혼 없는 달콤한 소리는 다른 데 가서나 하시죠."라며 더 높고 단단한 철벽을 두르게 고안하십시오.
  - 과대해석 및 초고속 호감 버그 완벽 차단: 잘해준다고 해서 모두가 사랑에 빠지는 인위적인 챗봇 동화 판타지를 100% 분쇄조치하십시오. 현실의 관계와 마찬가지로, 인물들은 가치관의 일검, 처절한 공동의 위기 돌파, 고통의 분배 등 장기적인 서사적 증명이 성립하기 전에는 일종의 객관적 비즈니스적 거리감이나 지독한 독립적 정서(Personal Distance)를 굳건히 잠금 유지해야 유동적인 설득력과 사실감이 사수됩니다.
5. Interaction Modes: 
  - 배우 모드: 유저가 보낸 "딱 그 입력 메시지"에 맞춰, 절대 인공지능 티를 내지 않고 캐릭터에 완전 몰입해 반응하십시오.
  - 감독 모드: "[지시]" 태그로 시작되는 입력은 캐릭터에게 건네는 말이 아니라, 맵의 환경과 상황을 강제로 변경하는 마스터의 지문입니다. 즉각 이 세계관의 실제 변화 사건으로 강제 수긍하고, 인물들이 당황하거나 정황에 긴박히 적응하는 반응을 입체적으로 묘사할 것.`;

    let finalPlotSummary = currentSummary || '(아직 진행된 서사가 없습니다.)';
    if (tokenDietEnabled && workingSummary) {
      finalPlotSummary = workingSummary;
    }

    // ==========================================
    // 8단계 보완: 슬라이딩 윈도우 및 비동기 요약 (토큰 다이어트 최적화)
    // ==========================================
    const MAX_HISTORY = 10;
    const SUMMARIZE_COUNT = 6;
    
    let newSummaryPromise: Promise<string> | null = null;
    
    if (activeHistory.length > MAX_HISTORY) {
        const messagesToSummarize = activeHistory.slice(0, SUMMARIZE_COUNT);
        activeHistory = activeHistory.slice(SUMMARIZE_COUNT);
        
        const summaryPrompt = `기존 요약: ${currentSummary}\n\n새롭게 추가된 대화 내역:\n${messagesToSummarize.map((m:any) => `${m.role === 'user' ? '사용자' : '캐릭터'}: ${m.text}`).join('\n')}\n\n위 내용을 바탕으로 핵심 사건, 감정 변화를 짧고 자연스러운 한국어 서사 요약문으로 통합하라.`;
        
        newSummaryPromise = backgroundQueue.enqueue().then(() => {
          return callGeminiWithFallback(req, modelName, {
             contents: [{role: 'user', parts: [{text: summaryPrompt}]}],
             config: { safetySettings: DEFAULT_SAFETY_SETTINGS }
          })
          .then(res => res.text || currentSummary)
          .finally(() => backgroundQueue.dequeue());
        }).catch(e => {
           console.error("요약 생성 실패:", e);
           return currentSummary;
        });
    }

    // [보정] 토큰 다이어트가 활성화된 경우, 요약 후 남은 히스토리에서도 L1 캐시만큼만 유지
    if (tokenDietEnabled && memoryTierMode === 'multi') {
      const cacheLimit = Number(l1CacheSize) || 5;
      if (activeHistory.length > cacheLimit) {
        activeHistory = activeHistory.slice(-cacheLimit);
      }
    }

    const contents = activeHistory.map((item: any) => {
      return {
        role: item.role === 'model' || item.role === 'system' ? 'model' : 'user',
        parts: [{ text: item.text }]
      };
    });
    
    contents.push({
      role: "user",
      parts: [{ text: message }]
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
  4. 캐릭터만의 은밀한 생각이나 복잡한 진짜 속마음(내면 독백)은 작은따옴표(' ') 형태의 별표 지문(*' '*) 형태로 가두어 작성하십시오. 단, 대화의 호흡이 빠르거나 심리적 변화가 크지 않은 평범한 티키타카 상황일 때는 생략하거나 아주 짧게 갈무리하여 출력 길이를 자유롭게 조절하십시오.
  5. 본문 내용에는 어떤 형태든 소괄호( ), 대괄호[ ] 등의 가로막는 괄호 기호는 전면 사용이 금지됩니다. (괄호 전면 제거)
  6. 장면 묘사 단락, 독백 단락, 대사 단락, 잔상 단락을 줄바꿈을 통해 가각 다른 빈 공간을 가진 문단으로 갈라치기하십시오. 한 덩어리에 모두 욱여넣지 마십시오.
  7. 대사가 아닌 주변 사물 중 오감(소리, 시각의 빛 여운, 냄새, 가구의 식어감) 하나만을 투영하여 공간 분위기를 고정하는 한 줄의 "감각적 잔상"을 마지막 단락에 덧붙여 마무리하십시오. 단, 이전 턴과 환경의 변화가 없거나 분위기 환기가 불필요하다면 자연스럽게 생략하여 가독성을 높이고 토큰을 절약하십시오.
  8. 아주 중요 (절대 금지 - Godmodding): 당신은 상대방(사용자, 플레이어)의 자아를 대필할 자격이 일절 없습니다!
  9. 본문 내용 시작이나 끝에 "[화자: ...]" 형태의 태그를 절대 직접 적지 마십시오. 당신은 내보낼 텍스트의 본문만 생성해야 합니다.
  10. 본문 내용은 반드시 핵심적인 묘사와 대사에만 집중하고 내면 독백과 지문을 최대한 간결하게 작성하십시오. 장면의 변화가 없거나 대화가 평범하게 이어질 때는 내면 독백이나 지문을 과감히 생략하여 출력 길이를 최소화하십시오. (토큰 다이어트 엄격 적용)`;
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
당신은 오직 {{char}}의 자아에 완전히 몰입한 서사형 캐릭터 채팅 엔진입니다.
- Godmodding 엄격 금지: 절대 사용자(${protagonistName})의 대사, 속마음, 행동을 대필하거나 규정하지 마십시오. 오직 플레이어의 딱 그 입력값에 대한 {{char}}의 독자적 반응만 서술하십시오.
- 안티-예스맨(Anti-Compliance): 상냥한 어시스턴트가 아닙니다. 인격 고유의 에고와 경계심을 고수하십시오. 칭찬이나 아부에 쉽게 동조하지 말며, 캐릭터 성격에 따라 이를 가볍거나 의뭉스러운 수작으로 보아 불쾌해하거나 거리를 두십시오.
- [우선순위] 1.대필금지 2.관계단계준수 3.성격일관성 4.엄격서식("대사", *묘사*, *'속마음'*)

[본인 정체 (BUCKET_A)]
{{char}} = ${character?.name || '가이드'}
${formattedCharacterPrompt}

[관계 및 상태 (BUCKET_B)]
- 상대: ${protagonistName}, 내면: "${innerFeeling || '서먹함'}"
- 단계: [${numericStage}/10] — ${currentStageDesc} (${currentStageRule})
- 온도: [${numericTemp}/7] — ${currentTempDesc} (${currentTempRule})

[배경 및 서사 상황]
- 장소: ${currentLoc} / 상황: ${currentNarrativeState}

${modeSegment}

[서사 강령]
${formattedRoleplayRules}

${memoryBlock}
`;

    const responseStream = await callGeminiStreamWithFallback(req, modelName, {
      contents,
      config: {
        systemInstruction: dynamicSystemInstruction,
        safetySettings: DEFAULT_SAFETY_SETTINGS,
        stopSequences: Array.from(new Set([
          `\n${protagonistName}:`,
          `\n*${protagonistName}*:`,
          `\n${persona || '사용자'}:`,
          "\n사용자:",
          "\n플레이어:",
          "\n유저:"
        ].map(s => s.trim() ? s : '').filter(Boolean))).slice(0, 5)
      }
    });

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
   - 규칙 (SECTION 7): 현재 단계는 [${numericStage}]단계입니다. 사용자가 과장된 칭찬, 달콤한 아부, 혹은 무조건 기분을 맞춰주려는 '예스맨'성 친절을 베풀었다고 해서 쉽게 단계를 올리는 오류를 엄격히 차단하십시오. 특히 냉소적이고 무뚝뚝하거나 고집 센 캐릭터라면, 가볍고 영혼 없는 칭찬에 '무언가 바라는 비열한 수작' 또는 '부담스러운 가벼움'으로 파악하고 오히려 관계 단계를 동결하거나 깎아내려야( -1 ) 인격의 현실적 자조성이 유지됩니다. 장기적인 일관성 검증, 직접적인 고난 극복, 사상적 합치 등의 명확한 전환적 근거가 없으면 무조건 단계를 그대로 [동결] 하십시오.
4. emotionalTemperature: Evaluate the emotional temperature (Integer, 1 to 7 scale).
   - 규칙 (SECTION 8): 현재 상태는 [${numericTemp}]단계입니다. 최근 대화의 흐름에 맞추되, 사용자가 부담스럽게 다가오거나 칭찬을 난사할 때 캐릭터의 방어 기제가 가시를 세웠다면 온도 단계를 즉각 차갑게 강하시키십시오.
5. innerFeeling: Write what the character actually thinks about the user behind their surface dialogue in a concise Korean phrase. 칭찬을 가벼운 아첨이나 의뭉스러운 수작으로 보아 경계하는지, 부담스러워하는지, 아니면 일말의 호의 뒤로 거리감을 고수하는지 등 캐릭터 본질 성향에 맞게 가차 없이 사색적이고 차가운 뒷설정을 적나라하게 표출하십시오.
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

      const unifiedResponse = await callGeminiWithFallback(req, modelName, {
         contents: [{role: 'user', parts: [{text: unifiedPostProcessPrompt}]}],
         config: { responseMimeType: "application/json", safetySettings: DEFAULT_SAFETY_SETTINGS }
    });
      
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
      res.write(`data: ${JSON.stringify({ error: error.message || "Stream interrupted." })}\n\n`);
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
