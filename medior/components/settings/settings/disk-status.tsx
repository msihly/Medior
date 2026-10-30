import { useEffect, useState } from "react";
import { DiskSpace } from "check-disk-space";
import { Comp, Icon, IconName, Text, View } from "medior/components";
import { colors, CssColor } from "medior/utils/client";
import { Fmt } from "medior/utils/common";
import { rpc } from "medior/utils/server";

interface Status {
  color: CssColor;
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
  OFFLINE: {
    color: colors.custom.red,
    icon: "Error",
    label: "Offline",
  },
  ONLINE: {
    color: colors.custom.green,
    icon: "CheckCircle",
    label: "Online",
  },
};

export interface DiskStatusProps {
  diskPath: string;
  /** Fill ratio that marks the disk as full. Omitted for disks without a storage threshold. */
  threshold?: number;
}

export const DiskStatus = Comp(({ diskPath, threshold }: DiskStatusProps) => {
  const [diskStats, setDiskStats] = useState<DiskSpace>(undefined);
  const [isOffline, setIsOffline] = useState(false);

  const percentFilled = (diskStats?.size - diskStats?.free) / diskStats?.size;
  const isAtThreshold = threshold !== undefined && percentFilled >= threshold;
  const isNearThreshold = threshold !== undefined && percentFilled >= threshold - 0.1;
  const status = isOffline
    ? STATUSES.OFFLINE
    : isAtThreshold
      ? STATUSES.AT_THRESHOLD
      : isNearThreshold
        ? STATUSES.NEAR_THRESHOLD
        : STATUSES.ONLINE;

  useEffect(() => {
    let isCurrent = true;

    setDiskStats(undefined);
    setIsOffline(false);

    (async () => {
      if (diskPath) {
        try {
          const res = await rpc.getDiskStats({ diskPath });

          if (!res.success) throw new Error(res.error);

          if (isCurrent) setDiskStats(res.data);
        } catch (err) {
          if (isCurrent) setIsOffline(true);
          console.error(err);
        }
      }
    })();

    return () => {
      isCurrent = false;
    };
  }, [diskPath]);

  return (
    <View row align="center" width="17rem" spacing="0.5rem">
      <Icon name={status.icon} color={status.color} />

      {isOffline ? (
        <Text color={status.color} fontWeight={500}>
          {status.label}
        </Text>
      ) : !diskStats ? (
        <Text color={colors.custom.grey}>{"Loading..."}</Text>
      ) : (
        <View row spacing="1rem">
          <Text color={status.color} fontWeight={500}>
            {`${(percentFilled * 100).toFixed(2)}%`}
          </Text>

          <Text>{`${Fmt.bytes(diskStats.free)} / ${Fmt.bytes(diskStats.size)}`}</Text>
        </View>
      )}
    </View>
  );
});
