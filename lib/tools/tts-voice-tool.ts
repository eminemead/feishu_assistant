/**
 * TTS Voice Tool - Text-to-Speech for Feishu Voice Messages
 *
 * Uses mlx-audio (local Apple Silicon TTS) to generate voice messages
 * and sends them via Feishu's audio message API.
 *
 * Requirements:
 * - mlx-audio installed in ~/.venv (uv pip install mlx-audio)
 * - Apple Silicon Mac (M1/M2/M3)
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { execSync, spawn } from "child_process";
import { client } from "../feishu-utils";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Python venv path - adjust if different
const VENV_PATH = path.join(os.homedir(), ".venv");
const PYTHON_BIN = path.join(VENV_PATH, "bin", "python");

// Default TTS model and voice
const DEFAULT_MODEL = "prince-canuma/Kokoro-82M";
const DEFAULT_VOICE = "af_heart"; // American female, warm voice

/**
 * Check if mlx-audio is available
 */
function checkMlxAudioAvailable(): boolean {
  try {
    execSync(
      `${PYTHON_BIN} -c "from mlx_audio.tts.generate import generate_audio"`,
      { stdio: "ignore" }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Pre-download the TTS model (call once to cache the model)
 * This avoids download delays during actual TTS generation.
 * 
 * Usage: await preloadTtsModel()
 */
export async function preloadTtsModel(model: string = DEFAULT_MODEL): Promise<boolean> {
  console.log(`[TTS] Pre-loading model: ${model}`);
  
  const pythonScript = `
import os
os.environ['TOKENIZERS_PARALLELISM'] = 'false'
from mlx_audio.tts.utils import load_model
print('Loading model...')
model = load_model("${model}")
print('Model loaded successfully')
`;

  return new Promise((resolve) => {
    const proc = spawn(PYTHON_BIN, ["-c", pythonScript], {
      env: { ...process.env, TOKENIZERS_PARALLELISM: "false" },
      stdio: "inherit",
    });

    proc.on("close", (code) => {
      if (code === 0) {
        console.log(`[TTS] ✅ Model pre-loaded: ${model}`);
        resolve(true);
      } else {
        console.error(`[TTS] ❌ Failed to pre-load model`);
        resolve(false);
      }
    });

    proc.on("error", () => {
      resolve(false);
    });
  });
}

/**
 * Generate audio file using mlx-audio
 */
async function generateTtsAudio(
  text: string,
  outputPath: string,
  options: {
    voice?: string;
    speed?: number;
    model?: string;
  } = {}
): Promise<void> {
  const { voice = DEFAULT_VOICE, speed = 1.0, model = DEFAULT_MODEL } = options;

  // Escape text for Python string
  const escapedText = text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");

  const pythonScript = `
import os
os.environ['TOKENIZERS_PARALLELISM'] = 'false'
from mlx_audio.tts.generate import generate_audio

generate_audio(
    text="${escapedText}",
    model_path="${model}",
    voice="${voice}",
    speed=${speed},
    file_prefix="${outputPath.replace(".wav", "")}",
    audio_format="wav",
    join_audio=True,
    verbose=False
)
`;

  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON_BIN, ["-c", pythonScript], {
      env: { ...process.env, TOKENIZERS_PARALLELISM: "false" },
    });

    let stderr = "";
    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`TTS generation failed: ${stderr}`));
      } else {
        resolve();
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn Python process: ${err.message}`));
    });
  });
}

/**
 * Convert WAV to Opus format (required for Feishu audio messages)
 * Feishu only accepts: opus, mp4 for audio - not raw WAV
 */
async function convertToOpus(
  wavPath: string,
  opusPath: string
): Promise<string> {
  try {
    execSync(`ffmpeg -i "${wavPath}" -c:a libopus -b:a 64k "${opusPath}" -y 2>/dev/null`, {
      stdio: "ignore",
    });
    return opusPath;
  } catch {
    throw new Error("ffmpeg required to convert WAV to Opus. Install with: brew install ffmpeg");
  }
}

/**
 * Upload audio file to Feishu
 * 
 * Feishu im.v1.file.create supports: opus, mp4, pdf, doc, xls, ppt, stream
 * For audio messages, use opus or mp4 (wav needs conversion)
 */
async function uploadAudioToFeishu(
  audioPath: string,
  fileName: string,
  durationMs?: number
): Promise<string> {
  const audioBuffer = fs.readFileSync(audioPath);
  const isOpus = audioPath.endsWith(".opus");

  // Feishu file upload for audio
  // API: https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/file/create
  const resp = await client.im.v1.file.create({
    data: {
      file_type: isOpus ? "opus" : "mp4",
      file_name: fileName,
      file: audioBuffer,
      duration: durationMs, // duration in ms for audio/video
    },
  });

  if (!resp?.file_key) {
    throw new Error(`Failed to upload audio: ${JSON.stringify(resp)}`);
  }

  return resp.file_key;
}

/**
 * Send audio message in Feishu
 */
async function sendAudioMessage(
  chatId: string,
  fileKey: string,
  duration?: number
): Promise<string> {
  const resp = await client.im.message.create({
    params: {
      receive_id_type: "chat_id",
    },
    data: {
      receive_id: chatId,
      msg_type: "audio",
      content: JSON.stringify({
        file_key: fileKey,
        duration: duration, // duration in milliseconds (optional)
      }),
    },
  });

  const isSuccess = resp.code === 0 || resp.code === undefined;
  if (!isSuccess || !resp.data?.message_id) {
    throw new Error(`Failed to send audio message: ${JSON.stringify(resp)}`);
  }

  return resp.data.message_id;
}

/**
 * TTS Voice Tool Schema
 */
const ttsVoiceInputSchema = z.object({
  text: z
    .string()
    .min(1)
    .max(5000)
    .describe("Text to convert to speech (max 5000 chars)"),
  chatId: z.string().describe("Feishu chat ID to send the voice message to"),
  voice: z
    .string()
    .optional()
    .default(DEFAULT_VOICE)
    .describe(
      "Voice ID (default: af_heart). Options: af_heart, af_bella, am_adam, am_michael"
    ),
  speed: z
    .number()
    .min(0.5)
    .max(2.0)
    .optional()
    .default(1.0)
    .describe("Speech speed (0.5-2.0, default: 1.0)"),
});

/**
 * Create TTS Voice Tool
 */
export function createTtsVoiceTool(enableCache: boolean = true) {
  return createTool({
    id: "send_voice_message",
    description: `Convert text to speech and send as a voice message in Feishu.
Uses local mlx-audio TTS (Apple Silicon optimized).
Good for: announcements, summaries, accessibility, personal touch.
Max text length: 5000 characters.`,
    inputSchema: ttsVoiceInputSchema,
    execute: async (input, execContext) => {
      if (execContext?.abortSignal?.aborted) {
        return { success: false, error: "Aborted" };
      }

      const { text, chatId, voice, speed } = input;

      console.log(
        `[TTS] Generating voice message: ${text.slice(0, 50)}... (${text.length} chars)`
      );

      // Check mlx-audio availability
      if (!checkMlxAudioAvailable()) {
        return {
          success: false,
          error:
            "mlx-audio not available. Install with: uv pip install mlx-audio",
        };
      }

      const tmpDir = os.tmpdir();
      const timestamp = Date.now();
      const wavPath = path.join(tmpDir, `tts_${timestamp}.wav`);
      const opusPath = path.join(tmpDir, `tts_${timestamp}.opus`);

      try {
        // Generate audio
        console.log(`[TTS] Generating audio with voice=${voice}, speed=${speed}`);
        await generateTtsAudio(text, wavPath, { voice, speed });

        // Verify file was created
        if (!fs.existsSync(wavPath)) {
          throw new Error("Audio file was not created");
        }

        // Get audio duration (approximate based on file size)
        const stats = fs.statSync(wavPath);
        const durationMs = Math.round((stats.size / 48000) * 1000); // rough estimate

        // Convert to opus if possible
        const finalPath = await convertToOpus(wavPath, opusPath);
        const fileName = path.basename(finalPath);

        // Upload to Feishu
        console.log(`[TTS] Uploading audio to Feishu...`);
        const fileKey = await uploadAudioToFeishu(finalPath, fileName, durationMs);

        // Send audio message
        console.log(`[TTS] Sending audio message to chat ${chatId}...`);
        const messageId = await sendAudioMessage(chatId, fileKey, durationMs);

        // Cleanup temp files
        try {
          if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
          if (fs.existsSync(opusPath)) fs.unlinkSync(opusPath);
        } catch {
          // Ignore cleanup errors
        }

        console.log(`[TTS] ✅ Voice message sent: ${messageId}`);
        return {
          success: true,
          messageId,
          duration: durationMs,
        };
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : String(error);
        console.error(`[TTS] ❌ Error:`, errorMsg);

        // Cleanup on error
        try {
          if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
          if (fs.existsSync(opusPath)) fs.unlinkSync(opusPath);
        } catch {
          // Ignore cleanup errors
        }

        return {
          success: false,
          error: errorMsg,
        };
      }
    },
  });
}

/**
 * Pre-configured TTS Voice Tool instance
 */
export const ttsVoiceTool = createTtsVoiceTool(true);
