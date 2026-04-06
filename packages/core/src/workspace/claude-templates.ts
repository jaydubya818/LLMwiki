import type { BrainTemplateId } from "./types.js";
import { PRODUCTION_CLAUDE_MD } from "../scaffold-templates.js";

const CODING = `# Second Brain — Coding agent

Specialized brain for implementation work.

## Focus
- Repos, architecture, prompts, tools, coding workflows, bugs, plans, technical decisions, APIs, system design

## Rules
- Optimize for **narrow task performance** and clean technical synthesis.
- Prefer small, linkable wiki pages: decisions, ADRs, bug postmortems, prompt snippets.
- Tag durable insights worth promotion with frontmatter: \`promotion_candidate: true\` and \`promotion_rationale: "..."\`.
- Do **not** assume this content syncs to master automatically.

## Outputs
- Technical briefs, comparisons, implementation plans → \`outputs/\`.
`;

const STRATEGY = `# Second Brain — Strategy agent

## Focus
- Product strategy, market framing, PRDs, roadmaps, prioritization, stakeholders, business hypotheses

## Rules
- Keep decisions explicit: options, tradeoffs, recommendation.
- Mark \`promotion_candidate: true\` only for insights that should inform **personal** master strategy.
`;

const RESEARCH = `# Second Brain — Research agent

## Focus
- Papers, concepts, experiments, comparisons, hypotheses, learning maps

## Rules
- Cite sources in every synthesis. Prefer concepts/ and research/ wiki folders.
- Promotion candidates: cross-cutting frameworks that change how the master brain should think.
`;

const LEADERSHIP = `# Second Brain — Leadership agent

## Focus
- People, meetings, team health, coaching, decisions, status, communication, projects

## Rules
- Respectful, factual people notes. Decision pages with context and follow-ups.
- Mark promotion_candidate when a decision or pattern should live in **master** long-term.
`;

const MAP: Record<BrainTemplateId, string> = {
  master: PRODUCTION_CLAUDE_MD,
  "coding-agent": CODING,
  "strategy-agent": STRATEGY,
  "research-agent": RESEARCH,
  "leadership-agent": LEADERSHIP,
};

export function getClaudeTemplate(id: BrainTemplateId): string {
  return MAP[id];
}
