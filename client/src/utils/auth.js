class Auth {
    constructor() {
        localStorage.setItem("isAuthenticated", this.getStatus() ?? false);
    }

    getStatus() {
        return JSON.parse(localStorage.getItem("isAuthenticated"));
    }

    async login(formData) {
        try {
            let res = await(await fetch("/api/user/login", { method: "POST", body: formData ?? {} })).json();
            this.setStatus(res.success);
            return res;
        } catch (e) { console.error(e.message); return false; }
    }

    localLogout() {
        this.setStatus(false);
        window.location.reload();
    }

    async logout() {
        try {
            let res = await(await fetch("/api/user/logout", { method: "DELETE" })).json();
            if (res.success) { this.setStatus(false); }
            return res;
        } catch (e) { console.error(e.message); return false; }
    }

    async register(formData) {
        try {
            let res = await(await fetch("/api/user/register", { method: "POST", body: formData })).json();
            this.setStatus(res.success);
            return res;
        } catch (e) { console.error(e.message); return false; }
    }

    setStatus(status) {
        localStorage.setItem("isAuthenticated", status);
    }
}

export default new Auth();