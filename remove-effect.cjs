const fs = require('fs');
let chatCode = fs.readFileSync('src/components/ChatRoom.tsx', 'utf8');

const regex = /const hasAutoStarted = useRef\(false\);\s*useEffect\(\(\) => \{\s*if \(messages\.length === 1 &&[\s\S]*?\}\), \[messages, character, userPersona\]\);/g;

chatCode = chatCode.replace(regex, '');

fs.writeFileSync('src/components/ChatRoom.tsx', chatCode);
