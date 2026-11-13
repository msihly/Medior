import { Comp, FileBase, MusicCard } from "medior/components";
import { File, MusicTrackSearch, useStores } from "medior/store";
import { toast } from "medior/utils/client";
import { Fmt, getMusicTrackTitle } from "medior/utils/common";

export interface MusicTrackCardProps {
  file: File;
  /** The search the card selects in, whose tracks play in order from the card's. */
  search: MusicTrackSearch;
}

/** A library track, which plays from itself through the rest the filters match once opened. */
export const MusicTrackCard = Comp(({ file, search }: MusicTrackCardProps) => {
  const stores = useStores();

  const handlePlay = async () => {
    const ids = await search.listTrackIds();
    if (!ids.success) toast.error(ids.error);
    else {
      const res = await stores.music.play({ fileId: file.id, fileIds: ids.data });
      if (!res.success) toast.error(res.error);
    }
  };

  const handleSelect = async (event: React.MouseEvent) => {
    const res = await search.handleSelect({
      hasCtrl: event.ctrlKey,
      hasShift: event.shiftKey,
      id: file.id,
    });
    if (!res?.success) toast.error(res.error);
  };

  return (
    <FileBase.ContextMenu file={file} store={search} carouselFileIds={search.carouselFileIds}>
      <MusicCard
        name={getMusicTrackTitle(file)}
        details={file.music?.artist}
        cover={file}
        chip={Fmt.duration(file.duration)}
        icon="MusicNote"
        isSelected={search.getIsSelected(file.id)}
        rating={file.rating}
        onOpen={handlePlay}
        onSelect={handleSelect}
      />
    </FileBase.ContextMenu>
  );
});
