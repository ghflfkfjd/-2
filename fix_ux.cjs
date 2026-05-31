const fs = require('fs');

let code = fs.readFileSync('src/components/ChatRoom.tsx', 'utf8');

// Upgrade main background to soft pinkish pastel
code = code.replace(
  /className="flex-1 flex flex-col h-full bg-\[\#FAF9F6\] relative overflow-hidden"/g,
  'className="flex-1 flex flex-col h-full bg-[#FFF9FA] relative overflow-hidden"'
);

// Upgrade header shadow and border
code = code.replace(
  /className="w-full p-4 bg-white\/90 backdrop-blur-md border-b border-\[\#EAE5DC\] z-10 shrink-0 shadow-xs flex flex-col"/g,
  'className="w-full p-4 bg-white/95 backdrop-blur-lg border-b border-[#FFE1E5] z-10 shrink-0 shadow-[0_4px_20px_-5px_rgba(255,122,133,0.08)] flex flex-col"'
);

// Header buttons
code = code.replace(
  /bg-\[\#FAF9F5\] hover:bg-\[\#EFECE6\]/g,
  'bg-[#FFFDFD] hover:bg-[#FFF0F2]'
);
code = code.replace(
  /border-\[\#DCD6CC\]/g,
  'border-[#FFE1E5]'
);
code = code.replace(
  /text-\[\#63574A\] hover:text-\[\#4B4033\]/g,
  'text-[#A85860] hover:text-[#8C464D]'
);

// Chat Bubble (Model)
code = code.replace(
  /\? 'bg-\[\#EAE4D9\] text-\[\#63574A\] border-\[\#DBD2C1\]'/g,
  "? 'bg-[#FFF0F2] text-[#A85860] border-[#FFE1E5] shadow-[0_2px_8px_-2px_rgba(255,122,133,0.15)]'"
);

// Chat Bubble Icon
code = code.replace(
  /className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border shadow-sm transition-colors/g,
  'className="w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0 border shadow-md transition-all'
);

// Chat Bubble Text wrapping (User)
code = code.replace(
  /\? 'bg-\[\#EFECE6\] border-\[\#DCD6CC\] text-\[\#3E3830\] rounded-2xl rounded-tr-none'/g,
  "? 'bg-[#FF9AAF] border-[#FF879E] text-white rounded-2xl rounded-tr-none shadow-[0_2px_10px_-2px_rgba(255,154,175,0.3)]'"
);
// Chat Bubble Text wrapping (Model)
code = code.replace(
  /: 'bg-white border-\[\#EAE5DB\] rounded-2xl rounded-tl-none text-\[\#2F2922\]'/g,
  ": 'bg-white border-[#FFE1E5] rounded-2xl rounded-tl-none text-[#554A4B] shadow-[0_2px_10px_-2px_rgba(255,122,133,0.05)]'"
);

// User icon
code = code.replace(
  /: 'bg-\[\#96897E\] text-\[\#FFF9F5\] border-\[\#817469\]'/g,
  ": 'bg-[#FF9AAF] text-white border-[#FF879E] shadow-[0_2px_8px_-2px_rgba(255,154,175,0.3)]'"
);

// Loading indicator inner dots
code = code.replace(
  /bg-\[\#EAE4D9\] text-\[\#63574A\] border border-\[\#DBD2C1\]/g,
  'bg-[#FFF0F2] text-[#A85860] border border-[#FFE1E5]'
);
code = code.replace(/bg-\[\#A68F84\] animate-bounce/g, 'bg-[#FF7A85] animate-bounce');
code = code.replace(/border border-\[\#EAE5DB\] p-4 rounded-3xl/g, 'border border-[#FFE1E5] p-4 rounded-3xl');

// Input area
code = code.replace(
  /className="w-full bg-white border border-gray-200 focus:border-gray-400/g,
  'className="w-full bg-white border border-[#FFE1E5] focus:border-[#FF9AAF] focus:shadow-[0_0_0_4px_rgba(255,154,175,0.1)]'
);
code = code.replace(
  /className="p-4 md:p-6 bg-white border-t border-gray-200 shrink-0 z-10 space-y-4"/g,
  'className="p-4 md:p-6 bg-[#FFFDFD] border-t border-[#FFE1E5] shrink-0 z-10 space-y-4 shadow-[0_-5px_20px_-10px_rgba(255,122,133,0.05)]"'
);

// Send button
code = code.replace(
  /\? 'bg-gray-800 hover:bg-gray-700'/g,
  "? 'bg-[#FF7A85] hover:bg-[#FF6572] shadow-[0_2px_10px_-2px_rgba(255,122,133,0.4)]'"
);
code = code.replace(
  /: 'bg-gray-900 hover:bg-gray-800'/g,
  ": 'bg-[#FF7A85] hover:bg-[#FF6572] shadow-[0_2px_10px_-2px_rgba(255,122,133,0.4)]'"
);
code = code.replace(
  /: 'bg-gray-100 !text-gray-400'/g,
  ": 'bg-[#FFF0F2] !text-[#FFB5BC] border border-[#FFE1E5]'"
);

// Dashboard Overlay fix border and bg
code = code.replace(
  /className="absolute top-0 right-0 h-full w-\[340px\] md:w-\[400px\] bg-\[\#FAF9F5\] border-l border-\[\#EBE3D5\]/g,
  'className="absolute top-0 right-0 h-full w-[340px] md:w-[400px] bg-[#FFF9FA] border-l border-[#FFE1E5]'
);

// Dashboard close button hover
code = code.replace(
  /hover:bg-\[\#FAF7F2\]/g, // Wait, maybe it is bg-gray-100? No I changed them to bg-[#FAF7F2] previously
  'hover:bg-[#FFF0F2]'
);

// Format Text helper boxes inside
code = code.replace(
  /bg-\[\#FAF8F5\] border border-\[\#EBE3D5\]/g,
  'bg-[#FFFDFD] border border-[#FFE1E5]'
);
code = code.replace(
  /text-\[\#8C7B65\] bg-\[\#FAF8F5\] /g,
  'text-[#A85860] bg-[#FFF0F2] '
);
code = code.replace(
  /bg-\[\#FAF5EE\] border border-\[\#EAE2D5\]/g,
  'bg-[#FFF0F2] border border-[#FFE1E5]'
);

fs.writeFileSync('src/components/ChatRoom.tsx', code, 'utf8');
console.log("Done phase 3");
