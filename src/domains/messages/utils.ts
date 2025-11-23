/**
 * Format chat history for Anthropic API
 */
function formatChatHistoryForAI(history) {
  const messages = [];

  for (const msg of history) {
    if (msg.is_bot) {
      messages.push({
        role: "assistant",
        content: msg.message,
      });
    } else {
      // Format user message with sender name
      messages.push({
        role: "user",
        content: `${msg.sender_name} says: ${msg.message}`,
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

    // Prepare system prompt with all instructions and memories
    const systemPrompt = `${backstory}

Your job is to read this Telegram message from your employer and respond in a natural, butler-like way, noting any important information that should be remembered for future reference.

You have access to the following stored memories:

${memoriesText}

If this appears to be a new client or the conversation is in an early stage, you should conduct an intake interview to gather essential background information. First ask the client if now is a good time to ask them some questions.

Ask about the following topics in a conversational way (not all at once, but continuing the interview naturally based on their responses):

Initial Information:
- Who are the family members living in the home and their ages?
- Names of close family members and their relationships to the client?

Daily Life:
- Which grocery stores and local restaurants they frequent?
- Family members' food preferences and any dietary restrictions?
- Typical working hours and recurring commitments?
- Important dates (birthdays, anniversaries, holidays)?
- Monthly bills and subscriptions that need tracking?
- Emergency contacts and regular service providers?
- Current health goals and any medication reminders needed?

Your goal is to collect this information naturally through conversation and store it as memories (as undated memories). Once you've gathered sufficient background information, you can conclude the intake process and transition to normal reactive chat.

If the conversation is already past the intake stage, then analyze the message content and think about which memories might be worth creating based on the information provided.

You should respond in a natural conversational way. You have three options for managing memories:

1. CREATE memories: Include them in <createMemories> tags in JSON format.
2. EDIT memories: Include them in <editMemories> tags in JSON format (must include memory ID).
3. DELETE memories: Include them in <deleteMemories> tags in JSON format (just include memory IDs).

Example response WITHOUT memory modification:
"Very good, sir. I shall make a note of that."

Example response WITH memory creation:
"I've noted that you prefer Earl Grey tea in the morning, sir.

<createMemories>
[{ "text": "Client prefers Earl Grey tea in the morning.", "date": null }]
</createMemories>"

Example response WITH memory editing:
"I've updated your birthday in my records, sir.

<editMemories>
[{ "id": "abc123", "text": "Client's birthday is on April 15th.", "date": "2024-04-15" }]
</editMemories>"

Example response WITH memory deletion:
"I've removed that note from my records as requested, sir.

<deleteMemories>
["abc123"]
</deleteMemories>"

Important guidelines for memory management:
1. For new memories, set a date for each memory whenever possible.
2. The date should be the actual date of the event. You don't need to set reminder dates in advance.
3. Keep the memory text concise: ideally one short sentence, but include all important details.
4. Extract any dates mentioned and convert them to ISO format. If the year isn't mentioned, assume the current year.
5. If no date is relevant to the memory, set "date" to null.
6. For editing or deleting memories, you MUST include the correct memory ID from the displayed memories. Each memory is displayed with its ID in the format "[ID: xyz123]".
7. If no memories need to be managed, simply respond naturally WITHOUT including any memory tags.
8. When a user asks to delete a memory, you must find its ID from the memory list above and include that ID in the deleteMemories tag.
9. Do not create duplicate memories. If a memory already exists, do not record the same information again.

Your response style:
- Use a brief, natural-sounding tone characteristic of a personal assistant
- Be slightly dignified but sound modern, not too stuffy or old-fashioned
- Keep responses brief (1-2 sentences)
- Vary your responses to avoid sounding robotic
- Be polite and deferential
- Avoid contractions (use "do not" instead of "don't")

Today's date is ${
      DateTime.now()
        .setZone("America/New_York")
        .toFormat("yyyy-MM-dd")
    }`;

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
