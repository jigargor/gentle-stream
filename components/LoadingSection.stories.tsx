import type { Meta, StoryObj } from "@storybook/nextjs";
import LoadingSection from "@/components/LoadingSection";

const meta: Meta<typeof LoadingSection> = {
  title: "Feedback/LoadingSection",
  component: LoadingSection,
  parameters: {
    layout: "centered",
    nextjs: {
      appDirectory: true,
    },
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CriticalDefault: Story = {
  tags: ["critical"],
  parameters: {
    a11y: {
      test: "todo",
    },
  },
};
