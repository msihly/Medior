import { useCallback } from "react";
import { observer } from "mobx-react-lite";
import { ImportBatch as ImportBatchType } from "store";
import AutoSizer from "react-virtualized-auto-sizer";
import { FixedSizeList, ListChildComponentProps } from "react-window";
import { Icon, Text, View } from "components";
import { IMPORT_CARD_SIZE, IMPORT_STATUSES, ImportCard, ImportStatus } from ".";
import { colors, makeClasses, useDeepMemo } from "utils";

export const ImportCardRow = observer(
  ({ batch, status }: { batch: ImportBatchType; status: ImportStatus }) => {
    const { css } = useClasses(null);

    const meta = IMPORT_STATUSES[status];

    const batchImports = useDeepMemo(batch.imports);
    const imports = batchImports.filter((imp) => imp.status === status);

    const renderImportCard = useCallback(
      ({ index, style }: ListChildComponentProps) => (
        <ImportCard {...{ style }} key={index} fileImport={imports[index]} />
      ),
      [imports.length]
    );

    return !imports?.length ? null : (
      <View column>
        <View row spacing="0.5rem" margins={{ left: "0.3rem" }}>
          <Icon name={meta.icon} color={meta.color} />
          <Text color={meta.color} fontWeight={500}>
            {meta.label}
          </Text>
          <Text color={colors.grey["700"]}>{` - ${imports.length}`}</Text>
        </View>

        <View className={css.importCardRow}>
          <AutoSizer disableHeight>
            {({ width }) => (
              <FixedSizeList
                {...{ width }}
                layout="horizontal"
                height={IMPORT_CARD_SIZE + 10}
                itemSize={IMPORT_CARD_SIZE}
                itemCount={imports.length}
              >
                {renderImportCard}
              </FixedSizeList>
            )}
          </AutoSizer>
        </View>
      </View>
    );
  }
);

const useClasses = makeClasses({
  importCardRow: {
    display: "flex",
    flexDirection: "row",
    whiteSpace: "nowrap",
  },
});
