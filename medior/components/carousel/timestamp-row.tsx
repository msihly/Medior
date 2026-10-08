import { useMemo } from "react";
import { Button, Comp, Dropdown, Input, View } from "medior/components";
import { FileTimestampPair, useStores } from "medior/store";
import { colors } from "medior/utils/client";
import {
  durationRegex,
  durationToSeconds,
  getTimestampPairError,
  secondsToDuration,
} from "medior/utils/common";

export interface TimestampRowProps {
  timestamp: FileTimestampPair;
}

export const TimestampRow = Comp(({ timestamp }: TimestampRowProps) => {
  const stores = useStores();
  const store = stores.carousel.splicer;

  const duration = stores.carousel.getActiveFile()?.duration;

  const [isDurationInvalid, isEndInvalid, isStartInvalid] = useMemo(() => {
    const isEndInvalid = !timestamp.endDuration || !durationRegex.test(timestamp.endDuration);
    const isStartInvalid = !timestamp.startDuration || !durationRegex.test(timestamp.startDuration);

    const isDurationInvalid =
      isEndInvalid ||
      isStartInvalid ||
      Boolean(
        getTimestampPairError(
          durationToSeconds(timestamp.startDuration),
          durationToSeconds(timestamp.endDuration),
          duration,
        ),
      );

    return [isDurationInvalid, isEndInvalid, isStartInvalid];
  }, [duration, timestamp.endDuration, timestamp.startDuration]);

  const setEndVal = (val: string) => store.setTimestampPairVal(timestamp.id, "endDuration", val);

  const setStartVal = (val: string) =>
    store.setTimestampPairVal(timestamp.id, "startDuration", val);

  return (
    <View row>
      <View column width="5rem">
        <Dropdown
          options={store.orderOptions}
          value={String(timestamp.order)}
          setValue={(val) => store.setTimestampPairOrder(timestamp.id, +val)}
          disabled={store.isLoading}
          borderRadiuses={{ bottom: 0, right: 0 }}
          dense
        />

        <Button
          icon="Delete"
          onClick={() => store.removeTimestampPair(timestamp.id)}
          disabled={store.isLoading}
          color={colors.custom.black}
          colorOnHover={colors.custom.red}
          borderRadiuses={{ right: 0, top: 0 }}
          height="100%"
          width="100%"
        />
      </View>

      <View column>
        <Input
          placeholder="Start"
          value={timestamp.startDuration}
          setValue={setStartVal}
          disabled={store.isLoading}
          error={isStartInvalid || (isDurationInvalid && !isEndInvalid)}
          adornment="hmsz"
          borderRadiuses={{ all: 0 }}
          borders={{ bottom: "none" }}
          dense
        />

        <Input
          placeholder="End"
          value={timestamp.endDuration}
          setValue={setEndVal}
          disabled={store.isLoading}
          error={isEndInvalid || (isDurationInvalid && !isStartInvalid)}
          adornment="hmsz"
          borderRadiuses={{ all: 0 }}
          dense
        />
      </View>

      <View column>
        <Button
          text="SET"
          onClick={() => setStartVal(secondsToDuration(stores.carousel.curTime))}
          disabled={store.isLoading}
          color={colors.custom.black}
          colorOnHover={colors.custom.blue}
          borderRadiuses={{ bottom: 0, left: 0 }}
          height="100%"
          width="100%"
          fontSize="0.7rem"
          fontWeight={500}
        />

        <Button
          text="SET"
          onClick={() => setEndVal(secondsToDuration(stores.carousel.curTime))}
          disabled={store.isLoading}
          color={colors.custom.black}
          colorOnHover={colors.custom.blue}
          borderRadiuses={{ left: 0, top: 0 }}
          height="100%"
          width="100%"
          fontSize="0.7rem"
          fontWeight={500}
        />
      </View>
    </View>
  );
});
