const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
`function getAIClient(req: express.Request): GoogleGenAI {
  const userApiKey = req.headers['x-user-api-key'] as string;
  if (userApiKey && userApiKey.trim() !== '') {
    return new GoogleGenAI({
      apiKey: userApiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return ai;
}`,
`function getApiKeys(req: express.Request): string[] {
  const userApiKey = req.headers['x-user-api-key'] as string;
  if (userApiKey && userApiKey.trim() !== '') {
    return userApiKey.split(',').map(k => k.trim()).filter(k => k);
  }
  return [];
}

function getSelectedModel(req: express.Request, defaultModel = "gemini-2.5-flash"): string {
  const userModel = req.headers['x-user-model'] as string;
  return (userModel && userModel.trim() !== '') ? userModel : defaultModel;
}

async function withRetry<T>(req: express.Request, operation: (client: GoogleGenAI) => Promise<T>): Promise<T> {
  const keys = getApiKeys(req);
  if (keys.length === 0 && process.env.GEMINI_API_KEY) {
    keys.push(process.env.GEMINI_API_KEY);
  }
  
  if (keys.length === 0) {
    // Fallback if no keys at all
    return operation(ai);
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
      console.warn('API Key error:', error?.message, '. Trying next key...');
      continue;
    }
  }
  throw lastError;
}`
);

// Now update the endpoints to use withRetry and getSelectedModel
// /api/snapshot
code = code.replace(
`    const client = getAIClient(req);
    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
    });`,
`    const modelName = getSelectedModel(req, "gemini-2.5-flash");
    const response = await withRetry(req, (client) => client.models.generateContent({
      model: modelName,
      contents: prompt,
    }));`
);

// /api/draft-character
code = code.replace(
`    const client = getAIClient(req);
    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });`,
`    const modelName = getSelectedModel(req, "gemini-2.5-flash");
    const response = await withRetry(req, (client) => client.models.generateContent({
      model: modelName,
      contents: prompt,
      config: { responseMimeType: "application/json" }
    }));`
);

// /api/translate
code = code.replace(
`    const client = getAIClient(req);
    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
    });`,
`    const modelName = getSelectedModel(req, "gemini-2.5-flash");
    const response = await withRetry(req, (client) => client.models.generateContent({
      model: modelName,
      contents: prompt,
    }));`
);

// /api/chat - need to be careful with stream and multi calls
code = code.replace(
`  const client = getAIClient(req);`,
`  const modelName = getSelectedModel(req, "gemini-2.5-flash");`
);

code = code.replace(
`      const embeddingResult = await client.models.embedContent({
        model: "gemini-embedding-2-preview",
        contents: message
      });`,
`      const embeddingResult = await withRetry(req, (client) => client.models.embedContent({
        model: "gemini-embedding-2-preview",
        contents: message
      }));`
);

code = code.replace(
`          return client.models.generateContent({
             model: "gemini-3.5-flash", 
             contents: [{role: 'user', parts: [{text: summaryPrompt}]}]
          })`,
`          return withRetry(req, (client) => client.models.generateContent({
             model: modelName, 
             contents: [{role: 'user', parts: [{text: summaryPrompt}]}]
          }))`
);

code = code.replace(
`    const responseStream = await llmBreaker.execute(() => client.models.generateContentStream({
      model: "gemini-3.5-flash",
      contents,
      config: {
        systemInstruction: dynamicSystemInstruction,
      }
    }));`,
`    const responseStream = await llmBreaker.execute(() => withRetry(req, (client) => client.models.generateContentStream({
      model: modelName,
      contents,
      config: {
        systemInstruction: dynamicSystemInstruction,
      }
    })));`
);

code = code.replace(
`      const stateResponse = await client.models.generateContent({
         model: "gemini-3.5-flash",
         contents: [{role: 'user', parts: [{text: statePrompt}]}],
         config: { responseMimeType: "application/json" }
      });`,
`      const stateResponse = await withRetry(req, (client) => client.models.generateContent({
         model: modelName,
         contents: [{role: 'user', parts: [{text: statePrompt}]}],
         config: { responseMimeType: "application/json" }
      }));`
);

code = code.replace(
`      const evalResponse = await client.models.generateContent({
         model: "gemini-3.5-flash", // 판단용 LLM
         contents: [{role: 'user', parts: [{text: evalPrompt}]}],
         config: { responseMimeType: "application/json" }
      });`,
`      const evalResponse = await withRetry(req, (client) => client.models.generateContent({
         model: modelName, // 판단용 LLM
         contents: [{role: 'user', parts: [{text: evalPrompt}]}],
         config: { responseMimeType: "application/json" }
      }));`
);

fs.writeFileSync('server.ts', code, 'utf8');
console.log("Replaced server.ts");
