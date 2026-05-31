const fs = require('fs');
let css = fs.readFileSync('src/index.css', 'utf8');
css = css.replace(/background-color: #FFFFFF;/g, 'background-color: #FFF9FA;');
css = css.replace(/color: #111827;/g, 'color: #4A4042;');
fs.writeFileSync('src/index.css', css);
