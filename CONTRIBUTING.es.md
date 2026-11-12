# Contribuir

[English](CONTRIBUTING.md) • **Español**

> [!NOTE]
> Esta es una traducción de [CONTRIBUTING.md](CONTRIBUTING.md). Si ambas versiones difieren, la versión en inglés es la de referencia.

## Publicar una release

Las releases se publican en npm desde GitHub Actions con [trusted publishing](https://docs.npmjs.com/trusted-publishers), así que no se guarda ningún token de npm y cada versión lleva una attestation de procedencia. Para publicar una release, sube `version` en `package.json` (y sus rangos de peer `@rulebookguard/site` y `@rulebookguard/symbols`), en `packages/site/package.json`, en `packages/symbols/package.json`, en `plugin/.claude-plugin/plugin.json`, en `plugin/plugin.json`, en `plugin/mcp.json` y en los comandos fijados de `README.md` y `README.es.md` (los tests los mantienen iguales), haz merge a `main` y luego sube un tag que coincida:

```sh
git tag v0.1.0
git push origin v0.1.0
```

Publica `@rulebookguard/site`, luego `@rulebookguard/symbols` (cuyo `prepack` copia dentro los archivos de gramáticas) y luego `rulebookguard`. Trusted publishing se configura por paquete en npmjs.com, y un paquete debe existir antes de poder configurarse, así que antes de la primera release que incluya un paquete nuevo, publica una vez a mano una versión provisoria (por ejemplo `npm version 0.0.0-setup.0 --no-git-tag-version` y luego `npm publish --access public --tag setup` desde su directorio, sin commitear el cambio de versión) y agrega su trusted publisher. Nunca publiques a mano la versión de la release en sí: el `npm publish` del workflow fallaría después de que los paquetes anteriores ya sean públicos.

El workflow `Release` falla sin publicar cuando el tag no coincide con las versiones de los paquetes, o cuando falla `vp check`, `vp test` o `vp pack`.

También publica un `npm-shrinkwrap.json`, generado por `scripts/write-shrinkwrap.ts` y no commiteado, que bloquea las dependencias de producción a las versiones de `pnpm-lock.yaml`, las mismas con las que corrió `vp test`. Esto es lo que hace reproducible un `npx rulebookguard@<version>` fijado para proyectos que no lo tienen en su lockfile, así que para distribuir una dependencia más nueva, actualiza `pnpm-lock.yaml`. El workflow falla sin publicar cuando un paquete de producción es un alias o resuelve a dos versiones en `pnpm-lock.yaml` (`vp test` detecta ambos casos antes de un tag), cuando npm no puede bloquear exactamente esas versiones, o cuando el CLI empaquetado no puede ejecutar lint sobre este repositorio.

Después de publicar, `scripts/check-published.ts` confirma lo que solo el registro real puede probar: que reporta `_hasShrinkwrap: true` y que instalar la nueva versión da las versiones bloqueadas. Si este último paso falla, la versión ya es pública, así que inspecciónala y, si hace falta, depréciala, en lugar de volver a ejecutar el workflow.
