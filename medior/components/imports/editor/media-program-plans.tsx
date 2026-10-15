import {
  Card,
  Chip,
  Comp,
  Input,
  MediaProgramDropdown,
  NumInput,
  Text,
  View,
} from "medior/components";
import { Ingester, Reingester } from "medior/store";
import { colors } from "medior/utils/client";
import { Fmt, MediaProgramPlan } from "medior/utils/common";

export interface MediaProgramPlansProps {
  store: Ingester | Reingester;
}

export const MediaProgramPlans = Comp(({ store }: MediaProgramPlansProps) => {
  return (
    <Card
      flex="none"
      maxHeight="40%"
      overflow="hidden auto"
      spacing="0.5rem"
      header={
        <View row align="center" spacing="0.5rem">
          <Text preset="title">{"Media Programs"}</Text>

          <Chip label={Fmt.commas(store.mediaPrograms.length)} height="1.5em" />
        </View>
      }
    >
      {store.mediaPrograms.map((plan) => (
        <MediaProgramPlanRow key={plan.folderPath} plan={plan} store={store} />
      ))}
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

  const handleYear = (year: number) => store.updateMediaProgram(plan.folderPath, { year });

  return (
    <View row align="center" spacing="0.5rem">
      <Input
        header="Name"
        value={plan.name}
        setValue={handleName}
        disabled={isDisabled}
        error={!plan.name.trim()}
        flex={1}
        dense
      />

      <NumInput
        header="Year"
        value={plan.year}
        setValue={handleYear}
        disabled={isDisabled}
        minValue={1800}
        maxValue={9999}
        textAlign="center"
        width="6rem"
        dense
      />

      <MediaProgramDropdown
        field="types"
        header="Type"
        value={plan.type}
        setValue={handleType}
        disabled={isDisabled}
        width="9rem"
        dense
      />

      <MediaProgramDropdown
        field="mediums"
        header="Medium"
        value={plan.medium}
        setValue={handleMedium}
        disabled={isDisabled}
        width="9rem"
        dense
      />

      <MediaProgramDropdown
        field="languages"
        header="Language"
        value={plan.language}
        setValue={handleLanguage}
        disabled={isDisabled}
        width="9rem"
        dense
      />

      <View column align="flex-end" spacing="0.2rem" width="9rem">
        <Chip
          label={`${plan.seasonLabels.length} seasons, ${Fmt.commas(plan.fileCount)} files`}
          height="1.5em"
        />

        {plan.existingId && (
          <Chip label="Adds to Existing" height="1.5em" color={colors.custom.lightBlue} />
        )}
      </View>
    </View>
  );
});
