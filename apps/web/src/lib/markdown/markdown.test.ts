import { describe, expect, it } from 'vitest';
import { renderMarkdown, renderMarkdownInline } from './index';

describe('renderMarkdown', () => {
  it('renders basic Markdown and tables', () => {
    const html = renderMarkdown('**gras** et _italique_\n\n| a | b |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<strong>gras</strong>');
    expect(html).toContain('<em>italique</em>');
    expect(html).toContain('<table>');
  });

  it('renders inline and block math with KaTeX', () => {
    const inline = renderMarkdown('Aire : $\\pi r^2$');
    expect(inline).toContain('class="katex"');
    const block = renderMarkdown('$$\n\\frac{a}{b}\n$$');
    expect(block).toContain('math-block');
    expect(block).toContain('katex-display');
    expect(renderMarkdown('$$x^2$$')).toContain('katex-display');
  });

  it('leaves prices alone', () => {
    const html = renderMarkdown('Ça coûte $5 et $6.');
    expect(html).not.toContain('katex');
    expect(html).toContain('$5');
  });

  it('highlights code blocks', () => {
    const html = renderMarkdown('```python\nprint("hi")\n```');
    expect(html).toContain('hljs-');
    expect(renderMarkdown('```\n<b>x</b>\n```')).toContain('&lt;b&gt;');
  });

  it('removes dangerous HTML', () => {
    const html = renderMarkdown(
      '<script>alert(1)</script><img src=x onerror=alert(1)><iframe src="https://e.vil"></iframe>[x](javascript:alert(1))<b onclick="x()">ok</b>',
    );
    expect(html).not.toMatch(/<script|onerror|<iframe|href="javascript:|onclick/i);
    expect(html).toContain('<b>ok</b>');
  });

  it('resolves media images and blocks remote ones by default', () => {
    const html = renderMarkdown('![Trame](media:fig-1) ![Distant](https://example.com/a.png)', {
      resolveMedia: (id) => (id === 'fig-1' ? 'blob:local/1' : undefined),
    });
    expect(html).toContain('src="blob:local/1"');
    expect(html).not.toContain('example.com');
    expect(html).toContain('[Distant]');
    expect(renderMarkdown('![x](media:missing)')).toContain('media-missing');
    expect(
      renderMarkdown('![d](https://example.com/a.png)', { allowRemoteImages: true }),
    ).toContain('example.com');
  });

  it('opens links safely in a new tab', () => {
    const html = renderMarkdown('[doc](https://example.com)');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });

  it('renders inline without a paragraph', () => {
    expect(renderMarkdownInline('a *b*')).toBe('a <em>b</em>');
  });
});
