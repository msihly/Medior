import { useEffect, useState } from "react";
import { observer, useStores } from "medior/store";
import { Icon, IconButton, IconName, Text, View } from "medior/components";
import { Input, InputProps } from "./input";
import { colors, formatBytes, round, trpc } from "medior/utils";
import { DiskUsage } from "diskusage";

interface Status {
  color: string;
  icon: IconName;
  label: string;
}

const STATUSES: Record<string, Status> = {
  AT_THRESHOLD: {
    color: colors.red["800"],
    icon: "Error",
    label: "Threshold Reached",
  },
  NEAR_THRESHOLD: {
    color: colors.amber["700"],
    icon: "Warning",
    label: "Near Threshold",
  },
  ONLINE: {
    color: colors.green["700"],
    icon: "CheckCircle",
    label: "Online",
  },
  OFFLINE: {
    color: colors.red["800"],
    icon: "Error",
    label: "Offline",
  },
};

export interface StorageInputProps extends Omit<InputProps, "setValue" | "value"> {
  index: number;
  selectLocation: () => Promise<string | undefined>;
}

export const StorageInput = observer(({ index, selectLocation, ...props }: StorageInputProps) => {
  const stores = useStores();

  const [diskStats, setDiskStats] = useState<DiskUsage>(undefined);
  const [isOffline, setIsOffline] = useState(false);

  const threshold = stores.home.settings.db.fileStorage.threshold;
  const percentFilled = (diskStats?.total - diskStats?.available) / diskStats?.total;
  const isAtThreshold = percentFilled >= threshold;
  const isNearThreshold = percentFilled >= threshold - 0.1;
  const status = isOffline
    ? STATUSES.OFFLINE
    : isAtThreshold
    ? STATUSES.AT_THRESHOLD
    : isNearThreshold
    ? STATUSES.NEAR_THRESHOLD
    : STATUSES.ONLINE;
  const value = stores.home.settings.db.fileStorage.locations[index];

  useEffect(() => {
    (async () => {
      if (value) {
        try {
          const res = await trpc.getDiskStats.mutate({ diskPath: value });
          if (!res.success) throw new Error(res.error);
          setDiskStats(res.data);
        } catch (err) {
          const msg: string = err.message;
          if (msg.startsWith("ENOENT")) setIsOffline(true);
          else console.error(err);
        }
      }
    })();
  }, [value]);

  const decrementIndex = () => stores.home.settings.setFileStorageIndex(index, index - 1);

  const handleLocationClick = async (event: React.MouseEvent) => {
    event.preventDefault();
    const location = await selectLocation();
    if (location) setLocationValue(location);
  };

  const handleDelete = () => stores.home.settings.removeFileStorageLocation(index);

  const incrementIndex = () => stores.home.settings.setFileStorageIndex(index, index + 1);

  const setLocationValue = (val: string) => stores.home.settings.setFileStorageLocation(index, val);

  return (
    <View row align="center" spacing="0.5rem">
      <IconButton name="ArrowUpward" onClick={decrementIndex} disabled={index === 0} />

      <IconButton
        name="ArrowDownward"
        onClick={incrementIndex}
        disabled={index === stores.home.settings.db.fileStorage.locations.length - 1}
      />

      <Input value={value} onClick={handleLocationClick} flex={1} {...props} />

      <View row align="center" width="17rem" spacing="0.5rem">
        <Icon name={status.icon} color={status.color} />

        {isOffline ? (
          <Text color={status.color} fontWeight={500}>
            {status.label}
          </Text>
        ) : !diskStats ? (
          <Text color={colors.text.grey}>{"Loading..."}</Text>
        ) : (
          <>
            <Text color={status.color} fontWeight={500}>{`${round(percentFilled * 100)}%`}</Text>

            <Text>
              {`-- ${formatBytes(diskStats.available)} / ${formatBytes(diskStats.total)}`}
            </Text>
          </>
        )}
      </View>

      <IconButton name="Delete" onClick={handleDelete} iconProps={{ color: colors.button.red }} />
    </View>
  );
});
