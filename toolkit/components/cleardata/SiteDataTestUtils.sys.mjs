/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";
import { BrowserTestUtils } from "resource://testing-common/BrowserTestUtils.sys.mjs";
import { ContentTaskUtils } from "resource://testing-common/ContentTaskUtils.sys.mjs";

const lazy = {};

XPCOMUtils.defineLazyServiceGetter(
  lazy,
  "swm",
  "@mozilla.org/serviceworkers/manager;1",
  "nsIServiceWorkerManager"
);

/**
 * This module assists with tasks around testing functionality that shows
 * or clears site data.
 *
 * Please note that you will have to clean up changes made manually, for
 * example using SiteDataTestUtils.clear().
 */
export var SiteDataTestUtils = {
  /**
   * Makes an origin have persistent data storage.
   *
   * @param {String} origin - the origin of the site to give persistent storage
   *
   * @returns a Promise that resolves when storage was persisted
   */
  persist(origin, value = Services.perms.ALLOW_ACTION) {
    return new Promise(resolve => {
      let principal =
        Services.scriptSecurityManager.createContentPrincipalFromOrigin(origin);
      Services.perms.addFromPrincipal(principal, "persistent-storage", value);
      Services.qms.persist(principal).callback = () => resolve();
    });
  },

  /**
   * Adds a new blob entry to a dummy indexedDB database for the specified origin.
   *
   * @param {String} origin - the origin of the site to add test data for
   * @param {Number} size [optional] - the size of the entry in bytes
   *
   * @returns a Promise that resolves when the data was added successfully.
   */
  addToIndexedDB(origin, size = 1024) {
    return new Promise(resolve => {
      let principal =
        Services.scriptSecurityManager.createContentPrincipalFromOrigin(origin);
      let request = indexedDB.openForPrincipal(principal, "TestDatabase", 1);
      request.onupgradeneeded = function (e) {
        let db = e.target.result;
        db.createObjectStore("TestStore");
      };
      request.onsuccess = function (e) {
        let db = e.target.result;
        let tx = db.transaction("TestStore", "readwrite");
        let store = tx.objectStore("TestStore");
        tx.oncomplete = resolve;
        let buffer = new ArrayBuffer(size);
        let blob = new Blob([buffer]);
        store.add(blob, Cu.now());
      };
    });
  },

  /**
   * Adds a new cookie for the specified origin or host + path + oa, with the
   * specified contents. The cookie will be valid for one day.
   * @param {object} options
   * @param {String} [options.origin] - Origin of the site to add test data for.
   * If set, overrides host, path and originAttributes args.
   * @param {String} [options.host] - Host of the site to add test data for.
   * @param {String} [options.path] - Path to set cookie for.
   * @param {Object} [options.originAttributes] - Object of origin attributes to
   * set cookie for.
   * @param {String} [options.name] - Cookie name
   * @param {String} [options.value] - Cookie value
   */
  addToCookies({
    origin,
    host,
    path = "path",
    originAttributes = {},
    name = "foo",
    value = "bar",
  }) {
    if (origin) {
      let principal =
        Services.scriptSecurityManager.createContentPrincipalFromOrigin(origin);
      host = principal.host;
      path = principal.URI.pathQueryRef;
      originAttributes = Object.keys(originAttributes).length
        ? originAttributes
        : principal.originAttributes;
    }

    const cv = Services.cookies.add(
      host,
      path,
      name,
      value,
      false,
      false,
      false,
      Date.now() + 24 * 60 * 60 * 1000,
      originAttributes,
      Ci.nsICookie.SAMESITE_UNSET,
      Ci.nsICookie.SCHEME_UNSET
    );
    if (cv.result !== Ci.nsICookieValidation.eOK) {
      throw new Error(`Invalid cookie: ${cv.result}`);
    }
  },

  /**
   * Adds a new localStorage entry for the specified origin, with the specified
   * contents.
   *
   * This method requires the pref dom.storage.client_validation=false in order
   * to access LS without a window.
   *
   * @param {String} origin - the origin of the site to add test data for
   * @param {String} [key] - the localStorage key
   * @param {String} [value] - the localStorage value
   */
  addToLocalStorage(origin, key = "foo", value = "bar") {
    let principal =
      Services.scriptSecurityManager.createContentPrincipalFromOrigin(origin);
    let storage = Services.domStorageManager.createStorage(
      null,
      principal,
      principal,
      ""
    );
    storage.setItem(key, value);
  },

  /**
   * Checks whether the given origin is storing data in localStorage
   *
   * @param {String} origin - the origin of the site to check
   * @param {{key: String, value: String}[]} [testEntries] - An array of entries
   * to test for.
   *
   * This method requires the pref dom.storage.client_validation=false in order
   * to access LS without a window.
   *
   * @returns {Boolean} whether the origin has localStorage data
   */
  hasLocalStorage(origin, testEntries) {
    let principal =
      Services.scriptSecurityManager.createContentPrincipalFromOrigin(origin);
    let storage = Services.domStorageManager.createStorage(
      null,
      principal,
      principal,
      ""
    );
    if (!storage.length) {
      return false;
    }
    if (!testEntries) {
      return true;
    }
    return (
      storage.length >= testEntries.length &&
      testEntries.every(({ key, value }) => storage.getItem(key) == value)
    );
  },

  /**
   * Adds a new serviceworker with the specified path. Note that this method
   * will open a new tab at the domain of the SW path to that effect.
   *
   * @param {Object} options
   * @param {Window} options.win - The window to open the tab in where the SW is
   * registered.
   * @param {String} options.path - the path to the service worker to add.
   * @param {String} [options.topLevelPath] - If specified this path will be
   * used for the top level and the service worker will be registered in a frame
   * with 'path'. If omitted the service worker gets registered in the top level
   * (tab).
   * @param {Number} [options.userContextId] - User context to register the
   * service worker in. By default this targets the default user context (no
   * container).
   *
   * @returns a Promise that resolves when the service worker has been
   * registered
   */
  async addServiceWorker({
    win,
    path,
    topLevelPath = null,
    userContextId = undefined,
  }) {
    let uriTopLevel = Services.io.newURI(topLevelPath ?? path);

    // Open a new tab to load the page with the service worker.
    let tab = win.gBrowser.addTab(uriTopLevel.prePath, {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      userContextId,
    });
    win.gBrowser.selectedTab = tab;
    let browser = tab.linkedBrowser;
    await BrowserTestUtils.browserLoaded(
      browser,
      false,
      uriTopLevel.prePath + "/"
    );

    let registrationBrowsingContext = browser.browsingContext;

    let { SpecialPowers } = browser.ownerGlobal;

    // If caller requested a partitioned service worker create an iframe to
    // register the SW in.
    if (topLevelPath) {
      let uriIframe = topLevelPath ? Services.io.newURI(path) : null;
      registrationBrowsingContext = await SpecialPowers.spawn(
        browser,
        [uriIframe.prePath],
        async uriPrePath => {
          // eslint-disable-next-line no-undef
          let iframe = content.document.createElement("iframe");
          iframe.src = uriPrePath;
          // eslint-disable-next-line no-undef
          content.document.body.appendChild(iframe);
          // Wait for it to load.
          await ContentTaskUtils.waitForEvent(iframe, "load");

          return iframe.browsingContext;
        }
      );
    }

    // SW registration call.
    await SpecialPowers.spawn(
      registrationBrowsingContext,
      [{ path }],
      async ({ path: p }) => {
        // eslint-disable-next-line no-undef
        let r = await content.navigator.serviceWorker.register(p);
        return new Promise(resolve => {
          let worker = r.installing || r.waiting || r.active;
          if (worker.state == "activated") {
            resolve();
          } else {
            worker.addEventListener("statechange", () => {
              if (worker.state == "activated") {
                resolve();
              }
            });
          }
        });
      }
    );

    // Clean up the temporary tab.
    BrowserTestUtils.removeTab(tab);
  },

  hasCookies(origin, testEntries = null, testPBMCookies = false) {
    let principal =
      Services.scriptSecurityManager.createContentPrincipalFromOrigin(origin);

    let originAttributes = principal.originAttributes;

    if (testPBMCookies) {
      // Override the origin attributes to set PBM.
      // This needs to be updated when adding support for multiple PBM contexts.
      originAttributes = {
        ...principal.originAttributes,
        privateBrowsingId: 1,
      };
    }
    // Need to do an additional filter step since getCookiesFromHost returns all
    // cookies for the base domain (including subdomains). This method takes an
    // origin so we need to do an exact host match.
    let cookies = Services.cookies
      .getCookiesFromHost(principal.baseDomain, originAttributes)
      .filter(
        cookie =>
          cookie.host == principal.host || cookie.host == `.${principal.host}`
      );

    // If we don't have to filter specific testEntries we can return now.
    if (!testEntries) {
      return !!cookies.length;
    }

    // Check if the returned cookies match testEntries.
    if (cookies.length < testEntries.length) {
      return false;
    }

    // This code isn't very efficient. It should only be used for testing
    // a small amount of cookies.
    return testEntries.every(({ key, value }) =>
      cookies.some(cookie => cookie.name == key && cookie.value == value)
    );
  },

  hasIndexedDB(origin) {
    let principal =
      Services.scriptSecurityManager.createContentPrincipalFromOrigin(origin);
    return new Promise(resolve => {
      let data = true;
      let request = indexedDB.openForPrincipal(principal, "TestDatabase", 1);
      request.onupgradeneeded = function () {
        data = false;
      };
      request.onsuccess = function () {
        resolve(data);
      };
    });
  },

  _getCacheStorage(where, lci) {
    switch (where) {
      case "disk":
        return Services.cache2.diskCacheStorage(lci);
      case "memory":
        return Services.cache2.memoryCacheStorage(lci);
      case "pin":
        return Services.cache2.pinningCacheStorage(lci);
    }
    return null;
  },

  hasCacheEntry(path, where, lci = Services.loadContextInfo.default) {
    let storage = this._getCacheStorage(where, lci);
    return storage.exists(Services.io.newURI(path), "");
  },

  addCacheEntry(path, where, lci = Services.loadContextInfo.default) {
    return new Promise(resolve => {
      function CacheListener() {}
      CacheListener.prototype = {
        QueryInterface: ChromeUtils.generateQI(["nsICacheEntryOpenCallback"]),

        onCacheEntryCheck() {
          return Ci.nsICacheEntryOpenCallback.ENTRY_WANTED;
        },

        onCacheEntryAvailable() {
          resolve();
        },
      };

      let storage = this._getCacheStorage(where, lci);
      storage.asyncOpenURI(
        Services.io.newURI(path),
        "",
        Ci.nsICacheStorage.OPEN_NORMALLY,
        new CacheListener()
      );
    });
  },

  /**
   * Checks whether the specified origin has registered ServiceWorkers.
   *
   * @param {String} origin - the origin of the site to check, excluding the
   * OriginAttributes suffix.
   *
   * @returns {Boolean} whether or not the site has ServiceWorkers.
   */
  hasServiceWorkers(origin) {
    let serviceWorkers = lazy.swm.getAllRegistrations();
    for (let i = 0; i < serviceWorkers.length; i++) {
      let sw = serviceWorkers.queryElementAt(
        i,
        Ci.nsIServiceWorkerRegistrationInfo
      );
      if (sw.principal.originNoSuffix == origin) {
        return true;
      }
    }
    return false;
  },

  /**
   * Waits for a ServiceWorker to be registered.
   *
   * @param {String} the url of the ServiceWorker to wait for
   *
   * @returns a Promise that resolves when a ServiceWorker at the
   *          specified location has been registered.
   */
  promiseServiceWorkerRegistered(url) {
    if (!(url instanceof Ci.nsIURI)) {
      url = Services.io.newURI(url);
    }

    return new Promise(resolve => {
      let listener = {
        onRegister: registration => {
          if (registration.principal.host != url.host) {
            return;
          }
          lazy.swm.removeListener(listener);
          resolve(registration);
        },
      };
      lazy.swm.addListener(listener);
    });
  },

  /**
   * Waits for a ServiceWorker to be unregistered.
   *
   * @param {String} the url of the ServiceWorker to wait for
   *
   * @returns a Promise that resolves when a ServiceWorker at the
   *          specified location has been unregistered.
   */
  promiseServiceWorkerUnregistered(url) {
    if (!(url instanceof Ci.nsIURI)) {
      url = Services.io.newURI(url);
    }

    return new Promise(resolve => {
      let listener = {
        onUnregister: registration => {
          if (registration.principal.host != url.host) {
            return;
          }
          lazy.swm.removeListener(listener);
          resolve(registration);
        },
      };
      lazy.swm.addListener(listener);
    });
  },

  /**
   * Gets the current quota usage for the specified origin.
   *
   * @returns a Promise that resolves to an integer with the total
   *          amount of disk usage by a given origin.
   */
  getQuotaUsage(origin) {
    return new Promise(resolve => {
      let principal =
        Services.scriptSecurityManager.createContentPrincipalFromOrigin(origin);
      Services.qms.getUsageForPrincipal(principal, request =>
        resolve(request.result.usage)
      );
    });
  },

  /**
   * Cleans up all site data.
   */
  clear() {
    return new Promise(resolve => {
      Services.clearData.deleteData(
        Ci.nsIClearDataService.CLEAR_COOKIES |
          Ci.nsIClearDataService.CLEAR_ALL_CACHES |
          Ci.nsIClearDataService.CLEAR_MEDIA_DEVICES |
          Ci.nsIClearDataService.CLEAR_DOM_STORAGES |
          Ci.nsIClearDataService.CLEAR_PREDICTOR_NETWORK_DATA |
          Ci.nsIClearDataService.CLEAR_CLIENT_AUTH_REMEMBER_SERVICE |
          Ci.nsIClearDataService.CLEAR_EME |
          Ci.nsIClearDataService.CLEAR_STORAGE_ACCESS |
          Ci.nsIClearDataService.CLEAR_COOKIE_BANNER_EXCEPTION |
          Ci.nsIClearDataService.CLEAR_COOKIE_BANNER_EXECUTED_RECORD |
          Ci.nsIClearDataService.CLEAR_FINGERPRINTING_PROTECTION_STATE |
          Ci.nsIClearDataService.CLEAR_BOUNCE_TRACKING_PROTECTION_STATE,
        resolve
      );
    });
  },
};
