const config = {
  "*.css": ["stylelint --fix", "prettier --write"],
  "*.{js,json,jsonc,mjs,ts,tsx}": ["biome lint --write", "cspell lint --no-progress --no-summary", "prettier --write"],
  "*.md": ["textlint", "cspell lint --no-progress --no-summary", "prettier --write"],
  "*.{yaml,yml}": "prettier --write",
};

export default config;
