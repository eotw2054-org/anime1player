// Jest config: extends the jest-expo preset, but also lets babel transform
// node-html-parser (and its ESM dep `entities`), which lib/anime1.ts imports.
const expoPreset = require('jest-expo/jest-preset');

const transformIgnorePatterns = expoPreset.transformIgnorePatterns.map((p, i) =>
  i === 0 ? p.replace(/\)\)$/, '|node-html-parser|entities))') : p,
);

module.exports = {
  ...expoPreset,
  transformIgnorePatterns,
  testMatch: ['**/__tests__/**/*.test.ts'],
};
