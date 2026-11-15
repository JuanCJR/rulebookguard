/** A box of the diagram. */
export interface DiagramNode {
  id: string;
  title: string;
  /** Text under the title; each line wraps to the box width. */
  lines: string[];
  /** A short line under the text, never wrapped (counts, owning context). */
  badge?: string;
  href?: string;
  /** Drawn grey and dashed: a box that belongs elsewhere, such as another context's entity. */
  muted?: boolean;
  /** Drawn dashed: what an agent extracted and no person validated yet. */
  unvalidated?: boolean;
}

/** An arrow between two boxes, labeled in business words. */
export interface DiagramEdge {
  from: string;
  to: string;
  label: string;
  unvalidated?: boolean;
}

const WIDTH = 240;
const GAP_X = 56;
const GAP_Y = 104;
const MARGIN = 24;
const LOOP = 120;
// Room on the right for arrows that skip a row and curve around the boxes in between.
const SIDE = 180;
const BULGE = 110;
const MAX_COLUMNS = 4;
const LINE_CHARS = 32;
const MAX_LINES = 4;
const LABEL_CHARS = 26;
const LABEL_LINES = 3;
const PARALLEL_OFFSET = 16;

const STYLE = [
  '.rbg-diagram{margin:1.5rem 0;overflow-x:auto}',
  // Kept at its natural size so the text stays readable; a wide diagram scrolls instead.
  '.rbg-diagram svg{display:block;max-width:none;height:auto;margin:0 auto;font-family:inherit}',
  '.rbg-node rect{fill:var(--sl-color-bg-nav);stroke:var(--sl-color-gray-4);stroke-width:1.5}',
  '.rbg-node.rbg-muted rect{fill:var(--sl-color-gray-6);stroke-dasharray:6 4}',
  '.rbg-node.rbg-unvalidated rect{stroke:var(--sl-color-accent);stroke-dasharray:6 4}',
  '.rbg-node a:hover rect,.rbg-node a:focus-visible rect{stroke:var(--sl-color-accent);stroke-width:2.5}',
  '.rbg-title{font-size:15px;font-weight:600;fill:var(--sl-color-white)}',
  '.rbg-line{font-size:13px;fill:var(--sl-color-gray-2)}',
  '.rbg-badge{font-size:12px;fill:var(--sl-color-gray-3)}',
  '.rbg-edge path{fill:none;stroke:var(--sl-color-gray-3);stroke-width:1.5}',
  '.rbg-edge.rbg-unvalidated path{stroke-dasharray:6 4}',
  '.rbg-arrow{fill:var(--sl-color-gray-3)}',
  '.rbg-label{font-size:12px;fill:var(--sl-color-gray-2);paint-order:stroke;stroke:var(--sl-color-bg);stroke-width:4px;stroke-linejoin:round}',
].join('');

interface Box {
  node: DiagramNode;
  row: number;
  x: number;
  y: number;
  text: string[];
}

interface Point {
  x: number;
  y: number;
}

/**
 * Inline SVG of boxes in layers: the target of an arrow sits below its source when the arrows
 * allow it. The result holds no blank line, so Markdown keeps it as a single HTML block.
 */
export function diagram(nodes: DiagramNode[], edges: DiagramEdge[], label: string): string {
  const ids = new Set(nodes.map((node) => node.id));
  const drawn = edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to));
  const texts = new Map(nodes.map((node) => [node.id, nodeText(node)]));
  const height = Math.max(
    ...nodes.map((node) => boxHeight(texts.get(node.id) ?? [], node.badge !== undefined)),
  );
  const rows = arrange(nodes, drawn);
  const loops = drawn.some((edge) => edge.from === edge.to) ? LOOP : 0;
  const rowWidth = (count: number) => count * WIDTH + (count - 1) * GAP_X;
  const inner = Math.max(...rows.map((row) => rowWidth(row.length)));
  const boxes = new Map<string, Box>();
  rows.forEach((row, index) => {
    const left = MARGIN + (inner - rowWidth(row.length)) / 2;
    row.forEach((node, column) => {
      boxes.set(node.id, {
        node,
        row: index,
        x: Math.round(left + column * (WIDTH + GAP_X)),
        y: MARGIN + index * (height + GAP_Y),
        text: texts.get(node.id) ?? [],
      });
    });
  });
  const skips = drawn.some(
    (edge) => Math.abs((boxes.get(edge.to)?.row ?? 0) - (boxes.get(edge.from)?.row ?? 0)) > 1,
  );
  const width = inner + 2 * MARGIN + Math.max(loops, skips ? SIDE : 0);
  const total = rows.length * height + (rows.length - 1) * GAP_Y + 2 * MARGIN;
  const parallel = parallelIndexes(drawn);
  return [
    '<figure class="rbg-diagram">',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${total}" width="${width}" role="img" aria-label="${escape(label)}">`,
    `<style>${STYLE}</style>`,
    '<defs><marker id="rbg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path class="rbg-arrow" d="M0 0L10 5L0 10z"/></marker></defs>',
    ...drawn.map((edge, index) => {
      const from = boxes.get(edge.from) as Box;
      const to = boxes.get(edge.to) as Box;
      return edgeSvg(edge, from, to, height, parallel[index] ?? 0);
    }),
    ...[...boxes.values()].map((box) => nodeSvg(box, height)),
    '</svg>',
    '</figure>',
  ].join('\n');
}

function nodeText(node: DiagramNode): string[] {
  const lines = node.lines.flatMap((line) => wrap(line, LINE_CHARS));
  return lines.length <= MAX_LINES
    ? lines
    : [...lines.slice(0, MAX_LINES - 1), `${lines[MAX_LINES - 1] ?? ''}…`];
}

function boxHeight(lines: string[], badge: boolean): number {
  return 18 + 22 + lines.length * 18 + (badge ? 20 : 0) + 12;
}

// Layers by longest path over the arrows that close no cycle, then rows of at most MAX_COLUMNS,
// each layer ordered by where its sources sit, so arrows cross less.
function arrange(nodes: DiagramNode[], edges: DiagramEdge[]): DiagramNode[][] {
  const forward = acyclic(nodes, edges);
  const layer = new Map(nodes.map((node) => [node.id, 0]));
  for (let pass = 0; pass < nodes.length; pass += 1) {
    let changed = false;
    for (const { from, to } of forward) {
      const next = (layer.get(from) ?? 0) + 1;
      if (next > (layer.get(to) ?? 0)) {
        layer.set(to, next);
        changed = true;
      }
    }
    if (!changed) {
      break;
    }
  }
  const order = new Map(nodes.map((node, index) => [node.id, index]));
  const column = new Map<string, number>();
  const rows: DiagramNode[][] = [];
  const deepest = Math.max(0, ...layer.values());
  for (let depth = 0; depth <= deepest; depth += 1) {
    const sources = (node: DiagramNode) =>
      forward
        .filter((edge) => edge.to === node.id && column.has(edge.from))
        .map((edge) => column.get(edge.from) as number);
    const weight = (node: DiagramNode) => {
      const from = sources(node);
      return from.length === 0
        ? Number.POSITIVE_INFINITY
        : from.reduce((sum, value) => sum + value, 0) / from.length;
    };
    const members = nodes
      .filter((node) => layer.get(node.id) === depth)
      .sort(
        (a, b) => weight(a) - weight(b) || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0) || 0,
      );
    for (let start = 0; start < members.length; start += MAX_COLUMNS) {
      const row = members.slice(start, start + MAX_COLUMNS);
      row.forEach((node, index) => column.set(node.id, index));
      rows.push(row);
    }
  }
  return rows;
}

function acyclic(nodes: DiagramNode[], edges: DiagramEdge[]): DiagramEdge[] {
  const state = new Map<string, 'open' | 'done'>();
  const kept: DiagramEdge[] = [];
  const visit = (id: string) => {
    state.set(id, 'open');
    for (const edge of edges.filter((item) => item.from === id && item.to !== id)) {
      const target = state.get(edge.to);
      if (target === 'open') {
        continue;
      }
      kept.push(edge);
      if (target === undefined) {
        visit(edge.to);
      }
    }
    state.set(id, 'done');
  };
  for (const node of nodes) {
    if (!state.has(node.id)) {
      visit(node.id);
    }
  }
  return kept;
}

// Arrows between the same two boxes, in either direction, are spread apart.
function parallelIndexes(edges: DiagramEdge[]): number[] {
  const groups = new Map<string, number[]>();
  edges.forEach((edge, index) => {
    const key = [edge.from, edge.to].sort().join('\u0000');
    groups.set(key, [...(groups.get(key) ?? []), index]);
  });
  const offsets: number[] = [];
  for (const members of groups.values()) {
    members.forEach((index, position) => {
      offsets[index] = (position - (members.length - 1) / 2) * PARALLEL_OFFSET;
    });
  }
  return offsets;
}

function edgeSvg(edge: DiagramEdge, from: Box, to: Box, height: number, offset: number): string {
  const kind = edge.unvalidated === true ? 'rbg-edge rbg-unvalidated' : 'rbg-edge';
  if (from === to) {
    const x = from.x + WIDTH;
    const top = from.y + height * 0.3;
    const bottom = from.y + height * 0.7;
    const path = `M${x} ${top}C${x + 60} ${top - 16} ${x + 60} ${bottom + 16} ${x} ${bottom}`;
    return `<g class="${kind}"><path d="${path}" marker-end="url(#rbg-arrow)"/>${labelSvg(edge.label, { x: x + 64, y: (top + bottom) / 2 }, 'start')}</g>`;
  }
  if (Math.abs(to.row - from.row) > 1) {
    const side = Math.max(from.x, to.x) + WIDTH;
    const start = { x: from.x + WIDTH, y: from.y + height / 2 + offset };
    const end = { x: to.x + WIDTH, y: to.y + height / 2 + offset };
    const path = `M${round(start.x)} ${round(start.y)}C${round(side + BULGE)} ${round(start.y)} ${round(side + BULGE)} ${round(end.y)} ${round(end.x)} ${round(end.y)}`;
    const apex = { x: side + (BULGE * 3) / 4, y: (start.y + end.y) / 2 };
    return `<g class="${kind}"><path d="${path}" marker-end="url(#rbg-arrow)"/>${labelSvg(edge.label, apex, 'middle')}</g>`;
  }
  let start: Point;
  let end: Point;
  if (to.y !== from.y) {
    const down = to.y > from.y;
    start = { x: from.x + WIDTH / 2, y: down ? from.y + height : from.y };
    end = { x: to.x + WIDTH / 2, y: down ? to.y : to.y + height };
  } else {
    const right = to.x > from.x;
    start = { x: right ? from.x + WIDTH : from.x, y: from.y + height / 2 };
    end = { x: right ? to.x : to.x + WIDTH, y: to.y + height / 2 };
  }
  const length = Math.hypot(end.x - start.x, end.y - start.y) || 1;
  const shift = {
    x: (-(end.y - start.y) / length) * offset,
    y: ((end.x - start.x) / length) * offset,
  };
  start = { x: start.x + shift.x, y: start.y + shift.y };
  end = { x: end.x + shift.x, y: end.y + shift.y };
  const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  return `<g class="${kind}"><path d="M${round(start.x)} ${round(start.y)}L${round(end.x)} ${round(end.y)}" marker-end="url(#rbg-arrow)"/>${labelSvg(edge.label, middle, 'middle')}</g>`;
}

function labelSvg(label: string, at: Point, anchor: 'start' | 'middle'): string {
  const wrapped = wrap(label, LABEL_CHARS);
  const lines =
    wrapped.length <= LABEL_LINES
      ? wrapped
      : [...wrapped.slice(0, LABEL_LINES - 1), `${wrapped[LABEL_LINES - 1] ?? ''}…`];
  const first = at.y - ((lines.length - 1) * 14) / 2 + 4;
  return lines
    .map(
      (line, index) =>
        `<text class="rbg-label" x="${round(at.x)}" y="${round(first + index * 14)}" text-anchor="${anchor}">${escape(line)}</text>`,
    )
    .join('');
}

function nodeSvg({ node, x, y, text }: Box, height: number): string {
  const kind = [
    'rbg-node',
    node.muted === true ? 'rbg-muted' : undefined,
    node.unvalidated === true ? 'rbg-unvalidated' : undefined,
  ]
    .filter((item) => item !== undefined)
    .join(' ');
  const parts = [
    `<rect width="${WIDTH}" height="${height}" rx="10"/>`,
    `<text class="rbg-title" x="14" y="30">${escape(node.title)}</text>`,
    ...text.map(
      (line, index) =>
        `<text class="rbg-line" x="14" y="${52 + index * 18}">${escape(line)}</text>`,
    ),
    ...(node.badge === undefined
      ? []
      : [`<text class="rbg-badge" x="14" y="${height - 14}">${escape(node.badge)}</text>`]),
  ].join('');
  const body = node.href === undefined ? parts : `<a href="${escape(node.href)}">${parts}</a>`;
  return `<g class="${kind}" transform="translate(${x} ${y})">${body}</g>`;
}

function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/).filter((item) => item !== '')) {
    if (current === '') {
      current = word;
    } else if (current.length + 1 + word.length <= width) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  return current === '' ? lines : [...lines, current];
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function escape(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
