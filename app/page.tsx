"use client";

import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";

function isValidYouTubeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "www.youtube.com" ||
      parsed.hostname === "youtube.com" ||
      parsed.hostname === "youtu.be"
    );
  } catch {
    return false;
  }
}

// Split summary markdown into named sections by ## headings
function parseSections(summary: string): { title: string; content: string }[] {
  const SUMMARY_SECTIONS = ["Overview", "Key Points", "Notable Quotes", "Action Items"];
  const parts = summary.split(/^## /m).filter(
    (p) => SUMMARY_SECTIONS.some((s) => p.trimStart().startsWith(s))
  );
  return parts.map((part) => {
    const newline = part.indexOf("\n");
    if (newline === -1) return { title: part.trim(), content: "" };
    return {
      title: part.slice(0, newline).trim(),
      content: part.slice(newline + 1).trim(),
    };
  });
}

const SECTION_ACCENTS = ["#3b82f6", "#ff6b6b", "#8b5cf6", "#06b6d4", "#10b981"];

function SummarySection({
  title,
  content,
  index,
  open,
  onToggle,
}: {
  title: string;
  content: string;
  index: number;
  open: boolean;
  onToggle: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const accent = SECTION_ACCENTS[index % SECTION_ACCENTS.length];

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    await navigator.clipboard.writeText(content.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ ...card, borderLeftColor: accent }}>
      <div style={cardHeader} onClick={onToggle} role="button" aria-expanded={open}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ ...chevron, transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>›</span>
          <h2 style={{ ...cardTitle, color: accent }}>{title}</h2>
        </div>
        <button
          onClick={handleCopy}
          style={copied ? { ...copyBtn, ...copyBtnDone } : copyBtn}
          title="Copy section"
        >
          {copied ? <><CheckIcon /> Copied</> : <><CopyIcon /> Copy</>}
        </button>
      </div>

      {open && (
        <div className="section-body">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}

function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

interface SummarizeResult {
  summary: string;
  transcriptCharCount: number;
  transcriptWordCount: number;
  videoTooLong?: boolean;
}

// ── Password screen ───────────────────────────────────────────────────────────

function EyeIcon({ off }: { off?: boolean }) {
  return off ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function PasswordScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        onAuthenticated();
      } else {
        const data = await res.json();
        setError(data.error ?? "Incorrect password.");
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={main}>
      <h1 className="gradient-title">YouTube Summarizer</h1>
      <p style={subtitle}>Enter the app password to continue.</p>
      <form onSubmit={handleSubmit} style={form}>
        <div style={passwordWrapper}>
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="App password"
            style={{ ...input, paddingRight: 44 }}
            disabled={loading}
            autoFocus
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            style={eyeBtn}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            <EyeIcon off={showPassword} />
          </button>
        </div>
        {error && <p style={errorText}>{error}</p>}
        <button type="submit" disabled={loading} style={loading ? { ...btn, opacity: 0.7 } : btn}>
          {loading ? "Checking…" : "Unlock"}
        </button>
      </form>
    </main>
  );
}

// ── Main app ──────────────────────────────────────────────────────────────────

export default function Home() {
  // 'loading' while we check the cookie, then 'auth' or 'unauth'
  const [authState, setAuthState] = useState<"loading" | "authenticated" | "unauthenticated">("loading");

  const [url, setUrl] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const [result, setResult] = useState<SummarizeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<boolean[]>([]);

  // Check for existing auth cookie on mount
  useEffect(() => {
    fetch("/api/auth/check")
      .then((res) => setAuthState(res.ok ? "authenticated" : "unauthenticated"))
      .catch(() => setAuthState("unauthenticated"));
  }, []);

  async function handleLogout() {
    await fetch("/api/auth", { method: "DELETE" });
    setAuthState("unauthenticated");
    setResult(null);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setValidationError(null);
    setResult(null);

    if (!url.trim()) { setValidationError("Please enter a YouTube URL."); return; }
    if (!isValidYouTubeUrl(url.trim())) { setValidationError("That doesn't look like a valid YouTube URL."); return; }

    setSummarizing(true);
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (res.status === 401) {
        // Cookie expired mid-session
        setAuthState("unauthenticated");
        return;
      }
      if (!res.ok) { setError(data.error ?? "Something went wrong."); return; }
      const sections = parseSections(data.summary);
      setOpenSections(sections.map((_, i) => i === 0));
      setResult(data);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSummarizing(false);
    }
  }

  function toggleSection(i: number) {
    setOpenSections((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  }

  function expandAll() {
    setOpenSections((prev) => prev.map(() => true));
  }

  function collapseAll() {
    setOpenSections((prev) => prev.map(() => false));
  }

  if (authState === "loading") {
    return (
      <main style={main}>
        <p style={{ color: "#555", marginTop: 60 }}>Loading…</p>
      </main>
    );
  }

  if (authState === "unauthenticated") {
    return <PasswordScreen onAuthenticated={() => setAuthState("authenticated")} />;
  }

  const sections = result ? parseSections(result.summary) : [];
  const allOpen = openSections.length > 0 && openSections.every(Boolean);

  return (
    <main style={main}>
      <div style={topBar}>
        <h1 className="gradient-title" style={{ margin: 0 }}>YouTube Summarizer</h1>
        <button onClick={handleLogout} style={logoutBtn}>Log out</button>
      </div>
      <p style={subtitle}>Paste a YouTube URL and get an AI summary.</p>

      <form onSubmit={handleSubmit} style={form}>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          style={input}
          disabled={summarizing}
          autoFocus
        />
        {validationError && <p style={errorText}>{validationError}</p>}
        <button type="submit" disabled={summarizing} style={summarizing ? { ...btn, opacity: 0.7 } : btn}>
          {summarizing && <span className="spinner" />}
          {summarizing ? "Summarizing…" : "Summarize"}
        </button>
      </form>

      {error && (
        <div style={errorBox}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && sections.length > 0 && (
        <div style={resultBox}>
          <div style={summaryHeader}>
            <div style={summaryMeta}>
              <span style={summaryTitle}>Summary</span>
              <span style={metaChip}>
                {result.transcriptWordCount.toLocaleString()} words
              </span>
              {result.videoTooLong && (
                <span style={{ ...metaChip, color: "#f59e0b", borderColor: "#f59e0b33" }}>
                  ⚠ Over 2 hours
                </span>
              )}
            </div>
            <button onClick={allOpen ? collapseAll : expandAll} style={expandBtn}>
              {allOpen ? "Collapse all" : "Expand all"}
            </button>
          </div>

          <div style={sectionsWrapper}>
            {sections.map((s, i) => (
              <SummarySection
                key={i}
                title={s.title}
                content={s.content}
                index={i}
                open={openSections[i] ?? false}
                onToggle={() => toggleSection(i)}
              />
            ))}
          </div>
        </div>
      )}
    </main>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const main: React.CSSProperties = {
  maxWidth: 680,
  margin: "0 auto",
  padding: "52px 16px 100px",
};

const topBar: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 8,
};

const subtitle: React.CSSProperties = {
  color: "#666",
  marginBottom: 36,
  fontSize: 15,
};

const form: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  fontSize: 15,
  background: "#141414",
  border: "1px solid #2a2a2a",
  borderRadius: 8,
  color: "#e8e8e8",
  outline: "none",
};

const errorText: React.CSSProperties = {
  color: "#ef4444",
  fontSize: 13,
  marginTop: -4,
};

const btn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "12px 20px",
  fontSize: 15,
  fontWeight: 600,
  background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
};

const logoutBtn: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: "#888",
  background: "transparent",
  border: "1px solid #2a2a2a",
  borderRadius: 6,
  padding: "5px 14px",
  cursor: "pointer",
};

const errorBox: React.CSSProperties = {
  marginTop: 24,
  padding: "14px 16px",
  background: "#1f0000",
  border: "1px solid #ef4444",
  borderRadius: 8,
  color: "#ef4444",
  fontSize: 14,
};

const resultBox: React.CSSProperties = {
  marginTop: 40,
};

const summaryHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 16,
};

const summaryMeta: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const summaryTitle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: "#e8e8e8",
};

const metaChip: React.CSSProperties = {
  fontSize: 12,
  color: "#666",
  border: "1px solid #2a2a2a",
  borderRadius: 20,
  padding: "2px 8px",
};

const expandBtn: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "#888",
  background: "transparent",
  border: "1px solid #2a2a2a",
  borderRadius: 6,
  padding: "4px 12px",
  cursor: "pointer",
};

const sectionsWrapper: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const card: React.CSSProperties = {
  background: "#141414",
  border: "1px solid #222",
  borderLeft: "3px solid #3b82f6",
  borderRadius: 8,
  overflow: "hidden",
};

const cardHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 14px",
  cursor: "pointer",
  userSelect: "none",
};

const chevron: React.CSSProperties = {
  fontSize: 18,
  color: "#555",
  lineHeight: 1,
  transition: "transform 0.2s ease",
  display: "inline-block",
};

const cardTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const copyBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  padding: "4px 10px",
  fontSize: 12,
  fontWeight: 500,
  color: "#777",
  background: "#1a1a1a",
  border: "1px solid #2a2a2a",
  borderRadius: 6,
  cursor: "pointer",
};

const copyBtnDone: React.CSSProperties = {
  color: "#10b981",
  borderColor: "#10b98133",
};

const passwordWrapper: React.CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
};

const eyeBtn: React.CSSProperties = {
  position: "absolute",
  right: 12,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "transparent",
  border: "none",
  color: "#555",
  cursor: "pointer",
  padding: 4,
  borderRadius: 4,
};
