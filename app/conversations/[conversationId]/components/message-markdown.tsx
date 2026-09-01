import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import type { Components } from "react-markdown";

// react-markdown never renders raw HTML from the source text unless a
// rehype-raw-style plugin is added -- deliberately not adding one, so a
// message body can't inject markup. Only actual markdown syntax renders.
const components: Components = {
  p: ({ children }) => <p style={{ margin: 0 }}>{children}</p>,
  ul: ({ children }) => (
    <ul style={{ margin: "2px 0", paddingLeft: 20 }}>{children}</ul>
  ),
  ol: ({ children }) => (
    <ol style={{ margin: "2px 0", paddingLeft: 20 }}>{children}</ol>
  ),
  li: ({ children }) => <li style={{ margin: "1px 0" }}>{children}</li>,
  blockquote: ({ children }) => (
    <blockquote
      style={{
        margin: "2px 0",
        padding: "0 0 0 10px",
        borderLeft: "3px solid currentColor",
        opacity: 0.85,
      }}
    >
      {children}
    </blockquote>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: "inherit", textDecoration: "underline" }}
    >
      {children}
    </a>
  ),
  code: ({ children, className }) => {
    // remark assigns className (e.g. "language-js") to fenced code blocks'
    // <code>, but not to inline code -- that's the reliable way to tell them
    // apart here since this component covers both.
    const isBlock = Boolean(className);
    return (
      <code
        style={{
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          fontSize: isBlock ? "0.85em" : "0.9em",
          background: "rgba(127,127,127,0.16)",
          borderRadius: 4,
          padding: isBlock ? 0 : "1px 4px",
          whiteSpace: isBlock ? "pre" : undefined,
        }}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre
      style={{
        margin: "4px 0",
        padding: 8,
        borderRadius: 8,
        background: "rgba(127,127,127,0.16)",
        overflowX: "auto",
      }}
    >
      {children}
    </pre>
  ),
  img: ({ src, alt }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={typeof src === "string" ? src : undefined}
      alt={alt ?? ""}
      style={{ maxWidth: "100%", borderRadius: 8, display: "block" }}
    />
  ),
  h1: ({ children }) => (
    <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: "1.15em" }}>{children}</p>
  ),
  h2: ({ children }) => (
    <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: "1.08em" }}>{children}</p>
  ),
  h3: ({ children }) => (
    <p style={{ margin: "0 0 4px", fontWeight: 600 }}>{children}</p>
  ),
};

type MessageMarkdownProps = {
  text: string;
};

const MessageMarkdown: React.FC<MessageMarkdownProps> = ({ text }) => (
  <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
    {text}
  </ReactMarkdown>
);

export default MessageMarkdown;
