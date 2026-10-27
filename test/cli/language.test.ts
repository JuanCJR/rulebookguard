import { appendFile, cp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { scratchDir } from '../scratch.ts';
import { fixtureRoot, runCli } from './run.ts';

async function spanishCopy(fixture: string): Promise<string> {
  const dir = await scratchDir();
  await cp(fixtureRoot(fixture), dir, { recursive: true });
  await appendFile(join(dir, 'rulebookguard.config.yaml'), 'language: es\n');
  return dir;
}

describe('language: es', () => {
  it('prints lint findings and the summary in Spanish, keeping codes and severities', async () => {
    const repo = await spanishCopy('lint');

    expect(await runCli(['lint'], repo)).toEqual({
      status: 1,
      stdout: [
        'error untested-rule rules/orders/R-ORD-002.md la regla activa R-ORD-002 no tiene ningún test que la etiquete',
        'error schema rules/orders/R-ORD-004.md el campo "status" debe ser uno de: proposed, active, deprecated',
        'warning context-over-budget rules/orders/_context.md el contexto "orders" tiene 3 reglas, más que el contextBudget de 2',
        'error unmatched-anchor rules/stock/R-STK-001.md el anchor "src/stock/**" no coincide con ningún archivo',
        'error duplicate-id rules/stock/R-STK-002.md el campo "id" repite el id de rules/stock/R-STK-001.md',
        'error file-name-mismatch rules/stock/R-STK-002.md el campo "id" debe coincidir con el nombre del archivo "R-STK-002"',
        'error deprecated-rule-tag tests/orders_test.py:6 etiqueta R-ORD-003, que está deprecada',
        'error unknown-rule-tag tests/orders_test.py:11 etiqueta R-XYZ-001, que no existe',
        '7 errores, 1 aviso',
        '',
      ].join('\n'),
      stderr: '',
    });
  });

  it('translates the JSON message but not the code or the keys', async () => {
    const repo = await spanishCopy('lint');

    const report = JSON.parse((await runCli(['lint', '--json'], repo)).stdout);

    expect(report.findings[0]).toEqual({
      severity: 'error',
      code: 'untested-rule',
      file: 'rules/orders/R-ORD-002.md',
      message: 'la regla activa R-ORD-002 no tiene ningún test que la etiquete',
    });
  });

  it('translates schema messages that come from the validator', async () => {
    const repo = await spanishCopy('repo');
    await writeFile(
      join(repo, 'docs/rules/clients/R-CLI-001.md'),
      '---\nid: R-CLI-001\ncontext: clients\nentities: []\nstatus: active\nanchors: []\nsummary: ""\n---\n',
    );

    const result = await runCli(['lint', '--json'], repo);

    expect(JSON.parse(result.stdout).findings).toContainEqual({
      severity: 'error',
      code: 'schema',
      file: 'docs/rules/clients/R-CLI-001.md',
      message: 'el campo "summary" no puede estar vacío',
    });
  });

  it('prints no issues found in Spanish', async () => {
    const repo = await spanishCopy('repo');
    await writeFile(join(repo, 'tests/billing/test_numbering.py'), '# @rule R-BIL-002\n');

    expect(await runCli(['lint'], repo)).toEqual({
      status: 0,
      stdout: 'No se encontraron problemas.\n',
      stderr: '',
    });
  });

  it('translates read-command errors and headers', async () => {
    const repo = await spanishCopy('repo');

    expect(await runCli(['show', 'R-XXX-999'], repo)).toEqual({
      status: 1,
      stdout: '',
      stderr: 'No existe la regla "R-XXX-999". Ejecuta "rulebookguard list" para ver las reglas.\n',
    });
    expect((await runCli(['list', '--context', 'nope'], repo)).stderr).toBe(
      'No existe el contexto "nope". Ejecuta "rulebookguard contexts" para ver los contextos.\n',
    );
    expect((await runCli(['list', '--status', 'foo'], repo)).stderr).toBe(
      'Estado "foo" inválido: debe ser uno de proposed, active, deprecated.\n',
    );
    expect((await runCli(['for', 'src/none.ts'], repo)).stdout).toBe(
      'No hay reglas activas ancladas a src/none.ts.\n',
    );
    expect((await runCli(['contexts'], repo)).stdout).toMatch(/^billing \(BIL, \d+ reglas\): /);
    const impact = (await runCli(['impact', 'R-CLI-001'], repo)).stdout;
    expect(impact).toMatch(/^Archivos que cubren los anchors \(\d+\):$/m);
    expect(impact).toMatch(/^Tests que etiquetan R-CLI-001 \(\d+\):$/m);
  });

  it('keeps --help and argument errors in English', async () => {
    const repo = await spanishCopy('repo');

    expect((await runCli(['--help'], repo)).stdout).toMatch(/^Usage: rulebookguard/);
    expect(await runCli(['show'], repo)).toEqual({
      status: 2,
      stdout: '',
      stderr: 'Missing argument <id>. Usage: rulebookguard show <id> [--json]\n',
    });
  });
});
