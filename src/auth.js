// Microsoft Entra (Azure AD) authentication via MSAL.js.
//
// Per the project's "no vendoring cloud SDKs" rule, MSAL is loaded lazily
// from Microsoft's official CDN at runtime so it can evolve with the cloud.
// The service worker's same-origin filter lets cross-origin requests
// (alcdn.msftauth.net, graph.microsoft.com, login.microsoftonline.com) pass
// through without caching.

const AUTH_CLIENT_ID = "39d8afca-f47b-43cb-b962-0803f556520f";
const AUTHORITY = "https://login.microsoftonline.com/common";
// Minimum scopes: AppFolder for sandboxed storage, offline_access for refresh
// tokens. ID token alone supplies the email we show in the drawer, so we
// don't request User.Read.
export const SCOPES = ["Files.ReadWrite.AppFolder", "offline_access"];

// Microsoft's own CDN (alcdn.msftauth.net) only hosts MSAL v2; MSAL v3 ships
// via npm. Use jsDelivr as the primary mirror, with unpkg as fallback in case
// the primary is blocked from the user's network.
const MSAL_VERSION = "3.27.0";
const MSAL_URLS = [
  `https://cdn.jsdelivr.net/npm/@azure/msal-browser@${MSAL_VERSION}/lib/msal-browser.min.js`,
  `https://unpkg.com/@azure/msal-browser@${MSAL_VERSION}/lib/msal-browser.min.js`,
];

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
    let lastError = null;
    for (const url of MSAL_URLS) {
      try {
        await loadScript(url);
        if (window.msal) return window.msal;
        lastError = new Error("MSAL loaded but global not exposed");
      } catch (error) {
        lastError = error;
      }
    }
    msalLoadPromise = null;
    throw new Error(
      `无法加载 Microsoft 登录脚本，请检查网络（${lastError?.message ?? "unknown"})`,
    );
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
