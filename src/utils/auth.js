import { toast } from "react-toastify";

export const fetchAuthed = async (apiPath, options) => {
  const res = await (
    await fetch(apiPath, {
      ...options,
      headers: {
        ...options?.headers,
        Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
      },
    })
  ).json();

  if (!res?.success) throw new Error(res?.success === false ? res.message : res);

  if (res?.refreshedAccessToken) localStorage.setItem("accessToken", res.refreshedAccessToken);

  return res;
};

export const handleErrors =
  (fn, { hasToast = false, isAuth = false, history } = {}) =>
  async (...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e.message === "Unauthorized access: Access level") return history?.push("/");

      const isAuthError = e.message.includes("Unauthorized access");

      if (isAuth && isAuthError) {
        localStorage.removeItem("accessToken");
        return history?.push("/login");
      }

      hasToast && !isAuthError ? toast.error(e.message) : console.error(e.message);

      return { success: false, message: e.message };
    }
  };

export const login = async ({ formData, accessToken } = {}) => {
  return await (
    await fetch("/api/user/login", {
      method: "POST",
      body: formData ?? {},
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    }).catch((e) => console.error(e.message))
  ).json();
};

export const logout = async () =>
  await (
    await fetch("/api/user/logout", { method: "DELETE" }).catch((e) => console.error(e.message))
  ).json();
