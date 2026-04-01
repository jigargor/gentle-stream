import type { Meta, StoryObj } from "@storybook/nextjs";
import { LoginForm } from "./LoginForm";
import { expect, userEvent, within } from "storybook/test";

const meta: Meta<typeof LoginForm> = {
  title: "Auth/LoginForm",
  component: LoginForm,
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
    },
  },
};

export default meta;

type Story = StoryObj<typeof LoginForm>;

export const Default: Story = {};

export const SessionExpired: Story = {
  args: {
    initialSessionExpired: true,
  },
};

export const MagicLinkBrowserError: Story = {
  args: {
    initialOauthBrowserError: true,
  },
};

export const ConsentValidation: Story = {
  tags: ["critical"],
  parameters: {
    a11y: {
      test: "off",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("Email"), "reader@example.com");
    const submitButton = canvas.getByRole("button", {
      name: "Email me a sign-in link",
    });
    await expect(submitButton).toBeDisabled();
    await expect(
      canvas.getByText(/For email sign-in, you must agree before continuing\./i)
    ).toBeInTheDocument();
  },
};

export const CreatorOnboardingModal: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Sign up & onboarding" }));
    await expect(canvas.getByRole("dialog")).toBeInTheDocument();
  },
};
