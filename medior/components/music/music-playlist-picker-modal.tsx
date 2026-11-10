import { useEffect, useState } from "react";
import { MusicPlaylistSchema } from "medior/_generated/server";
import {
  Button,
  Card,
  CenteredText,
  Chip,
  Comp,
  Input,
  ListItem,
  LoadingOverlay,
  Modal,
  Text,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, toast, useCancellableLoad } from "medior/utils/client";
import { getMusicCountLabel } from "medior/utils/common";
import { rpc } from "medior/utils/server";

/** Adds files to a playlist chosen from the others, or to a new one named here. */
export const MusicPlaylistPickerModal = Comp(() => {
  const stores = useStores();
  const store = stores.music;

  const load = useCancellableLoad();

  const [filter, setFilter] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState("");
  const [playlists, setPlaylists] = useState<MusicPlaylistSchema[]>([]);

  const fileIds = [...store.playlistPickerFileIds];
  const filterText = filter.trim().toLowerCase();
  const shownPlaylists = playlists.filter((playlist) =>
    playlist.name.toLowerCase().includes(filterText),
  );

  useEffect(() => {
    load.run(async (signal) => {
      const res = await rpc.listMusicPlaylist({ args: { sort: { name: "asc" } } }, { signal });

      signal.throwIfAborted();

      if (!res.success) throw new Error(res.error);

      setPlaylists(res.data.items);
    });
  }, []);

  const handleAdd = async (id: string) => {
    setIsSaving(true);

    const res = await store.addFilesToPlaylist({ fileIds, id });

    setIsSaving(false);

    if (!res.success) toast.error(res.error);
    else handleClose();
  };

  const handleClose = () => store.setPlaylistPickerFileIds([]);

  const handleCreate = async () => {
    setIsSaving(true);

    const res = await store.createPlaylist({ fileIds, name });

    setIsSaving(false);

    if (!res.success) toast.error(res.error);
    else handleClose();
  };

  return (
    <Modal.Container isLoading={isSaving} onClose={handleClose} width="28rem" height="36rem">
      <Modal.Header>
        <Text preset="title">{"Add to Playlist"}</Text>
      </Modal.Header>

      <Modal.Content spacing="0.5rem" overflow="hidden">
        <View row align="flex-end" spacing="0.5rem">
          <Input header="New Playlist" value={name} setValue={setName} flex={1} />

          <Button
            text="Create"
            icon="Add"
            onClick={handleCreate}
            disabled={!name.trim()}
            color={colors.custom.blue}
          />
        </View>

        <Input header="Find Playlist" value={filter} setValue={setFilter} />

        <Card flex={1} position="relative" padding={{ all: 0 }} overflow="hidden auto">
          <LoadingOverlay isLoading={load.isLoading} />

          {shownPlaylists.length ? (
            shownPlaylists.map((playlist) => (
              <ListItem
                key={playlist.id}
                icon="QueueMusic"
                onClick={() => handleAdd(playlist.id)}
                text={
                  <View row align="center" justify="space-between" spacing="0.5rem">
                    <Text>{playlist.name}</Text>

                    <Chip size="small" label={getMusicCountLabel(playlist.fileCount, "Track")} />
                  </View>
                }
              />
            ))
          ) : (
            <CenteredText text="No playlists" />
          )}
        </Card>
      </Modal.Content>

      <Modal.Footer>
        <Button text="Cancel" icon="Close" onClick={handleClose} />
      </Modal.Footer>
    </Modal.Container>
  );
});
