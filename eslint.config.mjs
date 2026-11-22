import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off"
    }
  },
  {
    // `.next*` rather than `.next`: a build output directory is never source,
    // and a stray one (a variant tried out, a copy restored by file sync) used
    // to turn `npm run lint` into 173 errors in files nobody wrote. Same for
    // Playwright's output directories, which `npm run e2e` leaves behind.
    ignores: [
      ".next*/**",
      "node_modules/**",
      "test-results/**",
      "playwright-report/**",
      "**/*.test.ts",
      "e2e/**"
    ]
  }
];

export default eslintConfig;
