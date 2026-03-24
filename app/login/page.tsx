import { Suspense } from "react";
import { LoginForm } from "@/components/auth/LoginForm";

function LoginFallback() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#ede9e1",
        fontFamily: "'IM Fell English', Georgia, serif",
        fontStyle: "italic",
        color: "#999",
      }}
    >
      Loading&hellip;
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  );
}
