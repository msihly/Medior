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
      autoClose={2000}
      className={css.toast}
      hideProgressBar
      icon={({ type }) => <Icon name={STATUSES[type].icon} color={colors.custom.white} />}
      limit={3}
      pauseOnFocusLoss={false}
      position="bottom-left"
      newestOnTop
      style={{ bottom: "3rem" }}
      {...props}
    />
  );
};

const STATUSES: { [key in TypeOptions]: { color: string; icon: IconName } } = {
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
      border: "none",
      color: colors.custom.white,
      "&-body": {
        display: "flex",
        alignItems: "center",
        fontFamily: "Roboto",
        fontSize: "1.1em",
        fontWeight: 400,
        whiteSpace: "break-spaces",
      },
      "&-icon": { marginRight: "1em" },
      "&--default": { backgroundColor: STATUSES.default.color },
      "&--error": { backgroundColor: STATUSES.error.color },
      "&--info": { backgroundColor: STATUSES.info.color },
      "&--success": { backgroundColor: STATUSES.success.color },
      "&--warning": { backgroundColor: STATUSES.warning.color },
      "& .Toastify__close-button": {
        margin: 0,
        lineHeight: 1,
        color: colors.custom.lightGrey,
        "&:hover": {
          backgroundColor: "transparent",
          color: colors.custom.red,
        },
      },
    },
  },
});
