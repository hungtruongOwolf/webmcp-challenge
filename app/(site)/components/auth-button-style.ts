export const cardStyle: React.CSSProperties = {
  width: "100%",
  padding: 24,
  borderRadius: 22,
  boxShadow: "var(--e2), inset 0 1px 0 var(--hi)",
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

export const primaryButtonStyle = (disabled: boolean): React.CSSProperties => ({
  minHeight: 44,
  border: "none",
  borderRadius: 10,
  background: "var(--accent)",
  color: "#fff",
  fontSize: 14,
  fontWeight: 600,
  cursor: disabled ? "default" : "pointer",
  opacity: disabled ? 0.6 : 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
});
