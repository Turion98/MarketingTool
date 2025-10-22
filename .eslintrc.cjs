module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint", "security", "security-node", "no-unsanitized", "regexp"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:security/recommended",
    "plugin:security-node/recommended",
    "plugin:no-unsanitized/DOM",
    "plugin:regexp/recommended"
  ],
  rules: {
    "no-eval": "error",
    "no-implied-eval": "error",
    "security/detect-object-injection": "off", // típushelyzetek miatt gyakran fals pozitív
    "regexp/no-dupe-characters-character-class": "error"
  },
  ignorePatterns: ["dist/", ".next/", "node_modules/"]
};
