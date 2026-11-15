import { describe, expect, it } from 'vite-plus/test';
import { diagram } from '../../src/site/diagram.ts';

function boxOf(svg: string, title: string): { x: number; y: number } {
  const match = new RegExp(
    `<g class="rbg-node[^"]*" transform="translate\\((\\d+) (\\d+)\\)">(?:<a [^>]*>)?<rect[^>]*/><text[^>]*>${title}<`,
  ).exec(svg);
  if (match === null) {
    throw new Error(`no node "${title}" in ${svg}`);
  }
  return { x: Number(match[1]), y: Number(match[2]) };
}

describe('diagram', () => {
  it('draws a node per entry and places the target of an edge below its source', () => {
    const svg = diagram(
      [
        { id: 'client', title: 'Client', lines: ['A customer.'] },
        { id: 'order', title: 'Order', lines: [] },
      ],
      [{ from: 'client', to: 'order', label: 'Requests orders' }],
      'Model',
    );

    expect(svg.startsWith('<figure class="rbg-diagram">')).toBe(true);
    expect(svg).toContain('role="img" aria-label="Model"');
    expect(svg).toContain('>A customer.<');
    expect(svg).toContain('>Requests orders<');
    expect(boxOf(svg, 'Order').y).toBeGreaterThan(boxOf(svg, 'Client').y);
  });

  it('fits the page width and widens the page content, instead of scrolling', () => {
    const svg = diagram([{ id: 'a', title: 'A', lines: [] }], [], 'Map');

    expect(svg).toContain('.rbg-diagram svg{display:block;max-width:100%');
    expect(svg).toContain('html:not([data-has-toc]){--sl-content-width:');
    expect(svg).not.toContain('overflow-x');
  });

  it('never holds a blank line, so Markdown keeps it as one HTML block', () => {
    const svg = diagram(
      [{ id: 'a', title: 'A', lines: ['one', 'two'] }],
      [{ from: 'a', to: 'a', label: 'Refers to itself' }],
      'Model',
    );

    expect(svg).not.toMatch(/\n\s*\n/);
  });

  it('escapes text and links a node to its href', () => {
    const svg = diagram(
      [{ id: 'a', title: 'A & <B>', lines: ['"quoted"'], href: '/clients/' }],
      [],
      'Map',
    );

    expect(svg).toContain('A &amp; &lt;B&gt;');
    expect(svg).toContain('&quot;quoted&quot;');
    expect(svg).toContain('<a href="/clients/">');
  });

  it('marks muted nodes and unvalidated nodes and edges', () => {
    const svg = diagram(
      [
        { id: 'a', title: 'A', lines: [], unvalidated: true },
        { id: 'b', title: 'B', lines: [], muted: true },
      ],
      [{ from: 'a', to: 'b', label: 'x', unvalidated: true }],
      'Model',
    );

    expect(svg).toContain('class="rbg-node rbg-unvalidated"');
    expect(svg).toContain('class="rbg-node rbg-muted"');
    expect(svg).toContain('class="rbg-edge rbg-unvalidated"');
  });

  it('routes an arrow that skips a row around the boxes in between', () => {
    const svg = diagram(
      ['A', 'B', 'C'].map((title) => ({ id: title, title, lines: [] })),
      [
        { from: 'A', to: 'B', label: 'ab' },
        { from: 'B', to: 'C', label: 'bc' },
        { from: 'A', to: 'C', label: 'ac' },
      ],
      'Map',
    );
    const skip = /<g class="rbg-edge"><path d="([^"]+)"[^>]*\/><text[^>]*>ac</.exec(svg)?.[1] ?? '';
    const right = boxOf(svg, 'B').x + 240;

    expect(skip).toMatch(/^M[\d.]+ [\d.]+C/);
    const xs = [...skip.matchAll(/([\d.]+) [\d.]+/g)].map((match) => Number(match[1]));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(right);
  });

  it('wraps long lines and keeps rows to at most four nodes', () => {
    const nodes = ['A', 'B', 'C', 'D', 'E'].map((title) => ({
      id: title,
      title,
      lines: ['A rather long description that does not fit on a single line of the box.'],
    }));
    const svg = diagram(nodes, [], 'Map');

    expect(boxOf(svg, 'E').y).toBeGreaterThan(boxOf(svg, 'A').y);
    expect(svg).toContain('>A rather long description that<');
  });
});
