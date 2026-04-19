const isGithubPublishingEnabled = process.env.SEMREL_SKIP_GITHUB !== "1";

const plugins = [
  [
    "@semantic-release/commit-analyzer",
    {
      preset: "conventionalcommits",
      parserOpts: {
        noteKeywords: ["BREAKING CHANGE", "BREAKING CHANGES", "BREAKING"],
      },
      releaseRules: [
        { type: "feat", release: "minor" },
        { type: "fix", release: "patch" },
        { type: "perf", release: "patch" },
        { type: "revert", release: "patch" },
        // Soft transition for pre-1.0.0 history while commit conventions are adopted.
        { message: "fix *", release: "patch" },
        { message: "fix:*", release: "patch" },
        { message: "fixed *", release: "patch" },
        { message: "fixed:*", release: "patch" },
        { message: "hotfix *", release: "patch" },
        { message: "hotfix:*", release: "patch" },
      ],
    },
  ],
  [
    "@semantic-release/release-notes-generator",
    {
      preset: "conventionalcommits",
      parserOpts: {
        noteKeywords: ["BREAKING CHANGE", "BREAKING CHANGES", "BREAKING"],
      },
    },
  ],
  [
    "@semantic-release/changelog",
    {
      changelogFile: "CHANGELOG.md",
    },
  ],
  [
    "@semantic-release/npm",
    {
      npmPublish: false,
    },
  ],
  [
    "@semantic-release/git",
    {
      assets: ["CHANGELOG.md", "package.json", "package-lock.json"],
      message: "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}",
    },
  ],
];

if (isGithubPublishingEnabled) {
  plugins.push("@semantic-release/github");
}

module.exports = {
  // Releases and version bumps run only from `main`. `develop` is integration only;
  // merging to `main` (via PR) triggers the release workflow and avoids direct pushes
  // that violate branch protection / CodeQL rules.
  branches: ["main"],
  tagFormat: "v${version}",
  plugins,
};
