import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import configSchema from '../../schemas/v1/config.schema.json' with { type: 'json' };
import contextSchema from '../../schemas/v1/context.schema.json' with { type: 'json' };
import ruleSchema from '../../schemas/v1/rule.schema.json' with { type: 'json' };
import { FormatError, type FormatIssue } from './errors.ts';
import type { ContextFrontmatter, RuleFrontmatter, RulebookConfig } from './types.ts';

const ajv = new Ajv2020({ allErrors: true, useDefaults: true });

export const validators: {
  config: ValidateFunction<RulebookConfig>;
  context: ValidateFunction<ContextFrontmatter>;
  rule: ValidateFunction<RuleFrontmatter>;
} = {
  config: ajv.compile<RulebookConfig>(configSchema),
  context: ajv.compile<ContextFrontmatter>(contextSchema),
  rule: ajv.compile<RuleFrontmatter>(ruleSchema),
};

export function validate<T>(validator: ValidateFunction<T>, data: unknown, file: string): T {
  if (validator(data)) {
    return data;
  }
  throw new FormatError((validator.errors ?? []).map((error) => toIssue(error, file)));
}

function toIssue(error: ErrorObject, file: string): FormatIssue {
  const base = toFieldPath(error.instancePath);
  const params = error.params as Record<string, unknown>;
  switch (error.keyword) {
    case 'required':
      return { file, field: join(base, String(params.missingProperty)), message: 'is required' };
    case 'additionalProperties':
      return {
        file,
        field: join(base, String(params.additionalProperty)),
        message: 'is not allowed',
      };
    case 'enum':
      return withField(
        file,
        base,
        `must be one of: ${(params.allowedValues as unknown[]).join(', ')}`,
      );
    case 'const':
      return withField(file, base, `must be equal to ${JSON.stringify(params.allowedValue)}`);
    case 'pattern':
      if (params.pattern === '^[^\\r\\n]*$') {
        return withField(file, base, 'must be a single line');
      }
      return withField(file, base, error.message ?? 'is invalid');
    default:
      return withField(file, base, error.message ?? 'is invalid');
  }
}

function withField(file: string, field: string, message: string): FormatIssue {
  return field === '' ? { file, message } : { file, field, message };
}

function join(base: string, key: string): string {
  return base === '' ? key : `${base}.${key}`;
}

function toFieldPath(instancePath: string): string {
  return instancePath
    .split('/')
    .slice(1)
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce(
      (path, segment) => (/^\d+$/.test(segment) ? `${path}[${segment}]` : join(path, segment)),
      '',
    );
}
