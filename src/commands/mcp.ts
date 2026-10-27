import { resolve } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createRulesServer } from '../mcp/server.ts';
import type { CliIo } from './io.ts';

// Resolves once connected; the open stdin keeps the process serving until the client closes it.
export async function mcpCommand(io: CliIo, project: string | undefined): Promise<void> {
  await createRulesServer(resolve(io.cwd, project ?? '.')).connect(new StdioServerTransport());
}
