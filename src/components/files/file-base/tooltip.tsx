import { Icon, Tag, Text, Tooltip as TooltipBase, View } from "components";
import { observer } from "mobx-react-lite";
import { File } from "store";
import { colors, dayjs, formatBytes, makeClasses } from "utils";

interface TooltipProps {
  disabled?: boolean;
  file: File;
  onTagPress: (id: string) => any;
}

export const Tooltip = observer(({ disabled, file, onTagPress }: TooltipProps) => {
  const { css } = useClasses(null);

  return (
    <TooltipBase
      title={
        <View column>
          <View row className={css.header}>
            <View column margins={{ right: "1rem" }}>
              <Text>{`${file.width}x${file.height}`}</Text>
              <Text>{formatBytes(file.size)}</Text>
            </View>

            <View column margins={{ left: "1rem" }}>
              <Text textAlign="right">{`Modified ${dayjs(file.dateModified).fromNow()}`}</Text>
              <Text textAlign="right">{`Created ${dayjs(file.dateCreated).fromNow()}`}</Text>
            </View>
          </View>

          {file.tags?.length > 0 && (
            <View row margins={{ top: "0.3rem", bottom: "0.2rem" }} style={{ flexWrap: "wrap" }}>
              {file.tags.map((tag) => (
                <Tag
                  key={tag.id}
                  tag={tag}
                  onClick={!disabled ? () => onTagPress(tag.id) : undefined}
                  size="small"
                  style={{ margin: "0 0.5em 0.5em 0" }}
                />
              ))}
            </View>
          )}
        </View>
      }
    >
      <Icon
        name="InfoOutlined"
        color={colors.grey["600"]}
        size="1em"
        margins={{ left: "0.3rem" }}
      />
    </TooltipBase>
  );
});

const useClasses = makeClasses({
  header: {
    justifyContent: "space-between",
    padding: "0.3rem",
    fontSize: "1.1em",
  },
});
