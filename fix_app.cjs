const fs = require('fs');

let code = fs.readFileSync('src/App.tsx', 'utf8');

// State for model
code = code.replace(
  "const [userApiKey, setUserApiKey] = useState(() => localStorage.getItem('gemini_user_api_key') || '');",
  `const [userApiKey, setUserApiKey] = useState(() => localStorage.getItem('gemini_user_api_key') || '');
  const [userModel, setUserModel] = useState(() => localStorage.getItem('gemini_user_model') || 'gemini-2.5-flash');
  const [tempModel, setTempModel] = useState('');`
);

code = code.replace(
  "setTempApiKey(userApiKey);",
  "setTempApiKey(userApiKey);\n    setTempModel(userModel);"
);

code = code.replace(
  "setTempApiKey(localStorage.getItem('gemini_user_api_key') || '');",
  "setTempApiKey(localStorage.getItem('gemini_user_api_key') || '');\n                setTempModel(localStorage.getItem('gemini_user_model') || 'gemini-2.5-flash');"
);

code = code.replace(
  /const handleSaveApiKey = \(\) => {[\s\S]*?};/,
  `const handleSaveApiKey = () => {
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
    
    alert('설정이 저장되었습니다. 이제 맞춤형 설정이 즉시 적용됩니다.');
    setIsApiKeyModalOpen(false);
  };`
);

// Add model dropdown and change API key input to a multiline textarea or just a hint
code = code.replace(
  `<input 
                      type="password"
                      placeholder="AIzaSy..."
                      value={tempApiKey}
                      onChange={(e) => setTempApiKey(e.target.value)}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono outline-hidden focus:border-gray-400 focus:ring-1 focus:ring-gray-400 transition-colors"
                    />`,
  `<textarea 
                      placeholder="여러 개의 키를 등록하려면 쉼표(,)로 구분하세요 (예: AIzA..., AIzA...)"
                      value={tempApiKey}
                      onChange={(e) => setTempApiKey(e.target.value)}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 transition-colors resize-none h-20"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block mb-1">AI 모델 선택</label>
                    <div className="relative">
                      <select
                        value={tempModel}
                        onChange={(e) => setTempModel(e.target.value)}
                        className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 transition-colors appearance-none cursor-pointer text-gray-700"
                      >
                        <option value="gemini-2.5-flash">Gemini 2.5 Flash (플래시 - 권장)</option>
                        <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite (플래시 라이트 - 초고속)</option>
                        <option value="gemini-2.5-pro">Gemini 2.5 Pro (프로 - 강력한 추론)</option>
                      </select>
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none text-gray-400">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                      </div>
                    </div>`
);

code = code.replace(
  /Gemini API 키 \(GEMINI_API_KEY\)/g,
  'Gemini API 키 목록 (할당량 소진시 자동 전환)'
);

// Apply pastel colors to modal instead of gray
code = code.replace(/text-gray-900/g, 'text-[#4A4042]');
code = code.replace(/text-gray-500/g, 'text-[#A85860]');
code = code.replace(/text-gray-700/g, 'text-[#8C464D]');
code = code.replace(/text-gray-600/g, 'text-[#A85860]');
code = code.replace(/bg-gray-50/g, 'bg-[#FFF0F2]');
code = code.replace(/border-gray-100/g, 'border-[#FFE1E5]');
code = code.replace(/border-gray-200/g, 'border-[#FFE1E5]');
code = code.replace(/focus:border-gray-400/g, 'focus:border-[#FF9AAF]');
code = code.replace(/focus:ring-gray-400/g, 'focus:ring-[#FF9AAF]');
code = code.replace(/bg-gray-900/g, 'bg-[#FF7A85]');
code = code.replace(/hover:bg-gray-800/g, 'hover:bg-[#FF6572]');

fs.writeFileSync('src/App.tsx', code, 'utf8');
