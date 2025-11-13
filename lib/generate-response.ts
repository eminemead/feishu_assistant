import { createOpenRouter } from "@openrouter/ai-sdk-js";
import { CoreMessage, generateText, tool } from "ai";
import { z } from "zod";
import { exa } from "./utils";

export const generateResponse = async (
  messages: CoreMessage[],
  updateStatus?: (status: string) => void,
) => {
  const openrouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
  });

  const { text } = await generateText({
    model: openrouter("openai/gpt-4o"),
    system: `You are a Feishu/Lark AI assistant. Keep your responses concise and to the point.
    - Do not tag users.
    - Current date is: ${new Date().toISOString().split("T")[0]}
    - Make sure to ALWAYS include sources in your final response if you use web search. Put sources inline if possible.
    - Format your responses using Markdown syntax, which will be rendered in Feishu cards.`,
    messages,
    maxSteps: 10,
    tools: {
      getWeather: tool({
        description: "Get the current weather at a location",
        parameters: z.object({
          latitude: z.number(),
          longitude: z.number(),
          city: z.string(),
        }),
        execute: async ({ latitude, longitude, city }) => {
          updateStatus?.(`Getting weather for ${city}...`);

          const response = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weathercode,relativehumidity_2m&timezone=auto`,
          );

          const weatherData = await response.json();
          return {
            temperature: weatherData.current.temperature_2m,
            weatherCode: weatherData.current.weathercode,
            humidity: weatherData.current.relativehumidity_2m,
            city,
          };
        },
      }),
      searchWeb: tool({
        description: "Use this to search the web for information",
        parameters: z.object({
          query: z.string(),
          specificDomain: z
            .string()
            .nullable()
            .describe(
              "a domain to search if the user specifies e.g. bbc.com. Should be only the domain name without the protocol",
            ),
        }),
        execute: async ({ query, specificDomain }) => {
          updateStatus?.(`Searching the web for ${query}...`);
          const { results } = await exa.searchAndContents(query, {
            livecrawl: "always",
            numResults: 3,
            includeDomains: specificDomain ? [specificDomain] : undefined,
          });

          return {
            results: results.map((result) => ({
              title: result.title,
              url: result.url,
              snippet: result.text.slice(0, 1000),
            })),
          };
        },
      }),
    },
  });

  // Feishu cards support Markdown natively, so we can keep markdown format
  // Just ensure links are properly formatted for Feishu markdown
  // Feishu markdown uses [text](url) format which is standard
  return text;
};
