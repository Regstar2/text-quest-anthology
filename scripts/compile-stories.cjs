const fs = require('node:fs');
const path = require('node:path');
const {Compiler} = require('inkjs/full');

const storiesDir = path.resolve(__dirname, '..', 'src', 'stories');
const generatedDir = path.join(storiesDir, 'generated');

fs.mkdirSync(generatedDir, {recursive: true});

const storyFiles = fs
  .readdirSync(storiesDir, {withFileTypes: true})
  .filter(entry => entry.isFile() && entry.name.endsWith('.ink'))
  .map(entry => entry.name)
  .sort();

if (storyFiles.length === 0) {
  console.error('[ink] No .ink stories found in src/stories.');
  process.exit(1);
}

let failed = false;

for (const fileName of storyFiles) {
  const inputPath = path.join(storiesDir, fileName);
  const outputPath = path.join(
    generatedDir,
    `${path.basename(fileName, '.ink')}.json`,
  );
  const source = fs.readFileSync(inputPath, 'utf8').replace(/^\uFEFF/, '');

  const compiler = new Compiler(source, {
    errorHandler: message => {
      console.error(`[ink:${fileName}] ${message}`);
    },
  });

  try {
    const story = compiler.Compile();

    if (!story) {
      throw new Error('Compiler returned no story.');
    }

    fs.writeFileSync(outputPath, `${story.ToJson()}\n`, 'utf8');
    console.log(
      `[ink] ${path.relative(process.cwd(), inputPath)} -> ${path.relative(
        process.cwd(),
        outputPath,
      )}`,
    );
  } catch (error) {
    failed = true;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[ink:${fileName}] Compilation failed: ${message}`);
  }
}

if (failed) {
  process.exit(1);
}
