import { resolve } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createRulesServer } from '../mcp/server.ts';
import type { CliIo } from './io.ts';

// Resolves once connected; the open stdin keeps the process serving until the client closes it.
export async function mcpCommand(io: CliIo, project: string | undefined): Promise<void> {
  // @implements R-AGT-003
  const server = createRulesServer(resolve(io.cwd, project ?? '.'), {
    clientRoots: project === undefined,
  });
  // @endimplements R-AGT-003
  await server.connect(new StdioServerTransport());
}
