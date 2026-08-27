/* eslint-env node */

const path = require('node:path');
const {StoryPackageBuildError, buildStoryPackages} = require('./story-packages.cjs');

const storiesDir = path.resolve(__dirname, '..', 'stories');
const generatedDir = path.resolve(__dirname, '..', 'src', 'stories', 'generated');

try {
  const stories = buildStoryPackages({storiesDir, generatedDir});
  console.log(
    `[stories] Validated and compiled ${stories.length} story package${
      stories.length === 1 ? '' : 's'
    }.`,
  );
} catch (error) {
  if (error instanceof StoryPackageBuildError) {
    console.error(`[stories] ${error.message}`);
  } else {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(`[stories] UNEXPECTED_BUILD_ERROR: ${message}`);
  }

  process.exit(1);
}
