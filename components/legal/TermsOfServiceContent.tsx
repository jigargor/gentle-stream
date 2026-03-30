import type { CSSProperties } from "react";

const sectionTitleStyle: CSSProperties = { fontSize: "1.15rem" };

export function TermsOfServiceContent() {
  return (
    <>
      <section>
        <h2 style={{ ...sectionTitleStyle, marginTop: 0 }}>1. Introduction</h2>
        <p>
          These Terms govern your access to and use of Gentle Stream. By using the service,
          you agree to these Terms and to the{" "}
          <a href="/privacy" style={{ color: "#5c4a32" }}>
            Privacy policy
          </a>
          .
        </p>
      </section>

      <section>
        <h2 style={sectionTitleStyle}>2. Eligibility and accounts</h2>
        <p>
          You must be legally able to enter into this agreement and provide accurate account
          information. You are responsible for your login credentials and for activity under
          your account.
        </p>
      </section>

      <section>
        <h2 style={sectionTitleStyle}>3. Readers and creators</h2>
        <p>
          Gentle Stream supports both readers and creators. Reader features include
          personalized feeds and saved content. Creator features include profile onboarding
          and content submission workflows, subject to moderation and platform rules.
        </p>
      </section>

      <section>
        <h2 style={sectionTitleStyle}>4. Your content and platform license</h2>
        <p>
          You keep ownership of content you submit. You grant Gentle Stream a non-exclusive
          license to host, display, index, format, and distribute your content as needed to
          operate the service, including ranking and moderation systems.
        </p>
      </section>

      <section>
        <h2 style={sectionTitleStyle}>5. Intellectual property and notices</h2>
        <p>
          Do not submit content that infringes others&apos; rights. If you believe content on
          the platform violates your rights, contact support with enough detail for review.
        </p>
      </section>

      <section>
        <h2 style={sectionTitleStyle}>6. Acceptable use</h2>
        <p>You agree not to misuse the service. This includes:</p>
        <ul style={{ marginTop: 0 }}>
          <li>attempting unauthorized access or interference with security controls;</li>
          <li>automated scraping that violates documented product rules;</li>
          <li>spam, fraud, harassment, or illegal content submissions;</li>
          <li>impersonation or false identity claims.</li>
        </ul>
      </section>

      <section>
        <h2 style={sectionTitleStyle}>7. Third-party services</h2>
        <p>
          Some features rely on third-party providers, including authentication or messaging
          infrastructure. Their services are governed by their own terms and privacy policies.
        </p>
      </section>

      <section>
        <h2 style={sectionTitleStyle}>8. Warranty disclaimer and liability limits</h2>
        <p>
          Gentle Stream is provided &quot;as is&quot; and &quot;as available&quot; to the
          extent permitted by law. We do not guarantee uninterrupted operation. To the extent
          permitted by law, we are not liable for indirect, incidental, or consequential
          damages arising from your use of the service.
        </p>
      </section>

      <section>
        <h2 style={sectionTitleStyle}>9. Termination and suspension</h2>
        <p>
          We may suspend or terminate access for violations of these Terms, abuse, or security
          risk. You may stop using the service at any time and may request account deletion via{" "}
          <a href="/data-deletion" style={{ color: "#5c4a32" }}>
            Data deletion
          </a>
          .
        </p>
      </section>

      <section>
        <h2 style={sectionTitleStyle}>10. Privacy, children, and messaging</h2>
        <p>
          Our data practices are described in the{" "}
          <a href="/privacy" style={{ color: "#5c4a32" }}>
            Privacy policy
          </a>
          . Gentle Stream is not intended for children under the minimum age required by
          applicable law.
        </p>
        <p style={{ marginBottom: 0 }}>
          If you opt into phone verification, we may send one-time SMS verification codes.
          Message and data rates may apply. You can review SMS disclosure details at{" "}
          <a href="/sms-consent" style={{ color: "#5c4a32" }}>
            SMS consent
          </a>
          .
        </p>
      </section>

      <section>
        <h2 style={sectionTitleStyle}>11. Changes and miscellaneous</h2>
        <p style={{ marginBottom: 0 }}>
          We may update these Terms as the service evolves. Continued use after updates means
          you accept the revised Terms. Governing law and dispute resolution terms should be
          finalized with legal counsel for your operating jurisdiction.
        </p>
      </section>
    </>
  );
}

