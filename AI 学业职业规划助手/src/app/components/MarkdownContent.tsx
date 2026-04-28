import React from "react";

interface Props {
  content: string;
  className?: string;
}

function parseInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[(.+?)\]\((.+?)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      parts.push(<strong key={key++} className="font-semibold">{match[2]}</strong>);
    } else if (match[3]) {
      parts.push(<em key={key++}>{match[3]}</em>);
    } else if (match[4]) {
      parts.push(
        <code
          key={key++}
          className="bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 px-1.5 py-0.5 rounded text-[0.85em] font-mono"
        >
          {match[4]}
        </code>
      );
    } else if (match[5] && match[6]) {
      parts.push(
        <a
          key={key++}
          href={match[6]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sky-500 hover:text-sky-600 underline underline-offset-2"
        >
          {match[5]}
        </a>
      );
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

export function MarkdownContent({ content, className = "" }: Props) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre
          key={key++}
          className="bg-slate-100 dark:bg-slate-800 rounded-xl p-4 overflow-x-auto my-3 text-sm font-mono text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
        >
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
      i++;
      continue;
    }

    // Table
    if (line.includes("|") && line.trim().startsWith("|")) {
      const tableRows: string[][] = [];
      while (i < lines.length && lines[i].includes("|")) {
        const row = lines[i]
          .split("|")
          .slice(1, -1)
          .map((c) => c.trim());
        if (!row.every((c) => /^[-:]+$/.test(c))) {
          tableRows.push(row);
        }
        i++;
      }
      if (tableRows.length > 0) {
        elements.push(
          <div key={key++} className="overflow-x-auto my-3">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  {tableRows[0].map((cell, ci) => (
                    <th
                      key={ci}
                      className="py-2 px-3 text-left font-semibold text-slate-700 dark:text-slate-300"
                    >
                      {parseInline(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.slice(1).map((row, ri) => (
                  <tr
                    key={ri}
                    className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    {row.map((cell, ci) => (
                      <td key={ci} className="py-2 px-3 text-slate-600 dark:text-slate-400">
                        {parseInline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    // H1
    if (line.startsWith("# ")) {
      elements.push(
        <h1 key={key++} className="text-xl font-bold mt-4 mb-2 text-slate-800 dark:text-slate-100">
          {parseInline(line.slice(2))}
        </h1>
      );
      i++;
      continue;
    }

    // H2
    if (line.startsWith("## ")) {
      elements.push(
        <h2 key={key++} className="text-lg font-bold mt-4 mb-2 text-slate-800 dark:text-slate-100 border-b border-slate-200 dark:border-slate-700 pb-1">
          {parseInline(line.slice(3))}
        </h2>
      );
      i++;
      continue;
    }

    // H3
    if (line.startsWith("### ")) {
      elements.push(
        <h3 key={key++} className="text-base font-semibold mt-3 mb-1.5 text-slate-700 dark:text-slate-200">
          {parseInline(line.slice(4))}
        </h3>
      );
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      elements.push(
        <blockquote
          key={key++}
          className="border-l-4 border-sky-400 pl-4 my-2 text-slate-600 dark:text-slate-400 italic bg-sky-50 dark:bg-sky-900/20 py-2 rounded-r-lg"
        >
          {parseInline(line.slice(2))}
        </blockquote>
      );
      i++;
      continue;
    }

    // Unordered list
    if (line.match(/^(\s*)[-*+] /)) {
      const listItems: React.ReactNode[] = [];
      while (i < lines.length && lines[i].match(/^(\s*)[-*+] /)) {
        const itemText = lines[i].replace(/^(\s*)[-*+] /, "");
        listItems.push(
          <li key={i} className="flex gap-2 py-0.5">
            <span className="text-sky-500 mt-1 shrink-0">•</span>
            <span>{parseInline(itemText)}</span>
          </li>
        );
        i++;
      }
      elements.push(
        <ul key={key++} className="my-2 space-y-0.5 text-slate-700 dark:text-slate-300">
          {listItems}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (line.match(/^\d+\. /)) {
      const listItems: React.ReactNode[] = [];
      let num = 1;
      while (i < lines.length && lines[i].match(/^\d+\. /)) {
        const itemText = lines[i].replace(/^\d+\. /, "");
        listItems.push(
          <li key={i} className="flex gap-2 py-0.5">
            <span className="text-sky-500 font-semibold shrink-0 w-5">{num}.</span>
            <span>{parseInline(itemText)}</span>
          </li>
        );
        i++;
        num++;
      }
      elements.push(
        <ol key={key++} className="my-2 space-y-0.5 text-slate-700 dark:text-slate-300">
          {listItems}
        </ol>
      );
      continue;
    }

    // Horizontal rule
    if (line.match(/^---+$/)) {
      elements.push(
        <hr key={key++} className="my-4 border-slate-200 dark:border-slate-700" />
      );
      i++;
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      elements.push(<div key={key++} className="h-2" />);
      i++;
      continue;
    }

    // Paragraph
    elements.push(
      <p key={key++} className="text-slate-700 dark:text-slate-300 leading-relaxed">
        {parseInline(line)}
      </p>
    );
    i++;
  }

  return <div className={`text-sm space-y-0.5 ${className}`}>{elements}</div>;
}
