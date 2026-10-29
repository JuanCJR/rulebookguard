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
        '  sugerencia: agrega "@rule R-ORD-002" a un test en un archivo que coincida con testGlobs, o cambia el estado de la regla a proposed',
        'error schema rules/orders/R-ORD-004.md el campo "status" debe ser uno de: proposed, active, deprecated',
        '  sugerencia: corrige el archivo según el mensaje; los JSON Schemas vienen en rulebookguard/schemas/v1/',
        'warning context-over-budget rules/orders/_context.md el contexto "orders" tiene 3 reglas, más que el contextBudget de 2',
        '  sugerencia: divide el contexto en otros más chicos o sube contextBudget en rulebookguard.config.yaml',
        'error unmatched-anchor rules/stock/R-STK-001.md el anchor "src/stock/**" no coincide con ningún archivo',
        '  sugerencia: corrige el glob para que coincida con los archivos que implementan la regla, o quítalo',
        'error duplicate-id rules/stock/R-STK-002.md el campo "id" repite el id de rules/stock/R-STK-001.md',
        '  sugerencia: dale otro id a una de las reglas; "rulebookguard new <contexto>" elige el siguiente libre',
        'error file-name-mismatch rules/stock/R-STK-002.md el campo "id" debe coincidir con el nombre del archivo "R-STK-002"',
        '  sugerencia: renombra el archivo según el id o cambia el id',
        'error deprecated-rule-tag tests/orders_test.py:6 etiqueta R-ORD-003, que está deprecada',
        '  sugerencia: etiqueta la regla que reemplaza a R-ORD-003 o quita la etiqueta',
        'error unknown-rule-tag tests/orders_test.py:11 etiqueta R-XYZ-001, que no existe',
        '  sugerencia: corrige el id de la etiqueta o crea la regla a la que se refiere',
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
      hint: 'agrega "@rule R-ORD-002" a un test en un archivo que coincida con testGlobs, o cambia el estado de la regla a proposed',
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
      hint: 'corrige el archivo según el mensaje; los JSON Schemas vienen en rulebookguard/schemas/v1/',
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
