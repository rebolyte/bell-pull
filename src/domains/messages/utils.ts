import { MessageModel } from "./schema.ts";
import { LLMMessageParam } from "../../services/llm.ts";

/**
 * Format chat history for Anthropic API
 */
export function formatChatHistoryForAI(history: MessageModel[]) {
  const messages: LLMMessageParam[] = [];

  for (const msg of history) {
    if (msg.isBot) {
      messages.push({
        role: "assistant",
        content: msg.message,
      });
    } else {
      // Format user message with sender name
      messages.push({
        role: "user",
        content: `${msg.senderName} says: ${msg.message}`,
      });
    }
  }

  return messages;
}

/**
 * Analyze a Telegram message and extract memories from it
 */
async function analyzeMessageContent(
  anthropic,
  username,
  messageText,
  chatHistory = [],
) {
  try {
    // Get relevant memories
    const memories = await getRelevantMemories();
    const memoriesText = formatMemoriesForPrompt(memories);

    // Prepare formatted chat history
    const formattedHistory = chatHistory.length > 0 ? formatChatHistoryForAI(chatHistory) : [];

    console.log({ systemPrompt, formattedHistory });

    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-latest",
      max_tokens: 4196,
      system: systemPrompt,
      messages: formattedHistory,
    });

    // Get the text response
    const responseText = response.content[0].text;

    console.log({ responseText });

    // Parse the response, extracting memories if present
    try {
      // Check if there are memories to create, edit, or delete
      const createMemoryMatch = responseText.match(
        /<createMemories>([\s\S]*?)<\/createMemories>/,
      );
      const editMemoryMatch = responseText.match(
        /<editMemories>([\s\S]*?)<\/editMemories>/,
      );
      const deleteMemoryMatch = responseText.match(
        /<deleteMemories>([\s\S]*?)<\/deleteMemories>/,
      );

      let cleanedResponse = responseText;
      let memories = [];
      let editMemories = [];
      let deleteMemories = [];

      // Parse created memories
      if (createMemoryMatch) {
        cleanedResponse = cleanedResponse
          .replace(/<createMemories>[\s\S]*?<\/createMemories>/, "")
          .trim();

        try {
          memories = JSON.parse(createMemoryMatch[1]);
        } catch (e) {
          console.error("Error parsing created memories JSON:", e);
        }
      }

      // Parse edited memories
      if (editMemoryMatch) {
        cleanedResponse = cleanedResponse
          .replace(/<editMemories>[\s\S]*?<\/editMemories>/, "")
          .trim();

        try {
          editMemories = JSON.parse(editMemoryMatch[1]);
        } catch (e) {
          console.error("Error parsing edited memories JSON:", e);
        }
      }

      // Parse deleted memories
      if (deleteMemoryMatch) {
        cleanedResponse = cleanedResponse
          .replace(/<deleteMemories>[\s\S]*?<\/deleteMemories>/, "")
          .trim();

        try {
          deleteMemories = JSON.parse(deleteMemoryMatch[1]);
        } catch (e) {
          console.error("Error parsing deleted memories JSON:", e);
        }
      }

      // Handle any trailing/leading newlines that might be left after removing the tags
      cleanedResponse = cleanedResponse.replace(/\n{3,}/g, "\n\n"); // Replace 3+ consecutive newlines with 2

      return {
        memories: memories,
        editMemories: editMemories,
        deleteMemories: deleteMemories,
        response: cleanedResponse,
      };
    } catch (error) {
      console.error("Error processing AI response:", error);
      return {
        memories: [],
        editMemories: [],
        deleteMemories: [],
        response: responseText ||
          "I apologize, but I'm unable to process your request at the moment.",
      };
    }
  } catch (error) {
    console.error("Message analysis error:", error);
    return {
      memories: [],
      editMemories: [],
      deleteMemories: [],
      response: "I apologize, but I seem to be experiencing some difficulty at the moment.",
    };
  }
}
