import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "@/components/auth/LoginForm";

const createClientMock = vi.fn();
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
  });

  it("shows consent error when email sign-in is attempted unchecked", async () => {
    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "reader@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });
    const submitButton = screen.getByRole("button", {
      name: "Sign in with email",
    });
    const form = submitButton.closest("form");
    if (!form) throw new Error("Expected email sign-in form to exist");
    fireEvent.submit(form);

    expect(
      await screen.findByText(
        "Please agree to the Terms and Privacy Policy before continuing."
      )
    ).toBeInTheDocument();
  });

  it("submits email sign-in after consent and redirects", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ requiresEmailVerification: false }), { status: 200 })
    );
    const assignMock = vi.fn();
    vi.stubGlobal("location", { assign: assignMock } as unknown as Location);

    render(<LoginForm authRedirectBaseFromServer="http://127.0.0.1:3000" />);

    fireEvent.click(screen.getByRole("checkbox"));
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

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/email-password",
      expect.objectContaining({
        method: "POST",
      })
    );
    expect(assignMock).toHaveBeenCalledWith("/");
  });
});
