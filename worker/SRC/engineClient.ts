// worker/src/engineClient.ts

import { config } from "./config";


const callEngine = async (
  endpoint: string,
  payload: any
) => {
  const url = `${config.ENGINE_URL}${endpoint}`;

  const controller =
    new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    10000
  );

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(
        `Engine error ${res.status}`
      );
    }

    const data = await res.json();

    return data;
  } catch (err: any) {
    throw err;
  }
};


export const processMessage =
  async (payload: any) => {
    return callEngine(
      "/process",
      payload
    );
  };


export const processAI =
  async (payload: any) => {
    return callEngine(
      "/process",
      payload
    );
  };
