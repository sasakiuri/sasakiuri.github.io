import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { ExternalLink } from "./external-link";

const meta = {
  args: {
    children: "External destination",
    href: "https://example.com/path",
  },
  component: ExternalLink,
  tags: ["autodocs"],
  title: "Components/ExternalLink",
} satisfies Meta<typeof ExternalLink>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  async play({ canvas }) {
    const link = canvas.getByRole("link", { name: "External destination" });

    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noreferrer noopener");
  },
};
