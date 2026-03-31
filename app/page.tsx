"use client";

import { useState } from "react";
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
    e.stopPropagation(); // don't toggle collapse when clicking copy
    await navigator.clipboard.writeText(content.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ ...card, borderLeftColor: accent }}>
      {/* Clickable header toggles collapse */}
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

      {/* Collapsible body */}
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

export default function Home() {
  const [url, setUrl] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SummarizeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<boolean[]>([]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setValidationError(null);
    setResult(null);

    if (!password) { setValidationError("Please enter the app password."); return; }
    if (!url.trim()) { setValidationError("Please enter a YouTube URL."); return; }
    if (!isValidYouTubeUrl(url.trim())) { setValidationError("That doesn't look like a valid YouTube URL."); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-app-password": password },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Something went wrong."); return; }
      const sections = parseSections(data.summary);
      setOpenSections(sections.map((_, i) => i === 0)); // first open, rest collapsed
      setResult(data);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
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

  const sections = result ? parseSections(result.summary) : [];
  const allOpen = openSections.length > 0 && openSections.every(Boolean);

  return (
    <main style={main}>
      <h1 className="gradient-title">YouTube Summarizer</h1>
      <p style={subtitle}>Paste a YouTube URL and get an AI summary.</p>

      <form onSubmit={handleSubmit} style={form}>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="App password"
          style={input}
          disabled={loading}
          autoFocus
        />
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          style={input}
          disabled={loading}
        />
        {validationError && <p style={errorText}>{validationError}</p>}
        <button type="submit" disabled={loading} style={loading ? { ...btn, opacity: 0.7 } : btn}>
          {loading && <span className="spinner" />}
          {loading ? "Summarizing…" : "Summarize"}
        </button>
      </form>

      {error && (
        <div style={errorBox}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && sections.length > 0 && (
        <div style={resultBox}>
          {/* Summary header row */}
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
            <button
              onClick={allOpen ? collapseAll : expandAll}
              style={expandBtn}
            >
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
