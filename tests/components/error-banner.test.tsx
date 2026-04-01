import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ErrorBanner from "@/components/ErrorBanner";

describe("ErrorBanner", () => {
  it("renders message and invokes retry handler", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();

    render(<ErrorBanner message="Could not load stories." onRetry={onRetry} />);

    expect(screen.getByText("Could not load stories.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try Again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
