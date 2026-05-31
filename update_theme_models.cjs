const fs = require('fs');

const files = [
  'src/App.tsx',
  'src/components/ChatRoom.tsx',
  'src/components/CharacterCreator.tsx',
  'src/components/CharacterList.tsx',
  'src/components/PersonaSetup.tsx',
  'src/index.css',
  'server.ts'
];

const colorMap = {
  // Pinks & Pastels
  '#FFF9FA': '#F8FAFC',
  '#FFF0F2': '#F1F5F9',
  '#FFE1E5': '#E2E8F0',
  '#FFD5DA': '#CBD5E1',
  '#FFB5BC': '#94A3B8',
  '#FF9AAF': '#64748B',
  '#FF879E': '#475569',
  '#FF7A85': '#0F172A',
  '#FF6572': '#1E293B',
  '#A85860': '#475569',
  '#8C464D': '#334155',
  '#4A4042': '#0F172A',
  '#E88C95': '#94A3B8',
  '#FFFDFD': '#FFFFFF',
  '#554A4B': '#334155',
  '#FFE5E7': '#E2E8F0',
  '#FFEBEF': '#F1F5F9',
  
  // Browns
  '#FAF9F6': '#FFFFFF',
  '#FAF8F5': '#F8FAFC',
  '#FAF7F2': '#F8FAFC',
  '#FAF5EE': '#F1F5F9',
  '#EBE3D5': '#E2E8F0',
  '#EAE2D5': '#E2E8F0',
  '#DBD2C1': '#E2E8F0',
  '#EAE5DC': '#E2E8F0',
  '#EAE4D9': '#F1F5F9',
  '#EFECE6': '#F1F5F9',
  '#DCD6CC': '#E2E8F0',
  '#8C7B72': '#64748B',
  '#EBE6DD': '#E2E8F0',
  '#96897E': '#475569',
  '#63574A': '#475569',
  '#4B4033': '#334155',
  '#A68F84': '#64748B',
  '#8C7B65': '#475569',
  '#867562': '#64748B',
  '#3E3830': '#0F172A',
  
  // Greens
  '#EAFDF1': '#F8FAFC',
  '#C8E6C9': '#E2E8F0',
  '#2E7D32': '#475569',
  
  // Grays
  '#AAAAAA': '#94A3B8',
  '#888888': '#64748B',
  '#555555': '#475569',

  // Shadows
  'rgba(255,122,133,': 'rgba(15,23,42,',
  'rgba(255,154,175,': 'rgba(15,23,42,',
};

function replaceAll() {
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    let code = fs.readFileSync(file, 'utf8');

    // 1. Model names substitution
    code = code.replace(/gemini-2\.5-flash-lite/g, 'gemini-3.1-flash-lite');
    code = code.replace(/gemini-2\.5-flash/g, 'gemini-3.5-flash');
    code = code.replace(/gemini-2\.5-pro/g, 'gemini-3.1-pro');
    
    // 2. Exact UI Labels
    // Convert 2.5 back to respective numbers for the UI display string
    code = code.replace(/Gemini 2\.5 Flash \(플/g, 'Gemini 3.5 Flash (플'); 
    code = code.replace(/Gemini 2\.5 Flash Lite/g, 'Gemini 3.1 Flash Lite');
    code = code.replace(/Gemini 2\.5 Pro/g, 'Gemini 3.1 Pro');
    
    // 3. Color mapping
    for (const [oldColor, newColor] of Object.entries(colorMap)) {
      code = code.split(oldColor).join(newColor);
    }

    fs.writeFileSync(file, code, 'utf8');
  }
}
replaceAll();
console.log('Successfully updated theme and models.');
