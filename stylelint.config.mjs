const config = {
  extends: ["stylelint-config-standard"],
  ignoreFiles: [
    ".next/**",
    "coverage/**",
    "node_modules/**",
    "out/**",
    "playwright-report/**",
    "test-results/**",
  ],
  rules: {
    "font-family-name-quotes": null,
    "import-notation": "string",
    "number-max-precision": 5,
    "property-no-vendor-prefix": null,
    "selector-class-pattern": null,
  },
};

export default config;
