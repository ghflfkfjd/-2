const fs = require('fs');

// 1. Update CharacterCreator.tsx
let charCode = fs.readFileSync('src/components/CharacterCreator.tsx', 'utf8');
charCode = charCode.replace(
  /let compiledFirstGreeting = `\*감미로운 파스텔빛 노을이 옅게 흩날리는 평화로운 세계가 펼쳐집니다\. 이 포근한 \$\{세계관설정Name\}에서 당신\(\$\{주인공설정Name \|\| '플레이어'\}\)은 따스하게 불어오는 미풍과 함께 조용히 눈을 뜹니다\.\*`;\s*if \(introIdea\.trim\(\)\) \{\s*compiledFirstGreeting = `\[AUTO_START_INTRO\] \$\{introIdea\.trim\(\)\}`;\s*\}/g,
  `let compiledFirstGreeting = \`*감미로운 파스텔빛 노을이 옅게 흩날리는 평화로운 세계가 펼쳐집니다. 이 포근한 \${세계관설정Name}에서 당신(\${주인공설정Name || '플레이어'})은 따스하게 불어오는 미풍과 함께 조용히 눈을 뜹니다.*\`;
    if (introIdea.trim()) {
      compiledFirstGreeting = introIdea.trim();
    }`
);
fs.writeFileSync('src/components/CharacterCreator.tsx', charCode);

// 2. Update ChatRoom.tsx
let chatCode = fs.readFileSync('src/components/ChatRoom.tsx', 'utf8');

chatCode = chatCode.replace(
  /if \(character\.greeting_message\.startsWith\('\[AUTO_START_INTRO\]'\)\) \{\s*introIdeaVal = character\.greeting_message\.replace\('\[AUTO_START_INTRO\]', ''\)\.trim\(\);\s*\} else \{\s*introIdeaVal = character\.greeting_message;\s*\}/g,
  "introIdeaVal = character.greeting_message;"
);

chatCode = chatCode.replace(
  /let cleanGreeting = character\.greeting_message \|\| '\*환영합니다\. 이야기가 시작됩니다\.\*';\s*if \(cleanGreeting\.startsWith\('\[AUTO_START_INTRO\]'\)\) \{\s*cleanGreeting = cleanGreeting\.replace\('\[AUTO_START_INTRO\]', ''\)\.trim\(\);\s*\}/g,
  "let cleanGreeting = character.greeting_message || '*환영합니다. 이야기가 시작됩니다.*';"
);

chatCode = chatCode.replace(
  /let updatedGreeting = editIntroIdea;\s*if \(editIntroIdea\.trim\(\) && !editIntroIdea\.startsWith\('\[AUTO_START_INTRO\]'\)\) \{\s*updatedGreeting = `\[AUTO_START_INTRO\] \$\{editIntroIdea\.trim\(\)\}`;\s*\}/g,
  "let updatedGreeting = editIntroIdea;"
);

fs.writeFileSync('src/components/ChatRoom.tsx', chatCode);
