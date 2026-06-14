const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot, ...(config.watchFolders ?? [])];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// pnpm uses symlinks to its virtual store (.pnpm/); Metro must follow them
// so that relative imports inside packages (e.g. expo-font's ./memory) resolve.
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
