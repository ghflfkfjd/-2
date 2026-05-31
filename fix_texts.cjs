const fs = require('fs');

let code = fs.readFileSync('src/components/ChatRoom.tsx', 'utf8');

// Change text colors to softer variants.
code = code.replace(/text-\[\#3E3830\]/g, 'text-[#4A4042]'); // Dark brown/gray to dark pink-gray
code = code.replace(/text-\[\#8C7B65\]/g, 'text-[#A85860]'); // Med brown to pink-red text
code = code.replace(/text-\[\#A68F84\]/g, 'text-[#E88C95]'); // Light brown to coral
code = code.replace(/text-\[\#63574A\]/g, 'text-[#A85860]'); 

// Replace dashboard headers
code = code.replace(/text-\[\#746552\]/g, 'text-[#A85860]');
code = code.replace(/bg-\[\#FAF7F2\]/g, 'bg-[#FFFDFD]');
code = code.replace(/border-\[\#EBE3D5\]/g, 'border-[#FFE1E5]');
code = code.replace(/bg-\[\#FAF5EE\]/g, 'bg-[#FFF0F2]');
code = code.replace(/border-\[\#EAE2D5\]/g, 'border-[#FFE1E5]');

// Enhance the formatText italics part (the text inside * *)
code = code.replace(
  /className="italic text-\[\#A85860\] bg-\[\#FFF0F2\] px-1.5 py-0.5 rounded mx-0.5 font-serif text-\[12.5px\] border border-\[\#FFE1E5\]"/g,
  'className="italic text-[#E88C95] bg-[#FFF0F2] px-2 py-0.5 rounded-md mx-0.5 font-sans text-[12.5px] border border-[#FFE1E5]"'
);

fs.writeFileSync('src/components/ChatRoom.tsx', code, 'utf8');
console.log("Done phase 4");
