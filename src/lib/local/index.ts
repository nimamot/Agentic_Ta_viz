/**
 * Local file-based data layer — no database required.
 *
 * Copy this folder (`src/lib/local/`) plus `src/lib/dataSource.ts` into another
 * project to reuse the same file conventions.
 */

export { getLocalDataRoot, projectDir, reviewDir } from "./config";
export { fetchLocalResearchProjects } from "./loadResearchProjects";
export {
  fetchAllPendingLocalCodebookReviews,
  fetchPendingLocalCodebookReviewById,
  type PendingLocalReviewListItem,
} from "./loadCodebookReviews";
export { submitLocalCodebookReview } from "./submitCodebookReview";
export type { LocalManifest, LocalProjectMeta, LocalReviewMeta } from "./types";
