export default function CreatorLoading() {
  return (
    <div style={{ minHeight: "100vh", background: "#ede9e1", padding: "1rem" }}>
      <div style={{ maxWidth: "980px", margin: "0 auto", display: "grid", gap: "1rem" }}>
        <section style={{ background: "#faf8f3", border: "1px solid #d8d2c7", padding: "1rem" }}>
          <div style={{ height: 24, width: 220, background: "#e5e0d6" }} />
          <div style={{ marginTop: 10, height: 14, width: "70%", background: "#ebe7de" }} />
        </section>
        <section style={{ background: "#faf8f3", border: "1px solid #d8d2c7", padding: "1rem" }}>
          <div style={{ height: 18, width: 180, background: "#e5e0d6" }} />
          <div style={{ marginTop: 10, height: 260, width: "100%", background: "#f1eee8" }} />
        </section>
        <section style={{ background: "#faf8f3", border: "1px solid #d8d2c7", padding: "1rem" }}>
          <div style={{ height: 18, width: 160, background: "#e5e0d6" }} />
          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            <div style={{ height: 64, width: "100%", background: "#f1eee8" }} />
            <div style={{ height: 64, width: "100%", background: "#f1eee8" }} />
          </div>
        </section>
      </div>
    </div>
  );
}
