import { useMemo } from "react";
import { colors } from "trabecula/utils/client";
import { durationRegex, durationToSeconds, secondsToDuration } from "trabecula/utils/common";
import { Button, Comp, Dropdown, Input, View } from "medior/components";
import { FileTimestampPair, useStores } from "medior/store";

export interface TimestampRowProps {
  timestamp: FileTimestampPair;
}

export const TimestampRow = Comp(({ timestamp }: TimestampRowProps) => {
  const stores = useStores();
  const store = stores.carousel.splicer;

  const [isDurationInvalid, isEndInvalid, isStartInvalid] = useMemo(() => {
    const isEndInvalid = !timestamp.endDuration || !durationRegex.test(timestamp.endDuration);
    const isStartInvalid = !timestamp.startDuration || !durationRegex.test(timestamp.startDuration);
    const isDurationInvalid =
      isEndInvalid ||
      isStartInvalid ||
      durationToSeconds(timestamp.endDuration) <= durationToSeconds(timestamp.startDuration);

    return [isDurationInvalid, isEndInvalid, isStartInvalid];
  }, [timestamp.endDuration, timestamp.startDuration]);

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
          borderRadiuses={{ bottom: 0, right: 0 }}
          dense
        />

        <Button
          icon="Delete"
          onClick={() => store.removeTimestampPair(timestamp.id)}
          color={colors.custom.black}
          colorOnHover={colors.custom.red}
          borderRadiuses={{ top: 0, right: 0 }}
          height="100%"
          width="100%"
        />
      </View>

      <View column>
        <Input
          placeholder="Start"
          value={timestamp.startDuration}
          setValue={setStartVal}
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
          color={colors.custom.black}
          colorOnHover={colors.custom.blue}
          borderRadiuses={{ top: 0, left: 0 }}
          height="100%"
          width="100%"
          fontSize="0.7rem"
          fontWeight={500}
        />
      </View>
    </View>
  );
});
