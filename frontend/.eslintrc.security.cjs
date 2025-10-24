// frontend/.eslintrc.security.cjs
//
// Izolált lint config a security réteghez.
// Nem használjuk a teljes Next.js aliasokat, nincs build pipeline kötés,
// csak azt nézzük, hogy a biztonsági modulok tiszták-e.
//
// Használat példa:
// pnpm eslint frontend/app/lib/security frontend/app/components/Security \
//   -c frontend/.eslintrc.security.cjs --max-warnings=0

module.exports = {
  root: false, // nem bántjuk a projekt fő .eslintrc-jét
  env: {
    browser: true,
    es2022: true,
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: {
      jsx: true,
    },
    // fontos: itt nem kérünk project: "./tsconfig.json",
    // mert nem akarjuk, hogy a teljes repo path aliasai beégjenek
  },
  plugins: ["@typescript-eslint", "react"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
  ],
  rules: {
    // biztonság: ne legyen explicit any
    "@typescript-eslint/no-explicit-any": "error",

    // engedjük a console.warn / console.log, mert secLog és cache debug használja
    "no-console": "off",

    // react 18: nem kötelező defaultProps stb.
    "react/prop-types": "off",

    // TS már megfogja az unused-ot, de legyen szigor
    "@typescript-eslint/no-unused-vars": [
      "warn",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
  },
  settings: {
    react: {
      version: "detect",
    },
  },
};
