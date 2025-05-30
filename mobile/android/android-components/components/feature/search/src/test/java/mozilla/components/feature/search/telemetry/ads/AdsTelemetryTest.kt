/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.search.telemetry.ads

import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.runBlocking
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.concept.engine.Engine
import mozilla.components.feature.search.telemetry.ExtensionInfo
import mozilla.components.feature.search.telemetry.SearchProviderCookie
import mozilla.components.feature.search.telemetry.SearchProviderModel
import mozilla.components.feature.search.telemetry.ads.AdsTelemetry.Companion.ADS_EXTENSION_ID
import mozilla.components.feature.search.telemetry.ads.AdsTelemetry.Companion.ADS_EXTENSION_RESOURCE_URL
import mozilla.components.feature.search.telemetry.ads.AdsTelemetry.Companion.ADS_MESSAGE_COOKIES_KEY
import mozilla.components.feature.search.telemetry.ads.AdsTelemetry.Companion.ADS_MESSAGE_DOCUMENT_URLS_KEY
import mozilla.components.feature.search.telemetry.ads.AdsTelemetry.Companion.ADS_MESSAGE_ID
import mozilla.components.feature.search.telemetry.ads.AdsTelemetry.Companion.ADS_MESSAGE_SESSION_URL_KEY
import mozilla.components.support.base.Component
import mozilla.components.support.base.facts.Action
import mozilla.components.support.base.facts.Fact
import mozilla.components.support.base.facts.FactProcessor
import mozilla.components.support.base.facts.Facts
import mozilla.components.support.test.any
import mozilla.components.support.test.argumentCaptor
import mozilla.components.support.test.eq
import mozilla.components.support.test.mock
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mockito.doNothing
import org.mockito.Mockito.spy
import org.mockito.Mockito.verify

@RunWith(AndroidJUnit4::class)
class AdsTelemetryTest {
    private lateinit var telemetry: AdsTelemetry

    fun createMockProviderList(): List<SearchProviderModel> = listOf(
        SearchProviderModel(
            schema = 1671479978127,
            taggedCodes = listOf("monline_7_dg", "monline_4_dg", "monline_3_dg", "monline_dg"),
            telemetryId = "baidu",
            organicCodes = emptyList(),
            codeParamName = "tn",
            followOnParamNames = listOf("oq"),
            queryParamNames = listOf("wd", "word"),
            searchPageRegexp = "^https://(?:m|www)\\.baidu\\.com/(?:s|baidu)",
            extraAdServersRegexps = listOf("^https?://www\\.baidu\\.com/baidu\\.php?"),
            expectedOrganicCodes = emptyList(),
        ),
        SearchProviderModel(
            schema = 1671479978127,
            taggedCodes = listOf("firefox-b-m", "fpas", "lm"),
            telemetryId = "duckduckgo",
            organicCodes = emptyList(),
            codeParamName = "t",
            queryParamNames = listOf("q"),
            searchPageRegexp = "^https:\\/\\/duckduckgo\\.com\\/",
            extraAdServersRegexps = listOf("^https://duckduckgo.com/y\\.js?.*ad_provider\\="),
            expectedOrganicCodes = emptyList(),
        ),
        SearchProviderModel(
            schema = 1671479978127,
            taggedCodes = listOf("firefox-b-m", "fpas", "def"),
            telemetryId = "google",
            organicCodes = emptyList(),
            codeParamName = "client",
            followOnParamNames = listOf("oq", "ved", "ei"),
            queryParamNames = listOf("q"),
            searchPageRegexp = "^https://www\\.google\\.(?:.+)/search",
            extraAdServersRegexps = listOf("^https?://www\\.google(?:adservices)?\\.com/(?:pagead/)?aclk"),
            expectedOrganicCodes = emptyList(),
        ),
        SearchProviderModel(
            schema = 1671479978127,
            taggedCodes = listOf("MOZMBA", "MOZL", "def"),
            telemetryId = "bing",
            organicCodes = emptyList(),
            codeParamName = "pc",
            queryParamNames = listOf("q"),
            searchPageRegexp = "^https://www\\.bing\\.com/search",
            extraAdServersRegexps = listOf("^https://www\\.bing\\.com/acli?c?k"),
            followOnCookies = listOf(
                SearchProviderCookie(
                    extraCodeParamName = "form",
                    extraCodePrefixes = listOf("QBRE"),
                    host = "www.bing.com",
                    name = "SRCHS",
                    codeParamName = "PC",
                ),
            ),
            expectedOrganicCodes = emptyList(),
        ),
    )

    @Before
    fun setUp() {
        telemetry = spy(AdsTelemetry())
    }

    @Test
    fun `WHEN installWebExtension is called THEN install a properly configured extension`() {
        val engine: Engine = mock()
        val store: BrowserStore = mock()
        val extensionCaptor = argumentCaptor<ExtensionInfo>()

        runBlocking {
            doNothing().`when`(telemetry).setProviderList(any())
            telemetry.install(engine, store, mock())
        }

        verify(telemetry).installWebExtension(eq(engine), eq(store), extensionCaptor.capture())
        assertEquals(ADS_EXTENSION_ID, extensionCaptor.value.id)
        assertEquals(ADS_EXTENSION_RESOURCE_URL, extensionCaptor.value.resourceUrl)
        assertEquals(ADS_MESSAGE_ID, extensionCaptor.value.messageId)
    }

    @Test
    fun `WHEN checkIfAddWasClicked is called with a null session URL THEN don't emit a Fact`() {
        val facts = mutableListOf<Fact>()
        Facts.registerProcessor(
            object : FactProcessor {
                override fun process(fact: Fact) {
                    facts.add(fact)
                }
            },
        )

        telemetry.checkIfAddWasClicked(null, listOf())

        assertTrue(facts.isEmpty())
    }

    @Test
    fun `GIVEN no ads in the redirect path WHEN checkIfAddWasClicked is called THEN don't emit a Fact`() {
        val sessionUrl = "https://www.google.com/search?q=aaa"
        val facts = mutableListOf<Fact>()
        Facts.registerProcessor(
            object : FactProcessor {
                override fun process(fact: Fact) {
                    facts.add(fact)
                }
            },
        )

        telemetry.checkIfAddWasClicked(sessionUrl, listOf("https://www.aaa.com"))

        assertTrue(facts.isEmpty())
    }

    @Test
    fun `GIVEN ads are in the redirect path WHEN checkIfAddWasClicked is called THEN emit an appropriate SERP_ADD_CLICKED Fact`() {
        val sessionUrl = "https://www.google.com/search?q=aaa"
        telemetry.providerList = createMockProviderList()
        val facts = mutableListOf<Fact>()
        Facts.registerProcessor(
            object : FactProcessor {
                override fun process(fact: Fact) {
                    facts.add(fact)
                }
            },
        )

        telemetry.checkIfAddWasClicked(
            sessionUrl,
            listOf("https://www.google.com/aclk", "https://www.aaa.com"),
        )

        assertEquals(1, facts.size)
        assertEquals(Component.FEATURE_SEARCH, facts[0].component)
        assertEquals(Action.INTERACTION, facts[0].action)
        assertEquals(AdsTelemetry.SERP_ADD_CLICKED, facts[0].item)
        assertEquals("google.in-content.organic.none", facts[0].value)
    }

    @Test
    fun `GIVEN a message containing ad links from the extension WHEN processMessage is called THEN track a SERP_SHOWN_WITH_ADDS Fact`() {
        val first = "https://www.google.com/aclk"
        val second = "https://www.google.com/aaa"
        val urls = JSONArray()
        urls.put(first)
        urls.put(second)
        val cookies = JSONArray()
        val message = JSONObject()
        message.put(ADS_MESSAGE_DOCUMENT_URLS_KEY, urls)
        message.put(ADS_MESSAGE_SESSION_URL_KEY, "https://www.google.com/search?q=aaa")
        message.put(ADS_MESSAGE_COOKIES_KEY, cookies)
        telemetry.providerList = createMockProviderList()
        val facts = mutableListOf<Fact>()
        Facts.registerProcessor(
            object : FactProcessor {
                override fun process(fact: Fact) {
                    facts.add(fact)
                }
            },
        )

        telemetry.processMessage(message)

        assertEquals(1, facts.size)
        assertEquals(Component.FEATURE_SEARCH, facts[0].component)
        assertEquals(Action.INTERACTION, facts[0].action)
        assertEquals(AdsTelemetry.SERP_SHOWN_WITH_ADDS, facts[0].item)
        assertEquals("google.in-content.organic.none", facts[0].value)
    }

    @Test
    fun `GIVEN a message not containing ad links from the extension WHEN processMessage is called THEN don't emit any Fact`() {
        val first = "https://www.google.com/aaaaaa"
        val second = "https://www.google.com/aaa"
        val urls = JSONArray()
        urls.put(first)
        urls.put(second)
        val cookies = JSONArray()
        val message = JSONObject()
        message.put(ADS_MESSAGE_DOCUMENT_URLS_KEY, urls)
        message.put(ADS_MESSAGE_SESSION_URL_KEY, "https://www.google.com/search?q=aaa")
        message.put(ADS_MESSAGE_COOKIES_KEY, cookies)
        val facts = mutableListOf<Fact>()
        Facts.registerProcessor(
            object : FactProcessor {
                override fun process(fact: Fact) {
                    facts.add(fact)
                }
            },
        )

        telemetry.processMessage(message)

        assertTrue(facts.isEmpty())
    }

    @Test
    fun `GIVEN a Bing sap-follow-on with cookies WHEN checkIfAddWasClicked is called THEN emit an appropriate SERP_ADD_CLICKED Fact`() {
        val url = "https://www.bing.com/search?q=aaa&form=QBRERANDOM"
        telemetry.providerList = createMockProviderList()
        telemetry.cachedCookies = createCookieList()
        val facts = mutableListOf<Fact>()
        Facts.registerProcessor(
            object : FactProcessor {
                override fun process(fact: Fact) {
                    facts.add(fact)
                }
            },
        )

        telemetry.checkIfAddWasClicked(url, listOf("https://www.bing.com/aclik", "https://www.aaa.com"))

        assertEquals(1, facts.size)
        assertEquals(Component.FEATURE_SEARCH, facts[0].component)
        assertEquals(Action.INTERACTION, facts[0].action)
        assertEquals(AdsTelemetry.SERP_ADD_CLICKED, facts[0].item)
        assertEquals("bing.in-content.sap-follow-on.mozl", facts[0].value)
    }

    private fun createCookieList(): List<JSONObject> {
        val first = JSONObject()
        first.put("name", "SRCHS")
        first.put("value", "PC=MOZL&ANOTHER=VALUE")
        val second = JSONObject()
        second.put("name", "RANDOM")
        second.put("value", "RANDOM")
        return listOf(first, second)
    }
}
