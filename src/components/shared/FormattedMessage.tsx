import type { ReactNode } from "react";

type FormattedMessageProps = {
  content: string;
  className?: string;
};

export function FormattedMessage({ content, className }: FormattedMessageProps) {
  const blocks = parseBlocks(content);

  return (
    <div className={className}>
      {blocks.map((block, index) => {
        if (block.type === "list") {
          return (
            <ul key={index} className="my-2 list-disc space-y-1 pl-4">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }

        return (
          <p key={index} className={index === 0 ? undefined : "mt-3"}>
            {renderInline(block.text)}
          </p>
        );
      })}
    </div>
  );
}

function parseBlocks(content: string) {
  const lines = content.trim().split(/\n/);
  const blocks: Array<{ type: "paragraph"; text: string } | { type: "list"; items: string[] }> = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: "paragraph", text: paragraph.join("\n") });
    paragraph = [];
  };

  const flushList = () => {
    if (!listItems.length) return;
    blocks.push({ type: "list", items: listItems });
    listItems = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const bullet = trimmed.match(/^[-*]\s+(.+)$/);

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    if (bullet) {
      flushParagraph();
      listItems.push(bullet[1]);
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();

  return blocks;
}

function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }

    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={index} className="rounded bg-black/20 px-1 py-0.5 font-mono text-[0.92em]">
          {part.slice(1, -1)}
        </code>
      );
    }

    return part;
  });
}
