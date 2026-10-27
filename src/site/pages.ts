import type { RuleLanguage, RuleStatus } from '../format/types.ts';
import type { SiteData, SiteRule } from './data.ts';

export interface SiteOptions {
  language: RuleLanguage;
  /** URL path the site is served from, for example `/` or `/rules/`. */
  base: string;
}

const STATUSES: RuleStatus[] = ['active', 'proposed', 'deprecated'];

// Starlight links /favicon.svg from every page; without it each page view logs a 404.
const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="#3c51e8"/>
  <path d="M9 8h10a4 4 0 0 1 4 4v12H13a4 4 0 0 1-4-4z" fill="#fff"/>
  <path d="m13 16 2.5 2.5L20 14" fill="none" stroke="#3c51e8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;

const TEXT = {
  en: {
    title: 'Business rules',
    homeIntro:
      'The business rules of this repository: the source of truth that the code implements and the tests verify.',
    contexts: 'Contexts',
    context: 'Context',
    prefix: 'Prefix',
    summary: 'Summary',
    allRules: 'All rules',
    health: 'Health',
    rule: 'Rule',
    status: 'Status',
    entities: 'Entities',
    supersedes: 'Supersedes',
    supersededBy: 'Superseded by',
    ruleFile: 'Rule file',
    ruleText: 'Rule',
    anchors: 'Anchors',
    matchedFiles: 'Files matched by the anchors',
    tests: 'Tests',
    history: 'History',
    date: 'Date',
    commit: 'Commit',
    author: 'Author',
    change: 'Change',
    noHistory: 'No git history.',
    none: 'None.',
    search: 'Search rules',
    anyContext: 'Any context',
    anyStatus: 'Any status',
    noMatch: 'No rule matches the filters.',
    severity: 'Severity',
    code: 'Code',
    file: 'File',
    line: 'Line',
    message: 'Message',
    noIssues: 'No issues found.',
    counts: (errors: number, warnings: number) =>
      `${errors} ${errors === 1 ? 'error' : 'errors'}, ${warnings} ${warnings === 1 ? 'warning' : 'warnings'}`,
    healthIntro: 'Findings of `rulebookguard lint` when the site was built.',
  },
  es: {
    title: 'Reglas de negocio',
    homeIntro:
      'Las reglas de negocio de este repositorio: la fuente de verdad que el código implementa y los tests verifican.',
    contexts: 'Contextos',
    context: 'Contexto',
    prefix: 'Prefijo',
    summary: 'Resumen',
    allRules: 'Todas las reglas',
    health: 'Salud',
    rule: 'Regla',
    status: 'Estado',
    entities: 'Entidades',
    supersedes: 'Reemplaza a',
    supersededBy: 'Reemplazada por',
    ruleFile: 'Archivo de la regla',
    ruleText: 'Regla',
    anchors: 'Anclas',
    matchedFiles: 'Archivos que coinciden con las anclas',
    tests: 'Tests',
    history: 'Historial',
    date: 'Fecha',
    commit: 'Commit',
    author: 'Autor',
    change: 'Cambio',
    noHistory: 'Sin historial de git.',
    none: 'Ninguno.',
    search: 'Buscar reglas',
    anyContext: 'Cualquier contexto',
    anyStatus: 'Cualquier estado',
    noMatch: 'Ninguna regla coincide con los filtros.',
    severity: 'Severidad',
    code: 'Código',
    file: 'Archivo',
    line: 'Línea',
    message: 'Mensaje',
    noIssues: 'No se encontraron problemas.',
    counts: (errors: number, warnings: number) =>
      `${errors} ${errors === 1 ? 'error' : 'errores'}, ${warnings} ${warnings === 1 ? 'advertencia' : 'advertencias'}`,
    healthIntro: 'Hallazgos de `rulebookguard lint` al momento de generar el sitio.',
  },
} satisfies Record<RuleLanguage, unknown>;

type Text = (typeof TEXT)['en'];

export function siteText(language: RuleLanguage): Text {
  return TEXT[language];
}

export function normalizeBase(base: string): string {
  const trimmed = base.replace(/^\/+|\/+$/g, '');
  return trimmed === '' ? '/' : `/${trimmed}/`;
}

export function sitePages(data: SiteData, options: SiteOptions): Map<string, string> {
  const text = TEXT[options.language];
  const base = normalizeBase(options.base);
  const rulePath = new Map(
    data.rules.map(({ rule }) => [rule.id, `${base}${rule.context}/${rule.id.toLowerCase()}/`]),
  );
  const ruleByFile = new Map(data.rules.map(({ rule }) => [rule.file, rule.id]));
  const ruleLink = (id: string) => {
    const path = rulePath.get(id);
    return path === undefined ? id : `[${id}](${path})`;
  };
  const files = new Map<string, string>();

  files.set('public/favicon.svg', FAVICON);

  files.set(
    'src/content.config.ts',
    `import { defineCollection } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = { docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }) };
`,
  );

  files.set(
    'src/content/docs/index.md',
    page(text.title, text.homeIntro, [
      text.homeIntro,
      '',
      `[${text.allRules}](${base}rules/) · [${text.health}](${base}health/)`,
      '',
      `## ${text.contexts}`,
      '',
      `| ${text.context} | ${text.prefix} | ${text.summary} | ${STATUSES.join(' | ')} |`,
      `| --- | --- | --- | ${STATUSES.map(() => '---:').join(' | ')} |`,
      ...data.contexts.map((context) => {
        const rules = data.rules.filter(({ rule }) => rule.context === context.context);
        const counts = STATUSES.map(
          (status) => rules.filter(({ rule }) => rule.status === status).length,
        );
        return `| [${context.context}](${base}${context.context}/) | ${context.prefix} | ${cell(context.summary)} | ${counts.join(' | ')} |`;
      }),
    ]),
  );

  for (const context of data.contexts) {
    const rules = data.rules.filter(({ rule }) => rule.context === context.context);
    files.set(
      `src/content/docs/${context.context}/index.md`,
      page(context.context, context.summary, [
        `**${cell(context.summary)}**`,
        '',
        demote(context.body.trim()),
        '',
        `| ${text.rule} | ${text.status} | ${text.summary} |`,
        '| --- | --- | --- |',
        ...rules.map(
          ({ rule }) => `| ${ruleLink(rule.id)} | ${rule.status} | ${cell(rule.summary)} |`,
        ),
      ]),
    );
  }

  for (const entry of data.rules) {
    files.set(
      `src/content/docs/${entry.rule.context}/${entry.rule.id.toLowerCase()}.md`,
      rulePage(entry, text, base, ruleLink),
    );
  }

  files.set('src/pages/rules.astro', rulesPage(data, text, rulePath));

  const errors = data.findings.filter((finding) => finding.severity === 'error').length;
  const warnings = data.findings.length - errors;
  files.set(
    'src/content/docs/health.md',
    page(text.health, text.healthIntro, [
      text.healthIntro,
      '',
      data.findings.length === 0 ? text.noIssues : `**${text.counts(errors, warnings)}**`,
      '',
      ...(data.findings.length === 0
        ? []
        : [
            `| ${text.severity} | ${text.code} | ${text.file} | ${text.line} | ${text.message} |`,
            '| --- | --- | --- | ---: | --- |',
            ...data.findings.map((finding) => {
              const id = ruleByFile.get(finding.file);
              const path = id === undefined ? undefined : rulePath.get(id);
              const file =
                path === undefined ? `\`${finding.file}\`` : `[${finding.file}](${path})`;
              return `| ${finding.severity} | ${finding.code} | ${file} | ${finding.line ?? ''} | ${cell(finding.message)} |`;
            }),
          ]),
    ]),
  );

  return files;
}

function rulePage(
  { rule, files, tests, history, supersedes, supersededBy }: SiteRule,
  text: Text,
  base: string,
  ruleLink: (id: string) => string,
): string {
  const rows: [string, string][] = [
    [text.status, rule.status],
    [text.context, `[${rule.context}](${base}${rule.context}/)`],
    [text.entities, rule.entities.length === 0 ? '—' : rule.entities.map(cell).join(', ')],
    [text.ruleFile, `\`${rule.file}\``],
  ];
  if (supersedes.length > 0) {
    rows.push([text.supersedes, supersedes.map(ruleLink).join(' → ')]);
  }
  if (supersededBy !== undefined) {
    rows.push([text.supersededBy, ruleLink(supersededBy)]);
  }
  return page(rule.id, rule.summary, [
    `**${cell(rule.summary)}**`,
    '',
    '| | |',
    '| --- | --- |',
    ...rows.map(([label, value]) => `| ${label} | ${value} |`),
    '',
    `## ${text.ruleText}`,
    '',
    demote(rule.body.trim()),
    '',
    `## ${text.anchors}`,
    '',
    ...list(
      rule.anchors.map((anchor) => `\`${anchor}\``),
      text.none,
    ),
    '',
    `### ${text.matchedFiles} (${files.length})`,
    '',
    ...list(
      files.map((file) => `\`${file}\``),
      text.none,
    ),
    '',
    `## ${text.tests} (${tests.length})`,
    '',
    ...list(
      tests.map((test) => `\`${test.file}:${test.line}\``),
      text.none,
    ),
    '',
    `## ${text.history}`,
    '',
    ...(history.length === 0
      ? [text.noHistory]
      : [
          `| ${text.date} | ${text.commit} | ${text.author} | ${text.change} |`,
          '| --- | --- | --- | --- |',
          ...history.map(
            (commit) =>
              `| ${commit.date} | \`${commit.hash}\` | ${cell(commit.author)} | ${cell(commit.subject)} |`,
          ),
        ]),
  ]);
}

function rulesPage(data: SiteData, text: Text, rulePath: Map<string, string>): string {
  const contexts = data.contexts.map((context) => context.context);
  const rows = data.rules.map(({ rule }) => {
    const search = [rule.id, rule.context, rule.summary].join(' ').toLowerCase();
    return `      <tr data-context="${html(rule.context)}" data-status="${rule.status}" data-search="${html(search)}">
        <td class="rbg-id"><a href="${rulePath.get(rule.id) ?? ''}">${rule.id}</a></td>
        <td>${html(rule.context)}</td>
        <td>${rule.status}</td>
        <td>${html(rule.summary)}</td>
      </tr>`;
  });
  return `---
import StarlightPage from "@astrojs/starlight/components/StarlightPage.astro";
---

<StarlightPage frontmatter={{ title: ${JSON.stringify(text.allRules)}, tableOfContents: false }}>
  <div class="rbg-filters">
    <input type="search" data-filter="search" placeholder="${html(text.search)}" aria-label="${html(text.search)}" />
    <select data-filter="context" aria-label="${html(text.context)}">
      <option value="">${html(text.anyContext)}</option>
${contexts.map((context) => `      <option value="${html(context)}">${html(context)}</option>`).join('\n')}
    </select>
    <select data-filter="status" aria-label="${html(text.status)}">
      <option value="">${html(text.anyStatus)}</option>
${STATUSES.map((status) => `      <option value="${status}">${status}</option>`).join('\n')}
    </select>
  </div>
  <div class="rbg-table">
  <table class="rbg-rules">
    <thead>
      <tr><th>${html(text.rule)}</th><th>${html(text.context)}</th><th>${html(text.status)}</th><th>${html(text.summary)}</th></tr>
    </thead>
    <tbody>
${rows.join('\n')}
    </tbody>
  </table>
  </div>
  <p class="rbg-empty" hidden>${html(text.noMatch)}</p>
</StarlightPage>

<style>
  .rbg-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin-bottom: 1rem; }
  /* Starlight spaces sibling content blocks with margin-top; inside the filter row it misaligns the controls. */
  .rbg-filters > * { margin: 0; }
  .rbg-filters :is(input, select) {
    border: 1px solid var(--sl-color-gray-5);
    border-radius: 0.5rem;
    background-color: var(--sl-color-bg);
    color: var(--sl-color-white);
    font: inherit;
    font-size: var(--sl-text-sm);
    padding: 0.5rem 0.75rem;
    height: 2.5rem;
    box-sizing: border-box;
  }
  .rbg-filters input { flex: 1 1 16rem; }
  .rbg-filters select { flex: 1 1 12rem; cursor: pointer; }
  .rbg-filters :is(input, select):focus-visible { outline: 2px solid var(--sl-color-accent); outline-offset: 1px; }
  .rbg-id { white-space: nowrap; }
  .rbg-table { overflow-x: auto; }
  .rbg-table table { margin: 0; }
  .rbg-rules td:last-child { min-width: 16rem; }
</style>

<script>
  const value = (name: string) =>
    (document.querySelector<HTMLInputElement | HTMLSelectElement>(\`[data-filter="\${name}"]\`)?.value ?? '').trim().toLowerCase();
  const apply = () => {
    const search = value('search');
    const context = value('context');
    const status = value('status');
    let shown = 0;
    for (const row of document.querySelectorAll<HTMLTableRowElement>('.rbg-rules tbody tr')) {
      const visible =
        (search === '' || (row.dataset.search ?? '').includes(search)) &&
        (context === '' || row.dataset.context === context) &&
        (status === '' || row.dataset.status === status);
      row.hidden = !visible;
      if (visible) shown += 1;
    }
    const empty = document.querySelector<HTMLElement>('.rbg-empty');
    if (empty) empty.hidden = shown > 0;
  };
  for (const control of document.querySelectorAll('[data-filter]')) {
    control.addEventListener('input', apply);
  }
</script>
`;
}

function page(title: string, description: string, lines: string[]): string {
  return [
    '---',
    `title: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(description)}`,
    '---',
    '',
    ...lines,
    '',
  ].join('\n');
}

function list(items: string[], empty: string): string[] {
  return items.length === 0 ? [empty] : items.map((item) => `- ${item}`);
}

/** Text inside a Markdown table cell. */
function cell(text: string): string {
  return text.replaceAll('\\', '\\\\').replaceAll('|', '\\|').replaceAll('<', '&lt;');
}

/** Text inside the Astro page, where braces start expressions. */
function html(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('{', '&#123;')
    .replaceAll('}', '&#125;');
}

/** Pushes the headings of a rule text two levels down, below the page's own sections. */
function demote(markdown: string): string {
  let fence: string | undefined;
  return markdown
    .split('\n')
    .map((line) => {
      const marker = /^\s*(```+|~~~+)/.exec(line)?.[1];
      if (marker !== undefined) {
        if (fence === undefined) {
          fence = marker;
        } else if (marker.startsWith(fence)) {
          fence = undefined;
        }
        return line;
      }
      if (fence === undefined && /^#{1,4} /.test(line)) {
        return `##${line}`;
      }
      return line;
    })
    .join('\n');
}
