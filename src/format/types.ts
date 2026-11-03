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

export interface ContextFrontmatter {
  context: string;
  prefix: string;
  summary: string;
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
