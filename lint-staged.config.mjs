const config = {
  "*.{css}": ["stylelint --fix", "prettier --write"],
  "*.{js,json,jsonc,mjs,ts,tsx}": ["biome lint --write", "prettier --write"],
  "*.{md,yaml,yml}": "prettier --write",
};

export default config;
