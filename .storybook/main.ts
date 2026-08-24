import type { StorybookConfig } from "@storybook/nextjs-vite";

const config: StorybookConfig = {
  addons: ["@storybook/addon-a11y", "@storybook/addon-docs", "@storybook/addon-vitest"],
  features: {
    experimentalRSC: true,
  },
  framework: {
    name: "@storybook/nextjs-vite",
    options: {},
  },
  staticDirs: ["../public"],
  stories: ["../src/**/*.stories.@(ts|tsx)"],
};

export default config;
