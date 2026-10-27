#!/usr/bin/env node
import { runCli } from './commands/run.ts';

process.exitCode = await runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  stdin: async () => {
    let text = '';
    for await (const chunk of process.stdin) {
      text += String(chunk);
    }
    return text;
  },
});
