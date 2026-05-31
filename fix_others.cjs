const fs = require('fs');

function replaceColors(file) {
  let code = fs.readFileSync(file, 'utf8');

  code = code.replace(/text-gray-400/g, 'text-[#FF7A85]');
  code = code.replace(/text-gray-500/g, 'text-[#AAAAAA]');
  code = code.replace(/text-gray-600/g, 'text-[#888888]');
  code = code.replace(/text-gray-700/g, 'text-[#555555]');
  code = code.replace(/text-gray-900/g, 'text-[#3E3830]');
  code = code.replace(/border-gray-100/g, 'border-[#FFF0F2]');
  code = code.replace(/border-gray-200/g, 'border-[#FFE1E5]');
  code = code.replace(/bg-gray-50/g, 'bg-[#FFF9FA]');
  code = code.replace(/bg-gray-100/g, 'bg-[#FFF0F2]');
  code = code.replace(/bg-gray-200/g, 'bg-[#FFE1E5]');
  code = code.replace(/bg-gray-800/g, 'bg-[#FF6572]');
  code = code.replace(/bg-gray-900/g, 'bg-[#FF7A85]');

  fs.writeFileSync(file, code, 'utf8');
}

replaceColors('src/components/PersonaSetup.tsx');
replaceColors('src/components/CharacterList.tsx');
replaceColors('src/components/CharacterCreator.tsx');

console.log("Done phase 2");
