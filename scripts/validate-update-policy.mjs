import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { isSemanticVersion, compareSemanticVersions } from "../src/shared/data/semverCore.mjs";

const [requestedVersion, policyPathArg = "release/update-policy.json"] = process.argv.slice(2);
const packageJson = JSON.parse(await readFile(resolve("package.json"), "utf8"));
const versionArg = requestedVersion ?? packageJson.version;

const locales = ["az", "tr", "en", "ru", "es"];
const policy = JSON.parse(await readFile(resolve(policyPathArg), "utf8"));

if (policy.schemaVersion !== 1) throw new Error("Update policy schemaVersion must be 1");
if (policy.version !== versionArg) throw new Error(`Update policy version ${policy.version} does not match ${versionArg}`);
if (!isSemanticVersion(policy.version) || policy.version.startsWith("v")) throw new Error("Update policy version is not valid SemVer");
if (!isSemanticVersion(policy.minimumSupportedVersion) || policy.minimumSupportedVersion.startsWith("v")) throw new Error("minimumSupportedVersion is not valid SemVer");
if (!new Set(["optional", "critical"]).has(policy.severity)) throw new Error("Update severity must be optional or critical");
if (compareSemanticVersions(policy.minimumSupportedVersion, policy.version) > 0) {
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
