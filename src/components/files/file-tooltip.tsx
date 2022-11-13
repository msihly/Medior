import { Tooltip, colors } from "@mui/material";
import { Icon, Tag, Text, View } from "components";
import { observer } from "mobx-react-lite";
import { File } from "store";
import { dayjs, formatBytes, makeClasses } from "utils";

interface FileTooltipProps {
  file: File;
  onTagPress: (id: string) => any;
}

export const FileTooltip = observer(({ file, onTagPress }: FileTooltipProps) => {
  const { css } = useClasses(null);

  return (
    <Tooltip
      classes={{ tooltip: css.tooltip }}
      title={
        <View column>
          <View row className={css.header}>
            <View column margins={{ right: "1rem " }}>
              <Text>{`${file.width}x${file.height}`}</Text>
              <Text>{formatBytes(file.size)}</Text>
            </View>

            <View column margins={{ left: "1rem " }}>
              <Text textAlign="right">{`Modified ${dayjs(file.dateModified).fromNow()}`}</Text>
              <Text textAlign="right">{`Created ${dayjs(file.dateCreated).fromNow()}`}</Text>
            </View>
          </View>

          {file.tags?.length > 0 && (
            <View row margins={{ top: "0.3rem", bottom: "0.2rem" }}>
              {file.tags.map((tag) => (
                <Tag key={tag.id} tag={tag} onClick={() => onTagPress(tag.id)} size="small" />
              ))}
            </View>
          )}
        </View>
      }
    >
      <View>
        <Icon
          name="InfoOutlined"
          color={colors.grey["600"]}
          size="1em"
          margins={{ left: "0.3rem" }}
        />
      </View>
    </Tooltip>
  );
});

const useClasses = makeClasses({
  header: {
    fontSize: "1.1em",
  },
  tooltip: {
    backgroundColor: colors.grey["900"],
    boxShadow: "rgb(0 0 0 / 50%) 1px 2px 4px 0px",
  },
});
