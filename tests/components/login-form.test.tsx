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
    const submitButton = screen.getByRole("button", {
      name: "Email me a sign-in link",
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

  it("submits email sign-in after consent and displays success state", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    render(<LoginForm authRedirectBaseFromServer="http://127.0.0.1:3000" />);

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "reader@example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Email me a sign-in link" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/email-link",
      expect.objectContaining({
        method: "POST",
      })
    );
    expect(
      await screen.findByText("Check your inbox for a sign-in link. You can close this tab.")
    ).toBeInTheDocument();
  });
});
