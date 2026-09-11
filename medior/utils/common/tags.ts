import { Fmt } from "trabecula/utils/common";

export const tagsToRegEx = (tags: { aliases?: string[]; label: string }[]) =>
  `(${tags
    .flatMap((tag) => [tag.label, ...(tag.aliases ?? [])])
    .map((s) => `^${Fmt.regexEscape(s).replaceAll(/[\s-_]+/g, "[\\s\\-_\\.]+")}$`)
    .join(")|(")})`;
