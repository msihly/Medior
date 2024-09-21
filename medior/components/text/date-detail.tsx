import { dayjs } from "medior/utils";
import { Detail, DetailProps } from ".";

export interface DateDetailProps extends DetailProps {
  value: string;
}

export const DateDetail = (props: DateDetailProps) => {
  return (
    <Detail
      {...props}
      value={props.value?.length ? dayjs(props.value).format("MMM D, YYYY [@] hh:mm:ss A") : null}
    />
  );
};
