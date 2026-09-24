import {
  isProviderError,
  runIntakeOcrEvaluation,
  settingsFromEnvironment,
} from "./modules/inventory/intake/recognition/evaluation.js";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}

const manifestPath = argument("--manifest");
const provider = argument("--provider");
const detailedOutputPath = argument("--detailed-output");
if (!manifestPath || !provider) {
  console.error(
    "Usage: npm run evaluate:ocr-verifiers -- --provider <paddleocr|google-vision> --manifest <path> [--allow-live] [--detailed-output <ignored-path>]",
  );
  process.exitCode = 2;
} else if (provider !== "paddleocr" && provider !== "google-vision") {
  console.error("OCR verifier must be paddleocr or google-vision");
  process.exitCode = 2;
} else {
  try {
    const settings = settingsFromEnvironment({
      ...process.env,
      INTAKE_RECOGNITION_VERIFIER_PROVIDER: provider,
    });
    const report = await runIntakeOcrEvaluation({
      manifestPath,
      settings,
      allowLive: process.argv.includes("--allow-live"),
      requireNonEmptyLines: process.argv.includes("--require-lines"),
      ...(detailedOutputPath ? { detailedOutputPath } : {}),
    });
    // stdout is aggregate JSON only. Detailed OCR text is written solely when
    // the caller explicitly supplies an ignored local output path.
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    const message = isProviderError(error)
      ? `OCR verifier evaluation failed: ${error.code}`
      : "OCR verifier evaluation failed";
    console.error(message);
    process.exitCode = 1;
  }
}
