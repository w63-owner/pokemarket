import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const patterns = [
  /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/,
  /\bwhsec_[A-Za-z0-9]{16,}\b/,
  /\bsk-proj-[A-Za-z0-9_-]{20,}\b/,
  /\bsntrys_[A-Za-z0-9]{20,}\b/,
];

const stagedOnly = process.argv.includes("--staged");
const findings = stagedOnly ? scanStagedDiff() : scanTrackedFiles();

if (findings.length > 0) {
  console.error("Potential secret detected. Rotate it before committing:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

function scanStagedDiff() {
  const diff = git([
    "diff",
    "--cached",
    "--unified=0",
    "--no-color",
    "--diff-filter=ACMR",
  ]);
  const findings = [];
  let currentPath = "staged changes";

  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ b/")) {
      currentPath = line.slice("+++ b/".length);
      continue;
    }
    if (!line.startsWith("+") || line.startsWith("+++")) continue;
    if (containsSecret(line.slice(1))) findings.push(currentPath);
  }

  return [...new Set(findings)];
}

function scanTrackedFiles() {
  const findings = [];
  const files = git(["ls-files", "-z"]).split("\0").filter(Boolean);

  for (const file of files) {
    const contents = readFileSync(file);
    if (contents.includes(0)) continue;
    if (containsSecret(contents.toString("utf8"))) findings.push(file);
  }

  return findings;
}

function containsSecret(value) {
  return patterns.some((pattern) => pattern.test(value));
}

function git(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  }
  return result.stdout;
}
