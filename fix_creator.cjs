const fs = require('fs');
let code = fs.readFileSync('src/components/CharacterCreator.tsx', 'utf8');

// Using PersonaSetup.tsx's pastel rule
code = code.replace(/text-gray-400/g, 'text-[#FF7A85]');
code = code.replace(/text-gray-500/g, 'text-[#AAAAAA]');
code = code.replace(/text-gray-600/g, 'text-[#888888]');
code = code.replace(/text-gray-700/g, 'text-[#555555]');
code = code.replace(/text-gray-900/g, 'text-[#3E3830]');
code = code.replace(/border-gray-100/g, 'border-[#FFF0F2]');
code = code.replace(/border-gray-200/g, 'border-[#FFE1E5]');
code = code.replace(/border-gray-300/g, 'border-[#FFD5DA]');
code = code.replace(/bg-gray-50/g, 'bg-[#FFF9FA]');
code = code.replace(/bg-gray-100/g, 'bg-[#FFF0F2]');
code = code.replace(/bg-gray-200/g, 'bg-[#FFE1E5]');
code = code.replace(/bg-gray-800/g, 'bg-[#FF6572]');
code = code.replace(/bg-gray-900/g, 'bg-[#FF7A85]');

fs.writeFileSync('src/components/CharacterCreator.tsx', code, 'utf8');
console.log("Done CharacterCreator");
