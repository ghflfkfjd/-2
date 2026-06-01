const { GoogleGenAI } = require("@google/genai");
async function main() {
  const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await gemini.models.listModels({});
  for await (const m of response) {
    console.log(m.name);
  }
}
main().catch(console.error);
