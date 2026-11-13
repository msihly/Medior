import { Comp, ContextMenu, MusicCard } from "medior/components";
import { MusicAlbum, MusicAlbumSearch, useStores } from "medior/store";
import { toast } from "medior/utils/client";
import { getMusicCountLabel } from "medior/utils/common";

export interface MusicAlbumCardProps {
  album: MusicAlbum;
  /** The search the card selects in and loads covers through. */
  search: MusicAlbumSearch;
}

export const MusicAlbumCard = Comp(({ album, search }: MusicAlbumCardProps) => {
  const stores = useStores();
  const store = stores.music;

  const handleOpen = async () => {
    const res = await store.editor.open({ id: album.id, kind: "album" });
    if (!res.success) toast.error(res.error);
  };

  const handleOpenArtist = async () => {
    const res = await store.editor.open({ id: album.artistId, kind: "artist" });
    if (!res.success) toast.error(res.error);
  };

  const handlePlay = async () => {
    const res = await store.play({ fileIds: [...album.fileIds] });
    if (!res.success) toast.error(res.error);
  };

  const handleSelect = async (event: React.MouseEvent) => {
    const res = await search.handleSelect({
      hasCtrl: event.ctrlKey,
      hasShift: event.shiftKey,
      id: album.id,
    });
    if (!res?.success) toast.error(res.error);
  };

  return (
    <ContextMenu
      id={album.id}
      menuItems={[
        { icon: "Album", label: "Open", onClick: handleOpen },
        { icon: "PlayArrow", label: "Play", onClick: handlePlay },
        { icon: "Person", label: "Open Artist", onClick: handleOpenArtist },
      ]}
    >
      <MusicCard
        name={album.name}
        details={[album.year, album.artistName].filter(Boolean).join(" · ")}
        cover={search.files.get(album.coverFileId)}
        chip={getMusicCountLabel(album.fileCount, "Track")}
        icon="Album"
        isSelected={search.getIsSelected(album.id)}
        rating={album.rating}
        onOpen={handleOpen}
        onSelect={handleSelect}
      />
    </ContextMenu>
  );
});
