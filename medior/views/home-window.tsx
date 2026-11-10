import { ipcRenderer } from "electron";
import { ReactNode, useEffect } from "react";
import {
  BackgroundActivityModal,
  Comp,
  Drawer,
  FileCollectionManager,
  ImportManager,
  LowerResolutionModal,
  MediaProgramManager,
  MinimizedJobs,
  ModalGroupContext,
  MusicManager,
  RepairModal,
  SettingsModal,
  TagManager,
  VideoTransformerModal,
  View,
  WindowTitleBar,
} from "medior/components";
import { HomeView, HomeViewRequest, useStores } from "medior/store";
import { colors, makeClasses, toast } from "medior/utils/client";
import { useSockets, Views } from "./common";

export const HomeWindow = Comp(() => {
  const stores = useStores();
  const store = stores.home;

  const { css } = useClasses(null);

  useSockets({ view: "home" });

  useEffect(() => {
    (async () => {
      try {
        await stores.file.shownSearch.loadFiltered({ noCache: true, page: 1 });
        await stores.import.manager.getImporterStatus();
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  // Views other windows ask for, such as a tag's search from a carousel, show here.
  useEffect(() => {
    const handleViewRequest = async (_, request: HomeViewRequest) => {
      const res = await store.openRequestedView(request);
      if (!res.success) toast.error(res.error);
    };

    ipcRenderer.on("openHomeView", handleViewRequest);

    return () => {
      ipcRenderer.removeListener("openHomeView", handleViewRequest);
    };
  }, []);

  // Each modal belongs to the view it opened over, hiding with its state while another is shown.
  return (
    <ModalGroupContext.Provider value={store.view}>
      <Views.ImportDnD>
        <View column className={css.root}>
          <WindowTitleBar title="Medior" />

          <View row flex={1} overflow="hidden" position="relative">
            <Drawer />

            <HomeTab view="files">
              <Views.Search />
            </HomeTab>

            {store.settings.isOpen && (
              <HomeTab view="settings">
                <SettingsModal />
              </HomeTab>
            )}

            {stores.import.manager.isOpen && (
              <HomeTab view="imports">
                <ImportManager />
              </HomeTab>
            )}

            {stores.tag.manager.isOpen && (
              <HomeTab view="tags">
                <TagManager />
              </HomeTab>
            )}

            {stores.collection.manager.isOpen && (
              <HomeTab view="collections">
                <FileCollectionManager />
              </HomeTab>
            )}

            {stores.mediaProgram.manager.isOpen && (
              <HomeTab view="mediaPrograms">
                <MediaProgramManager />
              </HomeTab>
            )}

            {stores.music.manager.isOpen && (
              <HomeTab view="music">
                <MusicManager />
              </HomeTab>
            )}

            {stores.file.videoTransformer.isOpen && (
              <HomeTab view="transformer">
                <VideoTransformerModal />
              </HomeTab>
            )}

            {stores.file.lowerResolution.isOpen && (
              <HomeTab view="duplicates">
                <LowerResolutionModal />
              </HomeTab>
            )}

            {store.isActivityOpen && (
              <HomeTab view="activity">
                <BackgroundActivityModal />
              </HomeTab>
            )}

            <Views.CollectionModals />

            <Views.FileModals />

            <Views.ImportModals />

            <Views.MediaProgramModals />

            <Views.MusicModals />

            <Views.TagModals view="home" />

            {/* A repair's progress shows over every view until it's minimized to the corner. */}
            {store.settings.repair.isOpen && (
              <ModalGroupContext.Provider value={undefined}>
                <RepairModal />
              </ModalGroupContext.Provider>
            )}

            <MinimizedJobs />
          </View>
        </View>
      </Views.ImportDnD>
    </ModalGroupContext.Provider>
  );
});

interface HomeTabProps {
  children: ReactNode;
  view: HomeView;
}

/** A view beside the drawer, kept with its state while another is shown. */
const HomeTab = Comp(({ children, view }: HomeTabProps) => {
  const stores = useStores();

  return (
    <View
      column
      display={stores.home.view === view ? undefined : "none"}
      flex={1}
      minHeight={0}
      minWidth={0}
      overflow="hidden"
      position="relative"
      bgColor={colors.background}
    >
      {children}
    </View>
  );
});

const useClasses = makeClasses({
  root: {
    height: "100vh",
    overflow: "hidden",
  },
});
