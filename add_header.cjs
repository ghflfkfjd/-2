const fs = require('fs');

function addModelHeader(filePath) {
  let code = fs.readFileSync(filePath, 'utf8');

  // get userModel from localStorage
  const userModelDecl = "      const userModel = localStorage.getItem('gemini_user_model') || 'gemini-2.5-flash';";
  
  // ChatRoom
  code = code.replace(
    /const userApiKey = localStorage\.getItem\('gemini_user_api_key'\) \|\| '';/g,
    `const userApiKey = localStorage.getItem('gemini_user_api_key') || '';\n      const userModel = localStorage.getItem('gemini_user_model') || 'gemini-2.5-flash';`
  );

  code = code.replace(
    /'x-user-api-key': userApiKey/g,
    `'x-user-api-key': userApiKey, 'x-user-model': userModel`
  );

  fs.writeFileSync(filePath, code, 'utf8');
}

addModelHeader('src/components/ChatRoom.tsx');
addModelHeader('src/components/CharacterCreator.tsx');
addModelHeader('src/components/CharacterList.tsx'); // Snapshot might be generated here or ChatRoom? It's in ChatRoom.
