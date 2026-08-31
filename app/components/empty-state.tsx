const EmptyState = () => {
  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>
          Select a chat or start a new conversation
        </h3>
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--t2)" }}>
          Pick someone from the list, or open the directory to say hello.
        </p>
      </div>
    </div>
  );
};

export default EmptyState;
