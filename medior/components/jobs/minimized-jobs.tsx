import type { JobState, JobType } from "medior/server/database";
import { Card, Comp, JobProgress, RepairProgress, View } from "medior/components";
import { useStores } from "medior/store";
import { makeClasses } from "medior/utils/client";

/**
 * Operations running in the background, stacked in the corner while their modals are hidden.
 * Operations started in another window, or before a reload, can only be stopped from here.
 */
export const MinimizedJobs = Comp(() => {
  const stores = useStores();
  const file = stores.file;
  const lowerResolution = file.lowerResolution;
  const repair = stores.home.settings.repair;
  const tagManager = stores.tag.manager;

  const { css } = useClasses(null);

  const fileActionView = {
    isShown: !file.isActionMinimized,
    jobId: file.actionJobId,
    restore: () => file.setIsActionMinimized(false),
  };
  const tagManagerView = {
    isShown: tagManager.isOpen && !tagManager.isMinimized,
    jobId: tagManager.jobId,
    restore: () => tagManager.setIsMinimized(false),
  };
  const views: Record<JobType, { isShown: boolean; jobId: string; restore: () => void }> = {
    deleteFiles: fileActionView,
    deleteTags: tagManagerView,
    mergeDuplicates: {
      isShown: lowerResolution.isOpen && !lowerResolution.isMinimized,
      jobId: lowerResolution.archiveJobId,
      restore: () => lowerResolution.open(),
    },
    refreshFiles: {
      isShown: file.isRefreshOpen && !file.isRefreshMinimized,
      jobId: file.refreshJobId,
      restore: () => {
        file.setIsRefreshMinimized(false);
        file.setIsRefreshOpen(true);
      },
    },
    regenerateTagRegEx: tagManagerView,
    unarchiveFiles: fileActionView,
  };

  const getRestore = (job: JobState) =>
    views[job.type].jobId === job.id ? views[job.type].restore : undefined;

  const jobs = stores.home.jobs.filter(
    (job) => views[job.type].jobId !== job.id || !views[job.type].isShown,
  );
  // A finished repair stays here until restored, so its log can still be read.
  const isRepairShown = repair.isOpen && repair.isMinimized;

  if (!jobs.length && !isRepairShown) return null;

  return (
    <View column position="fixed" className={css.root} spacing="0.5rem" width="24rem">
      {isRepairShown && (
        <Card width="100%">
          <RepairProgress />
        </Card>
      )}

      {jobs.map((job) => (
        <Card key={job.id} width="100%">
          <JobProgress job={job} onRestore={getRestore(job)} />
        </Card>
      ))}
    </View>
  );
});

const useClasses = makeClasses({
  root: {
    bottom: "1rem",
    right: "1rem",
    zIndex: 1400,
  },
});
