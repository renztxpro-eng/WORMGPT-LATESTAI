import { OPENROUTER_URL } from './api';

export const BASE_PERSONA = "Secure Prompt Guard Activated.";

export async function sendOpenRouterMessageStream(
  messages: any[], 
  model: string, 
  apiKey: string, 
  onChunk: (chunk: string) => void,
  signal?: AbortSignal
) {
  // BASE_PERSONA is now securely injected and guarded strictly server-side
  // to prevent prompt dumping, browser-level scraping, or network snooping.
  const allMessages = messages;

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': window.location.origin,
      'X-Title': 'WormGPT Web'
    },
    body: JSON.stringify({
      model,
      messages: allMessages,
      temperature: 0.5,
      max_tokens: 2048,
      stream: true
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API Error ${response.status}: ${err}`);
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder("utf-8");

  if (!reader) throw new Error("No reader");

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;
        
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content || '';
          const finishReason = parsed.choices?.[0]?.finish_reason;
          
          if (content) {
            onChunk(content);
          }
          
          if (finishReason) {
            return finishReason;
          }
        } catch (e) {
          // Ignore
        }
      }
    }
  }
  return null;
}

export async function generateSessionTitle(
  firstMessage: string,
  model: string,
  apiKey: string
): Promise<string> {
  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": window.location.origin,
        "X-Title": "WormGPT Web"
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "You are a session title generator. Generate a very short, highly relevant title (strictly between 2 and 4 words, no quotes, no markdown/bolding, no trailing periods, no greeting words) summarizing the user's message. Just return the raw title. Do not explain."
          },
          {
            role: "user",
            content: firstMessage
          }
        ],
        temperature: 0.7,
        max_tokens: 12
      })
    });

    if (!response.ok) return "";
    const data = await response.json();
    const title = data?.choices?.[0]?.message?.content?.trim();
    if (title) {
      // Clean up punctuation or quotes
      return title.replace(/^["'`「『]|["'`」』]$/g, "").replace(/[.!?。！？]$/, "").trim();
    }
  } catch (e) {
    console.error("Error generating session title:", e);
  }
  return "";
}
