// Lint: `npx eslint .` (only catches real mistakes: undefined names, unused code).
const names = list => Object.fromEntries(list.split(' ').map(n => [n, 'readonly']));
export default [{
  files: ['**/*.js'],
  languageOptions: {
    ecmaVersion: 2023, sourceType: 'module',
    globals: names('window document navigator localStorage indexedDB matchMedia getComputedStyle requestAnimationFrame cancelAnimationFrame ' +
      'setTimeout clearTimeout console Event File Blob URL TextDecoder Uint8Array atob fetch self caches location process Buffer')
  },
  rules: { 'no-unused-vars': 'error', 'no-undef': 'error', 'no-unreachable': 'error', 'no-dupe-keys': 'error', 'no-const-assign': 'error' }
}];
