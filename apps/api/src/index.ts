import { loadConfig } from "./config";
import { HuggingFaceCaptionProvider } from "./providers/huggingface";
import { buildServer } from "./server";

const config = loadConfig(process.env);
const provider = new HuggingFaceCaptionProvider(config.HF_TOKEN);

await buildServer(provider).listen({ host: config.HOST, port: config.PORT });
