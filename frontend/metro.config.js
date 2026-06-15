const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');
const fs = require('fs');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot, ...(config.watchFolders ?? [])];

const nmPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

config.resolver.nodeModulesPaths = nmPaths;

// pnpm always symlinks packages in node_modules (even with node-linker=hoisted).
// Metro on Windows cannot reliably follow these symlinks. We use fs.realpathSync
// (which calls the Windows API and CAN follow NTFS junctions) to find the actual
// package paths, then hand them to extraNodeModules so Metro never has to follow
// the symlink itself.
function resolveRealPackagePath(pkgName) {
  for (const nmPath of nmPaths) {
    try {
      const candidate = path.join(nmPath, pkgName);
      if (fs.existsSync(candidate)) {
        return fs.realpathSync(candidate);
      }
    } catch (_) {}
  }
  // Fallback: let Node's module resolver follow the junction
  try {
    return path.dirname(
      require.resolve(pkgName + '/package.json', { paths: nmPaths })
    );
  } catch (_) {
    return null;
  }
}

const extraNodeModules = {};
const packagesToPreResolve = [
  '@expo/vector-icons',
  'metro-config',
  'metro-cache',
  'metro',
  'metro-core',
  'metro-runtime',
];
for (const pkg of packagesToPreResolve) {
  const real = resolveRealPackagePath(pkg);
  if (real) extraNodeModules[pkg] = real;
}
config.resolver.extraNodeModules = extraNodeModules;

module.exports = withNativeWind(config, { input: './global.css' });
