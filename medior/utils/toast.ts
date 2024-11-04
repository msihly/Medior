import { ReactNode } from "react";
import { toast, TypeOptions } from "react-toastify";

export class Toaster {
  private toastTimeoutRef = null;
  private toastRef = null;

  public toast(text: ReactNode, options?: { autoClose?: number | false; type?: TypeOptions }) {
    const autoClose = options?.autoClose === false ? false : options?.autoClose || 1000;
    clearTimeout(this.toastTimeoutRef);
    if (autoClose) this.toastTimeoutRef = setTimeout(() => (this.toastRef = null), autoClose);
    if (this.toastRef)
      toast.update(this.toastRef, { autoClose, render: text, type: options?.type });
    else this.toastRef = toast(() => text, { autoClose, type: options?.type || "info" });
  }
}
