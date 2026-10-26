export type RuleStatus = 'proposed' | 'active' | 'deprecated';

export interface RulebookConfig {
  schema: 1;
  rulesDir: string;
  testGlobs: string[];
  contextBudget: number;
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
  anchors: string[];
  summary: string;
}

export interface RuleDoc extends RuleFrontmatter {
  file: string;
  body: string;
}
