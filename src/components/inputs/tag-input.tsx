import {
  ComponentProps,
  forwardRef,
  HTMLAttributes,
  MouseEvent,
  MutableRefObject,
  useCallback,
  useEffect,
  useState,
} from "react";
import { observer } from "mobx-react-lite";
import { SearchTagType, TagOption, useStores } from "store";
import {
  Autocomplete,
  AutocompleteChangeReason,
  AutocompleteRenderGetTagProps,
  AutocompleteRenderInputParams,
} from "@mui/material";
import { Button, Chip, IconName, Input, InputProps, ListItem, Tag, View } from "components";
import { colors, makeClasses, Margins, socket, useDeepMemo } from "utils";
import { CSSObject } from "tss-react";
import { toast } from "react-toastify";

const SEARCH_MENU_META: {
  [key in SearchTagType]: { color: string; icon: IconName; text: string };
} = {
  exclude: {
    color: colors.red["700"],
    icon: "RemoveCircleOutline",
    text: "Exclude",
  },
  excludeDesc: {
    color: colors.red["700"],
    icon: "RemoveCircle",
    text: "Exclude (Descendants)",
  },
  includeAnd: {
    color: colors.green["700"],
    icon: "AddCircle",
    text: "Include (Required)",
  },
  includeOr: {
    color: colors.green["700"],
    icon: "AddCircleOutline",
    text: "Include (Optional)",
  },
  includeDesc: {
    color: colors.green["700"],
    icon: "ControlPointDuplicate",
    text: "Include (Descendants)",
  },
};

export type TagInputProps = Omit<
  ComponentProps<typeof Autocomplete>,
  "renderInput" | "onChange" | "onSelect" | "options"
> & {
  autoFocus?: boolean;
  center?: boolean;
  detachLabel?: boolean;
  disableWithoutFade?: boolean;
  excludedIds?: string[];
  hasCreate?: boolean;
  hasDelete?: boolean;
  hasEditor?: boolean;
  hasHelper?: boolean;
  hasSearchMenu?: boolean;
  inputProps?: InputProps;
  label?: string;
  margins?: Margins;
  maxTags?: number;
  onTagClick?: (tagId: string) => void;
  opaque?: boolean;
  options?: TagOption[];
  onChange?: (val: TagOption[]) => void;
  onSelect?: (val: TagOption) => void;
  value: TagOption[];
  width?: CSSObject["width"];
};

export const TagInput = observer(
  forwardRef(
    (
      {
        autoFocus = false,
        center,
        className,
        detachLabel,
        disabled,
        disableWithoutFade = false,
        excludedIds = [],
        hasCreate = false,
        hasDelete = false,
        hasEditor = true,
        hasHelper = false,
        hasSearchMenu,
        inputProps,
        label,
        margins,
        maxTags,
        onChange,
        onSelect,
        onTagClick,
        opaque = false,
        options,
        value = [],
        width,
        ...props
      }: TagInputProps,
      inputRef?: MutableRefObject<HTMLDivElement>
    ) => {
      const stores = useStores();
      const { css, cx } = useClasses({ center, margins, opaque, width });

      const isMaxTags = maxTags > 0 && value.length >= maxTags;
      disabled = disabled || isMaxTags;
      disableWithoutFade = disableWithoutFade || isMaxTags;

      const [inputValue, setInputValue] = useState((inputProps?.value ?? "") as string);
      const [isOpen, setIsOpen] = useState(false);

      const opts = useDeepMemo(options ?? [...stores.tag.tagOptions]);

      const removeDeletedTag = useCallback(
        ({ tagId }: { tagId: string }) => {
          const newValue = value.filter((t) => t.id !== tagId);
          if (newValue.length !== value.length) onChange?.(newValue);
        },
        [onChange, value]
      );

      const replaceMergedTag = useCallback(
        ({ oldTagId, newTagId }: { oldTagId: string; newTagId: string }) => {
          const oldTag = value.find((t) => t.id === oldTagId);
          if (!oldTag) return;

          const newTagOption = stores.tag.getById(newTagId)?.tagOption;
          const newValue = value.map((t) => (t.id === oldTagId ? newTagOption : t));
          onChange?.(newValue);
        },
        [onChange, value]
      );

      useEffect(() => {
        if (!socket?.connected) return;
        socket.on("tagDeleted", removeDeletedTag);
        socket.on("tagMerged", replaceMergedTag);

        return () => {
          socket.off("tagDeleted", removeDeletedTag);
          socket.off("tagMerged", replaceMergedTag);
        };
      }, [replaceMergedTag, socket?.connected]);

      useEffect(() => {
        setInputValue(inputProps?.value as string);
      }, [inputProps?.value]);

      const filterOptions = (options: TagOption[], { inputValue }: { inputValue: string }) => {
        const searchTerms = inputValue.trim().toLowerCase().split(" ");
        const filtered = options
          .filter(
            (o) =>
              o.label?.length > 0 &&
              excludedIds.every((id) => id !== o.id) &&
              [o.label.toLowerCase(), ...(o.aliases?.map((a) => a.toLowerCase()) ?? [])].some(
                (label) => searchTerms.every((t) => label.includes(t))
              )
          )
          .slice(0, 100);

        return hasCreate &&
          inputValue.length > 0 &&
          !filtered.find((o) => o.label.toLowerCase() === inputValue.toLowerCase())
          ? [...filtered, { id: "optionsEndNode", count: 0 }]
          : filtered;
      };

      const getOptionLabel = (option: TagOption) =>
        option?.label ?? stores.tag.getById(option.id)?.label ?? "";

      const handleChange = (_, val: TagOption[], reason?: AutocompleteChangeReason) => {
        if (disabled) return;
        if (reason === "selectOption") {
          if (val.some((t) => t.id === "optionsEndNode")) return handleCreateTag();
          setInputValue("");
        }
        onChange?.(val);
      };

      const handleClose = () => setIsOpen(false);

      const handleCreateTag = async () => {
        const res = await stores.tag.createTag({ label: inputValue });
        if (!res.success) return toast.error(res.error);
        onChange?.([...value, res.data]);
        setInputValue("");
        handleClose();
      };

      const handleInputChange = (val: string) => {
        if (disabled) return;
        setInputValue(val);
        inputProps?.setValue?.(val);
      };

      const handleOpen = () => !disabled && setIsOpen(true);

      const isOptionEqualToValue = (option: TagOption, val: TagOption) => option.id === val.id;

      const renderInput = (params: AutocompleteRenderInputParams) => (
        <Input
          {...params}
          {...{ autoFocus, detachLabel, hasHelper, label, width }}
          {...inputProps}
          ref={inputRef}
          value={inputValue}
          setValue={handleInputChange}
          disabled={!disableWithoutFade && disabled}
          className={cx(css.input, className)}
        />
      );

      const renderOption = (
        props: HTMLAttributes<HTMLLIElement> & HTMLAttributes<HTMLDivElement>,
        option: TagOption
      ) => {
        const handleClick = (event: MouseEvent<HTMLDivElement>) => {
          if (option.id === "optionsEndNode") return;
          onSelect ? onSelect(option) : props.onClick?.(event);
          setInputValue("");
          handleClose();
        };

        return (
          <View {...props} onClick={handleClick} className={cx(props.className, css.tagOption)}>
            {option.id === "optionsEndNode" ? (
              <Button text={`Create Tag '${inputValue}'`} icon="Add" onClick={handleCreateTag} />
            ) : (
              <>
                <Tag key={option.id} id={option.id} className={css.tag} />

                {option.aliases?.length > 0 && (
                  <View className={css.aliases}>
                    {option.aliases.map((a) => (
                      <Chip key={a} label={a} size="small" className={css.alias} />
                    ))}
                  </View>
                )}
              </>
            )}
          </View>
        );
      };

      const renderTags = (val: TagOption[], getTagProps: AutocompleteRenderGetTagProps) =>
        val.map((option: TagOption, index: number) => {
          const handleClick = () => onTagClick?.(option.id);

          const handleDelete = () => onChange?.(value.filter((t) => t.id !== option.id));

          const handleMenuClick = (searchType: SearchTagType) =>
            onChange?.(value.map((t) => (t.id === option.id ? { ...t, searchType } : t)));

          return !option ? null : (
            <Tag
              {...getTagProps({ index })}
              key={option.id}
              id={option.id}
              hasEditor={hasEditor}
              onClick={hasEditor || onTagClick ? handleClick : null}
              onDelete={hasDelete ? handleDelete : null}
              menuButtonProps={
                !hasSearchMenu
                  ? undefined
                  : {
                      icon: SEARCH_MENU_META[option.searchType]?.icon,
                      iconProps: { color: SEARCH_MENU_META[option.searchType]?.color },
                      padding: { all: 0 },
                      color: "transparent",
                    }
              }
              menu={
                hasSearchMenu ? (
                  <View>
                    <ListItem
                      text="Remove"
                      icon="Delete"
                      color={colors.red["700"]}
                      iconProps={{ color: colors.red["700"] }}
                      onClick={handleDelete}
                    />

                    {Object.entries(SEARCH_MENU_META).map(([type, { color, icon, text }]) => (
                      <ListItem
                        key={text}
                        {...{ icon, text }}
                        iconProps={{ color }}
                        onClick={() => handleMenuClick(type as SearchTagType)}
                      />
                    ))}
                  </View>
                ) : null
              }
            />
          );
        });

      return (
        <Autocomplete
          {...{
            filterOptions,
            getOptionLabel,
            isOptionEqualToValue,
            renderInput,
            renderOption,
            renderTags,
            value,
          }}
          classes={{ root: css.root }}
          clearOnBlur={false}
          disableClearable
          disabled={!disableWithoutFade && disabled}
          forcePopupIcon={false}
          ListboxProps={{ className: css.listbox }}
          multiple
          onChange={handleChange}
          onClose={handleClose}
          onOpen={handleOpen}
          open={isOpen}
          options={opts}
          size="small"
          {...props}
        />
      );
    }
  )
);

const useClasses = makeClasses((_, { center, margins, opaque, width }) => ({
  alias: {
    margin: "0.3rem 0 0 0.3rem",
    fontSize: "0.7em",
    opacity: 0.7,
  },
  aliases: {
    display: "flex",
    flexFlow: "row wrap",
    alignSelf: "flex-start",
  },
  listbox: {
    overflowX: "hidden",
    overflowY: "auto",
  },
  input: {
    backgroundColor: opaque ? colors.grey["800"] : "transparent",
    margin: margins?.all,
    marginTop: margins?.top,
    marginBottom: margins?.bottom,
    marginRight: margins?.right,
    marginLeft: margins?.left,
    "& .MuiAutocomplete-inputRoot": {
      justifyContent: center ? "center" : undefined,
    },
    "& .MuiAutocomplete-input": {
      minWidth: "0 !important",
    },
  },
  root: {
    display: "flex",
    alignItems: "center",
    width,
    "& > div": {
      width: "100%",
    },
  },
  tag: {
    alignSelf: "flex-start",
    marginLeft: 0,
  },
  tagOption: {
    display: "flex",
    flexDirection: "column",
    marginBottom: "0.3rem",
    "&.MuiAutocomplete-option": {
      padding: "0.2rem 0.5rem",
    },
  },
}));
