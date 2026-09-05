// Keep the site, icon sources, tooling and internal notes out of the
// shipped package. Verify with: python3 -m zipfile -l web-ext-artifacts/*.zip
// (macOS `unzip -l` misreads web-ext's archives and reports zero files).
module.exports = {
  ignoreFiles: [
    'icons',
    'icons/**',
    'site',
    'site/**',
    'node_modules/**',
    'web-ext-artifacts/**',
    'web-ext-config.cjs',
    'package.json',
    'package-lock.json',
    'PROGRESS.md'
  ]
};
