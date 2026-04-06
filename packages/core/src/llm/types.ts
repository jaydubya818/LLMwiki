export interface IngestLlmPlan {
  summary: string;
  entities: Array<{ name: string; type: string; notes?: string }>;
  primaryDomain:
    | "topics"
    | "projects"
    | "people"
    | "decisions"
    | "concepts"
    | "systems"
    | "research"
    | "health"
    | "goals"
    | "writing"
    | "life"
    | "work";
  suggestedPages: Array<{
    domain: IngestLlmPlan["primaryDomain"];
    slug: string;
    title: string;
    executiveSummary: string;
    relatedLinks: string[];
    keyPoints: string[];
  }>;
  indexLines: string[];
  dashboardBullets: string[];
}

export interface LlmClient {
  completeJson<T>(system: string, user: string): Promise<T>;
  completeText(system: string, user: string): Promise<string>;
}
