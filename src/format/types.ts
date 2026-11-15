export type RuleStatus = 'proposed' | 'active' | 'deprecated';

export type RuleLanguage = 'en' | 'es';

export type RuleOrigin = 'authored' | 'extracted';

export interface ParseOptions {
  /** Language of the issue messages; `en` when unset. */
  language?: RuleLanguage | undefined;
}

export interface RulebookConfig {
  schema: 1;
  rulesDir: string;
  testGlobs: string[];
  contextBudget: number;
  /** Language the generated rule text is written in; `en` when unset. */
  language?: RuleLanguage;
}

/** `crosscutting` marks a context that applies to every domain, such as auditing. */
export type ContextKind = 'domain' | 'crosscutting';

/** A business concept a context owns. */
export interface ContextEntity {
  name: string;
  description: string;
  /** `extracted` when an agent lifted it from the code and no person has validated it yet. */
  origin?: RuleOrigin;
  evidence?: string[];
}

/** How an entity of this context relates to an entity of any context. */
export interface ContextRelation {
  /** An entity of this context. */
  from: string;
  /** An entity of this or another context. */
  to: string;
  /** The relation in business words, cardinality included. */
  label: string;
  origin?: RuleOrigin;
  evidence?: string[];
}

export interface ContextFrontmatter {
  context: string;
  prefix: string;
  summary: string;
  /** `domain` when unset. */
  kind?: ContextKind;
  entities?: ContextEntity[];
  relations?: ContextRelation[];
}

export interface ContextDoc extends ContextFrontmatter {
  file: string;
  body: string;
}

export interface RuleFrontmatter {
  id: string;
  context: string;
  entities: string[];
  status: RuleStatus;
  supersedes?: string;
  /** Rules this rule needs in force; `lint` rejects unknown ids and cycles. */
  dependsOn?: string[];
  /** Rules that cannot be active at the same time as this one. */
  conflictsWith?: string[];
  /** The section the rule shows under on its context page; its first entity when unset. */
  group?: string;
  /** `extracted` when the rule was lifted from existing code rather than written from intent. */
  origin?: RuleOrigin;
  /** Where the rule shows in the code or tests, for example `src/x.ts:42`. */
  evidence?: string[];
  anchors: string[];
  summary: string;
}

export interface RuleDoc extends RuleFrontmatter {
  file: string;
  body: string;
}
