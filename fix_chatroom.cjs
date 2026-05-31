const fs = require('fs');
let code = fs.readFileSync('src/components/ChatRoom.tsx', 'utf8');

// Replace system instruction bubble
code = code.replace(
  /className="bg-gray-100 px-6 py-3 rounded-full text-\[11px\] text-gray-500 flex items-center gap-3 border border-gray-200 shadow-sm font-semibold"/g,
  'className="bg-[#FAF5EE] px-6 py-3 rounded-full text-[11px] text-[#847365] flex items-center gap-3 border border-[#EAE2D5] shadow-xs font-semibold"'
);
code = code.replace(
  /<span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse"><\/span>/g,
  '<span className="w-1.5 h-1.5 rounded-full bg-[#A68F84] animate-pulse"></span>'
);

// Replace system image bubble
code = code.replace(
  /className="bg-gray-50 p-2 rounded-2xl border border-gray-200 shadow-sm text-center w-full font-medium overflow-hidden"/g,
  'className="bg-[#FAF7F2] p-2 rounded-2xl border border-[#EBE3D5] shadow-xs text-center w-full font-medium overflow-hidden"'
);

// Replace avatar backgrounds
code = code.replace(
  /\? 'bg-gray-100 text-gray-900 border-gray-200'/g,
  "? 'bg-[#EAE4D9] text-[#63574A] border-[#DBD2C1]'"
);
code = code.replace(
  /: 'bg-gray-900 text-white border-gray-800'/g,
  ": 'bg-[#96897E] text-[#FFF9F5] border-[#817469]'"
);

// Replace user bubble
code = code.replace(
  /\? 'bg-white border-gray-200 text-gray-900 rounded-2xl rounded-tr-none'/g,
  "? 'bg-[#EFECE6] border-[#DCD6CC] text-[#3E3830] rounded-2xl rounded-tr-none'"
);
code = code.replace(
  /: 'bg-white border-gray-200 rounded-2xl rounded-tl-none text-gray-900'/g,
  ": 'bg-white border-[#EAE5DB] rounded-2xl rounded-tl-none text-[#2F2922]'"
);

// Loading dots
code = code.replace(
  /className="w-8 h-8 rounded-lg bg-gray-900 text-white flex items-center justify-center flex-shrink-0 shadow-sm"/g,
  'className="w-8 h-8 rounded-lg bg-[#EAE4D9] text-[#63574A] border border-[#DBD2C1] flex items-center justify-center flex-shrink-0 shadow-sm"'
);
code = code.replace(
  /<div className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" \/>/g,
  '<div className="w-1.5 h-1.5 rounded-full bg-[#A68F84] animate-bounce" />'
);
code = code.replace(
  /<div className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style=\{\{ animationDelay: '0.2s' \}\} \/>/g,
  '<div className="w-1.5 h-1.5 rounded-full bg-[#A68F84] animate-bounce" style={{ animationDelay: \'0.2s\' }} />'
);
code = code.replace(
  /<div className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style=\{\{ animationDelay: '0.4s' \}\} \/>/g,
  '<div className="w-1.5 h-1.5 rounded-full bg-[#A68F84] animate-bounce" style={{ animationDelay: \'0.4s\' }} />'
);

code = code.replace(
  /className="bg-white border border-gray-200 p-4 rounded-3xl rounded-tl-none shadow-sm flex gap-2 items-center"/g,
  'className="bg-white border border-[#EAE5DB] p-4 rounded-3xl rounded-tl-none shadow-sm flex gap-2 items-center"'
);

// Dashboard
code = code.replace(
  /className="absolute top-0 right-0 h-full w-\[340px\] md:w-\[400px\] bg-white border-l border-gray-200 shadow-2xl z-20 flex flex-col"/g,
  'className="absolute top-0 right-0 h-full w-[340px] md:w-[400px] bg-[#FAF9F5] border-l border-[#EBE3D5] shadow-2xl z-20 flex flex-col"'
);
code = code.replace(
  /className="p-4 border-b border-gray-200 flex justify-between items-center bg-white shrink-0"/g,
  'className="p-4 border-b border-[#EBE3D5] flex justify-between items-center bg-white shrink-0"'
);
code = code.replace(
  /className="font-bold text-gray-900 text-sm flex items-center gap-2"/g,
  'className="font-bold text-[#3E3830] text-sm flex items-center gap-2"'
);
code = code.replace(
  /className="text-gray-400"/g,
  'className="text-[#A68F84]"'
);
code = code.replace(/text-gray-400/g, 'text-[#A68F84]');
code = code.replace(/text-gray-900/g, 'text-[#3E3830]');
code = code.replace(/border-gray-200/g, 'border-[#EBE3D5]');
code = code.replace(/bg-gray-100/g, 'bg-[#FAF5EE]');
code = code.replace(/bg-gray-50/g, 'bg-[#FAF7F2]');
code = code.replace(/bg-gray-800/g, 'bg-[#746552]');
code = code.replace(/bg-gray-900/g, 'bg-[#8C7B65]');
code = code.replace(/text-gray-500/g, 'text-[#8C7B65]');

fs.writeFileSync('src/components/ChatRoom.tsx', code, 'utf8');
console.log("Done phase 1");
