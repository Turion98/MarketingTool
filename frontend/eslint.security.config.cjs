const tsParser = require("@typescript-eslint/parser");
const tsPlugin = require("@typescript-eslint/eslint-plugin");

module.exports = [
  {
    name: "security-scope",
    files: ["app/lib/security/**/*.ts"],
    ignores: [],

    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        project: null
      },
      globals: {
        window: "readonly",
        console: "readonly",
        process: "readonly",
      },
    },

    plugins: {
      "@typescript-eslint": tsPlugin,
    },

    rules: {
      // security elv: ne hagyjunk type-less adatfolyamot – de engedjük lokálisan, ha kell
      "@typescript-eslint/no-explicit-any": "error",

      // maradhat warning (nem akarjuk hogy ez blokkoljon)
      "@typescript-eslint/no-unused-vars": ["warn"],

      // security log => console engedélyezett
      "no-console": "off",

      // ezek most már nem kellenek, mert fent definiáltuk a globálokat:
      "no-undef": "off",
      "no-redeclare": "error",
    },
  },
];
