import { Icon, IconName } from "medior/components";
import {
  ToastContainer as ToastContainerBase,
  ToastContainerProps,
  TypeOptions,
} from "react-toastify";
import { colors, makeClasses } from "medior/utils";

export const ToastContainer = (props: ToastContainerProps) => {
  const { css } = useClasses(null);
  return (
    <ToastContainerBase
      position="bottom-left"
      icon={({ type }) => <Icon name={ICON_TYPES[type].icon} color={ICON_TYPES[type].color} />}
      limit={5}
      autoClose={3000}
      className={css.toast}
      {...props}
    />
  );
};

const ICON_TYPES: { [key in TypeOptions]: { color: string; icon: IconName } } = {
  default: {
    color: colors.custom.blue,
    icon: "CircleNotifications",
  },
  error: {
    color: colors.custom.red,
    icon: "Error",
  },
  info: {
    color: colors.custom.blue,
    icon: "Info",
  },
  success: {
    color: colors.custom.green,
    icon: "CheckCircle",
  },
  warning: {
    color: colors.custom.orange,
    icon: "NewReleases",
  },
};

const useClasses = makeClasses({
  toast: {
    "& .Toastify__toast": {
      backgroundColor: colors.foreground,
      color: colors.custom.white,
      "&-body": {
        display: "flex",
        alignItems: "center",
        fontFamily: "Roboto",
        fontSize: "1.1em",
        fontWeight: 400,
        whiteSpace: "break-spaces",
      },
      "&-icon": {
        marginRight: "1em",
      },
      "&--default": {
        borderColor: ICON_TYPES.default.color,
        "& .Toastify__progress-bar": { background: ICON_TYPES.default.color },
      },
      "&--error": {
        borderColor: ICON_TYPES.error.color,
        "& .Toastify__progress-bar": { background: ICON_TYPES.error.color },
      },
      "&--info": {
        borderColor: ICON_TYPES.info.color,
        "& .Toastify__progress-bar": { background: ICON_TYPES.info.color },
      },
      "&--success": {
        borderColor: ICON_TYPES.success.color,
        "& .Toastify__progress-bar": { background: ICON_TYPES.success.color },
      },
      "&--warning": {
        borderColor: ICON_TYPES.warning.color,
        "& .Toastify__progress-bar": { background: ICON_TYPES.warning.color },
      },
      "& .Toastify__close-button": {
        margin: 0,
        lineHeight: 1,
        color: colors.custom.grey,
        "&:hover": {
          backgroundColor: "transparent",
          color: colors.custom.red,
        },
      },
    },
  },
});
