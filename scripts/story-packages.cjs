/* eslint-env node */

const fs = require('node:fs');
const path = require('node:path');
const {Compiler} = require('inkjs/full');

const REQUIRED_METADATA_FIELDS = [
  'id',
  'schemaVersion',
  'contentVersion',
  'title',
  'description',
  'cover',
];
const STORY_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

class StoryPackageBuildError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = 'StoryPackageBuildError';
    this.code = code;
  }
}

function buildStoryPackages({storiesDir, generatedDir}) {
  const sourceRoot = path.resolve(storiesDir);
  const outputRoot = path.resolve(generatedDir);
  const packageDirectories = discoverStoryDirectories(sourceRoot);

  const descriptors = packageDirectories.map(packageDirectory =>
    readStoryPackage(packageDirectory, sourceRoot),
  );

  validateUniqueStoryIds(descriptors);

  const builtStories = descriptors.map(descriptor => ({
    ...descriptor,
    compiledStoryJson: compileInk(
      descriptor.storySource,
      `${descriptor.metadata.id}/story.ink`,
    ),
  }));

  writeGeneratedOutput(builtStories, outputRoot);

  return builtStories.map(story => ({
    metadata: story.metadata,
    compiledStory: JSON.parse(story.compiledStoryJson),
    assets: story.assets,
  }));
}

function discoverStoryDirectories(storiesDir) {
  if (!fs.existsSync(storiesDir) || !fs.statSync(storiesDir).isDirectory()) {
    throw new StoryPackageBuildError(
      'STORIES_DIRECTORY_NOT_FOUND',
      `Story source directory does not exist: ${storiesDir}`,
    );
  }

  const directories = fs
    .readdirSync(storiesDir, {withFileTypes: true})
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(storiesDir, entry.name))
    .sort((left, right) => left.localeCompare(right));

  if (directories.length === 0) {
    throw new StoryPackageBuildError(
      'NO_STORY_PACKAGES',
      `No story package directories found in ${storiesDir}`,
    );
  }

  return directories;
}

function readStoryPackage(packageDirectory, storiesDir) {
  const directoryName = path.basename(packageDirectory);
  const metadataPath = path.join(packageDirectory, 'meta.json');
  const storyPath = path.join(packageDirectory, 'story.ink');

  if (!fs.existsSync(metadataPath) || !fs.statSync(metadataPath).isFile()) {
    throw new StoryPackageBuildError(
      'STORY_METADATA_NOT_FOUND',
      `${directoryName}/meta.json is required.`,
    );
  }

  const metadata = parseMetadata(metadataPath, directoryName);
  validateMetadata(metadata, directoryName);

  if (!fs.existsSync(storyPath) || !fs.statSync(storyPath).isFile()) {
    throw new StoryPackageBuildError(
      'STORY_SOURCE_NOT_FOUND',
      `${directoryName}/story.ink is required.`,
    );
  }

  validateAssetPath(metadata.cover, packageDirectory, 'cover', directoryName);

  return {
    directoryName,
    metadata,
    storySource: fs.readFileSync(storyPath, 'utf8').replace(/^\uFEFF/, ''),
    assets: {
      cover: toPosixPath(
        path.join(path.basename(storiesDir), directoryName, metadata.cover),
      ),
    },
  };
}

function parseMetadata(metadataPath, directoryName) {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(metadataPath, 'utf8').replace(/^\uFEFF/, ''),
    );

    if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new Error('root value must be a JSON object');
    }

    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new StoryPackageBuildError(
      'INVALID_STORY_METADATA',
      `${directoryName}/meta.json: ${message}`,
    );
  }
}

function validateMetadata(metadata, directoryName) {
  for (const field of REQUIRED_METADATA_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(metadata, field)) {
      throw new StoryPackageBuildError(
        'INVALID_STORY_METADATA',
        `${directoryName}/meta.json is missing required field "${field}".`,
      );
    }
  }

  if (
    typeof metadata.id !== 'string' ||
    !STORY_ID_PATTERN.test(metadata.id)
  ) {
    throw new StoryPackageBuildError(
      'INVALID_STORY_METADATA',
      `${directoryName}/meta.json field "id" must use lowercase kebab-case.`,
    );
  }

  for (const field of ['title', 'description', 'cover']) {
    if (typeof metadata[field] !== 'string' || metadata[field].trim() === '') {
      throw new StoryPackageBuildError(
        'INVALID_STORY_METADATA',
        `${directoryName}/meta.json field "${field}" must be a non-empty string.`,
      );
    }
  }

  for (const field of ['schemaVersion', 'contentVersion']) {
    if (!Number.isInteger(metadata[field]) || metadata[field] <= 0) {
      throw new StoryPackageBuildError(
        'INVALID_STORY_METADATA',
        `${directoryName}/meta.json field "${field}" must be a positive integer.`,
      );
    }
  }

  if (!metadata.cover.startsWith('assets/')) {
    throw new StoryPackageBuildError(
      'INVALID_STORY_METADATA',
      `${directoryName}/meta.json field "cover" must point inside assets/.`,
    );
  }
}

function validateUniqueStoryIds(descriptors) {
  const seen = new Map();

  for (const descriptor of descriptors) {
    const previousDirectory = seen.get(descriptor.metadata.id);

    if (previousDirectory) {
      throw new StoryPackageBuildError(
        'DUPLICATE_STORY_ID',
        `Story id "${descriptor.metadata.id}" is used by both ${previousDirectory} and ${descriptor.directoryName}.`,
      );
    }

    seen.set(descriptor.metadata.id, descriptor.directoryName);
  }
}

function validateAssetPath(resourcePath, packageDirectory, fieldName, storyName) {
  if (resourcePath.includes('\\') || path.posix.isAbsolute(resourcePath)) {
    throw new StoryPackageBuildError(
      'INVALID_STORY_ASSET_PATH',
      `${storyName}/meta.json field "${fieldName}" must be a POSIX-style relative path.`,
    );
  }

  const normalized = path.posix.normalize(resourcePath);
  if (
    normalized !== resourcePath ||
    normalized === '..' ||
    normalized.startsWith('../')
  ) {
    throw new StoryPackageBuildError(
      'INVALID_STORY_ASSET_PATH',
      `${storyName}/meta.json field "${fieldName}" escapes or normalizes outside its declared path.`,
    );
  }

  const resolvedPath = path.resolve(
    packageDirectory,
    ...resourcePath.split('/'),
  );
  const relativePath = path.relative(packageDirectory, resolvedPath);

  if (
    relativePath === '' ||
    relativePath.startsWith('..') ||
    path.isAbsolute(relativePath)
  ) {
    throw new StoryPackageBuildError(
      'INVALID_STORY_ASSET_PATH',
      `${storyName}/meta.json field "${fieldName}" is not contained in the story package.`,
    );
  }

  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
    throw new StoryPackageBuildError(
      'STORY_ASSET_NOT_FOUND',
      `${storyName}/meta.json field "${fieldName}" points to missing file ${resourcePath}.`,
    );
  }
}

function compileInk(source, label) {
  const diagnostics = [];
  let story;

  try {
    const compiler = new Compiler(source, {
      errorHandler: (message, errorType) => {
        diagnostics.push(
          errorType === undefined ? message : `${errorType}: ${message}`,
        );
      },
    });
    story = compiler.Compile();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new StoryPackageBuildError(
      'INK_COMPILATION_FAILED',
      `${label}: ${message}`,
    );
  }

  if (diagnostics.length > 0) {
    throw new StoryPackageBuildError(
      'INK_COMPILATION_FAILED',
      `${label}: ${diagnostics.join(' | ')}`,
    );
  }

  if (!story) {
    throw new StoryPackageBuildError(
      'INK_COMPILATION_FAILED',
      `${label}: compiler returned no story.`,
    );
  }

  return story.ToJson();
}

function writeGeneratedOutput(stories, generatedDir) {
  fs.rmSync(generatedDir, {recursive: true, force: true});
  fs.mkdirSync(generatedDir, {recursive: true});

  for (const story of stories) {
    const outputDirectory = path.join(generatedDir, story.metadata.id);
    fs.mkdirSync(outputDirectory, {recursive: true});
    fs.writeFileSync(
      path.join(outputDirectory, 'story.json'),
      `${story.compiledStoryJson}\n`,
      'utf8',
    );
  }

  fs.writeFileSync(
    path.join(generatedDir, 'manifest.ts'),
    createManifestSource(stories),
    'utf8',
  );
}

function createManifestSource(stories) {
  const imports = stories
    .map(
      (story, index) =>
        `import story${index} from './${story.metadata.id}/story.json';`,
    )
    .join('\n');

  const entries = stories
    .map((story, index) => {
      const metadata = indentJson(story.metadata, 4);
      return `  {\n    metadata: ${metadata},\n    compiledStory: story${index} as InkStoryContent,\n    assets: {\n      cover: ${JSON.stringify(story.assets.cover)},\n    },\n  },`;
    })
    .join('\n');

  return `// Generated by scripts/compile-stories.cjs. Do not edit manually.\n\nimport type {InkStoryContent} from '../../narrative/InkStoryRuntime';\nimport type {StoryManifestEntry} from '../../narrative/StoryMetadata';\n${imports}\n\nexport const STORY_MANIFEST = [\n${entries}\n] satisfies readonly StoryManifestEntry[];\n`;
}

function indentJson(value, spaces) {
  const indentation = ' '.repeat(spaces);
  return JSON.stringify(value, null, 2).replace(/\n/g, `\n${indentation}`);
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

module.exports = {
  StoryPackageBuildError,
  buildStoryPackages,
};
