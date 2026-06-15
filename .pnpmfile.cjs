// Forces all metro sub-packages to the same version that Expo 53 / RN 0.79 expects.
// Without this, multiple metro versions coexist in .pnpm and @expo/cli can't find metro-config.
// Using .pnpmfile.cjs instead of pnpm-workspace.yaml overrides because the latter
// gets recorded in the lockfile and causes ERR_PNPM_LOCKFILE_CONFIG_MISMATCH on EAS.
function readPackage(pkg) {
  const metroPackages = ['metro', 'metro-cache', 'metro-config', 'metro-core', 'metro-runtime', 'metro-source-map', 'metro-transform-plugins', 'metro-babel-transformer'];
  for (const name of metroPackages) {
    if (pkg.dependencies?.[name]) {
      pkg.dependencies[name] = '~0.82.0';
    }
  }
  return pkg;
}

module.exports = { hooks: { readPackage } };
