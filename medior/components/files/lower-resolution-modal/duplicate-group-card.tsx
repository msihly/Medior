import type { DuplicateGroup } from "medior/server/lower-resolution";
import { Button, Card, Comp, Divider, Icon, Text, View } from "medior/components";
import { useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";
import { Fmt } from "medior/utils/common";
import { GroupFile } from "./group-file";

export interface DuplicateGroupCardProps {
  group: DuplicateGroup;
}

/** A duplicate group's files and nearby files, with its collection and tag actions. */
export const DuplicateGroupCard = Comp(({ group }: DuplicateGroupCardProps) => {
  const stores = useStores();
  const store = stores.file.lowerResolution;

  const groupFileIds = [...group.files, ...group.nearby].map((file) => file.id);
  const isTimeGrouped = !!store.options.timeWindow;

  const handleCreateCollection = async () => {
    const res = await store.createGroupCollection(group.id);
    if (!res.success) toast.error(res.error);
  };

  const handleEditTags = () => store.editTags(groupFileIds);

  return (
    <View padding={{ all: "0.3rem" }}>
      <Card spacing="0.5rem">
        <View row align="center" justify="space-between" spacing="0.5rem">
          <Text bold>{`Up to ${group.score.toFixed(1)}% similar`}</Text>

          <View row align="center" spacing="0.5rem">
            <Text color={colors.custom.lightGrey} fontSize="0.85em">
              {`${group.files.length - 1} ${group.files.length === 2 ? "duplicate" : "duplicates"}`}
            </Text>

            <Button
              icon="Label"
              tooltip="Add Tags to Group"
              onClick={handleEditTags}
              disabled={store.isArchiving}
              color={colors.foregroundCard}
            />

            <Button
              icon="Collections"
              tooltip="Create Collection from Group"
              onClick={handleCreateCollection}
              disabled={store.isArchiving}
              color={colors.foregroundCard}
            />
          </View>
        </View>

        {store.keepOneGroupId === group.id && (
          <View row align="center" spacing="0.5rem">
            <Icon name="Error" size="1.1em" color={colors.custom.red} />

            <Text color={colors.custom.red} fontSize="0.85em">
              {"Keep at least one file from each group."}
            </Text>
          </View>
        )}

        <View row wrap="wrap">
          {group.files.map((file, index) => {
            const isSelected = !!store.selection[file.id];

            return (
              <GroupFile
                key={file.id}
                file={file}
                carouselFileIds={groupFileIds}
                chip={
                  isSelected
                    ? { bgColor: colors.custom.red, label: "Archive" }
                    : index === 0
                      ? { bgColor: colors.custom.green, label: "Best Quality" }
                      : file.isVariation
                        ? {
                            bgColor: colors.custom.orange,
                            label: `Variation · ${file.similarity.toFixed(1)}%`,
                          }
                        : { label: `${file.similarity.toFixed(1)}%` }
                }
                comparison={
                  index === 0
                    ? null
                    : file.difference !== null
                      ? `${file.difference.toFixed(1)}% of the image differs`
                      : file.isVariation
                        ? "Different shape"
                        : null
                }
                isSelected={isSelected}
                jpeg={file.jpeg}
                onClick={(event) => store.toggleSelected(file.id, event.shiftKey)}
                showDateCreated={isTimeGrouped}
              />
            );
          })}
        </View>

        {group.nearby.length > 0 && (
          <>
            <Divider />

            <View row align="center" justify="space-between" spacing="0.5rem">
              <Text bold fontSize="0.9em">
                {"Created Nearby"}
              </Text>

              <Text color={colors.custom.lightGrey} fontSize="0.85em">
                {group.nearbyCount > group.nearby.length
                  ? `First ${group.nearby.length} of ${Fmt.commas(group.nearbyCount)} files`
                  : `${group.nearby.length} ${group.nearby.length === 1 ? "file" : "files"}`}
              </Text>
            </View>

            <View row wrap="wrap">
              {group.nearby.map((file) => (
                <GroupFile
                  key={file.id}
                  file={file}
                  carouselFileIds={groupFileIds}
                  showDateCreated
                />
              ))}
            </View>
          </>
        )}
      </Card>
    </View>
  );
});
