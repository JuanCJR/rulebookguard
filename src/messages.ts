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
  contextOverBudget: (context: string, count: number, budget: number) => string;
  pendingImplementation: (id: string, base: string) => string;
  noIssues: string;
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
    `warning: the catalog has ${count} ${count === 1 ? 'issue' : 'issues'}; run "rulebookguard lint" for details.`,
  unknownRule: (id) => `Unknown rule id "${id}". Run "rulebookguard list" to list them.`,
  unknownContext: (name) => `Unknown context "${name}". Run "rulebookguard contexts" to list them.`,
  invalidStatus: (status, allowed) => `Invalid status "${status}": expected one of ${allowed}.`,
  outsideRoot: (input, root) => `Path "${input}" is outside the rulebook root ${root}.`,
  gitFallback: (reason) =>
    `warning: git could not list files (${reason}); walking the directory instead.`,
  submoduleSkipped: (submodule, reason) =>
    `warning: could not list files of submodule "${submodule}" (${reason}); skipping it.`,
  ruleCount: (count) => `${count} ${count === 1 ? 'rule' : 'rules'}`,
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
  contextOverBudget: (context, count, budget) =>
    `context "${context}" has ${count} rules, more than the contextBudget of ${budget}`,
  pendingImplementation: (id, base) =>
    `rule ${id} changed since ${base} but none of the tests tagging it changed`,
  noIssues: 'No issues found.',
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
    `aviso: el catálogo tiene ${count} ${count === 1 ? 'problema' : 'problemas'}; ejecuta "rulebookguard lint" para ver el detalle.`,
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
  contextOverBudget: (context, count, budget) =>
    `el contexto "${context}" tiene ${count} reglas, más que el contextBudget de ${budget}`,
  pendingImplementation: (id, base) =>
    `la regla ${id} cambió desde ${base} pero no cambió ninguno de los tests que la etiquetan`,
  noIssues: 'No se encontraron problemas.',
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
