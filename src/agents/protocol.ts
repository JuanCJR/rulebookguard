import type { RuleLanguage } from '../format/types.ts';

// The SessionStart hook and the MCP server instructions hand over these same steps; the `rules`
// skill explains them in full.
const STEPS: Record<RuleLanguage, string[]> = {
  en: [
    '1. Explore: the `contexts` tool, then `rules_list` for the contexts involved, then `rules_for` on the files you will change; `rules_affected` takes the files and key words in one call. Say explicitly when the area has no context or no rules.',
    '2. Classify each new or changed behavior: (a) covered by an active rule: cite its id; (b) a new business rule: propose it with status `proposed` (a single rule of a small task inline, following the `rule-writing` guide; several rules, a new context or a conflict through the `rule-author` agent); only the user makes it `active`; (c) not a business rule (UI layout, performance, refactor): say so. A business rule is something the business would state (who, when, limits, states, required data), observable by the user and testable. If the area has no context yet, propose the context first.',
    '3. Never change an active rule on your own: ask the user whether to modify, deprecate or supersede it.',
    '4. In a plan or spec, each item cites the rule ids it affects; new or changed rules stay `proposed` until the user confirms them. Before you ask to activate a rule, review its questions for the business with the user, one at a time, and record each answer under `## Decisions` (the `rule-review` skill).',
    '5. Implement in this order: rule file, then tests tagged `@rule <ID>`, then code, then `lint`.',
    '6. Before a pull request, run `rulebookguard lint --base <the branch the pull request targets>`, and name every rule you touched in your final report.',
    'The `rules` skill, when your client has it, explains each step.',
  ],
  es: [
    '1. Explora: la herramienta `contexts`, luego `rules_list` para los contextos involucrados y `rules_for` sobre los archivos que vas a cambiar; `rules_affected` recibe los archivos y las palabras clave en una sola llamada. Di explícitamente cuando el área no tiene contexto o no tiene reglas.',
    '2. Clasifica cada comportamiento nuevo o cambiado: (a) cubierto por una regla activa: cita su id; (b) una regla de negocio nueva: propónla con estado `proposed` (una sola regla de una tarea pequeña, en línea, siguiendo la guía `rule-writing`; varias reglas, un contexto nuevo o un conflicto, con el agente `rule-author`); solo el usuario la pasa a `active`; (c) no es una regla de negocio (diseño de la interfaz, rendimiento, refactor): dilo. Una regla de negocio es algo que el negocio enunciaría (quién, cuándo, límites, estados, datos obligatorios), observable por el usuario y verificable con un test. Si el área aún no tiene contexto, propón primero el contexto.',
    '3. Nunca cambies por tu cuenta una regla activa: pregunta al usuario si modificarla, deprecarla o reemplazarla.',
    '4. En un plan o una especificación, cada ítem cita los ids de las reglas que afecta; las reglas nuevas o cambiadas siguen `proposed` hasta que el usuario las confirme. Antes de pedir que se active una regla, revisa con el usuario sus preguntas para el negocio, una a la vez, y registra cada respuesta en `## Decisions` (la skill `rule-review`).',
    '5. Implementa en este orden: archivo de la regla, luego tests marcados con `@rule <ID>`, luego código, luego `lint`.',
    '6. Antes de un pull request, ejecuta `rulebookguard lint --base <la rama a la que apunta el pull request>` y nombra en tu informe final cada regla que tocaste.',
    'La skill `rules`, si tu cliente la tiene, explica cada paso.',
  ],
};

const INTRO: Record<RuleLanguage, string> = {
  en: 'This project keeps its business rules in a rulebookguard rulebook. On every task, small or large, run a rule impact analysis before you plan or change behavior:',
  es: 'Este proyecto guarda sus reglas de negocio en un rulebook de rulebookguard. En cada tarea, pequeña o grande, haz un análisis de impacto sobre las reglas antes de planificar o cambiar comportamiento:',
};

// The server starts before it knows the workspace, so its instructions only apply where one has a rulebook.
const SERVER_INTRO =
  'When the workspace has a rulebookguard.config.yaml, it keeps its business rules in a rulebookguard rulebook. On every task, small or large, run a rule impact analysis before you plan or change behavior:';

// @implements R-AGT-005
export function sessionProtocol(language: RuleLanguage): string {
  return [INTRO[language], ...STEPS[language]].join('\n');
}
// @endimplements R-AGT-005

// @implements R-AGT-006
export function serverInstructions(): string {
  return [SERVER_INTRO, ...STEPS.en].join('\n');
}
// @endimplements R-AGT-006
