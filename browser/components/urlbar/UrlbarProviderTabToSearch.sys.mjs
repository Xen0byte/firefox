/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This module exports a provider that offers a search engine when the user is
 * typing a search engine domain.
 */

import {
  UrlbarProvider,
  UrlbarUtils,
} from "resource:///modules/UrlbarUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  ActionsProviderContextualSearch:
    "resource:///modules/ActionsProviderContextualSearch.sys.mjs",
  UrlbarView: "resource:///modules/UrlbarView.sys.mjs",
  UrlbarPrefs: "resource:///modules/UrlbarPrefs.sys.mjs",
  UrlbarProviderAutofill: "resource:///modules/UrlbarProviderAutofill.sys.mjs",
  UrlbarProviderGlobalActions:
    "resource:///modules/UrlbarProviderGlobalActions.sys.mjs",
  UrlbarResult: "resource:///modules/UrlbarResult.sys.mjs",
  UrlbarSearchUtils: "resource:///modules/UrlbarSearchUtils.sys.mjs",
  UrlbarTokenizer: "resource:///modules/UrlbarTokenizer.sys.mjs",
});

const DYNAMIC_RESULT_TYPE = "onboardTabToSearch";
const VIEW_TEMPLATE = {
  attributes: {
    selectable: true,
  },
  children: [
    {
      name: "no-wrap",
      tag: "span",
      classList: ["urlbarView-no-wrap"],
      children: [
        {
          name: "icon",
          tag: "img",
          classList: ["urlbarView-favicon"],
        },
        {
          name: "text-container",
          tag: "span",
          children: [
            {
              name: "first-row-container",
              tag: "span",
              children: [
                {
                  name: "title",
                  tag: "span",
                  classList: ["urlbarView-title"],
                  children: [
                    {
                      name: "titleStrong",
                      tag: "strong",
                    },
                  ],
                },
                {
                  name: "title-separator",
                  tag: "span",
                  classList: ["urlbarView-title-separator"],
                },
                {
                  name: "action",
                  tag: "span",
                  classList: ["urlbarView-action"],
                  attributes: {
                    "slide-in": true,
                  },
                },
              ],
            },
            {
              name: "description",
              tag: "span",
            },
          ],
        },
      ],
    },
  ],
};

/**
 * Initializes this provider's dynamic result. To be called after the creation
 *  of the provider singleton.
 */
function initializeDynamicResult() {
  lazy.UrlbarResult.addDynamicResultType(DYNAMIC_RESULT_TYPE);
  lazy.UrlbarView.addDynamicViewTemplate(DYNAMIC_RESULT_TYPE, VIEW_TEMPLATE);
}

/**
 * Class used to create the provider.
 */
class ProviderTabToSearch extends UrlbarProvider {
  constructor() {
    super();
  }

  /**
   * Returns the name of this provider.
   *
   * @returns {string} the name of this provider.
   */
  get name() {
    return "TabToSearch";
  }

  /**
   * @returns {Values<typeof UrlbarUtils.PROVIDER_TYPE>}
   */
  get type() {
    return UrlbarUtils.PROVIDER_TYPE.PROFILE;
  }

  /**
   * Whether this provider should be invoked for the given context.
   * If this method returns false, the providers manager won't start a query
   * with this provider, to save on resources.
   *
   * @param {UrlbarQueryContext} queryContext The query context object
   */
  async isActive(queryContext) {
    return (
      queryContext.searchString &&
      queryContext.tokens.length == 1 &&
      !queryContext.searchMode &&
      lazy.UrlbarPrefs.get("suggest.engines") &&
      !(
        (await lazy.UrlbarProviderGlobalActions.isActive(queryContext)) &&
        lazy.ActionsProviderContextualSearch.isActive(queryContext)
      )
    );
  }

  /**
   * Gets the provider's priority.
   *
   * @returns {number} The provider's priority for the given query.
   */
  getPriority() {
    return 0;
  }

  /**
   * This is called only for dynamic result types, when the urlbar view updates
   * the view of one of the results of the provider.  It should return an object
   * describing the view update.
   *
   * @param {UrlbarResult} result The result whose view will be updated.
   * @returns {object} An object describing the view update.
   */
  getViewUpdate(result) {
    return {
      icon: {
        attributes: {
          src: result.payload.icon,
        },
      },
      titleStrong: {
        l10n: {
          id: "urlbar-result-action-search-w-engine",
          args: {
            engine: result.payload.engine,
          },
        },
      },
      action: {
        l10n: {
          id: result.payload.isGeneralPurposeEngine
            ? "urlbar-result-action-tabtosearch-web"
            : "urlbar-result-action-tabtosearch-other-engine",
          args: {
            engine: result.payload.engine,
          },
        },
      },
      description: {
        l10n: {
          id: "urlbar-tabtosearch-onboard",
        },
      },
    };
  }

  /**
   * Called when a result from the provider is selected. "Selected" refers to
   * the user highlighing the result with the arrow keys/Tab, before it is
   * picked. onSelection is also called when a user clicks a result. In the
   * event of a click, onSelection is called just before onEngagement.
   *
   * @param {UrlbarResult} result
   *   The result that was selected.
   */
  onSelection(result) {
    // We keep track of the number of times the user interacts with
    // tab-to-search onboarding results so we stop showing them after
    // `tabToSearch.onboard.interactionsLeft` interactions.
    // Also do not increment the counter if the result was interacted with less
    // than 5 minutes ago. This is a guard against the user running up the
    // counter by interacting with the same result repeatedly.
    if (
      result.payload.dynamicType &&
      (!this.onboardingInteractionAtTime ||
        this.onboardingInteractionAtTime < Date.now() - 1000 * 60 * 5)
    ) {
      let interactionsLeft = lazy.UrlbarPrefs.get(
        "tabToSearch.onboard.interactionsLeft"
      );

      if (interactionsLeft > 0) {
        lazy.UrlbarPrefs.set(
          "tabToSearch.onboard.interactionsLeft",
          --interactionsLeft
        );
      }

      this.onboardingInteractionAtTime = Date.now();
    }
  }

  onEngagement(queryContext, controller, details) {
    let { result, element } = details;
    if (result.type == UrlbarUtils.RESULT_TYPE.DYNAMIC) {
      // Confirm search mode, but only for the onboarding (dynamic) result. The
      // input will handle confirming search mode for the non-onboarding
      // `RESULT_TYPE.SEARCH` result since it sets `providesSearchMode`.
      element.ownerGlobal.gURLBar.maybeConfirmSearchModeFromResult({
        result,
        checkValue: false,
      });
    }
  }

  /**
   * Defines whether the view should defer user selection events while waiting
   * for the first result from this provider.
   *
   * @returns {boolean} Whether the provider wants to defer user selection
   *          events.
   */
  get deferUserSelection() {
    return true;
  }

  /**
   * Starts querying.
   *
   * @param {object} queryContext The query context object
   * @param {Function} addCallback Callback invoked by the provider to add a new
   *        result.
   * @returns {Promise} resolved when the query stops.
   */
  async startQuery(queryContext, addCallback) {
    // enginesForDomainPrefix only matches against engine domains.
    // Remove trailing slashes and www. from the search string and check if the
    // resulting string is worth matching.
    let [searchStr] = UrlbarUtils.stripPrefixAndTrim(
      queryContext.searchString,
      {
        stripWww: true,
        trimSlash: true,
      }
    );
    // Skip any string that cannot be an origin.
    if (
      !lazy.UrlbarTokenizer.looksLikeOrigin(searchStr, {
        ignoreKnownDomains: true,
        noIp: true,
      })
    ) {
      return;
    }

    // Also remove the public suffix, if present, to allow for partial matches.
    if (searchStr.includes(".")) {
      searchStr = UrlbarUtils.stripPublicSuffixFromHost(searchStr);
    }

    // Add all matching engines.
    let engines = await lazy.UrlbarSearchUtils.enginesForDomainPrefix(
      searchStr,
      {
        matchAllDomainLevels: true,
      }
    );
    if (!engines.length) {
      return;
    }

    const onboardingInteractionsLeft = lazy.UrlbarPrefs.get(
      "tabToSearch.onboard.interactionsLeft"
    );

    // If the engine host begins with the search string, autofill may happen
    // for it, and the Muxer will retain the result only if there's a matching
    // autofill heuristic result.
    // Otherwise, we may have a partial match, where the search string is at
    // the boundary of a host part, for example "wiki" in "en.wikipedia.org".
    // We put those engines apart, and later we check if their host satisfies
    // the autofill threshold. If they do, we mark them with the
    // "satisfiesAutofillThreshold" payload property, so the muxer can avoid
    // filtering them out.
    let partialMatchEnginesByHost = new Map();

    for (let engine of engines) {
      // Trim the engine host. This will also be set as the result url, so the
      // Muxer can use it to filter.
      let [host] = UrlbarUtils.stripPrefixAndTrim(engine.searchUrlDomain, {
        stripWww: true,
      });
      // Check if the host may be autofilled.
      if (host.startsWith(searchStr.toLocaleLowerCase())) {
        if (onboardingInteractionsLeft > 0) {
          addCallback(this, makeOnboardingResult(engine));
        } else {
          addCallback(this, makeResult(queryContext, engine));
        }
        continue;
      }

      // Otherwise it may be a partial match that would not be autofilled.
      if (host.includes("." + searchStr.toLocaleLowerCase())) {
        partialMatchEnginesByHost.set(engine.searchUrlDomain, engine);
        // Don't continue here, we are looking for more partial matches.
      }
      // We also try to match the base domain of the searchUrlDomain,
      // because otherwise for an engine like rakuten, we'd check pt.afl.rakuten.co.jp
      // which redirects and is thus not saved in the history resulting in a low score.

      let baseDomain = Services.eTLD.getBaseDomainFromHost(
        engine.searchUrlDomain
      );
      if (baseDomain.startsWith(searchStr)) {
        partialMatchEnginesByHost.set(baseDomain, engine);
      }
    }
    if (partialMatchEnginesByHost.size) {
      let host = await lazy.UrlbarProviderAutofill.getTopHostOverThreshold(
        queryContext,
        Array.from(partialMatchEnginesByHost.keys())
      );
      if (host) {
        let engine = partialMatchEnginesByHost.get(host);
        if (onboardingInteractionsLeft > 0) {
          addCallback(this, makeOnboardingResult(engine, true));
        } else {
          addCallback(this, makeResult(queryContext, engine, true));
        }
      }
    }
  }
}

function makeOnboardingResult(engine, satisfiesAutofillThreshold = false) {
  let result = new lazy.UrlbarResult(
    UrlbarUtils.RESULT_TYPE.DYNAMIC,
    UrlbarUtils.RESULT_SOURCE.SEARCH,
    {
      engine: engine.name,
      searchUrlDomainWithoutSuffix: searchUrlDomainWithoutSuffix(engine),
      providesSearchMode: true,
      icon: UrlbarUtils.ICON.SEARCH_GLASS,
      dynamicType: DYNAMIC_RESULT_TYPE,
      satisfiesAutofillThreshold,
    }
  );
  result.resultSpan = 2;
  result.suggestedIndex = 1;
  return result;
}

function makeResult(context, engine, satisfiesAutofillThreshold = false) {
  let result = new lazy.UrlbarResult(
    UrlbarUtils.RESULT_TYPE.SEARCH,
    UrlbarUtils.RESULT_SOURCE.SEARCH,
    ...lazy.UrlbarResult.payloadAndSimpleHighlights(context.tokens, {
      engine: engine.name,
      isGeneralPurposeEngine: engine.isGeneralPurposeEngine,
      searchUrlDomainWithoutSuffix: searchUrlDomainWithoutSuffix(engine),
      providesSearchMode: true,
      icon: UrlbarUtils.ICON.SEARCH_GLASS,
      query: "",
      satisfiesAutofillThreshold,
    })
  );
  result.suggestedIndex = 1;
  return result;
}

function searchUrlDomainWithoutSuffix(engine) {
  let [value] = UrlbarUtils.stripPrefixAndTrim(engine.searchUrlDomain, {
    stripWww: true,
  });
  return value.substr(0, value.length - engine.searchUrlPublicSuffix.length);
}

export var UrlbarProviderTabToSearch = new ProviderTabToSearch();
initializeDynamicResult();
