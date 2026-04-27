export default function CreatorSettingsLoading() {
  return (
    <div style={{ minHeight: "100vh", background: "#ede9e1", padding: "1rem" }}>
      <div style={{ maxWidth: 980, margin: "0 auto", display: "grid", gap: "1rem" }}>
        <section style={{ background: "#faf8f3", border: "1px solid #d8d2c7", padding: "1rem" }}>
          <div style={{ width: 240, height: 24, background: "#e5e0d6" }} />
          <div style={{ marginTop: 10, width: "65%", height: 14, background: "#ebe7de" }} />
        </section>
        <section style={{ background: "#faf8f3", border: "1px solid #d8d2c7", padding: "1rem" }}>
          <div style={{ width: 200, height: 18, background: "#e5e0d6" }} />
          <div style={{ marginTop: 10, width: "100%", height: 220, background: "#f1eee8" }} />
        </section>
        <section style={{ background: "#faf8f3", border: "1px solid #d8d2c7", padding: "1rem" }}>
          <div style={{ width: 180, height: 18, background: "#e5e0d6" }} />
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            <div style={{ height: 72, background: "#f1eee8" }} />
            <div style={{ height: 72, background: "#f1eee8" }} />
            <div style={{ height: 72, background: "#f1eee8" }} />
          </div>
        </section>
      </div>
    </div>
  );
}
