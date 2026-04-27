export default function CreatorUsageLoading() {
  return (
    <div style={{ minHeight: "100vh", background: "#ede9e1", padding: "1rem" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gap: "1rem" }}>
        <section style={{ background: "#faf8f3", border: "1px solid #d8d2c7", padding: "1rem" }}>
          <div style={{ width: 160, height: 26, background: "#e5e0d6" }} />
          <div style={{ marginTop: 10, width: "75%", height: 14, background: "#ebe7de" }} />
        </section>
        <section style={{ background: "#faf8f3", border: "1px solid #d8d2c7", padding: "1rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            <div style={{ height: 56, background: "#f1eee8" }} />
            <div style={{ height: 56, background: "#f1eee8" }} />
            <div style={{ height: 56, background: "#f1eee8" }} />
            <div style={{ height: 56, background: "#f1eee8" }} />
          </div>
        </section>
        <section style={{ background: "#faf8f3", border: "1px solid #d8d2c7", padding: "1rem" }}>
          <div style={{ width: "100%", height: 180, background: "#f1eee8" }} />
        </section>
      </div>
    </div>
  );
}
