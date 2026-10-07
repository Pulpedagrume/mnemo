import { describe, expect, it } from 'vitest';
import { ankiHtmlToMarkdown, guidFor, markdownToAnkiHtml, uidFromGuid } from '.';
import { convertTemplate } from './models';
import { sha1Hex } from './sha1';

const md = (html: string) => ankiHtmlToMarkdown(html, (f) => `media:${f}`).text;

describe('ankiHtmlToMarkdown', () => {
  it('converts the common formatting subset', () => {
    expect(md('<b>gras</b> et <i> italique </i>, <u>souligné</u> H<sub>2</sub>O')).toBe(
      '**gras** et *italique* , <u>souligné</u> H<sub>2</sub>O',
    );
    expect(md('<div>ligne 1</div><div>ligne 2</div>')).toBe('ligne 1\nligne 2');
    expect(md('<p>a</p><p>b</p>')).toBe('a\n\nb');
    expect(md('<ul><li>un</li><li>deux</li></ul><ol><li>x</li></ol>')).toBe('- un\n- deux\n1. x');
    expect(md('<a href="https://ex.org/a b">lien</a> <a href="javascript:x()">mal</a>')).toBe(
      '[lien](https://ex.org/a%20b) mal',
    );
    expect(md('<code>a*b</code> <img src="fig 1.png" alt="Figure">')).toBe(
      '`a\\*b` ![Figure](media:fig 1.png)',
    );
  });

  it('escapes Markdown syntax in plain text and converts MathJax', () => {
    expect(md('2*3*4 = 24 $5 snake_case _x_ # pas un titre')).toBe(
      '2\\*3\\*4 = 24 \\$5 snake_case \\_x\\_ # pas un titre',
    );
    expect(md('# titre')).toBe('\\# titre');
    expect(md('&lt;tag&gt; &amp; &#233;&#x00e9;')).toBe('&lt;tag> & éé');
    expect(md('\\(x^2\\) et \\[\\frac{a}{b}\\]')).toBe('$x^2$ et $$\\frac{a}{b}$$');
  });

  it('keeps unknown HTML, drops styles, scripts and sounds', () => {
    const r = ankiHtmlToMarkdown(
      '<span style="color:red">rouge</span><table><tr><td>1</td></tr></table><script>x()</script>[sound:a.mp3]',
      () => undefined,
    );
    expect(r).toEqual({
      text: 'rouge<table><tr><td>1</td></tr></table>',
      images: [],
      sounds: ['a.mp3'],
      keptHtml: true,
      droppedStyle: true,
    });
    expect(ankiHtmlToMarkdown('<img src="x.png">', () => undefined)).toMatchObject({
      text: '',
      images: ['x.png'],
    });
  });
});

describe('markdownToAnkiHtml', () => {
  const html = (s: string) => markdownToAnkiHtml(s, (id) => (id === 'm1' ? 'a.png' : undefined));

  it('converts Markdown to Anki HTML', () => {
    expect(html('**b** *i* `c<d` ~~s~~ __B__ _I_')).toBe(
      '<b>b</b> <i>i</i> <code>c&lt;d</code> <s>s</s> <b>B</b> <i>I</i>',
    );
    expect(html('a\nb\n\nc')).toBe('a<br>b<br><br>c');
    expect(html('- un\n- deux\n\n1. x')).toBe(
      '<ul><li>un</li><li>deux</li></ul><ol><li>x</li></ol>',
    );
    expect(html('![alt](media:m1) ![](media:zz) [l](https://x.org)')).toBe(
      '<img src="a.png" alt="alt">  <a href="https://x.org">l</a>',
    );
    expect(html('$x^2$ et\n$$\ny\n$$\n# T\n---')).toBe('\\(x^2\\) et\\[y\\]<b>T</b><hr>');
    expect(html('```\na < b\n```')).toBe('<pre><code>a &lt; b</code></pre>');
    expect(html('\\*pas\\* <u>u</u> x < y & z')).toBe('*pas* <u>u</u> x &lt; y &amp; z');
    expect(html('{{c1::Paris::capitale}}')).toBe('{{c1::Paris::capitale}}');
  });

  it('round-trips through the importer conversion', () => {
    for (const s of ['**gras** et *italique*', 'a\nb\n\nc', '- un\n- deux', '`code`', '$x^2$'])
      expect(md(html(s).replace('a.png', 'm1'))).toBe(s);
  });
});

describe('templates, guids and checksums', () => {
  it('converts Anki templates to the Mustache subset', () => {
    const removed = new Set<string>();
    expect(
      convertTemplate(
        '{{#A}}<b>{{text:A}}</b>{{/A}}<br>{{furigana:B}} {{type:B}} {{Deck}} {{hint:A}}',
        ['A', 'B'],
        removed,
      ),
    ).toBe('{{#A}}**{{text:A}}**{{/A}}\n{{B}} {{type:B}} {{hint:A}}');
    expect([...removed]).toEqual(['furigana:', '{{Deck}}']);
  });

  it('maps guids to uids and back', () => {
    for (const guid of ['abc', 'a`b{c}!', 'éè'])
      expect(guidFor({ id: 'x', uid: uidFromGuid(guid) })).toBe(guid);
    expect(uidFromGuid('mnemo:q-1')).toBe('q-1');
    expect(guidFor({ id: 'x', uid: 'q-1' })).toBe('mnemo:q-1');
    expect(guidFor({ id: 'n1' })).toBe('n1');
  });

  it('computes SHA-1', () => {
    expect(sha1Hex('abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    expect(sha1Hex('')).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
  });
});
