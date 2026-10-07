import { createContext, useContext, useMemo } from 'react';
import { renderMarkdown, renderMarkdownInline } from '../lib/markdown';

/** Resolves `media:<id>` references to object URLs; provided by the study/preview screens. */
export const MediaResolverContext = createContext<(id: string) => string | undefined>(
  () => undefined,
);

interface MarkdownProps {
  source: string;
  inline?: boolean;
  className?: string;
}

/** Renders untrusted Markdown as sanitized HTML (KaTeX, code highlighting, media). */
export function Markdown({ source, inline = false, className = '' }: MarkdownProps) {
  const resolveMedia = useContext(MediaResolverContext);
  const html = useMemo(
    () =>
      inline
        ? renderMarkdownInline(source, { resolveMedia })
        : renderMarkdown(source, { resolveMedia }),
    [source, inline, resolveMedia],
  );
  const Tag = inline ? 'span' : 'div';
  return <Tag className={`prose-card ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
