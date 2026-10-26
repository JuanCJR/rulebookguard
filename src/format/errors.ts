export interface FormatIssue {
  file: string;
  field?: string;
  message: string;
}

export function formatIssue(issue: FormatIssue): string {
  return issue.field === undefined
    ? `${issue.file}: ${issue.message}`
    : `${issue.file}: field "${issue.field}" ${issue.message}`;
}

export class FormatError extends Error {
  readonly issues: FormatIssue[];

  constructor(issues: FormatIssue[]) {
    super(issues.map(formatIssue).join('\n'));
    this.name = 'FormatError';
    this.issues = issues;
  }
}
