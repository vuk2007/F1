/**
 * `node --import ./scripts/register-aliases.mjs scripts/<script>.ts`
 *
 * Lets a script import the app's own models (`@/lib/...`) under plain Node. See
 * alias-hooks.mjs for what it resolves and why.
 */
import { register } from 'node:module';

register('./alias-hooks.mjs', import.meta.url);
