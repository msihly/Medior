import { ComponentProps, HTMLAttributes, MouseEvent, useEffect, useRef, useState } from "react";
import {
  Autocomplete,
  AutocompleteChangeReason,
  AutocompleteRenderInputParams,
  CircularProgress,
  InputAdornment,
} from "@mui/material";
import {
  Button,
  Comp,
  HeaderWrapper,
  HeaderWrapperProps,
  Input,
  InputProps,
  TagInputRow,
  TagList,
  View,
} from "medior/components";
import { TagOption, tagToOption, useStores } from "medior/store";
import { colors, CSS, makeClasses, makeMargins, Margins, toast } from "medior/utils/client";
import { bisectArrayChanges, dayjs } from "medior/utils/common";
import { trpc } from "medior/utils/server";

export type TagInputProps = Omit<
  ComponentProps<typeof Autocomplete>,
  "defaultValue" | "fullWidth" | "label" | "renderInput" | "onChange" | "onSelect" | "options"
> & {
  autoFocus?: boolean;
  center?: boolean;
  excludedIds?: string[];
  hasCreate?: boolean;
  hasDelete?: boolean;
  hasDeleteAll?: boolean;
  hasEditor?: boolean;
  hasHelper?: boolean;
  hasList?: boolean;
  hasSearchMenu?: boolean;
  header?: HeaderWrapperProps["header"];
  headerProps?: HeaderWrapperProps["headerProps"];
  includedIds?: string[];
  inputProps?: InputProps;
  margins?: Margins;
  maxTags?: number;
  onChange?: (val: TagOption[]) => void;
  onSelect?: (val: TagOption) => void;
  onTagClick?: (tagOpt: TagOption) => void;
  single?: boolean;
  value: TagOption[];
  width?: CSS["width"];
};

export const TagInput = Comp(
  (
    {
      autoFocus = false,
      center,
      className,
      disabled,
      excludedIds = [],
      hasCreate = false,
      hasDelete = true,
      hasDeleteAll = false,
      hasEditor = true,
      hasHelper = false,
      hasList = true,
      hasSearchMenu,
      header,
      headerProps = {},
      includedIds = [],
      inputProps,
      margins,
      maxTags,
      onChange,
      onSelect,
      onTagClick,
      single,
      value = [],
      width,
      ...props
    }: TagInputProps,
    inputRef,
  ) => {
    const stores = useStores();
    const { css, cx } = useClasses({ center, margins, width });

    const isMaxTags = maxTags > -1 && value.length >= maxTags;
    disabled = disabled || isMaxTags;

    const [inputValue, setInputValue] = useState((inputProps?.value ?? "") as string);
    const [isLoading, setIsLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [options, setOptions] = useState<TagOption[]>([]);
    const lookupId = useRef(0);

    useEffect(() => {
      setInputValue(inputProps?.value as string);
    }, [inputProps?.value]);

    const isOptionEqualToValue = (option: TagOption, val: TagOption) =>
      option.id && val.id
        ? option.id === val.id
        : option.label.toLowerCase() === val.label.toLowerCase();
    const isUnavailableOption = (option: TagOption) =>
      excludedIds.includes(option.id) || value.some((tag) => isOptionEqualToValue(option, tag));
    const filterOptions = (options: TagOption[]) =>
      options.filter((option) => !isUnavailableOption(option));
    const getOptionLabel = (option: TagOption) => option.label;
    const handleClose = () => setIsOpen(false);
    const handleOpen = () => !disabled && !!inputValue && setIsOpen(true);
    const renderTags = () => null;

    const handleChange = (
      _,
      val: TagOption[],
      reason?: AutocompleteChangeReason,
      details?: { option: TagOption },
    ) => {
      if (disabled) return;
      if (
        details?.option &&
        isUnavailableOption(details.option) &&
        (reason === "selectOption" ||
          (reason === "removeOption" && (_.type === "click" || _.key === "Enter")))
      )
        return;
      if (reason === "selectOption") {
        if (val.some((t) => t.id === "optionsEndNode")) return handleCreateTag();
        setInputValue("");
        lookupId.current++;
        setIsLoading(false);
        const { added } = bisectArrayChanges(value, val);
        if (added?.length)
          trpc.updateTag.mutate({
            args: { id: added[0].id, updates: { lastSearchedAt: dayjs().toISOString() } },
          });
      }
      onChange?.(val);
    };

    const handleCreateTag = async () => {
      if (value.some((tag) => tag.label.toLowerCase() === inputValue?.toLowerCase())) return;
      const res = await stores.tag.createTag({ label: inputValue });
      if (!res.success) return toast.error(res.error);
      onChange?.([...value, res.data]);
      setInputValue("");
      lookupId.current++;
      setIsLoading(false);
      handleClose();
    };

    const handleInputChange = (val: string) => {
      if (disabled) return;
      setInputValue(val);
      inputProps?.setValue?.(val);
      if (val.length > 0 && !isOpen) setIsOpen(true);
      searchTags(val);
    };

    const renderInput = (params: AutocompleteRenderInputParams) => (
      <Input
        {...params}
        {...{ autoFocus, hasHelper, header, headerProps, width }}
        {...inputProps}
        ref={inputRef}
        value={inputValue}
        setValue={handleInputChange}
        disabled={disabled}
        borderRadiuses={!single && hasList ? { bottom: 0 } : undefined}
        className={cx(css.input, className)}
        InputProps={{
          ...params.InputProps,
          endAdornment: (
            <InputAdornment position="end">
              {isLoading ? <CircularProgress color="inherit" size={20} /> : null}
            </InputAdornment>
          ),
        }}
      />
    );

    const renderList = () => (
      <TagList
        {...{ hasDelete, hasDeleteAll, hasEditor, hasSearchMenu, onTagClick, value }}
        search={{ onChange, value }}
        hasInput
      />
    );

    const renderOption = (
      props: HTMLAttributes<HTMLLIElement> & HTMLAttributes<HTMLDivElement>,
      option: TagOption,
    ) => {
      const handleClick = (event: MouseEvent<HTMLDivElement>) => {
        if (option.id === "optionsEndNode" || isUnavailableOption(option)) return;
        onSelect ? onSelect(option) : props.onClick?.(event);
        setInputValue("");
        lookupId.current++;
        setIsLoading(false);
        handleClose();
      };

      return (
        <View {...props} onClick={handleClick} className={cx(props.className, css.tagOption)}>
          {option.id === "optionsEndNode" ? (
            <Button
              text={inputValue}
              icon="Add"
              onClick={handleCreateTag}
              color={colors.custom.purple}
              width="100%"
            />
          ) : (
            <TagInputRow tag={option} search={null} />
          )}
        </View>
      );
    };

    const searchTags = async (val: string) => {
      const requestId = ++lookupId.current;
      if (val.length === 0) {
        setIsLoading(false);
        setOptions([]);
        handleClose();
        return;
      }

      try {
        setIsLoading(true);

        const searchStr = val.toLowerCase();
        const res = await trpc.searchTags.mutate({
          excludedIds: [
            ...new Set([...excludedIds, ...value.map((tag) => tag.id).filter(Boolean)]),
          ],
          includedIds,
          searchStr,
        });
        if (requestId !== lookupId.current) return;
        if (!res.success) throw new Error(res.error);
        const opts = res.data.map(tagToOption);

        if (
          hasCreate &&
          val.length > 0 &&
          !value.some((tag) => tag.label.toLowerCase() === searchStr) &&
          !opts.find((o) => o.label.toLowerCase() === searchStr)
        )
          opts.push({ id: "optionsEndNode", aliases: [], count: 0, descendantIds: [], label: "" });

        setOptions(opts);
        handleOpen();
      } catch (err) {
        if (requestId !== lookupId.current) return;
        console.error(err), toast.error(err.message);
      } finally {
        if (requestId === lookupId.current) setIsLoading(false);
      }
    };

    return (
      <View column height="100%" className={css.root}>
        {single && value.length > 0 ? (
          <HeaderWrapper {...{ header, headerProps }}>{renderList()}</HeaderWrapper>
        ) : (
          <>
            <Autocomplete
              {...props}
              {...{
                disabled,
                filterOptions,
                getOptionLabel,
                isOptionEqualToValue,
                options,
                renderInput,
                renderOption,
                renderTags,
                value,
              }}
              clearOnBlur={false}
              disableClearable
              forcePopupIcon={false}
              filterSelectedOptions
              getOptionDisabled={isUnavailableOption}
              ListboxProps={{ className: css.listbox }}
              multiple
              onChange={handleChange}
              onClose={handleClose}
              onOpen={handleOpen}
              open={isOpen}
              size="small"
            />

            {!single && hasList && renderList()}
          </>
        )}
      </View>
    );
  },
);

interface ClassesProps extends Pick<TagInputProps, "center" | "margins" | "width"> {}

const useClasses = makeClasses((props: ClassesProps) => ({
  listbox: {
    backgroundColor: colors.background,
    boxShadow: "0 0 0.5rem 0.1rem rgba(0, 0, 0, 0.3)",
    overflowX: "hidden",
    overflowY: "auto",
  },
  input: {
    ...makeMargins(props.margins),
    "& .MuiAutocomplete-inputRoot": {
      justifyContent: props.center ? "center" : undefined,
    },
    "& .MuiAutocomplete-input": {
      minWidth: "0 !important",
    },
  },
  root: {
    display: "flex",
    alignItems: "center",
    width: props.width,
    "& > div": { width: "100%" },
  },
  tagOption: {
    width: "100%",
    "&.MuiAutocomplete-option": {
      padding: 0,
    },
  },
}));
