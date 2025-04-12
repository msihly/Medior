import { useEffect, useState } from "react";
import { DiskSpace } from "check-disk-space";
import { Comp, Icon, IconButton, IconName, Text, View } from "medior/components";
import { useStores } from "medior/store";
import { colors } from "medior/utils/client";
import { formatBytes, round } from "medior/utils/common";
import { trpc } from "medior/utils/server";
import { Input, InputProps } from "./input";

interface Status {
  color: string;
  icon: IconName;
  label: string;
}

const STATUSES: Record<string, Status> = {
  AT_THRESHOLD: {
    color: colors.custom.red,
    icon: "Error",
    label: "Threshold Reached",
  },
  NEAR_THRESHOLD: {
    color: colors.custom.orange,
    icon: "Warning",
    label: "Near Threshold",
  },
  ONLINE: {
    color: colors.custom.green,
    icon: "CheckCircle",
    label: "Online",
  },
  OFFLINE: {
    color: colors.custom.red,
    icon: "Error",
    label: "Offline",
  },
};

export interface StorageInputProps extends Omit<InputProps, "setValue" | "value"> {
  index: number;
  selectLocation: () => Promise<string | undefined>;
}

export const StorageInput = Comp(({ index, selectLocation, ...props }: StorageInputProps) => {
  const stores = useStores();

  const [diskStats, setDiskStats] = useState<DiskSpace>(undefined);
  const [isOffline, setIsOffline] = useState(false);

  const threshold = stores.home.settings.db.fileStorage.threshold;
  const percentFilled = (diskStats?.size - diskStats?.free) / diskStats?.size;
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
          setIsOffline(true);
          console.error(err);
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
          <Text color={colors.custom.grey}>{"Loading..."}</Text>
        ) : (
          <>
            <Text color={status.color} fontWeight={500}>{`${round(percentFilled * 100)}%`}</Text>

            <Text>{`-- ${formatBytes(diskStats.free)} / ${formatBytes(diskStats.size)}`}</Text>
          </>
        )}
      </View>

      <IconButton name="Delete" onClick={handleDelete} iconProps={{ color: colors.custom.red }} />
    </View>
  );
});
