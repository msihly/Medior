import { HTMLAttributes, MouseEvent, useEffect, useRef, useState } from "react";
import type { AutocompleteChangeReason, AutocompleteRenderInputParams } from "@mui/material";
import {
  AutoComplete,
  AutoCompleteProps,
  Button,
  Comp,
  HeaderWrapper,
  HeaderWrapperProps,
  Input,
  InputProps,
  ProgressCircle,
  TagInputRow,
  TagList,
  View,
} from "medior/components";
import { TagOption, tagToOption, useStores } from "medior/store";
import {
  colors,
  CSS,
  makeClasses,
  makeMargins,
  Margins,
  toast,
  useDeepMemo,
} from "medior/utils/client";
import { bisectArrayChanges, dayjs } from "medior/utils/common";
import { trpc } from "medior/utils/server";

export type TagInputProps = Omit<
  AutoCompleteProps<TagOption, true, true>,
  | "defaultValue"
  | "fullWidth"
  | "label"
  | "onChange"
  | "onSelect"
  | "options"
  | "ref"
  | "renderInput"
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

    const searchController = useRef<AbortController>(null);

    const searchParams = useDeepMemo({
      excludedIds: [...new Set([...excludedIds, ...value.map((tag) => tag.id).filter(Boolean)])],
      includedIds,
      searchStr: inputValue?.toLowerCase() ?? "",
    });

    const hasExactValue = value.some((tag) => tag.label.toLowerCase() === searchParams.searchStr);

    useEffect(() => {
      setInputValue((inputProps?.value ?? "") as string);
    }, [inputProps?.value]);

    useEffect(() => {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout>;

      searchController.current = controller;

      const searchTags = async () => {
        try {
          const res = await trpc.searchTags.mutate(searchParams, { signal: controller.signal });

          if (controller.signal.aborted) return;

          if (!res.success) throw new Error(res.error);

          const opts = res.data.map(tagToOption);

          if (
            hasCreate &&
            !hasExactValue &&
            !opts.some((option) => option.label.toLowerCase() === searchParams.searchStr)
          )
            opts.push({
              aliases: [],
              count: 0,
              descendantIds: [],
              id: "optionsEndNode",
              label: "",
            });

          setOptions(opts);
        } catch (error) {
          if (!controller.signal.aborted) {
            console.error(error);
            toast.error(error.message);
          }
        } finally {
          if (!controller.signal.aborted) setIsLoading(false);
        }
      };

      if (!disabled && isOpen && searchParams.searchStr.length) {
        setIsLoading(true);
        timer = setTimeout(searchTags, 200);
      } else {
        setIsLoading(false);
        setOptions([]);
      }

      return () => {
        clearTimeout(timer);
        controller.abort();
      };
    }, [disabled, hasCreate, hasExactValue, inputValue, isOpen, searchParams]);

    const isOptionEqualToValue = (option: TagOption, val: TagOption) =>
      option.id && val.id
        ? option.id === val.id
        : option.label.toLowerCase() === val.label.toLowerCase();

    const isUnavailableOption = (option: TagOption) =>
      excludedIds.includes(option.id) || value.some((tag) => isOptionEqualToValue(option, tag));

    const filterOptions = (options: TagOption[]) =>
      options.filter((option) => !isUnavailableOption(option));

    const getOptionLabel = (option: TagOption) => option.label;

    const handleClose = () => {
      searchController.current?.abort();
      setIsLoading(false);
      setIsOpen(false);
    };

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

      if (reason === "selectOption" && val.some((t) => t.id === "optionsEndNode"))
        handleCreateTag();
      else {
        if (reason === "selectOption") {
          setInputValue("");
          handleClose();

          const { added } = bisectArrayChanges(value, val);

          if (added?.length)
            trpc.updateTag.mutate({
              args: { id: added[0].id, updates: { lastSearchedAt: dayjs().toISOString() } },
            });
        }

        if (reason === "selectOption" && onSelect && details?.option) onSelect(details.option);
        else onChange?.(val);
      }
    };

    const handleCreateTag = async () => {
      if (value.some((tag) => tag.label.toLowerCase() === inputValue?.toLowerCase())) return;

      const res = await stores.tag.createTag({ label: inputValue });

      if (!res.success) return toast.error(res.error);

      onChange?.([...value, res.data]);
      setInputValue("");
      handleClose();
    };

    const handleInputChange = (val: string) => {
      if (disabled || val === inputValue) return;

      searchController.current?.abort();
      setInputValue(val);
      inputProps?.setValue?.(val);

      if (val.length > 0) setIsOpen(true);
      else handleClose();
    };

    const renderInput = (params: AutocompleteRenderInputParams) => (
      <Input
        {...params}
        {...{ autoFocus, hasHelper, header, headerProps, width }}
        {...inputProps}
        ref={inputRef}
        value={inputValue}
        setValue={handleInputChange}
        stopKeyPropagation={false}
        disabled={disabled}
        borderRadiuses={!single && hasList ? { bottom: 0 } : undefined}
        className={cx(css.input, className)}
        InputProps={{
          ...params.InputProps,
          endAdornment: (
            <View row align="center" flex="none" margins={{ left: 8 }}>
              {isLoading ? (
                <ProgressCircle color="inherit" size={20} variant="indeterminate" />
              ) : null}
            </View>
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

        props.onClick?.(event);
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

    return (
      <View column height="100%" className={css.root}>
        {single && value.length > 0 ? (
          <HeaderWrapper {...{ header, headerProps }}>{renderList()}</HeaderWrapper>
        ) : (
          <>
            <AutoComplete
              autoComplete={false}
              autoHighlight={false}
              fullWidth={false}
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
  input: {
    ...makeMargins(props.margins),
    "& .MuiAutocomplete-inputRoot": {
      justifyContent: props.center ? "center" : undefined,
    },
    "& .MuiAutocomplete-input": {
      minWidth: "0 !important",
    },
  },
  listbox: {
    backgroundColor: colors.background,
    boxShadow: "0 0 0.5rem 0.1rem rgba(0, 0, 0, 0.3)",
    overflowX: "hidden",
    overflowY: "auto",
  },
  root: {
    "& > div": { width: "100%" },
    alignItems: "center",
    display: "flex",
    width: props.width,
  },
  tagOption: {
    "&.MuiAutocomplete-option": {
      padding: 0,
    },
    width: "100%",
  },
}));
