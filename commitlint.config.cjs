module.exports = {
  extends: ["@commitlint/config-conventional"],
  defaultIgnores: true,
  ignores: [
    (message) => message.startsWith("Merge "),
    (message) => message.startsWith("Revert "),
    (message) => /^chore\(release\):\s\d+\.\d+\.\d+/.test(message),
  ],
};
