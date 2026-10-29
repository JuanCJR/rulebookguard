import type { CatalogIssueCode } from './catalog/load.ts';
import type { RuleLanguage } from './format/types.ts';

export interface Messages {
  field: (name: string) => string;
  missingFrontmatter: string;
  unclosedFrontmatter: string;
  invalidYaml: (detail: string) => string;
  required: string;
  notAllowed: string;
  oneOf: (values: string) => string;
  equalTo: (value: string) => string;
  singleLine: string;
  ofType: (type: string) => string | undefined;
  minLength: (limit: number) => string | undefined;
  minimum: (limit: number) => string | undefined;
  pattern: (pattern: string) => string | undefined;
  missingRulesDir: string;
  missingContextFile: string;
  contextMismatch: (name: string) => string;
  fileNameMismatch: (baseName: string) => string;
  idPrefixMismatch: (prefix: string) => string;
  duplicateId: (first: string) => string;
  catalogWarning: (count: number) => string;
  unknownRule: (id: string) => string;
  unknownContext: (name: string) => string;
  invalidStatus: (status: string, allowed: string) => string;
  outsideRoot: (input: string, root: string) => string;
  gitFallback: (reason: string) => string;
  submoduleSkipped: (submodule: string, reason: string) => string;
  ruleCount: (count: number) => string;
  noContexts: string;
  noRules: string;
  noActiveRulesFor: (path: string) => string;
  filesMatched: (count: number) => string;
  testsTagging: (id: string, count: number) => string;
  none: string;
  noFreeId: (context: string, lastId: string) => string;
  alreadyExists: (file: string) => string;
  invalidContextName: (name: string) => string;
  invalidPrefix: (prefix: string) => string;
  prefixTaken: (prefix: string, context: string) => string;
  prefixMismatch: (context: string, prefix: string, given: string) => string;
  contextTemplateSummary: string;
  contextTemplateBody: string;
  untestedRule: (id: string) => string;
  unmatchedAnchor: (anchor: string) => string;
  unknownRuleTag: (id: string) => string;
  deprecatedRuleTag: (id: string) => string;
  unclosedRuleTag: (id: string) => string;
  unmatchedEndruleTag: (id: string) => string;
  contextOverBudget: (context: string, count: number, budget: number) => string;
  pendingImplementation: (id: string, base: string) => string;
  noIssues: string;
  hintLabel: string;
  catalogHints: Record<CatalogIssueCode, string>;
  untestedRuleHint: (id: string) => string;
  unmatchedAnchorHint: string;
  unknownRuleTagHint: string;
  deprecatedRuleTagHint: (id: string, successor: string | undefined) => string;
  unclosedRuleTagHint: (id: string) => string;
  unmatchedEndruleTagHint: (id: string) => string;
  contextOverBudgetHint: string;
  pendingImplementationHint: (id: string) => string;
  lintSummary: (errors: number, warnings: number) => string;
  needsWorkTree: (root: string) => string;
  unknownRef: (ref: string) => string;
  cannotListChanged: (ref: string, reason: string) => string;
}

const EN: Messages = {
  field: (name) => `field "${name}"`,
  missingFrontmatter: 'missing YAML frontmatter delimited by "---" lines',
  unclosedFrontmatter: 'frontmatter is not closed by a "---" line',
  invalidYaml: (detail) => `invalid YAML: ${detail}`,
  required: 'is required',
  notAllowed: 'is not allowed',
  oneOf: (values) => `must be one of: ${values}`,
  equalTo: (value) => `must be equal to ${value}`,
  singleLine: 'must be a single line',
  // undefined keeps Ajv's own English message, so English output stays as it was.
  ofType: () => undefined,
  minLength: () => undefined,
  minimum: () => undefined,
  pattern: () => undefined,
  missingRulesDir: 'directory does not exist',
  missingContextFile: 'has no _context.md',
  contextMismatch: (name) => `must match its directory name "${name}"`,
  fileNameMismatch: (baseName) => `must match the file name "${baseName}"`,
  idPrefixMismatch: (prefix) => `must use the context prefix "${prefix}"`,
  duplicateId: (first) => `duplicates the id of ${first}`,
  catalogWarning: (count) =>
    `warning: the catalog has ${count} format ${count === 1 ? 'issue' : 'issues'}; run "rulebookguard lint" to see them and to check anchors and test tags.`,
  unknownRule: (id) => `Unknown rule id "${id}". Run "rulebookguard list" to list them.`,
  unknownContext: (name) => `Unknown context "${name}". Run "rulebookguard contexts" to list them.`,
  invalidStatus: (status, allowed) => `Invalid status "${status}": expected one of ${allowed}.`,
  outsideRoot: (input, root) => `Path "${input}" is outside the rulebook root ${root}.`,
  gitFallback: (reason) =>
    `warning: git could not list files (${reason}); walking the directory instead.`,
  submoduleSkipped: (submodule, reason) =>
    `warning: could not list files of submodule "${submodule}" (${reason}); skipping it.`,
  ruleCount: (count) => `${count} ${count === 1 ? 'rule' : 'rules'}`,
  noContexts: 'No contexts found. Create one with "rulebookguard new <context>".',
  noRules: 'No rules found.',
  noActiveRulesFor: (path) => `No active rules anchored to ${path}.`,
  filesMatched: (count) => `Files matched by anchors (${count}):`,
  testsTagging: (id, count) => `Tests tagging ${id} (${count}):`,
  none: '(none)',
  noFreeId: (context, lastId) =>
    `No free rule id left in context "${context}" (${lastId} is taken).`,
  alreadyExists: (file) => `${file} already exists; nothing was written.`,
  invalidContextName: (name) =>
    `Invalid context name "${name}": use lowercase letters, digits, "-" or "_", starting with a letter or digit.`,
  invalidPrefix: (prefix) =>
    `Invalid prefix "${prefix}": use uppercase letters and digits, starting with a letter. Pass one with --prefix.`,
  prefixTaken: (prefix, context) =>
    `Prefix "${prefix}" is already used by context "${context}". Pass another one with --prefix.`,
  prefixMismatch: (context, prefix, given) =>
    `Context "${context}" already exists with prefix "${prefix}", not "${given}".`,
  contextTemplateSummary: 'TODO: one-line summary of the context.',
  contextTemplateBody: 'TODO: describe what this context covers and what it leaves out.',
  untestedRule: (id) => `active rule ${id} has no test tagging it`,
  unmatchedAnchor: (anchor) => `anchor "${anchor}" matches no file`,
  unknownRuleTag: (id) => `tags ${id}, which does not exist`,
  deprecatedRuleTag: (id) => `tags ${id}, which is deprecated`,
  unclosedRuleTag: (id) => `@rule ${id} has no matching @endrule ${id}`,
  unmatchedEndruleTag: (id) => `@endrule ${id} has no open @rule ${id} before it`,
  contextOverBudget: (context, count, budget) =>
    `context "${context}" has ${count} rules, more than the contextBudget of ${budget}`,
  pendingImplementation: (id, base) =>
    `rule ${id} changed since ${base} but none of the tests tagging it changed`,
  noIssues: 'No issues found.',
  hintLabel: 'hint',
  catalogHints: {
    schema:
      'fix the file as the message says; the JSON Schemas ship under rulebookguard/schemas/v1/',
    'missing-rules-dir': 'create the directory, or set rulesDir in rulebookguard.config.yaml',
    'missing-context-file': 'add a _context.md with context, prefix and summary',
    'context-mismatch':
      'make the context field equal to the directory name, or move the file to the matching directory',
    'file-name-mismatch': 'rename the file after the id, or change the id',
    'id-prefix-mismatch':
      'change the id to use the context prefix, or move the rule to the context that owns its prefix',
    'duplicate-id':
      'give one of the rules another id; "rulebookguard new <context>" picks the next free one',
  },
  untestedRuleHint: (id) =>
    `wrap a test in a file matched by testGlobs with "@rule ${id}" and "@endrule ${id}", or set the rule's status to proposed`,
  unmatchedAnchorHint: 'fix the glob so it matches the files that implement the rule, or remove it',
  unknownRuleTagHint: 'fix the id in the tag, or create the rule it refers to',
  deprecatedRuleTagHint: (id, successor) =>
    successor === undefined
      ? `tag the rule that replaces ${id}, or remove the tag`
      : `tag ${successor}, which supersedes ${id}, instead`,
  unclosedRuleTagHint: (id) =>
    `add "@endrule ${id}" after the last line of the test, or close the inner regions first`,
  unmatchedEndruleTagHint: (id) =>
    `add "@rule ${id}" before the test, or remove the stray @endrule`,
  contextOverBudgetHint:
    'split the context into smaller ones, or raise contextBudget in rulebookguard.config.yaml',
  pendingImplementationHint: (id) =>
    `update or add a test tagging ${id} that covers the changed rule`,
  lintSummary: (errors, warnings) =>
    `${errors} ${errors === 1 ? 'error' : 'errors'}, ${warnings} ${warnings === 1 ? 'warning' : 'warnings'}`,
  needsWorkTree: (root) => `lint --base needs a git work tree, but ${root} is not inside one.`,
  unknownRef: (ref) => `Unknown git ref "${ref}".`,
  cannotListChanged: (ref, reason) => `Cannot list the files changed since "${ref}": ${reason}`,
};

const ES: Messages = {
  field: (name) => `el campo "${name}"`,
  missingFrontmatter: 'falta el frontmatter YAML delimitado por líneas "---"',
  unclosedFrontmatter: 'el frontmatter no se cierra con una línea "---"',
  invalidYaml: (detail) => `YAML inválido: ${detail}`,
  required: 'es obligatorio',
  notAllowed: 'no está permitido',
  oneOf: (values) => `debe ser uno de: ${values}`,
  equalTo: (value) => `debe ser igual a ${value}`,
  singleLine: 'debe ocupar una sola línea',
  ofType: (type) => `debe ser de tipo ${type}`,
  minLength: (limit) =>
    limit === 1 ? 'no puede estar vacío' : `debe tener al menos ${limit} caracteres`,
  minimum: (limit) => `debe ser mayor o igual que ${limit}`,
  pattern: (pattern) => `debe cumplir el patrón "${pattern}"`,
  missingRulesDir: 'el directorio no existe',
  missingContextFile: 'no tiene _context.md',
  contextMismatch: (name) => `debe coincidir con el nombre de su directorio "${name}"`,
  fileNameMismatch: (baseName) => `debe coincidir con el nombre del archivo "${baseName}"`,
  idPrefixMismatch: (prefix) => `debe usar el prefijo del contexto "${prefix}"`,
  duplicateId: (first) => `repite el id de ${first}`,
  catalogWarning: (count) =>
    `aviso: el catálogo tiene ${count} ${count === 1 ? 'problema' : 'problemas'} de formato; ejecuta "rulebookguard lint" para verlos y para revisar anchors y etiquetas de test.`,
  unknownRule: (id) =>
    `No existe la regla "${id}". Ejecuta "rulebookguard list" para ver las reglas.`,
  unknownContext: (name) =>
    `No existe el contexto "${name}". Ejecuta "rulebookguard contexts" para ver los contextos.`,
  invalidStatus: (status, allowed) => `Estado "${status}" inválido: debe ser uno de ${allowed}.`,
  outsideRoot: (input, root) => `La ruta "${input}" está fuera de la raíz del rulebook ${root}.`,
  gitFallback: (reason) =>
    `aviso: git no pudo listar los archivos (${reason}); se recorre el directorio en su lugar.`,
  submoduleSkipped: (submodule, reason) =>
    `aviso: no se pudieron listar los archivos del submódulo "${submodule}" (${reason}); se omite.`,
  ruleCount: (count) => `${count} ${count === 1 ? 'regla' : 'reglas'}`,
  noContexts: 'No se encontraron contextos. Crea uno con "rulebookguard new <contexto>".',
  noRules: 'No se encontraron reglas.',
  noActiveRulesFor: (path) => `No hay reglas activas ancladas a ${path}.`,
  filesMatched: (count) => `Archivos que cubren los anchors (${count}):`,
  testsTagging: (id, count) => `Tests que etiquetan ${id} (${count}):`,
  none: '(ninguno)',
  noFreeId: (context, lastId) =>
    `No quedan ids libres en el contexto "${context}" (${lastId} ya existe).`,
  alreadyExists: (file) => `${file} ya existe; no se escribió nada.`,
  invalidContextName: (name) =>
    `Nombre de contexto "${name}" inválido: usa minúsculas, dígitos, "-" o "_", empezando por una letra o un dígito.`,
  invalidPrefix: (prefix) =>
    `Prefijo "${prefix}" inválido: usa mayúsculas y dígitos, empezando por una letra. Indica uno con --prefix.`,
  prefixTaken: (prefix, context) =>
    `El prefijo "${prefix}" ya lo usa el contexto "${context}". Indica otro con --prefix.`,
  prefixMismatch: (context, prefix, given) =>
    `El contexto "${context}" ya existe con el prefijo "${prefix}", no "${given}".`,
  contextTemplateSummary: 'TODO: resumen del contexto en una línea.',
  contextTemplateBody: 'TODO: describe qué cubre este contexto y qué queda fuera.',
  untestedRule: (id) => `la regla activa ${id} no tiene ningún test que la etiquete`,
  unmatchedAnchor: (anchor) => `el anchor "${anchor}" no coincide con ningún archivo`,
  unknownRuleTag: (id) => `etiqueta ${id}, que no existe`,
  deprecatedRuleTag: (id) => `etiqueta ${id}, que está deprecada`,
  unclosedRuleTag: (id) => `@rule ${id} no tiene su @endrule ${id}`,
  unmatchedEndruleTag: (id) => `@endrule ${id} no tiene un @rule ${id} abierto antes`,
  contextOverBudget: (context, count, budget) =>
    `el contexto "${context}" tiene ${count} reglas, más que el contextBudget de ${budget}`,
  pendingImplementation: (id, base) =>
    `la regla ${id} cambió desde ${base} pero no cambió ninguno de los tests que la etiquetan`,
  noIssues: 'No se encontraron problemas.',
  hintLabel: 'sugerencia',
  catalogHints: {
    schema:
      'corrige el archivo según el mensaje; los JSON Schemas vienen en rulebookguard/schemas/v1/',
    'missing-rules-dir': 'crea el directorio o cambia rulesDir en rulebookguard.config.yaml',
    'missing-context-file': 'agrega un _context.md con context, prefix y summary',
    'context-mismatch':
      'iguala el campo context al nombre del directorio o mueve el archivo al directorio que corresponde',
    'file-name-mismatch': 'renombra el archivo según el id o cambia el id',
    'id-prefix-mismatch':
      'cambia el id para usar el prefijo del contexto o mueve la regla al contexto dueño de ese prefijo',
    'duplicate-id':
      'dale otro id a una de las reglas; "rulebookguard new <contexto>" elige el siguiente libre',
  },
  untestedRuleHint: (id) =>
    `envuelve un test de un archivo que coincida con testGlobs con "@rule ${id}" y "@endrule ${id}", o cambia el estado de la regla a proposed`,
  unmatchedAnchorHint:
    'corrige el glob para que coincida con los archivos que implementan la regla, o quítalo',
  unknownRuleTagHint: 'corrige el id de la etiqueta o crea la regla a la que se refiere',
  deprecatedRuleTagHint: (id, successor) =>
    successor === undefined
      ? `etiqueta la regla que reemplaza a ${id} o quita la etiqueta`
      : `etiqueta ${successor}, que reemplaza a ${id}`,
  unclosedRuleTagHint: (id) =>
    `agrega "@endrule ${id}" después de la última línea del test, o cierra antes las regiones internas`,
  unmatchedEndruleTagHint: (id) =>
    `agrega "@rule ${id}" antes del test, o quita el @endrule que sobra`,
  contextOverBudgetHint:
    'divide el contexto en otros más chicos o sube contextBudget en rulebookguard.config.yaml',
  pendingImplementationHint: (id) =>
    `actualiza o agrega un test que etiquete ${id} y cubra el cambio de la regla`,
  lintSummary: (errors, warnings) =>
    `${errors} ${errors === 1 ? 'error' : 'errores'}, ${warnings} ${warnings === 1 ? 'aviso' : 'avisos'}`,
  needsWorkTree: (root) => `lint --base necesita un work tree de git, pero ${root} no está en uno.`,
  unknownRef: (ref) => `La referencia de git "${ref}" no existe.`,
  cannotListChanged: (ref, reason) =>
    `No se pudieron listar los archivos cambiados desde "${ref}": ${reason}`,
};

const MESSAGES: Record<RuleLanguage, Messages> = { en: EN, es: ES };

export function messages(language: RuleLanguage | undefined): Messages {
  return MESSAGES[language ?? 'en'];
}
