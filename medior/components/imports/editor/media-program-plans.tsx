import { useEffect, useState } from "react";
import {
  Card,
  Chip,
  Comp,
  Dropdown,
  DropdownOption,
  Input,
  MediaProgramDropdown,
  NumInput,
  Text,
  TextProps,
  View,
} from "medior/components";
import { ImportEditorStore } from "medior/store";
import { colors, useCancellableLoad } from "medior/utils/client";
import {
  Fmt,
  getMediaProgramDetails,
  MEDIA_PROGRAM_WATCH_STATUSES,
  MediaProgramOption,
  MediaProgramPlan,
  MediaProgramWatchStatus,
} from "medior/utils/common";
import { rpc } from "medior/utils/server";

const COLUMN_PROPS: Partial<TextProps> = {
  color: colors.custom.lightGrey,
  fontSize: "0.8em",
  fontWeight: 500,
  textAlign: "center",
};

/** The Program column's choice of creating a program rather than joining an existing one. */
const NEW_PROGRAM = "new";

const WIDTHS = { count: "5rem", detail: "9rem", program: "12rem", year: "6rem" };

export interface MediaProgramPlansProps {
  store: ImportEditorStore;
}

/**
 * The programs the scan found, each joining the existing program its folder belongs to or one named
 * alike in the same year, or else a new one, unless another is picked for it.
 */
export const MediaProgramPlans = Comp(({ store }: MediaProgramPlansProps) => {
  const [programs, setPrograms] = useState<MediaProgramOption[]>([]);

  const load = useCancellableLoad();

  const programOptions: DropdownOption[] = [
    { label: "New", value: NEW_PROGRAM },
    ...programs.map((program) => ({
      label: [program.name, getMediaProgramDetails(program)].filter(Boolean).join(" · "),
      value: program.id,
    })),
  ];

  // Each scan lists the programs again, with any created or merged since.
  useEffect(() => {
    load.run(async (signal) => {
      const res = await rpc.listMediaProgramOptions(undefined, { signal });
      if (!res.success) throw new Error(res.error);

      signal.throwIfAborted();
      setPrograms(res.data);
    });
  }, [store.mediaPrograms]);

  return (
    <Card
      flex="none"
      spacing="0.3rem"
      header={
        <View row align="center" spacing="0.5rem">
          <Text preset="title">{"Media Programs"}</Text>

          <Chip label={Fmt.commas(store.mediaPrograms.length)} height="1.5em" />
        </View>
      }
    >
      <View row spacing="0.5rem">
        <Text {...COLUMN_PROPS} flex={1}>
          {"Name"}
        </Text>

        <Text {...COLUMN_PROPS} width={WIDTHS.year}>
          {"Year"}
        </Text>

        <Text {...COLUMN_PROPS} width={WIDTHS.detail}>
          {"Type"}
        </Text>

        <Text {...COLUMN_PROPS} width={WIDTHS.detail}>
          {"Medium"}
        </Text>

        <Text {...COLUMN_PROPS} width={WIDTHS.detail}>
          {"Language"}
        </Text>

        <Text {...COLUMN_PROPS} width={WIDTHS.detail}>
          {"Watch Status"}
        </Text>

        <Text {...COLUMN_PROPS} width={WIDTHS.count}>
          {"Seasons"}
        </Text>

        <Text {...COLUMN_PROPS} width={WIDTHS.count}>
          {"Files"}
        </Text>

        <Text {...COLUMN_PROPS} width={WIDTHS.program}>
          {"Program"}
        </Text>
      </View>

      <View column maxHeight="20rem" overflow="hidden auto" spacing="0.5rem">
        {store.mediaPrograms.map((plan) => (
          <MediaProgramPlanRow
            key={plan.folderPath}
            plan={plan}
            programOptions={programOptions}
            programs={programs}
            store={store}
          />
        ))}
      </View>
    </Card>
  );
});

interface MediaProgramPlanRowProps extends MediaProgramPlansProps {
  plan: MediaProgramPlan;
  programOptions: DropdownOption[];
  programs: MediaProgramOption[];
}

const MediaProgramPlanRow = Comp(
  ({ plan, programOptions, programs, store }: MediaProgramPlanRowProps) => {
    const isDisabled = store.isDisabled;

    const handleLanguage = (language: string) =>
      store.updateMediaProgram(plan.folderPath, { language });

    const handleMedium = (medium: string) => store.updateMediaProgram(plan.folderPath, { medium });

    const handleName = (name: string) => store.updateMediaProgram(plan.folderPath, { name });

    const handleProgram = (id: string) =>
      store.pickMediaProgram(
        plan.folderPath,
        programs.find((program) => program.id === id) ?? null,
      );

    const handleType = (type: string) => store.updateMediaProgram(plan.folderPath, { type });

    const handleWatchStatus = (watchStatus: MediaProgramWatchStatus) =>
      store.updateMediaProgram(plan.folderPath, { watchStatus });

    const handleYear = (year: number) => store.updateMediaProgram(plan.folderPath, { year });

    return (
      <View row align="center" spacing="0.5rem">
        <Input
          value={plan.name}
          setValue={handleName}
          disabled={isDisabled}
          error={!plan.name.trim()}
          flex={1}
          dense
        />

        <NumInput
          value={plan.year}
          setValue={handleYear}
          disabled={isDisabled}
          minValue={1800}
          maxValue={9999}
          textAlign="center"
          width={WIDTHS.year}
          dense
        />

        <MediaProgramDropdown
          field="types"
          value={plan.type}
          setValue={handleType}
          disabled={isDisabled}
          width={WIDTHS.detail}
          dense
        />

        <MediaProgramDropdown
          field="mediums"
          value={plan.medium}
          setValue={handleMedium}
          disabled={isDisabled}
          width={WIDTHS.detail}
          dense
        />

        <MediaProgramDropdown
          field="languages"
          value={plan.language}
          setValue={handleLanguage}
          disabled={isDisabled}
          width={WIDTHS.detail}
          dense
        />

        <Dropdown
          options={[...MEDIA_PROGRAM_WATCH_STATUSES]}
          value={plan.watchStatus}
          setValue={handleWatchStatus}
          disabled={isDisabled}
          width={WIDTHS.detail}
          dense
        />

        <View row justify="center" width={WIDTHS.count}>
          <Chip label={Fmt.commas(plan.seasonLabels.length)} height="1.5em" />
        </View>

        <View row justify="center" width={WIDTHS.count}>
          <Chip label={Fmt.commas(plan.fileCount)} height="1.5em" />
        </View>

        {plan.isFolderMatch ? (
          <View row justify="center" width={WIDTHS.program}>
            <Chip label="Existing" height="1.5em" color={colors.custom.lightBlue} />
          </View>
        ) : (
          <Dropdown
            options={programOptions}
            value={plan.existingId ?? NEW_PROGRAM}
            setValue={handleProgram}
            disabled={isDisabled}
            width={WIDTHS.program}
            dense
          />
        )}
      </View>
    );
  },
);
