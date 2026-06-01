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

    // Automatically update android/app/build.gradle
    const gradlePath = path.join(__dirname, 'android', 'app', 'build.gradle');
    if (fs.existsSync(gradlePath)) {
      let gradleContent = fs.readFileSync(gradlePath, 'utf8');
      
      // Calculate a strictly incremental versionCode based on major & minor version.
      // e.g. version "2.16" becomes versionCode 216.
      // This is much greater than the previous versionCode 1.
      const newVersionParts = newVersion.split('.');
      let versionCode = 1;
      if (newVersionParts.length >= 2) {
        const newMajor = parseInt(newVersionParts[0], 10);
        const newMinor = parseInt(newVersionParts[1], 10);
        versionCode = newMajor * 100 + newMinor;
      }
      
      // Update versionCode and versionName using regex
      gradleContent = gradleContent.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
      gradleContent = gradleContent.replace(/versionName\s+"[^"]+"/, `versionName "${newVersion}"`);
      
      fs.writeFileSync(gradlePath, gradleContent, 'utf8');
      console.log(`Updated android/app/build.gradle with versionCode ${versionCode} and versionName "${newVersion}"`);
    } else {
      console.warn(`android/app/build.gradle not found at ${gradlePath}. Skipped native version update.`);
    }
  } else {
    console.error('Format of version.json is invalid. Expected "X.Y"');
  }
} catch (err) {
  console.error('Error incrementing version:', err);
}
