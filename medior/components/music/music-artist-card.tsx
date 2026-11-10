import { Comp, ContextMenu, MusicCard } from "medior/components";
import { MusicArtist, MusicArtistSearch, useStores } from "medior/store";
import { toast } from "medior/utils/client";
import { getMusicCountLabel } from "medior/utils/common";

export interface MusicArtistCardProps {
  artist: MusicArtist;
  /** The search the card selects in and loads covers through. */
  search: MusicArtistSearch;
}

export const MusicArtistCard = Comp(({ artist, search }: MusicArtistCardProps) => {
  const stores = useStores();
  const store = stores.music;

  const handleOpen = async () => {
    const res = await store.editor.open({ id: artist.id, kind: "artist" });
    if (!res.success) toast.error(res.error);
  };

  const handlePlay = async () => {
    const res = await store.play({ fileIds: [...artist.fileIds] });
    if (!res.success) toast.error(res.error);
  };

  const handleSelect = async (event: React.MouseEvent) => {
    const res = await search.handleSelect({
      hasCtrl: event.ctrlKey,
      hasShift: event.shiftKey,
      id: artist.id,
    });

    if (!res?.success) toast.error(res.error);
  };

  return (
    <ContextMenu
      id={artist.id}
      menuItems={[
        { icon: "Person", label: "Open", onClick: handleOpen },
        { icon: "PlayArrow", label: "Play", onClick: handlePlay },
      ]}
    >
      <MusicCard
        name={artist.name}
        details={getMusicCountLabel(artist.fileCount, "Track")}
        cover={search.files.get(artist.coverFileId)}
        chip={getMusicCountLabel(artist.fileCount, "Track")}
        icon="Person"
        isSelected={search.getIsSelected(artist.id)}
        rating={artist.rating}
        onOpen={handleOpen}
        onSelect={handleSelect}
      />
    </ContextMenu>
  );
});
