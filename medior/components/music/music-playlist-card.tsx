import { Comp, ContextMenu, MusicCard } from "medior/components";
import { MusicPlaylist, MusicPlaylistSearch, useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";
import { Fmt, getMusicCountLabel } from "medior/utils/common";

export interface MusicPlaylistCardProps {
  playlist: MusicPlaylist;
  /** The search the card selects in and loads covers through. */
  search: MusicPlaylistSearch;
}

export const MusicPlaylistCard = Comp(({ playlist, search }: MusicPlaylistCardProps) => {
  const stores = useStores();
  const store = stores.music;

  const handleDelete = () => store.setIdsForConfirmDelete([playlist.id]);

  const handleOpen = async () => {
    const res = await store.editor.open({ id: playlist.id, kind: "playlist" });
    if (!res.success) toast.error(res.error);
  };

  const handlePlay = async () => {
    const res = await store.play({ fileIds: [...playlist.fileIds] });
    if (!res.success) toast.error(res.error);
  };

  const handleSelect = async (event: React.MouseEvent) => {
    const res = await search.handleSelect({
      hasCtrl: event.ctrlKey,
      hasShift: event.shiftKey,
      id: playlist.id,
    });
    if (!res?.success) toast.error(res.error);
  };

  return (
    <ContextMenu
      id={playlist.id}
      menuItems={[
        { icon: "QueueMusic", label: "Open", onClick: handleOpen },
        { icon: "PlayArrow", label: "Play", onClick: handlePlay },
        { color: colors.custom.red, icon: "Delete", label: "Delete", onClick: handleDelete },
      ]}
    >
      <MusicCard
        name={playlist.name}
        details={playlist.duration > 0 ? Fmt.duration(playlist.duration) : "Empty"}
        cover={search.files.get(playlist.coverFileId)}
        chip={getMusicCountLabel(playlist.fileCount, "Track")}
        icon="QueueMusic"
        isSelected={search.getIsSelected(playlist.id)}
        rating={playlist.rating}
        onOpen={handleOpen}
        onSelect={handleSelect}
      />
    </ContextMenu>
  );
});
