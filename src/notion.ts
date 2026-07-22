import { Client } from "@notionhq/client";
const notion = new Client({ auth: process.env.NOTION_API_KEY });
export const databaseId_tech = 'a410d9bb9cc14df58a703e73bc03151b';
export const databaseId_life = '188883f79f1e80958e2be2e2336455c3';
import { NotionToMarkdown } from "notion-to-md";
import { marked } from "marked";
import { codeToTokens } from "shiki";

export type notion_blog_item = {
  page_id: string,
  title: string,
  pubDate: Date,
  tags: string[],
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character] as string));
}

type TextRange = {
  start: number;
  end: number;
};

function getNotionCodeSource(block: any): { source: string; boldRanges: TextRange[] } {
  let source = "";
  const boldRanges: TextRange[] = [];

  for (const item of block.code.rich_text ?? []) {
    const start = source.length;
    source += item.plain_text;

    if (item.annotations.bold) {
      boldRanges.push({ start, end: source.length });
    }
  }

  return { source, boldRanges };
}

function renderHighlightedToken(
  content: string,
  offset: number,
  color: string | undefined,
  boldRanges: TextRange[],
): string {
  const end = offset + content.length;
  const boundaries = new Set([offset, end]);

  for (const range of boldRanges) {
    if (range.start > offset && range.start < end) boundaries.add(range.start);
    if (range.end > offset && range.end < end) boundaries.add(range.end);
  }

  const segments = [...boundaries].sort((left, right) => left - right);
  return segments.slice(0, -1).map((start, index) => {
    const finish = segments[index + 1];
    const text = escapeHtml(content.slice(start - offset, finish - offset));
    const isBold = boldRanges.some((range) => start >= range.start && finish <= range.end);
    const styledText = isBold ? `<strong>${text}</strong>` : text;
    const style = color ? ` style="color:${escapeHtml(color)}"` : "";
    return `<span${style}>${styledText}</span>`;
  }).join("");
}

async function renderNotionCodeBlock(block: any): Promise<string> {
  const { source, boldRanges } = getNotionCodeSource(block);
  const language = block.code.language === "plain text" ? "text" : block.code.language;

  try {
    const highlighted = await codeToTokens(source, {
      lang: language ?? "text",
      theme: "github-light",
    });
    const content = highlighted.tokens.map((line) => {
      const tokens = line.map((token) => renderHighlightedToken(
        token.content,
        token.offset,
        token.color,
        boldRanges,
      )).join("");
      return `<span class="line">${tokens}</span>`;
    }).join("\n");

    return `<pre class="shiki"><code>${content}</code></pre>`;
  } catch (error) {
    console.warn(`Unable to highlight Notion code block as ${language}:`, error);
    return `<pre><code>${escapeHtml(source)}</code></pre>`;
  }
}

function preserveBoldInlineCode(markdown: string): string {
  return markdown.replace(/\*\*(`[^`\n]+`)\*\*/g, "<strong>$1</strong>");
}

const n2m = new NotionToMarkdown({
  notionClient: notion,
  config: { convertImagesToBase64: true },
});
n2m.setCustomTransformer("code", renderNotionCodeBlock);
const publishedPostsCache = new Map<string, Promise<notion_blog_item[]>>();

export function getAllPublishedNotionBlogItem(databaseId: string): Promise<notion_blog_item[]> {
  const cachedPosts = publishedPostsCache.get(databaseId);
  if (cachedPosts) {
    return cachedPosts;
  }

  const request = fetchPublishedNotionBlogItems(databaseId);
  publishedPostsCache.set(databaseId, request);
  request.catch(() => publishedPostsCache.delete(databaseId));
  return request;
}

async function fetchPublishedNotionBlogItems(databaseId: string): Promise<notion_blog_item[]> {
  try {
    const response = await notion.databases.query({
      database_id: databaseId as string,
      filter: {
        and: [
          {
            property: "status",
            select: {
              equals: "Published",
            },
          },
          {
            property: "date",
            date: {
              is_not_empty: true,
            },
          },
        ],
      },
      sorts: [
        {
          property: "date",
          direction: "descending",
        },
      ],
    });
    const items = response.results.flatMap((page: any) => {
      const title = page.properties.title.title[0]?.plain_text;
      const date = page.properties.date.date?.start;

      if (!title || !date) {
        console.warn(`Skipping incomplete published Notion page: ${page.id}`);
        return [];
      }

      return [{
        page_id: page.id,
        title,
        pubDate: new Date(date),
        tags: page.properties.tags.multi_select.map((tag: any) => tag.name as string),
      }];
    });
    return items;
  } catch (error) {
    console.error("Error fetching blog posts from Notion:", error);
    throw error;
  }
}

export async function getNotionPage(id: string) {
  try {
    const response = await notion.pages.retrieve(
      { page_id: id }
    );
    return response;
  } catch (error) {
    console.error("Error fetching blog posts from Notion:", error);
    throw error;
  }
}

export async function getNotionPageContent(id: string) {
  const mdblocks = await n2m.pageToMarkdown(id);
  const mdString = n2m.toMarkdownString(mdblocks);
  // notion-to-md returns an empty object for empty or unsupported page blocks.
  const parsedContent = await marked.parse(preserveBoldInlineCode(mdString.parent ?? ""));
  return parsedContent;
}
