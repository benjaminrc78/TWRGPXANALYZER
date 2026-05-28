import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const versionFilePath = path.join(__dirname, 'src', 'version.json');

try {
  const data = JSON.parse(fs.readFileSync(versionFilePath, 'utf8'));
  const versionStr = data.version;
  const parts = versionStr.split('.');
  if (parts.length >= 2) {
    const major = parseInt(parts[0], 10);
    const minor = parseInt(parts[1], 10);
    
    // Check if we want to increment major (e.g. from command line argument)
    const isMajor = process.argv.includes('--major');
    
    let newVersion;
    if (isMajor) {
      newVersion = `${major + 1}.0`;
    } else {
      newVersion = `${major}.${minor + 1}`;
    }
    
    data.version = newVersion;
    fs.writeFileSync(versionFilePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(`Version incremented from ${versionStr} to ${newVersion}`);
  } else {
    console.error('Format of version.json is invalid. Expected "X.Y"');
  }
} catch (err) {
  console.error('Error incrementing version:', err);
}
