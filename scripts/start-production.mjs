/**
 * Explicit production launcher. NODE_ENV is set before importing the BFF
 * entrypoint so the production port and static dist serving are selected.
 */
process.env.NODE_ENV = 'production';
await import('../server/main.ts');
