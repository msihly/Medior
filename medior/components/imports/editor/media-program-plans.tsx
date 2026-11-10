import {
  Card,
  Chip,
  Comp,
  Dropdown,
  Input,
  MediaProgramDropdown,
  NumInput,
  Text,
  TextProps,
  View,
} from "medior/components";
import { ImportEditorStore } from "medior/store";
import { colors } from "medior/utils/client";
import {
  Fmt,
  MEDIA_PROGRAM_WATCH_STATUSES,
  MediaProgramPlan,
  MediaProgramWatchStatus,
} from "medior/utils/common";

const COLUMN_PROPS: Partial<TextProps> = {
  color: colors.custom.lightGrey,
  fontSize: "0.8em",
  fontWeight: 500,
  textAlign: "center",
};

const WIDTHS = { count: "5rem", detail: "9rem", program: "6rem", year: "6rem" };

export interface MediaProgramPlansProps {
  store: ImportEditorStore;
}

export const MediaProgramPlans = Comp(({ store }: MediaProgramPlansProps) => {
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
          <MediaProgramPlanRow key={plan.folderPath} plan={plan} store={store} />
        ))}
      </View>
    </Card>
  );
});

interface MediaProgramPlanRowProps extends MediaProgramPlansProps {
  plan: MediaProgramPlan;
}

const MediaProgramPlanRow = Comp(({ plan, store }: MediaProgramPlanRowProps) => {
  const isDisabled = store.isDisabled;

  const handleLanguage = (language: string) =>
    store.updateMediaProgram(plan.folderPath, { language });

  const handleMedium = (medium: string) => store.updateMediaProgram(plan.folderPath, { medium });

  const handleName = (name: string) => store.updateMediaProgram(plan.folderPath, { name });

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

      <View row justify="center" width={WIDTHS.program}>
        <Chip
          label={plan.existingId ? "Existing" : "New"}
          height="1.5em"
          color={plan.existingId ? colors.custom.lightBlue : undefined}
        />
      </View>
    </View>
  );
});
