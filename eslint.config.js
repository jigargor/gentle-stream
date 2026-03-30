// ESLint v9 uses the “flat config” format by default.
// `eslint-config-next` ships an appropriate flat config for Next.js projects.
const nextConfig = require("eslint-config-next");

module.exports = [
  ...nextConfig,
  {
    // These patterns exist in the repo's game components and are not worth
    // refactoring just to satisfy new rule strictness after the Next upgrade.
    rules: {
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

