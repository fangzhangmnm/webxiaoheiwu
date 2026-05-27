// Microsoft Entra (Azure AD) authentication via MSAL.js.
//
// MSAL is vendored at src/vendor/msal/msal-browser.min.js and loaded
// lazily on first sign-in attempt. Offline-first: precached by the service
// worker so the app can boot and sign in without network reachability to
// any CDN. Graph and login.microsoftonline.com itself still need the network
// at sign-in time; only the SDK shell is local.

const AUTH_CLIENT_ID = "39d8afca-f47b-43cb-b962-0803f556520f";
const AUTHORITY = "https://login.microsoftonline.com/common";
// Minimum scopes: AppFolder for sandboxed storage, offline_access for refresh
// tokens. ID token alone supplies the email we show in the drawer, so we
// don't request User.Read.
export const SCOPES = ["Files.ReadWrite.AppFolder", "offline_access"];

// Vendored MSAL v3.27.0 — see docs/msal-onedrive.md for the vendoring
// rationale. Resolved via import.meta.url so it works under any base path.
const MSAL_URL = new URL("./vendor/msal/msal-browser.min.js", import.meta.url).href;

let msalLoadPromise = null;
let pca = null;
let activeAccount = null;
let initPromise = null;

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = url;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`failed to load ${url}`));
    document.head.appendChild(s);
  });
}

function loadMsal() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("MSAL requires a browser context"));
  }
  if (window.msal) return Promise.resolve(window.msal);
  if (msalLoadPromise) return msalLoadPromise;
  msalLoadPromise = (async () => {
    try {
      await loadScript(MSAL_URL);
      if (window.msal) return window.msal;
      throw new Error("MSAL loaded but global not exposed");
    } catch (error) {
      msalLoadPromise = null;
      throw new Error(
        `无法加载 Microsoft 登录脚本（${error?.message ?? "unknown"})`,
      );
    }
  })();
  return msalLoadPromise;
}

export async function initializeAuth() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const msal = await loadMsal();
    pca = new msal.PublicClientApplication({
      auth: {
        clientId: AUTH_CLIENT_ID,
        authority: AUTHORITY,
        redirectUri: location.origin + location.pathname,
        postLogoutRedirectUri: location.origin + location.pathname,
      },
      cache: {
        cacheLocation: "localStorage",
        storeAuthStateInCookie: false,
      },
    });
    await pca.initialize();

    // Pick up any redirect callback (returning from sign-in or sign-out).
    let response = null;
    try {
      response = await pca.handleRedirectPromise();
    } catch (error) {
      console.warn("MSAL redirect handling failed:", error);
    }

    if (response?.account) {
      pca.setActiveAccount(response.account);
      activeAccount = response.account;
    } else {
      const cached = pca.getAllAccounts();
      if (cached.length > 0) {
        pca.setActiveAccount(cached[0]);
        activeAccount = cached[0];
      }
    }

    return { signedIn: !!activeAccount, account: activeAccount };
  })().catch((error) => {
    initPromise = null;
    throw error;
  });
  return initPromise;
}

export async function signIn() {
  if (!pca) await initializeAuth();
  return pca.loginRedirect({ scopes: SCOPES });
}

export async function signOut() {
  if (!pca || !activeAccount) return;
  const account = activeAccount;
  activeAccount = null;
  // Only drop this app's local MSAL cache — DO NOT call logoutRedirect,
  // which would also end the Microsoft session globally and log the user
  // out of their other tabs (Outlook, OneDrive web, etc.).
  try {
    await pca.clearCache({ account });
  } catch (error) {
    console.warn("clearCache failed:", error);
  }
  try {
    pca.setActiveAccount(null);
  } catch {
    // setActiveAccount may not exist in some MSAL versions; ignore.
  }
}

export async function getToken() {
  if (!pca || !activeAccount) {
    throw new Error("尚未登录 OneDrive");
  }
  try {
    const result = await pca.acquireTokenSilent({
      scopes: SCOPES,
      account: activeAccount,
    });
    return result.accessToken;
  } catch (silentError) {
    // Silent token acquisition failed; force interactive (redirect).
    await pca.acquireTokenRedirect({ scopes: SCOPES });
    throw silentError;
  }
}

export function getActiveAccount() {
  return activeAccount;
}

export function isSignedIn() {
  return !!activeAccount;
}
