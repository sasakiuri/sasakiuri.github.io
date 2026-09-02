import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { HomePage } from "./home-page";

const meta = {
  component: HomePage,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  title: "Pages/Home",
} satisfies Meta<typeof HomePage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  async play({ canvas }) {
    await expect(canvas.getByRole("heading", { level: 1, name: "ホームページ" })).toBeVisible();
    await expect(canvas.getByRole("img", { name: "ハクビシン" })).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Twitter" })).toHaveAttribute("rel", "noreferrer noopener");
    await expect(canvas.getByRole("link", { name: "GitHub" })).toHaveAttribute("href", "https://github.com/sasakiuri");
  },
};
