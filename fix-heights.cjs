const fs = require('fs');
let code = fs.readFileSync('src/components/CharacterCreator.tsx', 'utf8');

[
  ' h-24', ' h-28', ' h-32', ' h-44', ' h-48',
  'h-24 ', 'h-28 ', 'h-32 ', 'h-44 ', 'h-48 '
].forEach(h => {
  code = code.split(h).join('');
});

fs.writeFileSync('src/components/CharacterCreator.tsx', code);
