// Keep icon sources and local tooling out of the shipped package.
module.exports = {
  ignoreFiles: [
    'icons',
    'icons/**',
    'node_modules/**',
    'web-ext-artifacts/**',
    'web-ext-config.cjs',
    'package.json',
    'package-lock.json'
  ]
};
