import type { Meta, StoryObj } from "@storybook/nextjs";
import { fn } from "storybook/test";
import ErrorBanner from "@/components/ErrorBanner";

const meta = {
  title: "Feedback/ErrorBanner",
  component: ErrorBanner,
  tags: ["critical"],
  args: {
    message: "Could not load new stories. Please retry.",
    onRetry: fn(),
  },
  parameters: {
    nextjs: {
      appDirectory: true,
    },
  },
} satisfies Meta<typeof ErrorBanner>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AuthError: Story = {
  args: {
    message: "Sign-in did not complete. Please try again.",
  },
};
