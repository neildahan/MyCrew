import type { ToolDefinition } from "@/lib/ai/types";

// ─── Web Search ───────────────────────────────────────────────────
export const webSearchDefinition: ToolDefinition = {
  name: "web_search",
  description:
    "Search the web using Google. Use this to find current information, prices, business info, news, or anything that requires up-to-date data. Returns top search results with titles, snippets, and links.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query (e.g., 'best restaurants in Tel Aviv', 'USD to ILS exchange rate')",
      },
      num_results: {
        type: "number",
        description: "Number of results to return (default 5, max 10)",
      },
    },
    required: ["query"],
  },
};

export async function webSearchExecutor(
  args: Record<string, unknown>
): Promise<unknown> {
  const query = args.query as string;
  const numResults = Math.min((args.num_results as number) || 5, 10);

  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

  if (!apiKey || !searchEngineId) {
    // Fallback: use a simple scrape approach if no API key
    return await webSearchFallback(query, numResults);
  }

  const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}&num=${numResults}`;

  const res = await fetch(url);
  if (!res.ok) {
    // Fallback if API fails
    return await webSearchFallback(query, numResults);
  }

  const data = await res.json();
  const results = (data.items || []).map((item: any) => ({
    title: item.title,
    snippet: item.snippet,
    link: item.link,
  }));

  return {
    query,
    results,
    count: results.length,
  };
}

// Fallback: use Google search via scraping
async function webSearchFallback(
  query: string,
  numResults: number
): Promise<unknown> {
  try {
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${numResults}&hl=en`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9,he;q=0.8",
      },
    });

    if (!res.ok) {
      return { query, results: [], error: `Search returned HTTP ${res.status}` };
    }

    const html = await res.text();

    // Parse Google search results
    const results: Array<{ title: string; snippet: string; link: string }> = [];

    // Match result blocks - Google wraps results in <div class="g">
    const blockRegex = /<div class="g"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi;
    const blocks = html.match(blockRegex) || [];

    for (const block of blocks) {
      if (results.length >= numResults) break;

      // Extract link
      const linkMatch = block.match(/<a[^>]*href="(https?:\/\/[^"]*)"[^>]*>/);
      // Extract title
      const titleMatch = block.match(/<h3[^>]*>(.*?)<\/h3>/);
      // Extract snippet
      const snippetMatch = block.match(
        /data-sncf="[^"]*"[^>]*>([\s\S]*?)<\/(?:span|div)>/
      ) || block.match(/<span class="[^"]*">([\s\S]*?)<\/span>/);

      if (linkMatch && titleMatch) {
        const link = linkMatch[1];
        const title = titleMatch[1].replace(/<[^>]*>/g, "").trim();
        const snippet = snippetMatch
          ? snippetMatch[1].replace(/<[^>]*>/g, "").trim()
          : "";

        // Skip Google's own links
        if (!link.includes("google.com/search") && !link.includes("accounts.google")) {
          results.push({ title, snippet, link });
        }
      }
    }

    // If regex parsing failed, try a simpler approach
    if (results.length === 0) {
      // Extract all URLs that look like real results
      const simpleRegex = /<a[^>]*href="(https?:\/\/(?!www\.google)[^"]+)"[^>]*>[\s\S]*?<h3[^>]*>(.*?)<\/h3>/gi;
      let match;
      while ((match = simpleRegex.exec(html)) !== null && results.length < numResults) {
        results.push({
          title: match[2].replace(/<[^>]*>/g, "").trim(),
          snippet: "",
          link: match[1],
        });
      }
    }

    return { query, results, count: results.length };
  } catch (error: any) {
    return {
      query,
      results: [],
      error: `Search failed: ${error?.message || "unknown"}`,
    };
  }
}

// ─── Web Fetch / Browse ───────────────────────────────────────────
export const webFetchDefinition: ToolDefinition = {
  name: "web_fetch",
  description:
    "Fetch and read the content of a specific web page. Use this when you have a URL and need to read its content. Returns the page text (stripped of HTML). Good for reading articles, menus, product pages, etc.",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The full URL to fetch (e.g., 'https://example.com/page')",
      },
    },
    required: ["url"],
  },
};

export async function webFetchExecutor(
  args: Record<string, unknown>
): Promise<unknown> {
  const url = args.url as string;

  if (!url || !url.startsWith("http")) {
    return { error: "Invalid URL. Must start with http:// or https://" };
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "MyCrew Bot/1.0",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!res.ok) {
      return { error: `Failed to fetch: HTTP ${res.status}`, url };
    }

    const contentType = res.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const json = await res.json();
      return {
        url,
        type: "json",
        content: JSON.stringify(json).substring(0, 5000),
      };
    }

    const html = await res.text();

    // Strip HTML to get text content
    const text = htmlToText(html);

    // Truncate to avoid token overflow
    const truncated = text.substring(0, 5000);

    return {
      url,
      type: "html",
      title: extractTitle(html),
      content: truncated,
      truncated: text.length > 5000,
    };
  } catch (error: any) {
    return {
      error: `Failed to fetch URL: ${error?.message || "unknown"}`,
      url,
    };
  }
}

function htmlToText(html: string): string {
  return html
    // Remove script and style blocks
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    // Convert line breaks
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    // Remove remaining tags
    .replace(/<[^>]*>/g, "")
    // Decode HTML entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    // Clean up whitespace
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>(.*?)<\/title>/i);
  return match ? match[1].trim() : "";
}
