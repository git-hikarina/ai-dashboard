import OpenAI from "openai";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;
const BATCH_SIZE = 100; // OpenAI APIのバッチ上限

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

/**
 * テキスト配列をバッチでエンベディング化する。
 * 100件ずつAPIに送信。
 */
export async function generateEmbeddings(
  texts: string[],
): Promise<number[][]> {
  const openai = getClient();
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
      dimensions: EMBEDDING_DIMENSIONS,
    });
    for (const item of response.data) {
      allEmbeddings.push(item.embedding);
    }
  }

  return allEmbeddings;
}

/**
 * 単一テキストをエンベディング化する（チャット時のクエリ用）。
 */
export async function generateQueryEmbedding(
  text: string,
): Promise<number[]> {
  const [embedding] = await generateEmbeddings([text]);
  return embedding;
}

export { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS };
