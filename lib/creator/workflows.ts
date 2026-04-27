import { z } from "zod";

export const CREATOR_WORKFLOW_IDS = [
  "startup_inspiration",
  "startup_brainstorm",
  "startup_random",
  "stuck_assist",
  "autocomplete",
] as const;

export type CreatorWorkflowId = (typeof CREATOR_WORKFLOW_IDS)[number];

export interface CreatorWorkflowDefinition {
  id: CreatorWorkflowId;
  version: number;
  description: string;
  branches: Record<string, string>;
}

export const creatorWorkflowSchema = z.object({
  id: z.enum(CREATOR_WORKFLOW_IDS),
  version: z.number().int().min(1),
  description: z.string().min(4),
  branches: z.record(z.string(), z.string()),
});

export const CREATOR_WORKFLOWS: CreatorWorkflowDefinition[] = [
  {
    id: "startup_inspiration",
    version: 1,
    description: "Generate an opening passage when the user is idle or requests help.",
    branches: {
      default: "compose_opening",
      with_context: "compose_opening_with_context",
    },
  },
  {
    id: "startup_brainstorm",
    version: 1,
    description: "Collaborative ideation flow for starting angle, thesis, and structure.",
    branches: {
      default: "ask_directional_questions",
    },
  },
  {
    id: "startup_random",
    version: 1,
    description: "Randomized prompt seeding flow.",
    branches: {
      default: "generate_unexpected_angle",
    },
  },
  {
    id: "stuck_assist",
    version: 1,
    description: "Unblock flow when user indicates writer's block.",
    branches: {
      default: "diagnose_blocker",
      rewrite: "rewrite_last_paragraph",
      outline: "propose_outline",
    },
  },
  {
    id: "autocomplete",
    version: 1,
    description: "Low-latency next-token/next-phrase suggestion flow.",
    branches: {
      default: "predict_next_fragment",
    },
  },
];

for (const workflow of CREATOR_WORKFLOWS) {
  creatorWorkflowSchema.parse(workflow);
}
