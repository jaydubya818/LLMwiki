import { describe, it, expect } from "vitest";
import path from "node:path";
import { brainPaths } from "../paths.js";

describe("brainPaths", () => {
  it("resolves all paths relative to the given root", () => {
    const root = "/home/user/my-brain";
    const p = brainPaths(root);

    expect(p.root).toBe(root);
    expect(p.wiki).toBe(path.join(root, "wiki"));
    expect(p.raw).toBe(path.join(root, "raw"));
    expect(p.brain).toBe(path.join(root, ".brain"));
    expect(p.stateJson).toBe(path.join(root, ".brain", "state.json"));
    expect(p.graphJson).toBe(path.join(root, ".brain", "graph.json"));
    expect(p.searchIndexJson).toBe(path.join(root, ".brain", "search-index.json"));
    expect(p.humanOverridesJson).toBe(path.join(root, ".brain", "human-overrides.json"));
    expect(p.canonAdmissionJson).toBe(path.join(root, ".brain", "canon-admission.json"));
    expect(p.executiveTrustSummaryJson).toBe(path.join(root, ".brain", "executive-trust-summary.json"));
  });

  it("resolves relative root paths to absolute paths", () => {
    const p = brainPaths("./my-brain");
    expect(path.isAbsolute(p.root)).toBe(true);
    expect(p.wiki.startsWith(p.root)).toBe(true);
  });

  it("all .brain/ JSON paths are under the brain directory", () => {
    const root = "/test/root";
    const p = brainPaths(root);
    const brainDir = p.brain;
    const jsonPaths = [
      p.stateJson, p.fileHashesJson, p.ingestCacheJson, p.graphJson, p.searchIndexJson,
      p.reviewStateJson, p.lastDoctorJson, p.canonAdmissionJson, p.canonCouncilJson,
      p.humanOverridesJson, p.governanceSettingsJson, p.governanceActionLogJson,
      p.executiveTrustSummaryJson, p.canonFragilityJson, p.reviewDebtJson,
    ];
    for (const jp of jsonPaths) {
      expect(jp.startsWith(brainDir + path.sep) || jp === brainDir,
        `Expected ${jp} to be under ${brainDir}`
      ).toBe(true);
    }
  });

  it("reviewsDir is under outputs/", () => {
    const root = "/test/root";
    const p = brainPaths(root);
    expect(p.reviewsDir).toBe(path.join(root, "outputs", "reviews"));
  });
});
