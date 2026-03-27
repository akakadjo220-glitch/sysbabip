const fs = require('fs');
const path = require('path');

const directories = ['views', 'components'];
const root = 'c:/Users/USER/Documents/afritix event';

const replaceColors = (filePath) => {
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(/indigo-600/g, 'orange-600')
        .replace(/indigo-500/g, 'orange-500')
        .replace(/indigo-400/g, 'orange-400')
        .replace(/indigo-300/g, 'orange-300')
        .replace(/indigo-900/g, 'orange-900')
        .replace(/purple-800/g, 'amber-700')
        .replace(/purple-600/g, 'amber-500')
        .replace(/purple-500/g, 'amber-500')
        .replace(/purple-400/g, 'amber-400')
        .replace(/pink-600/g, 'rose-600')
        .replace(/pink-500/g, 'rose-500')
        .replace(/pink-400/g, 'rose-400');
    fs.writeFileSync(filePath, content, 'utf8');
};

const walk = (dir) => {
    fs.readdirSync(dir).forEach(file => {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walk(fullPath);
        } else if (fullPath.endsWith('.tsx')) {
            replaceColors(fullPath);
        }
    });
};

directories.forEach(d => walk(path.join(root, d)));
console.log("Theme colors updated successfully.");
