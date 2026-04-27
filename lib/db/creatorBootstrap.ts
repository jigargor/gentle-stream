import type { ArticleSubmission, CreatorDraftSummary } from "@/lib/types";
import { listCreatorSubmissionSummaries } from "@/lib/db/creator";
import { listCreatorDraftSummaries } from "@/lib/db/creatorDrafts";
import { getCreatorSettings } from "@/lib/db/creatorStudio";
import { withDbTiming } from "@/lib/db/timing";

export interface CreatorEditorBootstrap {
  submissions: ArticleSubmission[];
  submissionsNextCursor: string | null;
  draftSummaries: CreatorDraftSummary[];
  draftsNextCursor: string | null;
  autocompleteEnabled: boolean;
  creatorSchemaAvailable: boolean;
}

/**
 * Minimal server payload for `/creator` first paint: submission + draft list projections and one settings flag.
 * Draft bodies and versions are loaded lazily on the client.
 */
export async function getCreatorEditorBootstrap(userId: string): Promise<CreatorEditorBootstrap> {
  const settingsResult = await withDbTiming("creator.bootstrap.settings", () => getCreatorSettings(userId));

  const [subResult, draftResult] = await Promise.all([
    withDbTiming("creator.bootstrap.submissions", () =>
      listCreatorSubmissionSummaries({
        authorUserId: userId,
        limit: 12,
        cursorCreatedAt: null,
      })
    ),
    settingsResult.schemaAvailable
      ? withDbTiming("creator.bootstrap.draft_summaries", () =>
          listCreatorDraftSummaries({
            userId,
            limit: 8,
            cursorUpdatedAt: null,
          })
        )
      : Promise.resolve({ summaries: [] as CreatorDraftSummary[], nextCursor: null as string | null }),
  ]);

  return {
    submissions: subResult.submissions,
    submissionsNextCursor: subResult.nextCursor,
    draftSummaries: draftResult.summaries,
    draftsNextCursor: draftResult.nextCursor,
    autocompleteEnabled: settingsResult.settings.autocompleteEnabled,
    creatorSchemaAvailable: settingsResult.schemaAvailable,
  };
}
