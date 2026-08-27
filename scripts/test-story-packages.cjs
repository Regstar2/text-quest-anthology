/* eslint-env node */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {Story} = require('inkjs');
const {
  StoryPackageBuildError,
  buildStoryPackages,
} = require('./story-packages.cjs');

const VALID_INK = `Начало.\n\n* [Завершить]\n    Финал. # ending:done\n    -> END\n`;
const DEFAULT_METADATA = {
  id: 'fixture-one',
  schemaVersion: 1,
  contentVersion: 1,
  title: 'Fixture',
  description: 'Technical story package fixture.',
  cover: 'assets/cover.webp',
};

runScenario('two packages compile and enter the generated manifest', sandbox => {
  writeStoryPackage(sandbox.storiesDir, 'fixture-one');
  writeStoryPackage(sandbox.storiesDir, 'fixture-two', {
    metadata: {
      ...DEFAULT_METADATA,
      id: 'fixture-two',
      title: 'Fixture Two',
    },
  });

  const stories = buildStoryPackages(sandbox);
  assert.deepEqual(
    stories.map(story => story.metadata.id),
    ['fixture-one', 'fixture-two'],
  );

  const manifest = fs.readFileSync(
    path.join(sandbox.generatedDir, 'manifest.ts'),
    'utf8',
  );
  assert.match(manifest, /fixture-one/);
  assert.match(manifest, /fixture-two/);

  for (const storyPackage of stories) {
    const story = new Story(storyPackage.compiledStory);
    while (story.canContinue) {
      story.Continue();
    }
    assert.equal(story.currentChoices.length, 1);
    story.ChooseChoiceIndex(story.currentChoices[0].index);
    while (story.canContinue) {
      story.Continue();
    }
    assert.equal(story.canContinue, false);
    assert.equal(story.currentChoices.length, 0);
  }
});

expectBuildFailure('missing required metadata field', 'INVALID_STORY_METADATA', sandbox => {
  const metadata = {...DEFAULT_METADATA};
  delete metadata.title;
  writeStoryPackage(sandbox.storiesDir, 'fixture-one', {metadata});
});

expectBuildFailure('invalid content version', 'INVALID_STORY_METADATA', sandbox => {
  writeStoryPackage(sandbox.storiesDir, 'fixture-one', {
    metadata: {...DEFAULT_METADATA, contentVersion: 0},
  });
});

expectBuildFailure('invalid story id', 'INVALID_STORY_METADATA', sandbox => {
  writeStoryPackage(sandbox.storiesDir, 'fixture-one', {
    metadata: {...DEFAULT_METADATA, id: 'Bad ID'},
  });
});

expectBuildFailure('missing asset', 'STORY_ASSET_NOT_FOUND', sandbox => {
  writeStoryPackage(sandbox.storiesDir, 'fixture-one', {writeCover: false});
});

expectBuildFailure('escaping asset path', 'INVALID_STORY_ASSET_PATH', sandbox => {
  writeStoryPackage(sandbox.storiesDir, 'fixture-one', {
    metadata: {...DEFAULT_METADATA, cover: 'assets/../cover.webp'},
  });
});

expectBuildFailure('duplicate story id', 'DUPLICATE_STORY_ID', sandbox => {
  writeStoryPackage(sandbox.storiesDir, 'fixture-a', {
    metadata: {...DEFAULT_METADATA, id: 'duplicate'},
  });
  writeStoryPackage(sandbox.storiesDir, 'fixture-b', {
    metadata: {...DEFAULT_METADATA, id: 'duplicate'},
  });
});

expectBuildFailure('missing story source', 'STORY_SOURCE_NOT_FOUND', sandbox => {
  writeStoryPackage(sandbox.storiesDir, 'fixture-one', {writeStory: false});
});

expectBuildFailure('broken Ink source', 'INK_COMPILATION_FAILED', sandbox => {
  writeStoryPackage(sandbox.storiesDir, 'fixture-one', {
    storySource: '-> missing_target\n',
  });
});

console.log('[stories:test] Story package validation scenarios passed.');

function expectBuildFailure(name, expectedCode, setup) {
  runScenario(name, sandbox => {
    setup(sandbox);

    assert.throws(
      () => buildStoryPackages(sandbox),
      error =>
        error instanceof StoryPackageBuildError && error.code === expectedCode,
    );
  });
}

function runScenario(name, scenario) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'text-quest-stories-'));
  const sandbox = {
    storiesDir: path.join(root, 'stories'),
    generatedDir: path.join(root, 'generated'),
  };
  fs.mkdirSync(sandbox.storiesDir, {recursive: true});

  try {
    scenario(sandbox);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Story package test failed (${name}): ${message}`);
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
}

function writeStoryPackage(
  storiesDir,
  directoryName,
  {
    metadata = {...DEFAULT_METADATA, id: directoryName},
    storySource = VALID_INK,
    writeCover = true,
    writeStory = true,
  } = {},
) {
  const packageDir = path.join(storiesDir, directoryName);
  const assetsDir = path.join(packageDir, 'assets');
  fs.mkdirSync(assetsDir, {recursive: true});
  fs.writeFileSync(
    path.join(packageDir, 'meta.json'),
    `${JSON.stringify(metadata, null, 2)}\n`,
    'utf8',
  );

  if (writeStory) {
    fs.writeFileSync(path.join(packageDir, 'story.ink'), storySource, 'utf8');
  }

  if (writeCover) {
    fs.writeFileSync(path.join(assetsDir, 'cover.webp'), 'fixture', 'utf8');
  }
}
