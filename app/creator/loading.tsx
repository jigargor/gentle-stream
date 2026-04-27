export default function CreatorLoading() {
  return (
    <div style={{ minHeight: "100vh", background: "#ede9e1", padding: "1rem" }}>
      <div style={{ maxWidth: "980px", margin: "0 auto", display: "grid", gap: "1rem" }}>
        <section style={{ background: "#faf8f3", border: "1px solid #d8d2c7", padding: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
            <div style={{ height: 26, width: 200, background: "#e5e0d6" }} />
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ height: 32, width: 88, background: "#ebe7de" }} />
              <div style={{ height: 32, width: 88, background: "#ebe7de" }} />
            </div>
          </div>
          <div style={{ marginTop: 10, height: 14, width: "72%", background: "#ebe7de" }} />
        </section>
        <section style={{ background: "#faf8f3", border: "1px solid #d8d2c7", padding: "1rem" }}>
          <div style={{ height: 18, width: 160, background: "#e5e0d6" }} />
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 280px", gap: 12 }}>
            <div style={{ minHeight: 320, background: "#f1eee8" }} />
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ height: 56, background: "#ebe7de" }} />
              <div style={{ height: 56, background: "#ebe7de" }} />
              <div style={{ height: 56, background: "#ebe7de" }} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
