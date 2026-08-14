import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const [requestedVersion, policyPathArg = "release/update-policy.json"] = process.argv.slice(2);
const packageJson = JSON.parse(await readFile(resolve("package.json"), "utf8"));
const versionArg = requestedVersion ?? packageJson.version;

const semanticVersionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const locales = ["az", "tr", "en", "ru", "es"];
const policy = JSON.parse(await readFile(resolve(policyPathArg), "utf8"));

function versionParts(version) {
  return version.split(/[+-]/, 1)[0].split(".").map(Number);
}

function compareVersions(left, right) {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = leftParts[index] - rightParts[index];
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

if (policy.schemaVersion !== 1) throw new Error("Update policy schemaVersion must be 1");
if (policy.version !== versionArg) throw new Error(`Update policy version ${policy.version} does not match ${versionArg}`);
if (!semanticVersionPattern.test(policy.version)) throw new Error("Update policy version is not valid SemVer");
if (!semanticVersionPattern.test(policy.minimumSupportedVersion)) throw new Error("minimumSupportedVersion is not valid SemVer");
if (!new Set(["optional", "critical"]).has(policy.severity)) throw new Error("Update severity must be optional or critical");
if (compareVersions(policy.minimumSupportedVersion, policy.version) > 0) {
  throw new Error("minimumSupportedVersion cannot be greater than the release version");
}
if (policy.severity === "critical" && policy.minimumSupportedVersion !== policy.version) {
  throw new Error("A critical release must set minimumSupportedVersion to its own version");
}
for (const locale of locales) {
  if (typeof policy.notes?.[locale] !== "string" || policy.notes[locale].trim().length === 0) {
    throw new Error(`Update policy is missing release notes for ${locale}`);
  }
}

console.log(`Validated ${policy.severity} update policy for ${policy.version}`);
