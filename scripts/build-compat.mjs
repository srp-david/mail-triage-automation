import {writeFile,copyFile,mkdir} from 'node:fs/promises';
// Preserve existing Docker/CLI entry paths during the incremental v0 transition.
for(const name of ['server','worker','diagnose'])await writeFile(`dist/${name}.js`,`import './src/${name}.js';\n`);
await mkdir('dist/src',{recursive:true});
await copyFile('src/migration.sql','dist/src/migration.sql');
