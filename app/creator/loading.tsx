export default function CreatorLoading() {
  return (
    <main className="creator-studio">
      <div className="creator-studio__shell">
        <section className="creator-commandbar">
          <div className="creator-commandbar__copy">
            <div className="creator-skeleton-line creator-skeleton-line--title" />
            <div className="creator-skeleton-line" />
          </div>
        </section>
        <div className="creator-studio__grid">
          <section className="creator-panel"><div className="creator-skeleton-block" /></section>
          <section className="creator-editor"><div className="creator-skeleton-block" /></section>
          <section className="creator-panel"><div className="creator-skeleton-block" /></section>
        </div>
      </div>
    </main>
  );
}
