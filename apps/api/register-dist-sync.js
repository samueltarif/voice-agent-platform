// DEC-066 — usado SÓ pelo processo filho de extração da API compilada: o
// `--permission` nega a thread interna de `module.register`, então os mesmos
// redirecionamentos do dist são registrados com ganchos síncronos.
import { registerHooks } from 'node:module';
import { resolveSync } from './dist-resolver.js';

registerHooks({ resolve: resolveSync });
