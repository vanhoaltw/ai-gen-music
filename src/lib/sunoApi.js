import axios, { AxiosInstance } from "axios";
import UserAgent from "user-agents";
import pino from "pino";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";
import { sleep } from "@/lib/utils";

export const DEFAULT_MODEL = "chirp-v3-5";
const logger = pino();

class SunoApi {
  static BASE_URL = "https://studio-api.prod.suno.com";
  static CLERK_BASE_URL = "https://clerk.suno.com";
  static JSDELIVR_BASE_URL = "https://data.jsdelivr.com";

  constructor(cookie) {
    const cookieJar = new CookieJar();
    const randomUserAgent = new UserAgent(/Chrome/).random().toString();
    this.client = wrapper(
      axios.create({
        jar: cookieJar,
        withCredentials: true,
        headers: {
          "User-Agent": randomUserAgent,
          Cookie: cookie,
        },
      })
    );
    this.client.interceptors.request.use((config) => {
      if (this.currentToken) {
        // Use the current token status
        config.headers["Authorization"] = `Bearer ${this.currentToken}`;
      }
      return config;
    });
  }

  async init() {
    await this.getClerkLatestVersion();
    await this.getAuthToken();
    await this.keepAlive();
    return this;
  }

  async getAuthToken() {
    // URL to get session ID
    const getSessionUrl = `${SunoApi.CLERK_BASE_URL}/v1/client?_clerk_js_version=${this.clerkVersion}`;
    // Get session ID
    const sessionResponse = await this.client.get(getSessionUrl);
    if (!sessionResponse?.data?.response?.["last_active_session_id"]) {
      throw new Error(
        "Failed to get session id, you may need to update the SUNO_COOKIE"
      );
    }
    // Save session ID for later use
    this.sid = sessionResponse.data.response["last_active_session_id"];
  }

  async getClerkLatestVersion() {
    // URL to get clerk version ID
    const getClerkVersionUrl = `${SunoApi.JSDELIVR_BASE_URL}/v1/package/npm/@clerk/clerk-js`;
    // Get clerk version ID
    const versionListResponse = await this.client.get(getClerkVersionUrl);
    if (!versionListResponse?.data?.["tags"]["latest"]) {
      throw new Error(
        "Failed to get clerk version info, Please try again later"
      );
    }
    // Save clerk version ID for auth
    // this.clerkVersion = versionListResponse?.data?.['tags']['latest'];
    // Use a Clerk version released before fraud detection was implemented
    this.clerkVersion = "5.34.0";
  }

  async generateSongs(
    prompt,
    isCustom,
    tags,
    title,
    make_instrumental,
    model,
    wait_audio = false,
    negative_tags
  ) {
    await this.keepAlive(false);
    const payload = {
      make_instrumental: make_instrumental,
      mv: model || DEFAULT_MODEL,
      prompt: "",
      generation_type: "TEXT",
    };
    if (isCustom) {
      payload.tags = tags;
      payload.title = title;
      payload.negative_tags = negative_tags;
      payload.prompt = prompt;
    } else {
      payload.gpt_description_prompt = prompt;
    }
    logger.info(
      "generateSongs payload:\n" +
        JSON.stringify(
          {
            prompt: prompt,
            isCustom: isCustom,
            tags: tags,
            title: title,
            make_instrumental: make_instrumental,
            wait_audio: wait_audio,
            negative_tags: negative_tags,
            payload: payload,
          },
          null,
          2
        )
    );
    const response = await this.client.post(
      `${SunoApi.BASE_URL}/api/generate/v2/`,
      payload,
      {
        timeout: 10000, // 10 seconds timeout
      }
    );
    logger.info(
      "generateSongs Response:\n" + JSON.stringify(response.data, null, 2)
    );
    if (response.status !== 200) {
      throw new Error("Error response:" + response.statusText);
    }
    const songIds = response.data["clips"].map((audio) => audio.id);
    //Want to wait for music file generation
    if (wait_audio) {
      const startTime = Date.now();
      let lastResponse = [];
      await sleep(5, 5);
      while (Date.now() - startTime < 100000) {
        const response = await this.get(songIds);
        const allCompleted = response.every(
          (audio) => audio.status === "streaming" || audio.status === "complete"
        );
        const allError = response.every((audio) => audio.status === "error");
        if (allCompleted || allError) {
          return response;
        }
        lastResponse = response;
        await sleep(3, 6);
        await this.keepAlive(true);
      }
      return lastResponse;
    } else {
      await this.keepAlive(true);
      return response.data["clips"].map((audio) => ({
        id: audio.id,
        title: audio.title,
        image_url: audio.image_url,
        lyric: audio.metadata.prompt,
        audio_url: audio.audio_url,
        video_url: audio.video_url,
        created_at: audio.created_at,
        model_name: audio.model_name,
        status: audio.status,
        gpt_description_prompt: audio.metadata.gpt_description_prompt,
        prompt: audio.metadata.prompt,
        type: audio.metadata.type,
        tags: audio.metadata.tags,
        negative_tags: audio.metadata.negative_tags,
        duration: audio.metadata.duration,
      }));
    }
  }

  async keepAlive(isWait) {
    if (!this.sid) {
      throw new Error("Session ID is not set. Cannot renew token.");
    }
    // URL to renew session token
    const renewUrl = `${SunoApi.CLERK_BASE_URL}/v1/client/sessions/${this.sid}/tokens?_clerk_js_version==${this.clerkVersion}`;
    // Renew session token
    const renewResponse = await this.client.post(renewUrl);
    logger.info("KeepAlive...\n");
    if (isWait) {
      await sleep(1, 2);
    }
    const newToken = renewResponse.data["jwt"];
    // Update Authorization field in request header with the new JWT token
    this.currentToken = newToken;
  }
}

const newSunoApi = async (cookie) => {
  const sunoApi = new SunoApi(cookie);
  return await sunoApi.init();
};

if (!process.env.SUNO_COOKIE) {
  console.log("Environment does not contain SUNO_COOKIE.", process.env);
}

export const sunoApi = newSunoApi(process.env.SUNO_COOKIE || "");
