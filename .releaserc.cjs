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
];

if (isGithubPublishingEnabled) {
  plugins.push("@semantic-release/github");
}

module.exports = {
  // Releases run only from `main`. Version bumps and CHANGELOG edits happen in CI only;
  // @semantic-release/github publishes the tag and GitHub Release via API (no `git push`
  // to main), which matches rules that require PRs and CodeQL on branch updates.
  branches: ["main"],
  tagFormat: "v${version}",
  plugins,
};
