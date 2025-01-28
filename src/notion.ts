import { Client } from "@notionhq/client";
const notion = new Client({ auth: process.env.NOTION_API_KEY });
export const databaseId_tech = 'a410d9bb9cc14df58a703e73bc03151b';
export const databaseId_life = '188883f79f1e80958e2be2e2336455c3';
import { NotionToMarkdown } from "notion-to-md";
import { marked } from "marked";

export type notion_blog_item = {
  page_id: string,
  title: string,
  pubDate: Date,
  tags: string[],
};

const n2m = new NotionToMarkdown({ notionClient: notion });

export async function getAllPublishedNotionBlogItem(databaseId: string): Promise<notion_blog_item[]> {
  try {
    const response = await notion.databases.query({
      database_id: databaseId as string,
      filter: {
        property: "status",
        select: {
          equals: "Published",
        },
      },
      sorts: [
        {
          property: "date",
          direction: "descending",
        },
      ],
    });
    const items = response.results.map((page: any) => ({
      page_id: page.id,
      title: page.properties.title.title[0].plain_text,
      pubDate: new Date(page.properties.date.date.start),
      tags: page.properties.tags.multi_select.map((tag: any) => tag.name as string),
    }));
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
  const parsedContent = await marked.parse(mdString.parent);
  return parsedContent;
}