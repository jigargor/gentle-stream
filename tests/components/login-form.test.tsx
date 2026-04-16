import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "@/components/auth/LoginForm";

const createClientMock = vi.fn();
vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) =>
    React.createElement("img", { ...props, alt: props.alt ?? "" }),
}));
vi.mock("next/script", () => ({
  default: (props: Record<string, unknown>) => {
    const { children, ...rest } = props;
    return (
      <script data-testid="next-script" {...rest}>
        {children as React.ReactNode}
      </script>
    );
  },
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => createClientMock(),
}));

describe("LoginForm", () => {
  beforeEach(() => {
    createClientMock.mockReset();
    vi.stubGlobal("fetch", vi.fn());
    delete process.env.NEXT_PUBLIC_TURNSTILE_ENABLED;
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  });

  it("shows password length error before calling the API", async () => {
    const fetchMock = vi.mocked(fetch);
    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "reader@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "short" },
    });
    const submitButton = screen.getByRole("button", {
      name: "Sign in with email",
    });
    const form = submitButton.closest("form");
    if (!form) throw new Error("Expected email sign-in form to exist");
    fireEvent.submit(form);

    expect(
      await screen.findByText("Use at least 8 characters for your password.")
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits email sign-in and redirects", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ requiresEmailVerification: false }), { status: 200 })
    );
    const assignMock = vi.fn();
    vi.stubGlobal(
      "location",
      { origin: "http://127.0.0.1:3000", assign: assignMock } as unknown as Location
    );

    render(<LoginForm authRedirectBaseFromServer="http://127.0.0.1:3000" />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "reader@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });
    const submitButton = screen.getByRole("button", { name: "Sign in with email" });
    const form = submitButton.closest("form");
    if (!form) throw new Error("Expected email sign-in form to exist");
    fireEvent.submit(form);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/auth/email-password",
        expect.objectContaining({
          method: "POST",
        })
      );
    });

    await waitFor(() => {
      expect(assignMock).toHaveBeenCalledWith("/");
    });
  });

  it("toggles password visibility from hidden to visible", () => {
    render(<LoginForm />);
    const passwordInput = screen.getByLabelText("Password") as HTMLInputElement;
    expect(passwordInput.type).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(passwordInput.type).toBe("text");
    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(passwordInput.type).toBe("password");
  });

  it("shows sign-up success state with back-to-sign-in action", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ requiresEmailVerification: false, verificationEmailSent: true }),
        { status: 200 }
      )
    );
    vi.stubGlobal(
      "location",
      { origin: "http://127.0.0.1:3000", assign: vi.fn() } as unknown as Location
    );

    render(<LoginForm authRedirectBaseFromServer="http://127.0.0.1:3000" />);

    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "reader@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByLabelText("Birthdate"), {
      target: { value: "1990-01-01" },
    });

    const submitButton = screen.getByRole("button", { name: "Create account" });
    const form = submitButton.closest("form");
    if (!form) throw new Error("Expected sign-up form to exist");
    fireEvent.submit(form);

    expect(await screen.findByText(/Account created\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to sign in" }));
    expect(screen.getByRole("button", { name: "Sign in with email" })).toBeInTheDocument();
  });

  it("shows creator-disabled screen when creator login is not enabled", () => {
    render(<LoginForm audience="creator" />);

    expect(screen.getByText("Creator login")).toBeInTheDocument();
    expect(screen.getByText(/temporarily disabled pending approval/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue with Google" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue as guest" })).not.toBeInTheDocument();
  });

  it("disables guest browsing until turnstile challenge is solved", () => {
    process.env.NEXT_PUBLIC_TURNSTILE_ENABLED = "1";
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "turnstile-test-key";

    render(<LoginForm />);

    const guestButton = screen.getByRole("button", {
      name: "Continue as guest is disabled until security check is complete",
    });
    expect(guestButton).toBeDisabled();
    expect(
      screen.getByText("Complete the security check above to unlock guest browsing.")
    ).toBeInTheDocument();
  });
});
