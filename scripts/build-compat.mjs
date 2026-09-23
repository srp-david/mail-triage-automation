import {writeFile,copyFile,mkdir,cp} from 'node:fs/promises';
// Preserve existing Docker/CLI entry paths during the incremental v0 transition.
for(const name of ['server','worker','diagnose','schema','db','history','archive','sync'])await writeFile(`dist/${name}.js`,`export * from './src/${name}.js';\n`);
await mkdir('dist/src',{recursive:true});
await copyFile('src/migration.sql','dist/src/migration.sql');
await cp('apps/history-api/migrations','dist/apps/history-api/migrations',{recursive:true});
await cp('packages/skills','dist/packages/skills',{recursive:true});
