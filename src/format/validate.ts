import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import configSchema from '../../schemas/v1/config.schema.json' with { type: 'json' };
import contextSchema from '../../schemas/v1/context.schema.json' with { type: 'json' };
import ruleSchema from '../../schemas/v1/rule.schema.json' with { type: 'json' };
import { FormatError, type FormatIssue } from './errors.ts';
import { messages, type Messages } from '../messages.ts';
import type { ContextFrontmatter, ParseOptions, RuleFrontmatter, RulebookConfig } from './types.ts';

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

export function validate<T>(
  validator: ValidateFunction<T>,
  data: unknown,
  file: string,
  { language }: ParseOptions = {},
): T {
  if (validator(data)) {
    return data;
  }
  const text = messages(language);
  throw new FormatError((validator.errors ?? []).map((error) => toIssue(error, file, text)));
}

function toIssue(error: ErrorObject, file: string, text: Messages): FormatIssue {
  const base = toFieldPath(error.instancePath);
  const params = error.params as Record<string, unknown>;
  const fallback = error.message ?? 'is invalid';
  switch (error.keyword) {
    case 'required':
      return { file, field: join(base, String(params.missingProperty)), message: text.required };
    case 'additionalProperties':
      return {
        file,
        field: join(base, String(params.additionalProperty)),
        message: text.notAllowed,
      };
    case 'enum':
      return withField(file, base, text.oneOf((params.allowedValues as unknown[]).join(', ')));
    case 'const':
      return withField(file, base, text.equalTo(JSON.stringify(params.allowedValue)));
    case 'pattern':
      if (params.pattern === '^[^\\r\\n]*$') {
        return withField(file, base, text.singleLine);
      }
      return withField(file, base, text.pattern(String(params.pattern)) ?? fallback);
    case 'type':
      return withField(file, base, text.ofType(String(params.type)) ?? fallback);
    case 'minLength':
      return withField(file, base, text.minLength(Number(params.limit)) ?? fallback);
    case 'minimum':
      return withField(file, base, text.minimum(Number(params.limit)) ?? fallback);
    default:
      return withField(file, base, fallback);
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
