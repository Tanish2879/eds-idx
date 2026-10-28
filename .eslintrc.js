module.exports = {
  root: true,
  extends: [
    'airbnb-base',
    'plugin:json/recommended',
    'plugin:xwalk/recommended',
  ],
  env: {
    browser: true,
  },
  parser: '@babel/eslint-parser',
  parserOptions: {
    allowImportExportEverywhere: true,
    sourceType: 'module',
    requireConfigFile: false,
  },
  rules: {
    'import/extensions': ['error', { js: 'always' }], // require js file extensions in imports
    'linebreak-style': ['error', 'unix'], // enforce unix linebreaks
    'no-param-reassign': [2, { props: false }], // allow modifying properties of param
    'no-underscore-dangle': ['error', { allow: ['__dmRender__'] }],
    // the reservation form, the confirmation, the job board's filters and jobs, the careers hero
    // and the JSW footer keep every authored property in its own cell (read by position: grouped
    // cells can't tell which of several optional texts is empty); other models keep the default 4
    'xwalk/max-cells': ['error', {
      '*': 4,
      'reservation-form': 18,
      confirmation: 7,
      'job-board-filters': 5,
      'job-board-job': 6,
      'careers-hero': 5,
      'jsw-footer': 11, // (10 rows + the Layout, a class)
    }],
  },
};
