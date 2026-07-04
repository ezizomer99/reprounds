// Patches the `expo prebuild`-generated android project so the release build
// is signed with the Play upload keystore instead of the debug keystore.
//
// Credentials are read from the environment AT GRADLE TIME (never written to
// disk):
//   ANDROID_KEYSTORE_PATH      absolute path to the upload .jks/.keystore
//   ANDROID_KEYSTORE_PASSWORD  keystore password
//   ANDROID_KEY_ALIAS          key alias
//   ANDROID_KEY_PASSWORD       key password
//
// Run after `expo prebuild --platform android`, before `./gradlew bundleRelease`.

const fs = require('fs');
const path = require('path');

const gradlePath = path.join(__dirname, '..', 'android', 'app', 'build.gradle');
if (!fs.existsSync(gradlePath)) {
  console.error(`Not found: ${gradlePath} — run \`expo prebuild --platform android\` first.`);
  process.exit(1);
}
let gradle = fs.readFileSync(gradlePath, 'utf8');

// 1. Add a `release` signing config alongside the template's `debug` one.
const signingConfigsAnchor = /(\n\s*signingConfigs\s*\{\n)/;
if (!signingConfigsAnchor.test(gradle)) {
  console.error('Could not find the signingConfigs block in app/build.gradle — the prebuild template changed; update this script.');
  process.exit(1);
}
gradle = gradle.replace(
  signingConfigsAnchor,
  `$1        release {
            storeFile file(System.getenv("ANDROID_KEYSTORE_PATH"))
            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias System.getenv("ANDROID_KEY_ALIAS")
            keyPassword System.getenv("ANDROID_KEY_PASSWORD")
        }
`,
);

// 2. Point the release build type at it (the template signs release with debug).
const releaseBlock = /(release\s*\{[^{}]*?)signingConfig signingConfigs\.debug/;
if (!releaseBlock.test(gradle)) {
  console.error('Could not find `signingConfig signingConfigs.debug` in the release build type — the prebuild template changed; update this script.');
  process.exit(1);
}
gradle = gradle.replace(releaseBlock, '$1signingConfig signingConfigs.release');

fs.writeFileSync(gradlePath, gradle);

// 3. Give Gradle more heap than the RN template default — release bundles on
//    CI runners OOM at the template's 2 GB.
const propsPath = path.join(__dirname, '..', 'android', 'gradle.properties');
let props = fs.readFileSync(propsPath, 'utf8');
props = props.replace(/^org\.gradle\.jvmargs=.*$/m, 'org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m');
fs.writeFileSync(propsPath, props);

console.log('Applied upload-key signing to android/app/build.gradle');
