const fs = require('fs');
let code = fs.readFileSync('src/components/ChatRoom.tsx', 'utf8');

const startMarker = '              {/* 로컬 추론 엔진 및 초저지연 가속 매니저 (Step 22) */}';
const endMarker = '      {/* Input Form */}';

const startIndex = code.indexOf(startMarker);
const endIndex = code.indexOf(endMarker);

if (startIndex !== -1 && endIndex !== -1) {
  code = code.substring(0, startIndex) + code.substring(endIndex);
  fs.writeFileSync('src/components/ChatRoom.tsx', code, 'utf8');
  console.log("Success");
} else {
  console.log("Failed to find markers", startIndex, endIndex);
}
