import React from "react";

// Catches render-time crashes anywhere in the tree and shows a recoverable
// fallback instead of an unmounted (blank/gray) screen. Error boundaries must
// be class components.
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Surface to the console for debugging; no remote logging yet.
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100dvh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: 24,
            background: "var(--bg-gradient, #111)",
            color: "#fff",
            fontFamily: "var(--font-family-base, sans-serif)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700 }}>Jotain meni pieleen</div>
          <div style={{ fontSize: 14, opacity: 0.7, maxWidth: 320 }}>
            Sovellus kohtasi virheen. Lataa sivu uudelleen ja yritä uudestaan.
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: "12px 18px",
              borderRadius: 12,
              border: "none",
              background: "var(--color-primary, #f59e0b)",
              color: "#1a1206",
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Lataa uudelleen
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
